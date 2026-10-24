import { readJsonBody } from '@/lib/http/readJsonBody';
import type { Database } from '@/lib/supabase/database.types';
import { MAX_BODY_BYTES, parseEventsRequest } from './events';

/** A row of `app_events` as the route writes it. The id and the time are the database's. */
export type EventRow = Database['public']['Tables']['app_events']['Insert'];

/** What `POST /api/events` reaches outside itself for. The route gives the real ones; tests give fakes. */
export interface EventsHandlerDeps {
  /** Who is signed in, from the session token, or null. */
  userId(): Promise<string | null>;
  /** Whether the person signed in is a member, as `is_member()` says with their own session. */
  isMember(): Promise<boolean>;
  /** Writes the rows, behind the service key. The key is only taken up in here, so only once the member check passed. */
  record(rows: EventRow[]): Promise<void>;
}

/** Every answer of the route, so neither the browser nor anything in between keeps one. */
function answer(body: object | null, status: number): Response {
  const headers = { 'Cache-Control': 'no-store' };
  return body === null ? new Response(null, { status, headers }) : Response.json(body, { status, headers });
}

/**
 * `POST /api/events`: the actions of the app for the owner's panel. The body is `{ sessionId, events }` (see
 * `parseEventsRequest`): at most 20 events and 8 KB.
 *
 * - 204 with no body once the events are written.
 * - 401 with no session; 403 for someone who is not a member. Neither reads the body.
 * - 400 for a body that is not a request: too big, not JSON, an action that is not on the list, more than 20 events...
 * - 503 when the session, the membership or the database cannot be reached.
 *
 * Whose events they are comes from the session and nowhere else: a `user_id` in the body is never read. The reason for
 * a failure goes to the server log only. Every answer has `Cache-Control: no-store`.
 */
export async function handleEventsRequest(request: Request, deps: EventsHandlerDeps): Promise<Response> {
  try {
    const userId = await deps.userId();
    if (!userId) return answer({ error: 'unauthenticated' }, 401);
    if (!(await deps.isMember())) return answer({ error: 'not_member' }, 403);

    const parsed = parseEventsRequest(await readJsonBody(request, MAX_BODY_BYTES));
    if (!parsed) return answer({ error: 'invalid' }, 400);

    await deps.record(
      parsed.events.map(
        (event): EventRow => ({
          user_id: userId,
          session_id: parsed.sessionId,
          name: event.name,
          youtube_id: event.youtubeId,
          mode: event.mode,
          props: event.props,
        }),
      ),
    );
    return answer(null, 204);
  } catch (error) {
    console.warn('The events could not be recorded.', error);
    return answer({ error: 'unavailable' }, 503);
  }
}
