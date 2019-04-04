import openSocket from "socket.io-client";

// only allow websockets, as long-polling and short-polling are too resource-hungry
// const socket = openSocket('http://localhost:4000/', {upgrade: false, transports: ['websocket']});
const socket = openSocket({upgrade: false, transports: ['websocket']});

function connectChat(callback) {
  socket.on("chat", newChatMessage => {
    callback(newChatMessage);
  });
}

function connectRewriteHistory(callback) {
  socket.on("rewrite_history", newChatHistory => {
    callback(newChatHistory);
  });
}

function connectMetadata(callback) {
  socket.on("metadata", newMetadata => {
    callback(newMetadata);
  });
}

export { connectChat, connectRewriteHistory, connectMetadata };