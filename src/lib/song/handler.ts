import { readJsonBody } from '@/lib/http/readJsonBody';
import {
  readOnlyStore,
  resolveSong,
  type SongResolution,
  type SongStore,
  type VideoMeta,
} from '@/lib/lyrics/resolveSong';
import type { LyricsSource } from '@/lib/lyrics/source';
import { isVideoId } from '@/lib/youtube/parseUrl';

/** A real request is about 50 bytes; anything past this is not one, and is not even read to its end. */
const MAX_BODY_BYTES = 1024;

/** No song runs longer. A duration past it is not one a player read, so it is refused. */
export const MAX_DURATION_S = 12 * 3600;

/**
 * What the song screen asks: the video, and how long the player says it is in seconds. `durationS` is null (or 0)
 * when the player could not tell within its wait (ruling R42).
 */
export interface SongRequest {
  youtubeId: string;
  durationS: number | null;
}

/** The request, or null when the body is not one: a bare video id, and a duration from 0 to 12 hours or null. */
export function parseSongRequest(body: unknown): SongRequest | null {
  if (typeof body !== 'object' || body === null) return null;
  const { youtubeId, durationS } = body as Record<string, unknown>;
  if (typeof youtubeId !== 'string' || !isVideoId(youtubeId)) return null;
  if (durationS === null) return { youtubeId, durationS };
  if (typeof durationS !== 'number' || !Number.isFinite(durationS)) return null;
  if (durationS < 0 || durationS > MAX_DURATION_S) return null;
  return { youtubeId, durationS };
}

/** What `POST /api/song` reaches outside itself for. The route gives the real ones; tests give fakes. */
export interface SongHandlerDeps {
  /** Who is signed in, from the session token, or null. */
  userId(): Promise<string | null>;
  /** Whether the person signed in is a member, as `is_member()` says with their own session. */
  isMember(): Promise<boolean>;
  /** The `videos` table behind the service key, which no member may write. Made only once the member check passed. */
  store(): SongStore;
  /** Title and channel from YouTube, or null when YouTube does not know the video. */
  meta(id: string): Promise<VideoMeta | null>;
  /** The lyrics service. */
  lyrics(): LyricsSource;
  now(): Date;
}

/** Every answer of the route, so neither the browser nor anything in between keeps one. */
function answer(body: object, status: number): Response {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

/**
 * `POST /api/song`: finds what the song screen needs for a video (`resolveSong`), on the server (ruling R81). Only the
 * server writes the shared `videos` rows, so no member can plant lyrics, a status or a title for everyone, and the help
 * route's line check (ruling R61) only ever trusts rows the server wrote.
 *
 * - 200 with the `SongResolution`, whatever it says: ready, no lyrics, lyrics service slow, video gone.
 * - 401 with no session; 403 for someone who is not a member.
 * - 400 for a body that is not a `SongRequest`, or bigger than 1 KB.
 * - 503 when the database or YouTube fails, or the session cannot be read.
 *
 * Without a duration (null or 0) the lookup is a best guess: it reads the saved video but saves nothing, and it never
 * asks for a calibration (ruling R42). The reason for a failure goes to the server log only. Every answer, failures
 * included, has `Cache-Control: no-store`.
 */
export async function handleSongRequest(request: Request, deps: SongHandlerDeps): Promise<Response> {
  try {
    const userId = await deps.userId();
    if (!userId) return answer({ error: 'unauthenticated' }, 401);
    if (!(await deps.isMember())) return answer({ error: 'not_member' }, 403);

    const asked = parseSongRequest(await readJsonBody(request, MAX_BODY_BYTES));
    if (!asked) return answer({ error: 'invalid' }, 400);

    const durationS = asked.durationS ?? 0;
    const durationKnown = durationS > 0;
    const store = deps.store();
    let resolution: SongResolution = await resolveSong(asked.youtubeId, durationS, {
      store: durationKnown ? store : readOnlyStore(store),
      meta: deps.meta,
      lyrics: deps.lyrics(),
      now: deps.now,
    });
    // A video of unknown length cannot be told to run longer than its lyrics.
    if (!durationKnown && resolution.status === 'ready') resolution = { ...resolution, needsCalibration: false };
    return answer(resolution, 200);
  } catch (error) {
    console.warn('The song request failed.', error);
    return answer({ error: 'unavailable' }, 503);
  }
}
