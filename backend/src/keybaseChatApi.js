const util = require('util');
const { spawn } = require('child_process');

const streamToStringPromise = require('stream-to-string');
const promiseTimeout = require('promise-timeout');
const { chunksToLinesAsync } = require('@rauschma/stringio');
const axios = require('axios');
const NodeCache = require('node-cache');

const USER_DATA_REFRESH_INTERVAL_SECONDS = 60 * 60; // max refresh interval for user data

class KeybaseChatAPI {
    constructor(teamName, apiCallTimeoutMs = 5000, apiCallRetryLimit = 3) {
        this.teamName = teamName;
        this.apiCallTimeoutMs = apiCallTimeoutMs;
        this.apiCallRetryLimit = apiCallRetryLimit;
        this.userDataCache = new NodeCache({stdTTL: USER_DATA_REFRESH_INTERVAL_SECONDS});
    }

    async getUserData(usernames, desiredFields) { // valid values of desiredFields can be found at https://keybase.io/docs/api/1.0/call/user/lookup
        console.log('[KeybaseChatAPI for team "%s"] getUserData([...%d entries...])', this.teamName, usernames.length);

        // Keybase API seems to have an internal limit of 50 usernames per request, chunk usernames into groups of 50
        const CHUNK_SIZE = 50;

        // we have to save the current values before making the axios call, since some of them might expire while it's running
        // the values that don't exist yet will be undefined, but they will be overwritten when we construct the map at the end
        const currentUserData = usernames.map(username => [username, this.userDataCache.get(username)]);

        const newUsernames = usernames.filter(username => typeof this.userDataCache.get(username) === 'undefined');
        let newUserData = [];
        if (newUsernames.length > 0) {
            for (let i = 0; i < newUsernames.length; i += CHUNK_SIZE) {
                const newUsernamesChunk = newUsernames.slice(i,i + CHUNK_SIZE);
                console.log('[KeybaseChatAPI for team "%s"] getUserData([...%d entries...]) - retrieving usernames %d to %d of %d', this.teamName, usernames.length, i + 1, i + newUsernamesChunk.length, newUsernames.length);
                const response = await axios.get(
                    'https://keybase.io/_/api/1.0/user/lookup.json',
                    {params: {usernames: newUsernamesChunk.join(','), fields: desiredFields.join(',')}}
                );
                if (response.statusText !== 'OK' || response.data.status.name !== 'OK' || response.data.them.length !== newUsernamesChunk.length) {
                    throw new Error(util.format('Keybase user data lookup failed for usernames %j: %j', newUsernamesChunk, response.data));
                }
                for (let i = 0; i < newUsernamesChunk.length; i ++) {
                    const newUsername = newUsernamesChunk[i];
                    const userData = response.data.them[i];
                    if (userData !== null) {
                        this.userDataCache.set(newUsername, userData);
                    }
                    newUserData.push([newUsername, userData]);
                }
            }
        }

        // construct the map with the resulting data
        // some userData values may be null, which means that the corresponding user doesn't exist
        return new Map([...currentUserData, ...newUserData])
    }

    async listChannels() {
        console.log('[KeybaseChatAPI for team "%s"] listChannels()', this.teamName);
        const result = await this.apiCall({
            "method": "listconvsonname",
            "params": {
                "options": {
                    "topic_type": "CHAT",
                    "members_type": "team",
                    "name": this.teamName,
                }
            }
        });
        return result.conversations;
    }

    async listChannelMessages(channelName, unreadMessagesOnly = false, messageLimit = null) {
        console.log('[KeybaseChatAPI for team "%s"] listChannelMessages(%s, %s, %s)', this.teamName, channelName, unreadMessagesOnly, messageLimit);
        let queryOptions = {
            "channel": {
                "name": this.teamName,
                "members_type": "team",
                "topic_name": channelName,
            },
            "unread_only": !!unreadMessagesOnly
        };
        if (messageLimit !== null) {
            queryOptions.pagination = {"num": messageLimit};
        }
        const result = await this.apiCall({"method": "read", "params": {"options": queryOptions}});
        return result.messages;
    }

