import { foldWord } from '@/lib/game/text';
import { linesOfVideo } from '@/lib/lyrics/linesOfVideo';
import { parseYouTubeId } from '@/lib/youtube/parseUrl';
import type { HelpKind, HelpRequest } from './helpService';

/** A line longer than this is not a song line: it is turned down before anything is read or asked. */
export const MAX_LINE_CHARS = 300;
/** The longest word or expression that can be explained (ruling R63). */
export const MAX_TARGET_CHARS = 40;

const KINDS: ReadonlySet<string> = new Set<HelpKind>(['explain', 'translate']);

/** What the line check reads from the `videos` row. */
export interface StoredVideo {
  status: string | null;
  lyricsRef: string | null;
  lyricsLrc: string | null;
  lyricsDurationS: number | null;
}

/**
 * A request body with every field of a `HelpRequest`, each of the right type, or null. Only the shape is checked
 * here; `normalizeHelpRequest` checks the values and `checkStoredLine` the line.
 */
export function parseHelpRequest(body: unknown): HelpRequest | null {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return null;
  const { youtubeId, lyricsRef, lineIndex, lineText, kind, target } = body as Record<string, unknown>;
  if (typeof youtubeId !== 'string' || typeof lyricsRef !== 'string' || typeof lineText !== 'string') return null;
  if (typeof lineIndex !== 'number' || typeof target !== 'string') return null;
  if (typeof kind !== 'string' || !KINDS.has(kind)) return null;
  return { youtubeId, lyricsRef, lineIndex, lineText, kind: kind as HelpKind, target };
}

/**
 * The request as the cache knows it, or null when it cannot be answered (a 400). The line is trimmed, and the target
 * is trimmed and folded to lowercase with plain apostrophes, so "River", " river" and "river" are one cache row.
 *
 * The target is '' (the whole line) or part of the line, matched the same folded way, so a word tapped as "don't" is
 * found in a line written with "don’t". It is at most 40 characters, and a translation never has one (ruling R63).
 */
export function normalizeHelpRequest(r: HelpRequest): HelpRequest | null {
  if (parseYouTubeId(r.youtubeId) !== r.youtubeId || r.lyricsRef === '') return null;
  if (!Number.isInteger(r.lineIndex) || r.lineIndex < 0) return null;

  const lineText = r.lineText.trim();
  if (lineText === '' || lineText.length > MAX_LINE_CHARS) return null;

  const target = foldWord(r.target.trim());
  if (target.length > MAX_TARGET_CHARS) return null;
  if (r.kind === 'translate' ? target !== '' : !foldWord(lineText).includes(target)) return null;

  return { ...r, lineText, target };
}

/**
 * The target as the line writes it, for the model to read: the first stretch of the line that folds to it, with the
 * line's own capitals and apostrophes. `target` is folded already (`normalizeHelpRequest`).
 */
export function targetAsWritten(lineText: string, target: string): string {
  const folded = foldWord(lineText);
  const at = folded.indexOf(target);
  // Lowercasing can change the length of a few letters, and then positions no longer line up: the folded target is
  // still a fine highlight.
  if (at < 0 || folded.length !== lineText.length) return target;
  return lineText.slice(at, at + target.length);
}

/**
 * A line's text as two lines sung alike compare (ruling R72): trimmed, its runs of spaces made one, lowercased and
 * with plain apostrophes. So a chorus written "Paper boats" once and "PAPER  boats" later is one line to explain.
 */
export function sameTextKey(text: string): string {
  return foldWord(text.trim().replace(/\s+/g, ' '));
}

/** A request checked against the stored lyrics, and the other lines that have the same text as its line. */
export interface StoredLine {
  request: HelpRequest;
  sameTextLines: number[];
}

/**
 * The request checked against the video's stored lyrics (ruling R61), with the stored text of the line in place of the
 * one the browser sent, or null (a 400). The video must be playable, the request must be about its stored lyrics, the
 * line must exist, and the text the browser sent must be that line once trimmed. So the route explains only lines of
 * songs in the app, and no one can put help for a line that is not there into the cache every member reads.
 *
 * It also lists the other lines of the lyrics with the same text (`sameTextKey`), whose help is the same (ruling R72).
 */
export function checkStoredLine(r: HelpRequest, video: StoredVideo | null): StoredLine | null {
  if (!video || video.status !== 'ok') return null;
  const { lyricsRef, lyricsLrc, lyricsDurationS } = video;
  if (lyricsRef === null || lyricsLrc === null || lyricsDurationS === null) return null;
  if (r.lyricsRef !== lyricsRef || !Number.isInteger(r.lineIndex)) return null;

  const lines = linesOfVideo({ lyricsLrc, lyricsDurationS });
  const line = lines[r.lineIndex];
  if (!line || r.lineText.trim() !== line.text.trim()) return null;

  const key = sameTextKey(line.text);
  const sameTextLines = lines
    .filter((other) => other.index !== line.index && sameTextKey(other.text) === key)
    .map((other) => other.index);
  return { request: { ...r, lineText: line.text }, sameTextLines };
}
