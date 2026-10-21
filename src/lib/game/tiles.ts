import type { Blank, Difficulty, LyricLine } from '@/lib/types';
import { drawLines, hasBlankableDuration, hasBlankableWord, tokenize } from './blanks';
import { seededRng, shuffled } from './rng';

const MIN_WORDS = 3;
const MAX_WORDS = 9;

/** How many times the tiles are shuffled again when they come out in the original order. */
const MAX_RESHUFFLES = 5;

/** True when the line has 3 to 9 words: enough to be a puzzle, few enough to fit on the screen. */
export function eligibleForTiles(tokens: string[]): boolean {
  return tokens.length >= MIN_WORDS && tokens.length <= MAX_WORDS;
}

/** True when the two lists have the same words in the same places, capitals ignored ("Baby" is "baby"). */
function sameOrder(a: string[], b: string[]): boolean {
  return a.every((word, position) => word.toLowerCase() === b[position].toLowerCase());
}

/**
 * The seed to give `makeTiles` for a line: the song's seed and the line's index. The screen must use this one,
 * so the tiles it shows are the ones `selectTileLines` checked, and no two lines share an order.
 */
export function tileSeed(seed: string, lineIndex: number): string {
  return `${seed}:${lineIndex}`;
}

/**
 * The words of the line in a random order that depends only on the seed (the UI passes `tileSeed(seed, lineIndex)`).
 * A shuffle that comes out in the original order, capitals ignored, is redone, up to 5 more times. If it still
 * matches (a line that cannot be reordered, such as "go go go"), the original order comes back and the line is no puzzle.
 */
export function makeTiles(tokens: string[], seed: string): string[] {
  const rng = seededRng(seed);
  let tiles = shuffled(tokens, rng);
  for (let attempt = 0; attempt < MAX_RESHUFFLES && sameOrder(tiles, tokens); attempt++) {
    tiles = shuffled(tokens, rng);
  }
  return tiles;
}

/**
 * True when `word` is the word that comes after the `placedCount` words already placed, capitals ignored
 * ("Baby baby baby oh" takes any "baby" first). False when every word is already placed.
 */
export function isNextTileCorrect(tokens: string[], placedCount: number, word: string): boolean {
  return tokens[placedCount]?.toLowerCase() === word.toLowerCase();
}

/**
 * The lines of a song that become a "Monte o verso" puzzle: each one is a blank for the whole line
 * (`tokenIndex` -1, the answer is its words joined by spaces). Same line length rules and same share per
 * difficulty as `selectBlanks`. A line also needs 3 to 9 words that can be put in another order, and at least one
 * word `selectBlanks` could blank, so a line of ad-libs ("Na na na na") is never a puzzle.
 */
export function selectTileLines(lines: LyricLine[], difficulty: Difficulty, seed: string): Blank[] {
  const rng = seededRng(seed);
  const eligible = lines
    .filter(hasBlankableDuration)
    .map((line) => ({ line, tokens: tokenize(line.text) }))
    .filter(
      ({ line, tokens }) =>
        eligibleForTiles(tokens) &&
        hasBlankableWord(tokens) &&
        !sameOrder(makeTiles(tokens, tileSeed(seed, line.index)), tokens),
    );

  return drawLines(eligible, difficulty, rng).map(({ line, tokens }) => ({
    id: `${line.index}:-1`,
    lineIndex: line.index,
    tokenIndex: -1,
    answer: tokens.join(' '),
  }));
}
