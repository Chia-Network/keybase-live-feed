import React from 'react';
import Reactions from '../reactions/Reactions';
import './Message.css';

// <JoinLeaveMessage key={message.id} joined={true} metadata={message.metadata} />
function JoinLeaveMessage(props) {
  const { metadata, joined } = props;
  return (
    <div className="message join-leave-message font-italic">
      <p><b>{metadata.senderName}</b>&nbsp;has {joined ? "joined" : "left"} the channel.</p>
      <Reactions reactions={metadata.reactions} />
    </div>
  );
}

export default JoinLeaveMessage;
