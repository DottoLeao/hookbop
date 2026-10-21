import { damerau } from './editDistance';
import { isRealWord } from './words';

/** An answer needs at least this many letters (apostrophes do not count) before a typo in it is forgiven. */
const MIN_LETTERS_TO_FORGIVE = 3;

export interface TypedMatch {
  result: 'exact' | 'corrected' | 'wrong';
  /** The places in the answer (indexes into the answer text) of the letters that were fixed; empty unless corrected. */
  correctedIndices: number[];
}

/**
 * The text a player typed, ready to compare: lowercase, without spaces at the start, with the curly apostrophes
 * made plain, and without spaces or . , ! ? ; : at the end (a phone keyboard likes to add them).
 */
export function normalizeTyped(s: string): string {
  return s
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/^\s+/, '')
    .replace(/[\s.,!?;:]+$/, '');
}

/**
 * Where the typed text and the answer differ, given that they are exactly one edit apart.
 *  - two letters swapped: both places;
 *  - a letter replaced: its place in the answer;
 *  - a letter missing from the typed text: the place of that letter in the answer;
 *  - a letter too many: the place in the answer where it came in, or the last letter if it came after the end,
 *    so every index is a letter of the answer.
 * When the edit could be made in more than one place (a doubled letter), the later place is the one marked.
 */
function fixedPlaces(typed: string, answer: string): number[] {
  let first = 0; // the first place where the two texts differ
  while (first < typed.length && first < answer.length && typed[first] === answer[first]) first++;

  if (typed.length === answer.length) {
    const swapped = typed[first] === answer[first + 1] && typed[first + 1] === answer[first];
    return swapped ? [first, first + 1] : [first];
  }
  return [Math.min(first, answer.length - 1)];
}

/**
 * Compares what the player typed with the answer.
 *  - `exact`: the same once both are normalized (capitals, spaces, curly apostrophes and final punctuation ignored);
 *  - `corrected`: one edit away (a letter replaced, missing or added, or two neighbours swapped), and what was
 *    typed is not a real word. `correctedIndices` says which letters of the answer were fixed;
 *  - `wrong`: anything else. That includes a typo that happens to be a real word ("got" for "get"), and every
 *    answer of 2 letters or fewer, which has to be typed exactly.
 */
export function matchTyped(input: string, answer: string): TypedMatch {
  const typed = normalizeTyped(input);
  const expected = normalizeTyped(answer);

  if (typed === '') return { result: 'wrong', correctedIndices: [] };
  if (typed === expected) return { result: 'exact', correctedIndices: [] };

  const letters = expected.replace(/'/g, '').length;
  if (letters < MIN_LETTERS_TO_FORGIVE || damerau(typed, expected) !== 1 || isRealWord(typed)) {
    return { result: 'wrong', correctedIndices: [] };
  }
  return { result: 'corrected', correctedIndices: fixedPlaces(typed, expected) };
}
