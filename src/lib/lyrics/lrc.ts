import type { LyricLine } from '@/lib/types';

/** How long the last line lasts when the song duration is unknown. */
const LAST_LINE_MS = 5000;

/** One or more `[mm:ss.xx]` tags at the start of a line, then the text. */
const LINE = /^((?:\[\d{1,3}:\d{1,2}(?:\.\d{1,3})?\])+)(.*)$/;
const TAG = /\[(\d{1,3}):(\d{1,2})(?:\.(\d{1,3}))?\]/g;

interface Entry {
  startMs: number;
  text: string;
}

/** `[00:12.34]` means 12 s and 340 ms: the fraction is read as a decimal, not as a count. */
function tagToMs(minutes: string, seconds: string, fraction = ''): number {
  const ms = Number(fraction.padEnd(3, '0'));
  return (Number(minutes) * 60 + Number(seconds)) * 1000 + ms;
}

/**
 * Turns synced LRC text into lyric lines, sorted by time.
 * A line lasts until the next timestamp. Lines with no text are not returned,
 * but they still end the line before them. Metadata tags such as `[ar:X]` are ignored.
 * The last line ends at `totalDurationMs`, or 5 s after it starts when that is missing
 * or does not come after the line.
 */
export function parseLrc(lrc: string, totalDurationMs?: number): LyricLine[] {
  const entries: Entry[] = [];
  for (const raw of lrc.split(/\r?\n/)) {
    const match = LINE.exec(raw.trim());
    if (!match) continue;
    const text = match[2].trim();
    for (const [, minutes, seconds, fraction] of match[1].matchAll(TAG)) {
      entries.push({ startMs: tagToMs(minutes, seconds, fraction), text });
    }
  }
  entries.sort((x, y) => x.startMs - y.startMs);

  const lines: LyricLine[] = [];
  entries.forEach(({ startMs, text }, i) => {
    if (!text) return;
    const next = entries[i + 1];
    const endMs = next
      ? next.startMs
      : totalDurationMs !== undefined && totalDurationMs > startMs
        ? totalDurationMs
        : startMs + LAST_LINE_MS;
    lines.push({ index: lines.length, startMs, endMs, text });
  });
  return lines;
}

/**
 * Moves every line by `offsetMs`: positive values show the lyrics later.
 * Times never go below zero. Returns new lines and leaves the input alone.
 */
export function applyOffset(lines: LyricLine[], offsetMs: number): LyricLine[] {
  return lines.map((line) => ({
    ...line,
    startMs: Math.max(0, line.startMs + offsetMs),
    endMs: Math.max(0, line.endMs + offsetMs),
  }));
}

/**
 * Position in `lines` of the line playing at `timeMs`, or -1 when no line is.
 * A line counts from its start up to, but not including, its end.
 * Expects `lines` sorted by `startMs`, as `parseLrc` and `applyOffset` return them.
 */
export function activeLineIndex(lines: LyricLine[], timeMs: number): number {
  // Binary search for the last line that has already started.
  let low = 0;
  let high = lines.length - 1;
  let found = -1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    if (lines[mid].startMs <= timeMs) {
      found = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  return found !== -1 && timeMs < lines[found].endMs ? found : -1;
}
