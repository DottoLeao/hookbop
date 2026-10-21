import type { Blank, Difficulty, LyricLine } from '@/lib/types';
import { drawLines, hasBlankableDuration, tokenize } from './blanks';
import { seededRng, shuffled } from './rng';

const MIN_WORDS = 3;
const MAX_WORDS = 9;

/** How many times the tiles are shuffled again when they come out in the original order. */
const MAX_RESHUFFLES = 5;

/** True when the line has 3 to 9 words: enough to be a puzzle, few enough to fit on the screen. */
export function eligibleForTiles(tokens: string[]): boolean {
  return tokens.length >= MIN_WORDS && tokens.length <= MAX_WORDS;
}

function sameOrder(a: string[], b: string[]): boolean {
  return a.every((word, position) => word === b[position]);
}

/**
 * The words of the line in a random order that depends only on the seed. A shuffle that comes out in the original
 * order is redone, up to 5 more times. If it still matches (a line that cannot be reordered, such as
 * "go go go"), the original order comes back and the line is no puzzle.
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
 * True when `word` is exactly the word that comes after the `placedCount` words already placed
 * (same letters, same case: the tiles are the line's own words). False when every word is already placed.
 */
export function isNextTileCorrect(tokens: string[], placedCount: number, word: string): boolean {
  return tokens[placedCount] === word;
}

/**
 * The lines of a song that become a "Monte o verso" puzzle: each one is a blank for the whole line
 * (`tokenIndex` -1, the answer is its words joined by spaces). Same line length rules and same share per
 * difficulty as `selectBlanks`. A line also needs 3 to 9 words that can be put in another order.
 */
export function selectTileLines(lines: LyricLine[], difficulty: Difficulty, seed: string): Blank[] {
  const rng = seededRng(seed);
  const eligible = lines
    .filter(hasBlankableDuration)
    .map((line) => ({ line, tokens: tokenize(line.text) }))
    .filter(
      ({ line, tokens }) =>
        eligibleForTiles(tokens) && !sameOrder(makeTiles(tokens, `${seed}:${line.index}`), tokens),
    );

  return drawLines(eligible, difficulty, rng).map(({ line, tokens }) => ({
    id: `${line.index}:-1`,
    lineIndex: line.index,
    tokenIndex: -1,
    answer: tokens.join(' '),
  }));
}
