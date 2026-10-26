import { useCallback, useSyncExternalStore } from 'react';
import type { LineTranslation } from './songService';

/** What has come of a song's translation so far. */
export interface SongTranslationSnapshot {
  /** The translations that came, by line index. */
  lines: ReadonlyMap<number, string>;
  /** The request is over (it ended or failed): a line not in `lines` will not come from it. */
  settled: boolean;
}

/**
 * The translation of a whole song, kept in memory as it streams in. `subscribe` and `getSnapshot` are the shape
 * `useSyncExternalStore` takes; the snapshot is a new object each time something changes, and the same one otherwise.
 */
export interface SongTranslation {
  getSnapshot(): SongTranslationSnapshot;
  subscribe(listener: () => void): () => void;
  /** The translation of the line once it came, or undefined once the request is over without it. */
  line(lineIndex: number): Promise<string | undefined>;
  /**
   * Asks again when the request is over with no line at all, for a reason that may not last (the network, the model, a
   * 503), and only once in the session. Not after a 400 (the lyrics are not the stored ones) or a 429 (the hourly
   * budget is used up), not while the request is on its way, not once lines came. Says whether it asked.
   */
  retryIfFailed(): boolean;
}

/** A request for the translation of a song that the route answered with something other than its lines. */
export class SongTranslationError extends Error {
  override name = 'SongTranslationError';

  constructor(readonly status: number) {
    super(`The song translation failed with ${status}`);
  }
}

/** The answers asking again would not change. */
const FINAL_STATUSES: ReadonlySet<number> = new Set([400, 429]);

/** Gets the lines of a song from the server, handing them over as they come. Resolves at the end; rejects on failure. */
export type SongTranslationFetcher = (
  youtubeId: string,
  lyricsRef: string,
  onLines: (lines: LineTranslation[]) => void,
) => Promise<void>;

/** One line of the stream, or null when it is not a translation of a line. */
function readLine(line: string): LineTranslation | null {
  if (line.trim() === '') return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(line);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) return null;
  const { lineIndex, text } = parsed as Record<string, unknown>;
  if (typeof lineIndex !== 'number' || !Number.isInteger(lineIndex) || lineIndex < 0) return null;
  if (typeof text !== 'string' || text === '') return null;
  return { lineIndex, text };
}

/**
 * `POST /api/translate-song`, read as it streams: one JSON object per line of the body, each handed over as soon as
 * it is whole. A redirect is not followed: it is how src/proxy.ts turns away a request with no session or from someone
 * who is not a member. Any status but 200 is a failure, and so is a body that breaks off.
 */
export const postTranslateSong: SongTranslationFetcher = async (youtubeId, lyricsRef, onLines) => {
  const response = await fetch('/api/translate-song', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ youtubeId, lyricsRef }),
    cache: 'no-store',
    redirect: 'manual',
  });
  // The redirect of src/proxy.ts is what a missing session or membership gets: a 401, as far as this is concerned.
  if (response.type === 'opaqueredirect') throw new SongTranslationError(401);
  if (!response.ok) throw new SongTranslationError(response.status);
  if (!response.body) return;

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let pending = '';
  const handOver = (text: string) => {
    const lines = text.split('\n').map(readLine).filter((line) => line !== null);
    if (lines.length > 0) onLines(lines);
  };
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    pending += decoder.decode(value, { stream: true });
    const end = pending.lastIndexOf('\n');
    if (end < 0) continue;
    handOver(pending.slice(0, end));
    pending = pending.slice(end + 1);
  }
  handOver(pending + decoder.decode());
};

/**
 * Starts the request for a song's translation now, and keeps what comes. The first translation of a line is the one
 * kept. When the request is over, ended or failed, the translation is settled with whatever came: a failure only means
 * there is no translation ready, and is a warning in the console. One that brought no line can be asked again, once
 * (`retryIfFailed`).
 */
