import React from 'react';
import Sender from './Sender';
import './Message.css';
import FileIcon from '../../assets/file.svg';

function FileMessage(props) {
  const { metadata, name, caption } = props;
  return (
    <Sender metadata={metadata}>
      <div className="text-center d-inline-block p-3 m-3 border border-primary rounded">
        <img width={100} height={100} className="message-file-icon" src={FileIcon} alt="profile pic" />
        <b className="d-block">{name}</b>
        {caption}
      </div>
    </Sender>
  );
}

export default FileMessage;
