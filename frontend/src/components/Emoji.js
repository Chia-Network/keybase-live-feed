import React from 'react';
import emojiData from 'emoji-datasource';
import emojiSheet from 'emoji-datasource/img/apple/sheets/32.png';

const SKIN_TONE_MODIFIERS = {'1F3FB': 'skin-tone-2', '1F3FC': 'skin-tone-3', '1F3FD': 'skin-tone-4', '1F3FE': 'skin-tone-5', '1F3FF': 'skin-tone-6'};

const emojiMap = new Map();
const emojiMapWithSkinTone = new Map();
let emojiSheetWidth = 1768;
let emojiSheetHeight = 1768;
for (const emojiEntry of emojiData) {
  emojiMap.set(emojiEntry.short_name, [emojiEntry.sheet_x, emojiEntry.sheet_y]);

  const skinToneMap = new Map();
  if (typeof emojiEntry.skin_variations === 'object') {
    for (const [skinToneModifier, skinToneEmojiEntry] of Object.entries(emojiEntry.skin_variations)) {
      skinToneMap.set(SKIN_TONE_MODIFIERS[skinToneModifier], [skinToneEmojiEntry.sheet_x, skinToneEmojiEntry.sheet_y]);
    }
  }
  emojiMapWithSkinTone.set(emojiEntry.short_name, skinToneMap);
}

function getEmoji(shortName, skinToneModifier) {
  if (skinToneModifier) {
    if (!emojiMapWithSkinTone.has(shortName)) {
      if (!emojiMap.has(shortName)) {
        return [null, null];
      }
      return emojiMap.get(shortName);
    }
    if (!emojiMapWithSkinTone.get(shortName).has(skinToneModifier)) {
      if (!emojiMap.has(shortName)) {
        return [null, null];
      }
      return emojiMap.get(shortName);
    }
    return emojiMapWithSkinTone.get(shortName).get(skinToneModifier);
  } else {
    if (!emojiMap.has(shortName)) {
      return [null, null];
    }
    return emojiMap.get(shortName);
  }
}

function Emoji(props) {
  const text = props.text;
  const scaleFactor = props.scaleFactor || 0.5;
  const emojiRegex = /(:[^\s:]+(?:::skin-tone-[2-6])?:)/;
  const emojiDetailedRegex = /:([^\s:]+)(?:::(skin-tone-[2-6]))?:/;
  const emojiStrings = text.split(emojiRegex);
  return (
    <>
      {emojiStrings.map((value, i) => {
        if (i % 2 === 0) { // normal text
          return value;
        } else { // emoji string
          // eslint-disable-next-line no-unused-vars
          const [_, shortName, skinToneModifier] = emojiDetailedRegex.exec(value);
          const [sheetX, sheetY] = getEmoji(shortName, skinToneModifier);
          if (sheetX === null) { return null; } // unknown emoji, skip it
          const styles = {
            backgroundImage: `url("${emojiSheet}")`,
            backgroundPosition: `-${(34 * sheetX + 1) * scaleFactor}px -${(34 * sheetY + 1) * scaleFactor}px`,
            backgroundSize: `${emojiSheetWidth * scaleFactor}px ${emojiSheetHeight * scaleFactor}px`,
            display: 'inline-block',
            verticalAlign: 'text-bottom',
            width: '16px',
            height: '16px',
          }
          return <span key={i} style={styles} className="emoji" title={value} />
        }
      })}
    </>
  );

}

export default Emoji;