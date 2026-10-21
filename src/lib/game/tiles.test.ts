import { describe, expect, it } from 'vitest';
import type { LyricLine } from '@/lib/types';
import { tokenize } from './blanks';
import { eligibleForTiles, isNextTileCorrect, makeTiles, selectTileLines } from './tiles';

/** A line that is 3 s long (inside the playable range) unless the test says otherwise. */
function line(index: number, text: string, durationMs = 3000): LyricLine {
  const startMs = index * 5000;
  return { index, startMs, endMs: startMs + durationMs, text };
}

/** Thirty lines of five words each, every one with different words. */
const THIRTY_LINES = Array.from({ length: 30 }, (_, i) => line(i, `Line number ${i} sings along`));

/** Lines that can never become a puzzle, mixed in to prove the share counts only the eligible lines. */
const INELIGIBLE_LINES = [
  line(30, 'Hello there'), // 2 words
  line(31, 'One two three four five six seven eight nine ten'), // 10 words
  line(32, 'go go go'), // the words cannot be put in another order
  line(33, 'Dancing under neon lights', 1199),
  line(34, 'Dancing under neon lights', 15001),
  line(35, ''),
];

const SEEDS = Array.from({ length: 40 }, (_, i) => `seed-${i}`);

describe('makeTiles', () => {
  const tokens = tokenize("Please, don't let me down!");

  it('splits the line the way the tiles need', () => {
    expect(tokens).toEqual(['Please', "don't", 'let', 'me', 'down']);
  });

  it('has the same words in another order', () => {
    const tiles = makeTiles(tokens, 's');
    expect([...tiles].sort()).toEqual([...tokens].sort());
    expect(tiles).not.toEqual(tokens);
  });

  it('keeps repeated words as many times as they appear', () => {
    const tiles = makeTiles(['go', 'go', 'now', 'go'], 's');
    expect([...tiles].sort()).toEqual(['go', 'go', 'go', 'now']);
  });

  it('gives the same order for the same seed, and does not change the input', () => {
    const input = [...tokens];
    expect(makeTiles(input, 'same')).toEqual(makeTiles(input, 'same'));
    expect(input).toEqual(tokens);
  });

  it('gives different orders for different seeds', () => {
    const orders = new Set(SEEDS.map((seed) => makeTiles(tokens, seed).join(' ')));
    expect(orders.size).toBeGreaterThan(1);
  });

  it('never gives back the original order when another one exists, even with only 3 words', () => {
    // With 3 different words one shuffle in 6 lands on the original order, so only the reshuffling saves these.
    const three = ['x', 'y', 'z'];
    for (let i = 0; i < 100; i++) {
      expect(makeTiles(three, `seed-${i}`)).not.toEqual(three);
    }
  });

  it('gives back the same words when no other order exists, instead of looping', () => {
    expect(makeTiles(['go', 'go', 'go'], 's')).toEqual(['go', 'go', 'go']);
  });
});

describe('isNextTileCorrect', () => {
  it('is true only for the word that comes next', () => {
    expect(isNextTileCorrect(['go', 'go', 'now'], 0, 'go')).toBe(true);
    expect(isNextTileCorrect(['go', 'go', 'now'], 1, 'go')).toBe(true);
    expect(isNextTileCorrect(['go', 'go', 'now'], 1, 'now')).toBe(false);
    expect(isNextTileCorrect(['go', 'go', 'now'], 2, 'now')).toBe(true);
  });

  it('wants the word exactly as the line has it, capital letters included', () => {
    expect(isNextTileCorrect(['Please', 'me'], 0, 'please')).toBe(false);
    expect(isNextTileCorrect(['Please', 'me'], 0, 'Please')).toBe(true);
  });

  it('is false when every word is already placed or the count makes no sense', () => {
    expect(isNextTileCorrect(['go', 'go', 'now'], 3, 'now')).toBe(false);
    expect(isNextTileCorrect(['go', 'go', 'now'], -1, 'go')).toBe(false);
    expect(isNextTileCorrect([], 0, 'go')).toBe(false);
  });
});

describe('eligibleForTiles', () => {
  const words = (n: number) => Array.from({ length: n }, (_, i) => `w${i}`);

  it('is true with 3 to 9 words', () => {
    for (let n = 3; n <= 9; n++) expect(eligibleForTiles(words(n))).toBe(true);
  });

  it('is false with fewer than 3 or more than 9 words', () => {
    expect(eligibleForTiles(['a', 'b'])).toBe(false);
    expect(eligibleForTiles(words(1))).toBe(false);
    expect(eligibleForTiles([])).toBe(false);
    expect(eligibleForTiles(words(10))).toBe(false);
  });
});

