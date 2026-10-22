import { describe, expect, it } from 'vitest';
import { linesOfVideo } from './linesOfVideo';
import { parseLrc } from './lrc';

// Invented lines, not lyrics.
const LRC = ['[ar:Someone]', '[00:02.00]Paper boats on a river of light', '[00:06.50]', '[00:08.00]Hold the line till morning'].join(
  '\n',
);

describe('linesOfVideo', () => {
  it('gives the lines as the lyrics have them, before any offset, the last one ending with the lyrics', () => {
    expect(linesOfVideo({ lyricsLrc: LRC, lyricsDurationS: 30 })).toEqual([
      { index: 0, startMs: 2000, endMs: 6500, text: 'Paper boats on a river of light' },
      { index: 1, startMs: 8000, endMs: 30000, text: 'Hold the line till morning' },
    ]);
  });

  it('numbers the lines exactly as the song screen does, so a line index means the same line on both sides', () => {
    expect(linesOfVideo({ lyricsLrc: LRC, lyricsDurationS: 30 })).toEqual(parseLrc(LRC, 30000));
  });
});
