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
 * What `getHelp` reaches outside itself for. The cache and the budget are the database (`line_help`, and
 * `help_requests` through `reserve_help_request` / `release_help_request`, service key only); `callModel` is the model.
 * The request they get is the normalized one: the line trimmed and the target folded to lowercase
 * (`normalizeHelpRequest`).
 *
 * The brief had `countRecent` and `logRequest` here. Ruling R73 replaced them with `reserve` and `release`, so that two
 * requests sent together cannot both take the last slot of the budget.
 */
export interface HelpDeps {
  getCached(r: HelpRequest): Promise<string | null>;
  saveCached(r: HelpRequest, content: string): Promise<void>;
  /** Takes one request of the member's hourly budget for that kind: its id, or null when none is left. */
  reserve(userId: string, kind: HelpKind): Promise<number | null>;
  /** Gives a reservation back, when the model gave no answer. */
  release(id: number): Promise<void>;
  callModel(system: string, user: string): Promise<string>;
}

export type HelpResult = { status: 200; content: string } | { status: 429 } | { status: 400 };

/**
 * How many asks that reach the model a member may make in an hour, per kind (ruling R73). Answers from the cache
 * cost nothing. Translations get more: Karaokê translates every line of a song, about 70 for a long one, and a few
 * new songs an hour must not use up "Não entendi".
 */
export const HELP_BUDGET_PER_HOUR: Readonly<Record<HelpKind, number>> = { explain: 60, translate: 240 };

function userMessage(r: HelpRequest): string {
  return r.kind === 'explain'
    ? explainUserMessage(r.lineText, targetAsWritten(r.lineText, r.target))
    : translateUserMessage(r.lineText);
}

/** Saves an answer for every member. One that cannot be saved is still a good answer: the next ask makes it again. */
async function save(deps: HelpDeps, r: HelpRequest, content: string): Promise<void> {
  try {
    await deps.saveCached(r, content);
  } catch (error) {
    console.warn('Could not save the help for this line.', error);
  }
}

/** The same help already given for another of these lines, which have the same text as the one asked about. */
async function fromSameText(deps: HelpDeps, r: HelpRequest, lineIndexes: readonly number[]): Promise<string | null> {
  const others = lineIndexes.filter((lineIndex) => lineIndex !== r.lineIndex);
  const found = await Promise.all(others.map((lineIndex) => deps.getCached({ ...r, lineIndex })));
  return found.find((content) => content !== null) ?? null;
}

/**
 * The help for a line, in this order (rulings R62, R72 and R73):
 * 1. the request is checked (400);
 * 2. the cache answers when it can, which costs nothing;
 * 3. so does the help already given for another line with the same text (`sameTextLines`, a chorus sung again),
 *    which is then saved for this line too;
 * 4. one request of the member's budget for that kind is reserved (429 when none is left);
 * 5. the model is asked: when it fails, the reservation is given back and the failure goes on;
 * 6. its answer is saved for every member.
 */
export async function getHelp(
  userId: string,
  r: HelpRequest,
  deps: HelpDeps,
  sameTextLines: readonly number[] = [],
): Promise<HelpResult> {
  const request = normalizeHelpRequest(r);
  if (!request) return { status: 400 };

  const cached = await deps.getCached(request);
  if (cached !== null) return { status: 200, content: cached };

  const reused = await fromSameText(deps, request, sameTextLines);
  if (reused !== null) {
    await save(deps, request, reused);
    return { status: 200, content: reused };
  }

  const reservation = await deps.reserve(userId, request.kind);
  if (reservation === null) return { status: 429 };

  let content: string;
  try {
    content = await deps.callModel(systemFor(request.kind), userMessage(request));
  } catch (error) {
    await deps.release(reservation).catch((releaseError: unknown) => {
      console.warn('Could not give the help request back.', releaseError);
    });
    throw error;
  }

  await save(deps, request, content);
  return { status: 200, content };
}
