import React from 'react';
import moment from 'moment';
import Media from 'react-bootstrap/Media';
import Reactions from '../reactions/Reactions';
import DefaultUser from '../../assets/default-user.svg';
import './Message.css';


function Sender(props) {
  const { senderAvatar, senderName, timestamp, reactions, isEdited } = props.metadata;

  return (
    <Media className="message">
      <img width={40} height={40} className="message-profile-pic" src={senderAvatar || DefaultUser} alt="" />
      <Media.Body className="message-body">
        <div className="message-header">
          <div className="message-username">{senderName}</div>
          <div className="message-timestamp">{moment(timestamp).calendar()}</div>
        </div>
        {props.children}
        {isEdited && <div className="message-edited">EDITED</div>}
        <Reactions reactions={reactions} />
      </Media.Body>
    </Media>
  );
}

export default Sender;