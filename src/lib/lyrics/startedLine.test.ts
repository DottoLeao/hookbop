import { describe, expect, it } from 'vitest';
import type { LyricLine } from '@/lib/types';
import { lastStartedLineIndex } from './startedLine';

// Invented lines, with a break of music between the second and the third.
const LINES: LyricLine[] = [
  { index: 0, startMs: 2000, endMs: 6000, text: 'Paper boats on a river of light' },
  { index: 1, startMs: 6000, endMs: 10000, text: "We're counting the stars from the roof" },
  { index: 2, startMs: 18000, endMs: 22000, text: 'Hold the line till the morning comes' },
];

describe('lastStartedLineIndex', () => {
  it('is -1 before the first line starts, and for a song with no lines', () => {
    expect(lastStartedLineIndex(LINES, 0)).toBe(-1);
    expect(lastStartedLineIndex(LINES, 1999)).toBe(-1);
    expect(lastStartedLineIndex([], 5000)).toBe(-1);
  });

  it('counts a line from the very ms it starts', () => {
    expect(lastStartedLineIndex(LINES, 2000)).toBe(0);
    expect(lastStartedLineIndex(LINES, 6000)).toBe(1);
  });

  it('is the line playing while a line plays', () => {
    expect(lastStartedLineIndex(LINES, 4000)).toBe(0);
    expect(lastStartedLineIndex(LINES, 9999)).toBe(1);
  });

  it('stays on the last line that started through a break between two lines', () => {
    expect(lastStartedLineIndex(LINES, 10000)).toBe(1);
    expect(lastStartedLineIndex(LINES, 17999)).toBe(1);
  });

  it('stays on the last line once the song is past it', () => {
    expect(lastStartedLineIndex(LINES, 22000)).toBe(2);
    expect(lastStartedLineIndex(LINES, 999999)).toBe(2);
  });
});
