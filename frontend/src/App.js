import React, { Component } from 'react';
import './App.css';

import { connectChat, connectRewriteHistory, connectMetadata } from "./liveApi";

import TextMessage from './components/messages/TextMessage';
import FileMessage from './components/messages/FileMessage';
import TopicMessage from './components/messages/TopicMessage';
import JoinLeaveMessage from './components/messages/JoinLeaveMessage';


class App extends Component {
  constructor(props) {
    super(props);
    this.state = {
      teamName: '',
      chatHistory: {},
      membersCount: 0,
      currentChannel: 'general',
    };

    connectChat(newChatMessage => {
      const channelName = newChatMessage.metadata.channelName;
      if (!this.state.chatHistory.hasOwnProperty(channelName)) { 
        this.state.chatHistory[channelName] = [];
      }
      this.state.chatHistory[channelName].push(newChatMessage);
      this.setState({chatHistory: this.state.chatHistory});
    });

    connectRewriteHistory(newChatHistory => {
      this.setState({chatHistory: newChatHistory});
    });

    connectMetadata(newMetadata => {
      this.setState({teamName: newMetadata.teamName, membersCount: newMetadata.membersCount});
    });
  }

  getSnapshotBeforeUpdate(_prevProps, _prevState) {
    const isNearBottom = Math.abs(this.feedElement.scrollHeight - this.feedElement.scrollTop - this.feedElement.clientHeight) <= 100;
    return isNearBottom;
  }

  scrollToBottom() {
    this.feedElement.scrollTop = this.bottomOfFeedElement.offsetTop;
  }

  componentDidMount() {
    this.scrollToBottom();
  }

  componentDidUpdate(_prevProps, _prevState, isNearBottom) {
    if (isNearBottom) {
      this.scrollToBottom();
    }
  }

  render() {
    const channel = this.state.currentChannel;
    const messages = this.state.chatHistory.hasOwnProperty(channel) ? this.state.chatHistory[channel] : [];
    return (
      <div className="App d-flex flex-column">
        <header className="flex-shrink-0 d-flex flex-column flex-md-row align-items-stretch align-items-md-center">
          <div className="team-name">{this.state.teamName}</div>
          <div className="channel-name">
            #{channel}
            {/* <select
              className="custom-select custom-select-lg"
              value={this.state.currentChannel}
              onChange={e => {
                this.setState({currentChannel: e.target.value});
                this.scrollToBottom();
              }}>
              {Object.keys(this.state.chatHistory).sort().map(
                channelName => <option key={channelName} value={channelName}>#{channelName}</option>
              )}
            </select> */}
          </div>
          <div className="flex-grow-1"></div>
          <div className="members-count"><b>{this.state.membersCount.toLocaleString()}+ members</b> and counting</div>
        </header>

        <div className="messages-container flex-grow-1" ref={el => { this.feedElement = el; }}>
          {/* <TextMessage metadata={{channelName: 'general', senderName: 'swets', senderDevice: 'device', senderAvatar: null, timestamp: 1554145583835, explodeTime: null, reactions: [], isEdited: false}} text="test message :hash: :gorilla: :+1::skin-tone-2:" /> */}
          {messages.map(message => {
            switch (message.type) {
              case 'text':
                return <TextMessage key={message.id} metadata={message.metadata} text={message.text} />
              case 'file':
                return <FileMessage key={message.id} metadata={message.metadata} name={message.name} caption={message.caption} />
              case 'topic':
                return <TopicMessage key={message.id} metadata={message.metadata} text={message.text} />
              case 'join':
                return <JoinLeaveMessage key={message.id} joined={true} metadata={message.metadata} />
              case 'leave':
                return <JoinLeaveMessage key={message.id} joined={false} metadata={message.metadata} />
              default:
                throw new Error('Invalid message type: ' + message.type);
            }
          })}
          <div ref={el => { this.bottomOfFeedElement = el; }}></div>
        </div>
      </div>
    );
  }
}

export default App;
