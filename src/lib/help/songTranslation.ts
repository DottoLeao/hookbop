import { useSyncExternalStore } from 'react';
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
}

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
  if (response.type === 'opaqueredirect' || !response.ok) {
    throw new Error(`The song translation failed with ${response.status}`);
  }
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
 * there is no translation ready, and is a warning in the console.
 */
export function fetchSongTranslation(
  youtubeId: string,
  lyricsRef: string,
  fetcher: SongTranslationFetcher = postTranslateSong,
): SongTranslation {
  let snapshot: SongTranslationSnapshot = { lines: new Map(), settled: false };
  const listeners = new Set<() => void>();

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

  fetcher(youtubeId, lyricsRef, (lines) => {
    if (snapshot.settled) return;
    const known = new Map(snapshot.lines);
    for (const { lineIndex, text } of lines) if (!known.has(lineIndex)) known.set(lineIndex, text);
    change({ lines: known, settled: false });
  })
    .catch((error: unknown) => {
      console.warn('Could not get the translation of the song.', error);
    })
    .finally(() => change({ lines: snapshot.lines, settled: true }));

  return {
    getSnapshot: () => snapshot,
    subscribe,
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
 * open: opening the song again, or a retry of the lyrics, reuses the one there is, even one that failed.
 */
export function createSongTranslations(fetcher: SongTranslationFetcher = postTranslateSong) {
  const songs = new Map<string, SongTranslation>();
  return (youtubeId: string, lyricsRef: string): SongTranslation => {
    const key = JSON.stringify([youtubeId, lyricsRef]);
    let song = songs.get(key);
    if (!song) {
      song = fetchSongTranslation(youtubeId, lyricsRef, fetcher);
      songs.set(key, song);
    }
    return song;
  };
}

/** The app's own: `POST /api/translate-song`, once per song for as long as the app is open. */
export const translateSong = createSongTranslations();

/** No translation of the song: nothing will come, and the lines are asked for one by one. */
const NONE: SongTranslationSnapshot = { lines: new Map(), settled: true };
const getNone = () => NONE;
const subscribeToNothing = () => () => {};

/** What has come of the song's translation, following it as it streams in. */
export function useSongTranslation(song: SongTranslation | null | undefined): SongTranslationSnapshot {
  return useSyncExternalStore(
    song ? song.subscribe : subscribeToNothing,
    song ? song.getSnapshot : getNone,
    song ? song.getSnapshot : getNone,
  );
}
