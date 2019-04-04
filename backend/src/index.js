const path = require('path');
const util = require('util');
const http = require('http');

const express = require('express');
const socketio = require('socket.io');

const KeybaseChatAPI = require('./keybaseChatApi');
const KeybaseChatHistory = require('./keybaseChatHistory');

// const KEYBASE_TEAM_NAME = 'chia_test_team';
const KEYBASE_TEAM_NAME = 'chia_network.public';
const KEYBASE_API_CALL_TIMEOUT_MS = 15000;
const KEYBASE_API_CALL_RETRY_LIMIT = 3;
const KEYBASE_CHECK_MEMBERS_INTERVAL_MS = 30000;

// initialize Express server with Socket.IO
const app = express();
const server = http.Server(app);
const io = socketio(server);

// initialize Keybase helpers
const keybaseChatApi = new KeybaseChatAPI(KEYBASE_TEAM_NAME, KEYBASE_API_CALL_TIMEOUT_MS, KEYBASE_API_CALL_RETRY_LIMIT)
const keybaseChatHistory = new KeybaseChatHistory(KEYBASE_TEAM_NAME, keybaseChatApi);
let keybaseTeamMembers = [];
let keybaseUserAvatars = new Map();

async function processFeedHistory() {
    for (const keybaseMessages of keybaseChatHistory.getHistory().values()) {
        keybaseMessages.forEach(async (msg) => await processKeybaseMessage(msg));
    }
}

function getFeedHistory() {
    const result = {};
    for (const [channelName, keybaseMessages] of keybaseChatHistory.getHistory().entries()) {
        const feedMessages = keybaseMessages.map(msg => keybaseMessageToFeedMessage(msg));
        result[channelName] = feedMessages.filter(([messageType, _]) => messageType === 'chat').map(([_, messageData]) => messageData);
    }
    return result;
}

async function processKeybaseMessage(keybaseMsg) {
    const channelName = keybaseMsg.channel.topic_name;
    const content = keybaseMsg.content;

    switch (content.type) {
        // history rewriting messages
        case 'reaction':
            keybaseChatHistory.addMessageReaction(channelName, content.reaction.m, keybaseMsg);
            break;
        case 'edit':
            keybaseChatHistory.editMessage(channelName, content.edit.messageID, content.edit.body);
            break;
        case 'delete':
            for (const msgId of content.delete.messageIDs) {
                // deleting a reaction should remove the reaction from its corresponding message
                const deletedReactionMsg = keybaseChatHistory.getMessage(channelName, msgId);
                if (deletedReactionMsg !== null && deletedReactionMsg.content.type === 'reaction') {
                    keybaseChatHistory.deleteMessageReaction(channelName, deletedReactionMsg.content.reaction.m, deletedReactionMsg.id);
                }

                keybaseChatHistory.deleteMessage(channelName, msgId);
            }
            break;
        case 'metadata':
            console.log('[processKeybaseMessage] metadata message received, refreshing history');
            await keybaseChatHistory.refreshHistory();
            break;
    }
}

function keybaseMessageToFeedMessage(keybaseMsg) {
    const reactions = new Map();
    keybaseChatHistory.getMessageReactions(keybaseMsg.channel.topic_name, keybaseMsg.id).forEach(reactionMsg => {
        const reaction = reactionMsg.content.reaction.b;
        reactions.set(reaction, (reactions.get(reaction) || 0) + 1)
    });
    const reactionList = Array.from(reactions.entries()).map(([k, v]) => ({reaction: k, num: v})).sort((a, b) => a.reaction < b.reaction ? -1 : a.reaction > b.reaction ? 1 : 0);

    const metadata = {
        channelName: keybaseMsg.channel.topic_name,
        senderName: keybaseMsg.sender.username,
        senderDevice: keybaseMsg.sender.device_name,
        senderAvatar: keybaseUserAvatars.has(keybaseMsg.sender.username) ? keybaseUserAvatars.get(keybaseMsg.sender.username) : null,
        timestamp: keybaseMsg.sent_at_ms,
        explodeTime: keybaseMsg.is_ephemeral ? keybaseMsg.etime : null,
        reactions: reactionList,
        isEdited: keybaseChatHistory.getMessageIsEdited(keybaseMsg.channel.topic_name, keybaseMsg.id),
    };
    const content = keybaseMsg.content;

    // assumption: message ID, team name, and channel name together form a globally unique identifier for a given message
    const id = util.format('%s|%s|%s', keybaseMsg.channel.name, keybaseMsg.channel.topic_name, keybaseMsg.id);

    switch (content.type) {
        // normal messages
        case 'text':
            return ['chat', {type: 'text', id: id, text: content.text.body, metadata: metadata}];
        case 'attachment':
            return ['chat', {type: 'file', id: id, name: content.attachment.object.filename, caption: content.attachment.object.title, metadata: metadata}];
        case 'headline':
            return ['chat', {type: 'topic', id: id, text: content.headline.headline, metadata: metadata}];
        case 'join':
            return ['chat', {type: 'join', id: id, metadata: metadata}];
        case 'leave':
            return ['chat', {type: 'leave', id: id, metadata: metadata}];

        // history rewriting messages
        case 'reaction':
            return ['rewrite_history', null];
        case 'edit':
            return ['rewrite_history', null];
        case 'delete':
            return ['rewrite_history', null];
        case 'metadata':
            return ['rewrite_history', null];

        // ignorable messages
        case 'unfurl': // URL preview messages
            return [null, null];
        case 'system': // team creation messages, complex/simple team settings change messages, etc.
            return [null, null];
        case 'none': // null messages, usually means there was an exploding message here that exploded
            return [null, null];

        default:
            console.warn('IGNORING MESSAGE DUE TO UNKNOWN TYPE: %j', keybaseMsg);
            return [null, null];
    }
}

