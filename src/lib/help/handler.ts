import type { HelpStore } from '@/lib/supabase/helpStore';
import { getHelp, type HelpDeps } from './helpService';
import { checkStoredLine, parseHelpRequest } from './validate';

/** A real request is a few hundred characters; anything far past that is not one, and is not even parsed. */
const MAX_BODY_CHARS = 4096;

/** What `POST /api/help` reaches outside itself for. The route gives the real ones; tests give fakes. */
export interface HelpHandlerDeps {
  /** Who is signed in, from the session token, or null. */
  userId(): Promise<string | null>;
  /** Whether the person signed in is a member, as `is_member()` says with their own session. */
  isMember(): Promise<boolean>;
  /** The database behind the service key. Made only once the member check passed. */
  store(): HelpStore;
  callModel: HelpDeps['callModel'];
  now(): number;
}

/** Every answer of the route, so neither the browser nor anything in between keeps one. */
function answer(body: object, status: number): Response {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

const invalid = () => answer({ error: 'invalid' }, 400);

async function readBody(request: Request): Promise<unknown> {
  const text = await request.text();
  if (text.length > MAX_BODY_CHARS) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/**
 * `POST /api/help`: "Não entendi" and "Traduzir verso" for a line of a song in the app. The body is a `HelpRequest`.
 *
 * 200 `{ content }`; 401 with no session; 403 for someone who is not a member; 400 for a body that is not a request,
 * or that does not match the stored lyrics (ruling R61); 429 past the member's hourly limit; 503 when the model or the
 * database fails, which is never saved or counted. The reason for a failure goes to the server log only.
 */
export async function handleHelpRequest(request: Request, deps: HelpHandlerDeps): Promise<Response> {
  try {
    const userId = await deps.userId();
    if (!userId) return answer({ error: 'unauthenticated' }, 401);
    if (!(await deps.isMember())) return answer({ error: 'not_member' }, 403);

    const asked = parseHelpRequest(await readBody(request));
    if (!asked) return invalid();

    const store = deps.store();
    const checked = checkStoredLine(asked, await store.getVideo(asked.youtubeId));
    if (!checked) return invalid();

    const result = await getHelp(userId, checked, { ...store, callModel: deps.callModel }, deps.now());
    if (result.status === 200) return answer({ content: result.content }, 200);
    if (result.status === 429) return answer({ error: 'rate_limited' }, 429);
    return invalid();
  } catch (error) {
    console.warn('The help request failed.', error);
    return answer({ error: 'unavailable' }, 503);
  }
}
