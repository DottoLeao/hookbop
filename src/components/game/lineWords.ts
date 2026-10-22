import { tokenize } from '@/lib/game/blanks';
import { foldApostrophes } from '@/lib/game/text';

/** A word of the line, numbered as `tokenize` numbers it (a blank's tokenIndex), or what sits between two words. */
export type Piece = { word: string; index: number; text: string } | { text: string };

/**
 * The line cut into its words and the spaces and punctuation between them, all as written. `tokenize` reads the
 * text with its apostrophes made plain, which keeps every character where it was, so its words are found in order.
 */
export function pieces(text: string): Piece[] {
  const plain = foldApostrophes(text);
  const out: Piece[] = [];
  let cursor = 0;
  tokenize(text).forEach((word, index) => {
    const at = plain.indexOf(word, cursor);
    if (at > cursor) out.push({ text: text.slice(cursor, at) });
    out.push({ word, index, text: text.slice(at, at + word.length) });
    cursor = at + word.length;
  });
  if (cursor < text.length) out.push({ text: text.slice(cursor) });
  return out;
}

const outline = 'focus-visible:outline-2 focus-visible:outline-offset-2';

/** The focus ring of a control on the dark page. */
export const focusRing = `${outline} focus-visible:outline-lime`;

/**
 * What a word that can be tapped looks like, except for the color of its focus ring (lime on the dark page, but
 * invisible on a lime line, where it has to be `focus-visible:outline-bg`): at least 44 px tall, even inside a line of
 * text.
 */
export const tappableShape = `inline-flex min-h-11 items-center rounded-blank align-middle ${outline}`;

/** An answered blank or a word that can be tapped on the dark page. */
export const tappable = `${tappableShape} focus-visible:outline-lime`;