    async * realtimeListMessages() {
        console.log('[KeybaseChatAPI for team "%s"] realtimeListMessages()', this.teamName);
        const keybaseChatListenerProcess = spawn(
            'keybase',
            ['chat', 'api-listen'],
            {stdio: ['ignore', 'pipe', process.stderr]}
        );
        for await (const line of chunksToLinesAsync(keybaseChatListenerProcess.stdout)) {
            const incomingMessage = JSON.parse(line);
            if (incomingMessage.type !== 'chat' || incomingMessage.source !== 'remote') {
                console.warn('[KeybaseChatAPI for team "%s"] realtimeListMessages() - UNRECOGNIZED KEYBASE CHAT MESSAGE: %j', this.teamName, incomingMessage);
                continue;
            }
            const messageTeamName = incomingMessage.msg.channel.name;
            if (messageTeamName === this.teamName) {
                yield incomingMessage.msg;
            }
        }
    }

    async listTeamMembers() {
        let error = null;
        for (let i = 0; i < this.apiCallRetryLimit; i ++) {
            const keybaseProcess = spawn('keybase', ['chat', 'list-members', this.teamName, 'general'], {stdio: ['ignore', 'pipe', process.stderr]});
            let output = '';
            try {
                output = await promiseTimeout.timeout(streamToStringPromise(keybaseProcess.stdout), this.apiCallTimeoutMs);
            } catch (err) {
                if (err instanceof promiseTimeout.TimeoutError) { // request timed out, kill off the keybase process
                    console.warn('[KeybaseChatAPI for team "%s"] listTeamMembers() - KILLING KEYBASE CHAT API PROCESS DUE TO COMMAND TIMEOUT, ATTEMPT %d OF %d', this.teamName, i + 1, this.apiCallRetryLimit);
                    keybaseProcess.kill();
                }
                error = err;
                continue;
            }

            // output is of the form "Listing members in chia_network.public [#general]:", followed by a blank line, followed by one username per line
            const outputLines = output.split('\n');
            if (outputLines.length < 2 || outputLines[0] === '' || outputLines[1] !== '' || outputLines[outputLines.length - 1] !== '') {
                console.warn('[KeybaseChatAPI for team "%s"] listTeamMembers() - INVALID KEYBASE COMMAND OUTPUT (CHECK KEYBASE VERSION), ATTEMPT %d OF %d', this.teamName, i + 1, this.apiCallRetryLimit);
                error = new Error(util.format('Invalid Keybase command output, check Keybase version: %s', output));
                continue;
            }
            outputLines.splice(0, 2); // remove the first two lines from the output
            outputLines.pop(); // remove blank line at end of output
            return outputLines;
        }
        throw error;
    }

    async apiCall(query) {
        let result = null;
        let error = null;
        for (let i = 0; i < this.apiCallRetryLimit; i ++) {
            const keybaseChatApiProcess = spawn(
                'keybase',
                ['chat', 'api', '-m', JSON.stringify(query)],
                {stdio: ['ignore', 'pipe', process.stderr]}
            );
            let output = '';
            try {
                output = await promiseTimeout.timeout(streamToStringPromise(keybaseChatApiProcess.stdout), this.apiCallTimeoutMs);
            } catch (err) {
                if (err instanceof promiseTimeout.TimeoutError) { // request timed out, kill off the keybase process
                    console.warn('[KeybaseChatAPI for team "%s"] apiCall(%j) - KILLING KEYBASE CHAT API PROCESS DUE TO COMMAND TIMEOUT', this.teamName, query);
                    keybaseChatApiProcess.kill();
                }
                error = err;
                console.warn('[KeybaseChatAPI for team "%s"] apiCall(%j) - FAILURE FROM API CALL ATTEMPT %d OF %d', this.teamName, query, i + 1, this.apiCallRetryLimit);
                continue;
            }
            try {
                result = JSON.parse(output);
                if (result.result) {
                    return result.result;
                } else {
                    error = new Error(util.format('Malformed result from API call: %s', output))
                }
            } catch (err) {
                error = err;
            }
            console.warn('[KeybaseChatAPI for team "%s"] apiCall(%j) - MALFORMED RESULT FROM API CALL ATTEMPT %d OF %d', this.teamName, query, i + 1, this.apiCallRetryLimit);
        }
        throw error;
    }
}

module.exports = KeybaseChatAPI;