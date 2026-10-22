import type { LyricLine } from '@/lib/types';

/**
 * Position in `lines` of the last line that has started by `timeMs`, or -1 before the first one starts. A line counts
 * from the ms it starts, and goes on counting through a break in the music after it and past the end of the song, as
 * the singer left it: unlike `activeLineIndex`, which gives -1 once the line has ended. Expects `lines` sorted by
 * `startMs`, as `parseLrc` and `applyOffset` return them.
 */
export function lastStartedLineIndex(lines: LyricLine[], timeMs: number): number {
  return lines.findLastIndex((line) => line.startMs <= timeMs);
}
