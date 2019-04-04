const SCROLLBACK_MESSAGES = 50; // number of messages to show in scrollback

class KeybaseChatHistory {
    constructor(teamName, keybaseChatApi) {
        this.teamName = teamName;
        this.keybaseChatApi = keybaseChatApi;
        this.messagesByChannel = new Map(); // map from channel names to lists of messages
        this.reactionsByChannelMsgId = new Map(); // map from channel names and message IDs to lists of reaction messages
        this.isEditedByChannelMsgId = new Set(); // map from channel names and message IDs to whether they were edited
    }

    async refreshHistory() {
        console.log('[KeybaseChatHistory for team "%s"] refreshHistory()', this.teamName);

        // get full history back to SCROLLBACK_MESSAGES messages for every channel
        const messagesByChannel = new Map();
        const channelList = await this.keybaseChatApi.listChannels();
        const seenMessageIdentifiers = [];
        await Promise.all(channelList.map(async (channelEntry) => {
            const channelName = channelEntry.channel.topic_name;
            const messages = await this.keybaseChatApi.listChannelMessages(channelName, false, SCROLLBACK_MESSAGES);
            const extractedMessages = messages.slice(0, SCROLLBACK_MESSAGES)
                                              .filter(message => message.hasOwnProperty('msg')) // ignore expired exploding messages
                                              .map(message => message.msg)
                                              .reverse();
            messagesByChannel.set(channelName, extractedMessages);

            // store all seen messages to clean up outdated entries
            for (const msg of extractedMessages) {
                seenMessageIdentifiers.push(channelName + '|' + msg.id.toString());
            }
        }));

        // clean up reactions and isEdited
        const newReactionsByChannelMsgId = new Map();
        const newIsEditedByChannelMsgId = new Set();
        for (const identifier of seenMessageIdentifiers) {
            if (this.reactionsByChannelMsgId.has(identifier)) {
                newReactionsByChannelMsgId.set(identifier, this.reactionsByChannelMsgId.get(identifier));
            }
            if (this.isEditedByChannelMsgId.has(identifier)) {
                newIsEditedByChannelMsgId.add(identifier);
            }
        }

        // update fields
        this.messagesByChannel = messagesByChannel;
        this.reactionsByChannelMsgId = newReactionsByChannelMsgId;
        this.isEditedByChannelMsgId = newIsEditedByChannelMsgId;
    }

    addMessage(msg) {
        const channelName = msg.channel.topic_name;
        if (!this.messagesByChannel.has(channelName)) {
            this.messagesByChannel.set(channelName, []);
        }
        const messages = this.messagesByChannel.get(channelName);
        messages.push(msg);
        if (messages.length > SCROLLBACK_MESSAGES) {
            messages.shift();
        }
    }

    getMessage(channelName, msgId) {
        for (const keybaseMsg of this.getChannelMessages(channelName)) {
            if (keybaseMsg.channel.topic_name === channelName && keybaseMsg.id.toString() === msgId.toString()) {
                return keybaseMsg;
            }
        }
        return null;
    }

    editMessage(channelName, msgId, newText) {
        const keybaseMsg = this.getMessage(channelName, msgId);
        if (keybaseMsg !== null && keybaseMsg.content.type === 'text') { // message exists and is a text message
            keybaseMsg.content.text.body = newText;
            this.isEditedByChannelMsgId.add(channelName + '|' + msgId);
            return true;
        }
        return false; // only text messages can be edited
    }

    deleteMessage(channelName, msgId) {
        const keybaseMsgs = this.getChannelMessages(channelName);
        for (let i = 0; i < keybaseMsgs.length; i ++) {
            if (keybaseMsgs[i].id.toString() === msgId.toString()) {
                keybaseMsgs.splice(i, 1);
                return true;
            }
        }
        return false;
    }

    addMessageReaction(channelName, msgId, reactionMsg) {
        const identifier = channelName + '|' + msgId.toString();
        if (!this.reactionsByChannelMsgId.has(identifier)) {
            this.reactionsByChannelMsgId.set(identifier, []);
        }
        this.reactionsByChannelMsgId.get(identifier).push(reactionMsg);
    }

    getMessageReactions(channelName, msgId) {
        const identifier = channelName + '|' + msgId.toString();
        return this.reactionsByChannelMsgId.has(identifier) ? this.reactionsByChannelMsgId.get(identifier) : [];
    }

    deleteMessageReaction(channelName, msgId, reactionMsgId) {
        const reactions = this.getMessageReactions(channelName, msgId);
        for (let i = 0; i < reactions.length; i ++) {
            if (reactions[i].id.toString() === reactionMsgId.toString()) {
                reactions.splice(i, 1);
                return true;
            }
        }
        return false;
    }

    getMessageIsEdited(channelName, msgId) {
        return this.isEditedByChannelMsgId.has(channelName + '|' + msgId);
    }

    getHistory() {
        return this.messagesByChannel;
    }

    getChannelMessages(channelName) {
        return this.messagesByChannel.has(channelName) ? this.messagesByChannel.get(channelName) : [];
    }
}

module.exports = KeybaseChatHistory;