export function fetchSongTranslation(
  youtubeId: string,
  lyricsRef: string,
  fetcher: SongTranslationFetcher = postTranslateSong,
): SongTranslation {
  let snapshot: SongTranslationSnapshot = { lines: new Map(), settled: false };
  const listeners = new Set<() => void>();
  // Whether the request is over with nothing, for a reason asking again may change; and whether it was asked again.
  let worthRetrying = false;
  let retried = false;

  function change(next: SongTranslationSnapshot) {
    snapshot = next;
    for (const listener of [...listeners]) listener();
  }

  function subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }

  function start() {
    let finalFailure = false;
    fetcher(youtubeId, lyricsRef, (lines) => {
      if (snapshot.settled) return;
      const known = new Map(snapshot.lines);
      for (const { lineIndex, text } of lines) if (!known.has(lineIndex)) known.set(lineIndex, text);
      change({ lines: known, settled: false });
    })
      .catch((error: unknown) => {
        finalFailure = error instanceof SongTranslationError && FINAL_STATUSES.has(error.status);
        console.warn('Could not get the translation of the song.', error);
      })
      .finally(() => {
        worthRetrying = snapshot.lines.size === 0 && !finalFailure;
        change({ lines: snapshot.lines, settled: true });
      });
  }

  start();

  return {
    getSnapshot: () => snapshot,
    subscribe,
    retryIfFailed() {
      if (!snapshot.settled || !worthRetrying || retried) return false;
      retried = true;
      worthRetrying = false;
      change({ lines: new Map(), settled: false });
      start();
      return true;
    },
    line(lineIndex) {
      return new Promise((resolve) => {
        const settledOn = () => {
          const text = snapshot.lines.get(lineIndex);
          if (text === undefined && !snapshot.settled) return false;
          resolve(text);
          return true;
        };
        if (settledOn()) return;
        const stop = subscribe(() => {
          if (settledOn()) stop();
        });
      });
    },
  };
}

/**
 * The translations of the songs opened in the app, each asked for once per song and lyrics for as long as the app is
 * open: opening the song again, or a retry of the lyrics, reuses the one there is. One that failed with nothing is asked
 * again then, once (`retryIfFailed`).
 */
export function createSongTranslations(fetcher: SongTranslationFetcher = postTranslateSong) {
  const songs = new Map<string, SongTranslation>();
  return (youtubeId: string, lyricsRef: string): SongTranslation => {
    const key = JSON.stringify([youtubeId, lyricsRef]);
    const known = songs.get(key);
    if (known) {
      known.retryIfFailed();
      return known;
    }
    const song = fetchSongTranslation(youtubeId, lyricsRef, fetcher);
    songs.set(key, song);
    return song;
  };
}

/** The app's own: `POST /api/translate-song`, once per song for as long as the app is open. */
export const translateSong = createSongTranslations();

/** What the translation of the song has for one line, and whether the request is over. */
export interface SongLine {
  text: string | undefined;
  settled: boolean;
}

const noListening = () => {};

/**
 * What the translation of the song has for `lineIndex`, following it as it streams in. The component renders again
 * only when that line's translation or the end of the request changes, never for the other lines, and not at all
 * while `active` is false: it then does not listen, and reads the latest when it renders for another reason or when
 * `active` turns true. With no translation of the song, the request is over and has nothing.
 */
export function useSongLine(song: SongTranslation | null | undefined, lineIndex: number, active: boolean): SongLine {
  const subscribe = useCallback(
    (listener: () => void) => (song && active ? song.subscribe(listener) : noListening),
    [song, active],
  );
  const readText = () => song?.getSnapshot().lines.get(lineIndex);
  const readSettled = () => (song ? song.getSnapshot().settled : true);
  const text = useSyncExternalStore(subscribe, readText, readText);
  const settled = useSyncExternalStore(subscribe, readSettled, readSettled);
  return { text, settled };
}
