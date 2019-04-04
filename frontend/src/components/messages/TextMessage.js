import React from 'react';
import ReactMarkdown from 'react-markdown'
import Emoji from '../Emoji';
import Sender from './Sender';
import './Message.css';

const renderers = {
  text: props => <Emoji text={props.value} />,
  link: props => <a href={props.href} rel="noopener noreferrer" target="_blank">{props.children}</a>,
}

function TextMessage(props) {
  const { metadata, text } = props;
  return (
    <Sender metadata={metadata}>
      <ReactMarkdown
        className="message-contents"
        source={text}
        renderers={renderers} />
    </Sender>
  );
}

export default TextMessage;
