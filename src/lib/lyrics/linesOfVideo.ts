import type { LyricLine } from '@/lib/types';
import { parseLrc } from './lrc';

/**
 * The lines of a video's stored lyrics as written, before any offset, the last one ending where the lyrics end. The
 * song screen and the help route both read lines through here, so a line index means the same line on both sides of
 * the network: the offset moves the times only, never the texts or the numbering.
 */
export function linesOfVideo(lyrics: { lyricsLrc: string; lyricsDurationS: number }): LyricLine[] {
  return parseLrc(lyrics.lyricsLrc, lyrics.lyricsDurationS * 1000);
}