async function backgroundServer() {
    // serve static files from the "static" folder by default
    app.use(express.static(path.join(__dirname, 'static')));

    io.on('connection', async (socket) => {
        // send user their past history from before they connected
        console.log('[main] new user connected: %s', socket.request.socket.remoteAddress);
        socket.emit('metadata', {teamName: KEYBASE_TEAM_NAME, membersCount: keybaseTeamMembers.length});
        socket.emit('rewrite_history', getFeedHistory());
    });

    server.listen(4000, () => {
        console.log('[main] server listening on 0.0.0.0:4000');
    });
}

async function backgroundKeybaseChatListener() {
    console.log('[backgroundKeybaseChatListener] starting background chat listener')

    // obtain initial chat history and process messages
    await keybaseChatHistory.refreshHistory();
    getFeedHistory();
    await processFeedHistory();

    for await (const keybaseMsg of keybaseChatApi.realtimeListMessages(KEYBASE_TEAM_NAME)) {
        keybaseChatHistory.addMessage(keybaseMsg);
        const [messageType, messageData] = keybaseMessageToFeedMessage(keybaseMsg);
        await processKeybaseMessage(keybaseMsg);
        switch (messageType) {
            case 'chat':
                console.log('[backgroundKeybaseChatListener] broadcasting message to %d connected users: %j', io.engine.clientsCount, messageData);
                io.emit('chat', messageData);
                break;
            case 'rewrite_history':
                console.log('[backgroundKeybaseChatListener] broadcasting new chat history to %d connected users', io.engine.clientsCount);
                io.emit('rewrite_history', getFeedHistory());
                break;
            case null:
                break;
            default:
                throw new Error(util.format('Invalid message type: %s', messageType));
        }
    }
}

async function backgroundKeybaseMembersListener() {
    console.log('[backgroundKeybaseMembersListener] starting background members listener');
    while (true) {
        keybaseTeamMembers = await keybaseChatApi.listTeamMembers();
        const metadata = {teamName: KEYBASE_TEAM_NAME, membersCount: keybaseTeamMembers.length};
        console.log('[backgroundKeybaseMembersListener] broadcasting metadata to %d connected users: %j', io.engine.clientsCount, metadata);
        io.emit('metadata', metadata);

        // update the avatars of each member
        const teamUsersData = await keybaseChatApi.getUserData(keybaseTeamMembers, ['pictures']);
        for (const [username, userData] of teamUsersData.entries()) {
            if (userData && userData.pictures && userData.pictures.primary) {
                const avatar = userData.pictures.primary.url;
                keybaseUserAvatars.set(username, avatar);
            }
        }

        // sleep for a while until we check again
        await new Promise(resolve => setTimeout(resolve, KEYBASE_CHECK_MEMBERS_INTERVAL_MS));
    }
}

// run server in the background
backgroundServer().catch(reason => {
    console.warn('[server] terminating due to error:', reason);
    process.exit();
});

// run Keybase chat listener in the background
backgroundKeybaseChatListener().catch(reason => {
    console.warn('[backgroundKeybaseChatListener] terminating due to error:', reason);
    process.exit();
});

// run Keybase members listener in the background
backgroundKeybaseMembersListener().catch(reason => {
    console.warn('[backgroundKeybaseMembersListener] terminating due to error:', reason);
    process.exit();
});