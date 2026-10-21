import { pickBestCandidate, type LrclibCandidate } from './pick';
import type { LyricsLookup, LyricsQuery, LyricsSource } from './source';

const API_URL = 'https://lrclib.net/api';
const DEFAULT_TIMEOUT_MS = 6000;

/** What one LRCLIB call came back with. `candidates` is empty only when the service sent an empty list. */
type Answer =
  | { kind: 'candidates'; candidates: LrclibCandidate[] }
  | { kind: 'not_found' }
  | { kind: 'unavailable' };

const NOT_FOUND: Answer = { kind: 'not_found' };
const UNAVAILABLE: Answer = { kind: 'unavailable' };

function isCandidate(value: unknown): value is LrclibCandidate {
  if (typeof value !== 'object' || value === null) return false;
  const c = value as Record<string, unknown>;
  return (
    typeof c.id === 'number' &&
    typeof c.trackName === 'string' &&
    typeof c.artistName === 'string' &&
    typeof c.duration === 'number' &&
    (typeof c.syncedLyrics === 'string' || c.syncedLyrics === null)
  );
}

/**
 * /api/get answers with one song and /api/search with a list; both become a list of songs.
 * An empty list is a real "nothing here". Anything else that holds no well-formed song
 * (junk entries, an error object, null) is not an answer we can trust, so it is `unavailable`.
 */
function parseAnswer(body: unknown): Answer {
  if (Array.isArray(body) && body.length === 0) return { kind: 'candidates', candidates: [] };
  const items: unknown[] = Array.isArray(body) ? body : [body];
  const candidates = items.filter(isCandidate);
  return candidates.length > 0 ? { kind: 'candidates', candidates } : UNAVAILABLE;
}

function candidatesIn(answer: Answer): LrclibCandidate[] {
  return answer.kind === 'candidates' ? answer.candidates : [];
}

/**
 * Lyrics from LRCLIB (https://lrclib.net), asking /api/get and /api/search at the same time.
 * Both calls share one timeout (6 s unless `timeoutMs` says otherwise) that aborts them together.
 * A 404 or an empty list is `not_found`; a 5xx, any other bad status, a network error, an abort,
 * an answer that is not JSON and a 200 whose body holds no well-formed song (but is not an empty
 * list) are `unavailable`. Whatever the service could not tell us about is never reported as
 * "no lyrics": if one call is unavailable and the other has no usable candidate, the lookup is
 * `unavailable`.
 */
export function createLrclibSource(opts: { fetch: typeof fetch; client: string; timeoutMs?: number }): LyricsSource {
  // Taken off `opts` so it runs as a plain function: the browser's fetch throws
  // "Illegal invocation" when called as a method of another object.
  const doFetch = opts.fetch;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  async function call(path: 'get' | 'search', params: Record<string, string>, signal: AbortSignal): Promise<Answer> {
    try {
      const response = await doFetch(`${API_URL}/${path}?${new URLSearchParams(params)}`, {
        headers: { 'Lrclib-Client': opts.client },
        signal,
      });
      if (response.status === 404) return NOT_FOUND;
      if (!response.ok) return UNAVAILABLE;
      return parseAnswer(await response.json());
    } catch {
      // Network error, abort by the timeout, or a body that is not JSON.
      return UNAVAILABLE;
    }
  }

  return {
    async find(q: LyricsQuery): Promise<LyricsLookup> {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const [exact, search] = await Promise.all([
          call(
            'get',
            { artist_name: q.artist, track_name: q.track, duration: String(Math.round(q.durationS)) },
            controller.signal,
          ),
          call('search', { track_name: q.track, artist_name: q.artist }, controller.signal),
        ]);

        const best = pickBestCandidate([...candidatesIn(exact), ...candidatesIn(search)], q);
        if (best?.syncedLyrics) {
          return {
            status: 'found',
            result: {
              source: 'lrclib',
              ref: String(best.id),
              syncedLrc: best.syncedLyrics,
              durationS: best.duration,
              artist: best.artistName,
              track: best.trackName,
            },
          };
        }
        return exact.kind === 'unavailable' || search.kind === 'unavailable'
          ? { status: 'unavailable' }
          : { status: 'not_found' };
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
