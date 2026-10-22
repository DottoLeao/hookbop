import { explainUserMessage, systemFor, translateUserMessage } from './prompts';
import { normalizeHelpRequest, targetAsWritten } from './validate';

export type HelpKind = 'explain' | 'translate';

/**
 * One ask for help with a line of a song's stored lyrics: explain `target` in it ('' for the whole line), or translate
 * it (`target` is then '').
 */
export interface HelpRequest {
  youtubeId: string;
  lyricsRef: string;
  lineIndex: number;
  lineText: string;
  kind: HelpKind;
  target: string;
}

/**
 * What `getHelp` reaches outside itself for. The cache and the request log are the database (`line_help` and
 * `help_requests`, service key only); `callModel` is the model. The request they get is the normalized one: the line
 * trimmed and the target folded to lowercase (`normalizeHelpRequest`).
 */
export interface HelpDeps {
  getCached(r: HelpRequest): Promise<string | null>;
  saveCached(r: HelpRequest, content: string): Promise<void>;
  countRecent(userId: string, sinceMs: number): Promise<number>;
  logRequest(userId: string): Promise<void>;
  callModel(system: string, user: string): Promise<string>;
}

export type HelpResult = { status: 200; content: string } | { status: 429 } | { status: 400 };

/** How many asks that reach the model a member may make in an hour. Answers from the cache do not count. */
export const HELP_LIMIT_PER_HOUR = 60;
const HOUR_MS = 3_600_000;

function userMessage(r: HelpRequest): string {
  return r.kind === 'explain'
    ? explainUserMessage(r.lineText, targetAsWritten(r.lineText, r.target))
    : translateUserMessage(r.lineText);
}

/**
 * The help for a line, in this order (ruling R62): the request is checked (400), the cache answers when it can (and
 * that costs nothing), the member's last hour is counted (429 at 60), the model is asked, its answer is saved for every
 * member, and the request is counted.
 *
 * A model failure is not caught: it rejects, and nothing is saved or counted. An answer that cannot be saved is still
 * given and counted, since the model was asked; the next ask for that line just asks it again.
 */
export async function getHelp(userId: string, r: HelpRequest, deps: HelpDeps, nowMs: number): Promise<HelpResult> {
  const request = normalizeHelpRequest(r);
  if (!request) return { status: 400 };

  const cached = await deps.getCached(request);
  if (cached !== null) return { status: 200, content: cached };

  if ((await deps.countRecent(userId, nowMs - HOUR_MS)) >= HELP_LIMIT_PER_HOUR) return { status: 429 };

  const content = await deps.callModel(systemFor(request.kind), userMessage(request));
  try {
    await deps.saveCached(request, content);
  } catch (error) {
    console.warn('Could not save the help for this line.', error);
  }
  await deps.logRequest(userId);
  return { status: 200, content };
}
