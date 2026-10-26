import { readJsonBody } from '@/lib/http/readJsonBody';
import type { HelpStore, TranslationCache } from '@/lib/supabase/helpStore';
import { parseSongAsk, startSongTranslation, type LineTranslation, type SongRun, type StreamModel } from './songService';

/** A request is a video id and a lyrics ref, well under this. */
const MAX_BODY_BYTES = 1024;

/** What `POST /api/translate-song` reaches outside itself for. The route gives the real ones; tests give fakes. */
export interface TranslateSongHandlerDeps {
  /** Who is signed in, from the session token, or null. */
  userId(): Promise<string | null>;
  /** Whether the person signed in is a member, as `is_member()` says with their own session. */
  isMember(): Promise<boolean>;
  /** The database behind the service key. Made only once the member check passed. */
  store(): HelpStore & TranslationCache;
  streamModel: StreamModel;
  /**
   * Keeps the server on `job` after the response is over (the platform's `waitUntil`, through `after`), so the lines
   * still coming are saved, and the call logged, even when the player has gone. `job` never rejects.
   */
  keepAlive(job: Promise<void>): void;
}

/** Every answer of the route, so neither the browser nor anything in between keeps one. */
function answer(body: object, status: number): Response {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

const invalid = () => answer({ error: 'invalid' }, 400);

/** The translations go out as JSON lines: `{"lineIndex":0,"text":"..."}`, one per line of the song. */
const STREAM_HEADERS = { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store' };

/**
 * The body of a 200: what `run` sends goes out at once, and the stream closes as soon as `run` says the last line is
 * out, or when it is done whatever happened. A player who leaves cancels the stream and nothing more: `run` goes on,
 * kept alive after the response, and later lines are just not sent.
 */
function streamOf(run: SongRun, keepAlive: TranslateSongHandlerDeps['keepAlive']): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let open = true;
  return new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (lines: readonly LineTranslation[]) => {
        if (!open || lines.length === 0) return;
        const text = lines.map(({ lineIndex, text }) => `${JSON.stringify({ lineIndex, text })}\n`).join('');
        try {
          controller.enqueue(encoder.encode(text));
        } catch {
          open = false;
        }
      };
      const end = () => {
        if (!open) return;
        open = false;
        try {
          controller.close();
        } catch {
          // Closed already: the player went away.
        }
      };
      const job = run(send, end).finally(end);
      try {
        keepAlive(job);
      } catch (error) {
        console.warn('Could not keep the song translation going after the response.', error);
      }
    },
    cancel() {
      open = false;
    },
  });
}

/**
 * `POST /api/translate-song`: the translation of every line of a song in the app, fetched by the song screen as soon
 * as the lyrics are known. The body is `{ youtubeId, lyricsRef }`; the lines are read from the stored lyrics, never
 * from the browser.
 *
 * - 200 with a stream of JSON lines, `{ lineIndex, text }`, in the order they come: first every line the cache has,
 *   then each line as the model gives it. A line that is not in it has no translation this time (the model failed,
 *   gave nothing usable for it, or the budget is used up); the browser asks for it by line.
 * - 401 with no session; 403 for someone who is not a member.
 * - 400 for a body that is not a request, or lyrics that are not the stored ones.
 * - 429 when the hourly translation budget is used up and the cache has none of the lines.
 * - 503 when the database fails or the session cannot be read, before anything is sent.
 *
 * The reason for a failure goes to the server log only. Every answer has `Cache-Control: no-store`.
 */
export async function handleTranslateSongRequest(request: Request, deps: TranslateSongHandlerDeps): Promise<Response> {
  try {
    const userId = await deps.userId();
    if (!userId) return answer({ error: 'unauthenticated' }, 401);
    if (!(await deps.isMember())) return answer({ error: 'not_member' }, 403);

    const ask = parseSongAsk(await readJsonBody(request, MAX_BODY_BYTES));
    if (!ask) return invalid();

    const start = await startSongTranslation(userId, ask, { ...deps.store(), streamModel: deps.streamModel });
    if (start.status === 400) return invalid();
    if (start.status === 429) return answer({ error: 'rate_limited' }, 429);
    return new Response(streamOf(start.run, deps.keepAlive), { status: 200, headers: STREAM_HEADERS });
  } catch (error) {
    console.warn('The song translation request failed.', error);
    return answer({ error: 'unavailable' }, 503);
  }
}