describe('selectTileLines', () => {
  it('turns each line into one blank for the whole line', () => {
    const lines = [line(7, "Please, don't let me down!")];
    expect(selectTileLines(lines, 'dificil', 's')).toEqual([
      { id: '7:-1', lineIndex: 7, tokenIndex: -1, answer: "Please don't let me down" },
    ]);
  });

  it('gives the same result for the same input, and another draw for another seed', () => {
    const a = selectTileLines(THIRTY_LINES, 'medio', 'song-1');
    expect(selectTileLines(THIRTY_LINES, 'medio', 'song-1')).toEqual(a);
    expect(selectTileLines(THIRTY_LINES, 'medio', 'song-2').map((b) => b.id)).not.toEqual(a.map((b) => b.id));
  });

  it('does not change the lines it is given', () => {
    const lines = THIRTY_LINES.map((l) => ({ ...l }));
    selectTileLines(lines, 'dificil', 'song-1');
    expect(lines).toEqual(THIRTY_LINES);
  });

  it('is empty without lines', () => {
    expect(selectTileLines([], 'dificil', 's')).toEqual([]);
  });

  it('leaves out lines with fewer than 3 or more than 9 words', () => {
    const lines = [line(0, 'Hello there'), line(1, 'One two three four five six seven eight nine ten'), line(2, 'Just three words')];
    expect(selectTileLines(lines, 'dificil', 's').map((b) => b.lineIndex)).toEqual([2]);
  });

  it('keeps lines of exactly 3 and exactly 9 words', () => {
    const lines = [line(0, 'One two three'), line(1, 'One two three four five six seven eight nine')];
    expect(selectTileLines(lines, 'dificil', 's').map((b) => b.lineIndex)).toEqual([0, 1]);
  });

  it('leaves out a line shorter than 1200 ms or longer than 15000 ms, and keeps exactly those limits', () => {
    const lines = [
      line(0, 'Dancing under neon lights', 1199),
      line(1, 'Dancing under neon lights', 1200),
      line(2, 'Dancing under neon lights', 15000),
      line(3, 'Dancing under neon lights', 15001),
    ];
    expect(selectTileLines(lines, 'dificil', 's').map((b) => b.lineIndex)).toEqual([1, 2]);
  });

  it('leaves out a line whose words cannot be put in another order', () => {
    const lines = [line(0, 'go go go'), line(1, 'go go now')];
    expect(selectTileLines(lines, 'dificil', 's').map((b) => b.lineIndex)).toEqual([1]);
  });

  it('gives a third of the eligible lines in facil', () => {
    for (const seed of SEEDS.slice(0, 10)) {
      const blanks = selectTileLines([...INELIGIBLE_LINES, ...THIRTY_LINES], 'facil', seed);
      expect(blanks.length).toBeGreaterThanOrEqual(9);
      expect(blanks.length).toBeLessThanOrEqual(11);
    }
  });

  it('gives half of the eligible lines in medio', () => {
    for (const seed of SEEDS.slice(0, 10)) {
      const blanks = selectTileLines([...INELIGIBLE_LINES, ...THIRTY_LINES], 'medio', seed);
      expect(blanks.length).toBeGreaterThanOrEqual(14);
      expect(blanks.length).toBeLessThanOrEqual(16);
    }
  });

  it('gives every eligible line in dificil, and never an ineligible one', () => {
    for (const seed of SEEDS.slice(0, 10)) {
      const blanks = selectTileLines([...INELIGIBLE_LINES, ...THIRTY_LINES], 'dificil', seed);
      expect(blanks.map((b) => b.lineIndex)).toEqual(THIRTY_LINES.map((l) => l.index));
    }
  });

  it('never draws an ineligible line, whatever the difficulty', () => {
    for (const difficulty of ['facil', 'medio', 'dificil'] as const) {
      for (const seed of SEEDS.slice(0, 10)) {
        const blanks = selectTileLines([...INELIGIBLE_LINES, ...THIRTY_LINES], difficulty, seed);
        expect(blanks.every((b) => b.lineIndex < 30)).toBe(true);
      }
    }
  });

  it('returns the lines in song order', () => {
    const lineIndexes = selectTileLines([...INELIGIBLE_LINES, ...THIRTY_LINES], 'medio', 'order').map((b) => b.lineIndex);
    expect(lineIndexes).toEqual([...lineIndexes].sort((a, b) => a - b));
  });

  it('draws every eligible line at some point across seeds, so none is left out for good', () => {
    const seen = new Set<number>();
    for (const seed of SEEDS) {
      for (const blank of selectTileLines(THIRTY_LINES, 'facil', seed)) seen.add(blank.lineIndex);
    }
    expect(seen.size).toBe(30);
  });

  it('uses the words of the line, in order, as the answer', () => {
    for (const blank of selectTileLines(THIRTY_LINES, 'dificil', 's')) {
      const words = blank.answer.split(' ');
      expect(words).toEqual(tokenize(THIRTY_LINES[blank.lineIndex].text));
      expect(eligibleForTiles(words)).toBe(true);
    }
  });
});
