import { damerau } from './editDistance';
import { foldWord } from './text';
import { isRealWord } from './words';

/** An answer needs at least this many letters (apostrophes do not count) before a typo in it is forgiven. */
const MIN_LETTERS_TO_FORGIVE = 3;

/** Characters a keyboard may add that nobody sees: zero-width space, joiners, word joiner, BOM and direction marks. */
const INVISIBLE = /[​-‏⁠﻿]/g;

export interface TypedMatch {
  result: 'exact' | 'corrected' | 'wrong';
  /** The places in the answer (indexes into the answer text) of the letters that were fixed; empty unless corrected. */
  correctedIndices: number[];
}

/**
 * The text a player typed, ready to compare: accents in their composed form (NFC), no invisible characters,
 * lowercase, without spaces at the start, with every apostrophe-like mark made plain (’ ‘ ʼ ´ `), and without
 * spaces or . , ! ? ; : … at the end (a phone keyboard likes to add them).
 */
export function normalizeTyped(s: string): string {
  // NFC comes after the invisible characters are gone, so it also joins a letter and an accent they kept apart.
  return foldWord(s.replace(INVISIBLE, ''))
    .normalize('NFC')
    .replace(/^\s+/, '')
    .replace(/[\s.,!?;:…]+$/, '');
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

/** The places of the apostrophes in the text. */
function apostrophePlaces(text: string): number[] {
  const places: number[] = [];
  for (let i = 0; i < text.length; i++) if (text[i] === "'") places.push(i);
  return places;
}

/**
 * Compares what the player typed with the answer.
 *  - `exact`: the same once both are normalized (capitals, spaces, apostrophe marks, final punctuation and
 *    invisible characters ignored);
 *  - `corrected`: one of these, and `correctedIndices` says which letters of the answer were fixed:
 *      - every apostrophe of the answer was left out ("its" for "it's", "cause" for "'cause"). This is always
 *        accepted, even when what was typed is another real word and whatever the length of the answer, because
 *        phone keyboards drop apostrophes all the time;
 *      - one edit away (a letter replaced, missing or added, or two neighbours swapped), the answer has 3 letters
 *        or more, and what was typed is not a real word;
 *  - `wrong`: anything else. That includes a typo that happens to be a real word ("got" for "get"), and every
 *    answer of 2 letters or fewer, which has to be typed exactly (except for a dropped apostrophe).
 */
export function matchTyped(input: string, answer: string): TypedMatch {
  const typed = normalizeTyped(input);
  const expected = normalizeTyped(answer);

  if (typed === '') return { result: 'wrong', correctedIndices: [] };
  if (typed === expected) return { result: 'exact', correctedIndices: [] };

  const apostrophes = apostrophePlaces(expected);
  if (apostrophes.length > 0 && typed === expected.replace(/'/g, '')) {
    return { result: 'corrected', correctedIndices: apostrophes };
  }

  const letters = expected.replace(/'/g, '').length;
  if (letters < MIN_LETTERS_TO_FORGIVE || damerau(typed, expected) !== 1 || isRealWord(typed)) {
    return { result: 'wrong', correctedIndices: [] };
  }
  return { result: 'corrected', correctedIndices: fixedPlaces(typed, expected) };
}
