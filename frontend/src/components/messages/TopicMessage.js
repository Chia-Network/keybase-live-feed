import React from 'react';
import Reactions from '../reactions/Reactions';
import './Message.css';

function TopicMessage(props) {
  const { metadata, text } = props;
  return (
    <div className="message topic-message">
      <p><b>{metadata.senderName}</b>&nbsp;changed the topic to:&nbsp;<span className="font-weight-bold font-italic">{text}</span></p>
      <Reactions reactions={metadata.reactions} />
    </div>
  );
}

export default TopicMessage;
