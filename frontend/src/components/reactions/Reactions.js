import React from 'react';
import Container from 'react-bootstrap/Container';
import Row from 'react-bootstrap/Row';
import Emoji from '../Emoji';
import './Reactions.css';


function Reactions(props) {
  return (
    <Container className="reactions-container" fluid={true}>
      <Row>
        {props.reactions.map(reaction => {
          return (
            <div key={reaction.reaction} className="reaction">
              <Emoji text={reaction.reaction} />
              <div className="reaction-contents">{reaction.num}</div>
            </div>
          );
        })}
      </Row>
    </Container>
  );
}

export default Reactions;
