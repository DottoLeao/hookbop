import { readJsonBody } from '@/lib/http/readJsonBody';
import type { HelpStore } from '@/lib/supabase/helpStore';
import { getHelp, type HelpDeps } from './helpService';
import { ModelError } from './modelError';
import { checkStoredLine, normalizeHelpRequest, parseHelpRequest } from './validate';

/** A real request is a few hundred bytes; anything past this is not one, and is not even read to its end. */
const MAX_BODY_BYTES = 4096;

/** What `POST /api/help` reaches outside itself for. The route gives the real ones; tests give fakes. */
export interface HelpHandlerDeps {
  /** Who is signed in, from the session token, or null. */
  userId(): Promise<string | null>;
  /** Whether the person signed in is a member, as `is_member()` says with their own session. */
  isMember(): Promise<boolean>;
  /** The database behind the service key. Made only once the member check passed. */
  store(): HelpStore;
  callModel: HelpDeps['callModel'];
}

/** Every answer of the route, so neither the browser nor anything in between keeps one. */
function answer(body: object, status: number): Response {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

const invalid = () => answer({ error: 'invalid' }, 400);

/**
 * `POST /api/help`: "Não entendi" and "Traduzir verso" for a line of a song in the app. The body is a `HelpRequest`.
 *
 * - 200 `{ content }`.
 * - 401 with no session; 403 for someone who is not a member.
 * - 400 for a body that is not a request, or that breaks the rules of a request (checked before the database is read),
 *   or that does not match the stored lyrics (ruling R61).
 * - 429 when the member's hourly budget for that kind of help is used up.
 * - 422 when the model refused or ran out of room: asking again would not change it (ruling R74).
 * - 503 when the model or the database fails, or the session cannot be read. Never saved, and the budget is given back.
 *
 * The reason for a failure goes to the server log only. Every answer, failures included, has `Cache-Control: no-store`.
 */
export async function handleHelpRequest(request: Request, deps: HelpHandlerDeps): Promise<Response> {
  try {
    const userId = await deps.userId();
    if (!userId) return answer({ error: 'unauthenticated' }, 401);
    if (!(await deps.isMember())) return answer({ error: 'not_member' }, 403);

    const parsed = parseHelpRequest(await readJsonBody(request, MAX_BODY_BYTES));
    const asked = parsed && normalizeHelpRequest(parsed);
    if (!asked) return invalid();

    const store = deps.store();
    const stored = checkStoredLine(asked, await store.getVideo(asked.youtubeId));
    if (!stored) return invalid();

    const result = await getHelp(userId, stored.request, { ...store, callModel: deps.callModel }, stored.sameTextLines);
    if (result.status === 200) return answer({ content: result.content }, 200);
    if (result.status === 429) return answer({ error: 'rate_limited' }, 429);
    return invalid();
  } catch (error) {
    console.warn('The help request failed.', error);
    if (error instanceof ModelError && error.declined) return answer({ error: 'declined' }, 422);
    return answer({ error: 'unavailable' }, 503);
  }
}
