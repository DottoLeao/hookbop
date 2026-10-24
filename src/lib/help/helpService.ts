import { ModelError } from './modelError';
import { costUsd, HELP_MODEL, type TokenUsage } from './pricing';
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

/** What the model gave back: the text of its answer, the tokens it took and how long the call ran. */
export interface ModelAnswer {
  text: string;
  usage: TokenUsage;
  latencyMs: number;
}

/**
 * One row of `ai_usage`, the log of the AI help: a request answered by the model, by the cache or by a chorus line,
 * and how it went. `model` is null, and the tokens and the cost are 0, when the model was not asked. `latencyMs` is
 * null when no time was measured. `kind`, `source` and `outcome` are always spelled out.
 */
export interface AiUsageEntry {
  userId: string;
  youtubeId: string;
  lineIndex: number;
  kind: HelpKind;
  /** Where the answer came from: the model, the per-line cache or the help of another line with the same text. */
  source: 'model' | 'cache' | 'reuse';
  model: string | null;
  inputTokens: number;
  outputTokens: number;
  /** The estimated cost in US dollars (`costUsd`). */
  costUsd: number;
  latencyMs: number | null;
  /** `declined` is an answer the model refused or cut short, `error` any other failure. */
  outcome: 'ok' | 'declined' | 'error';
}

/**
 * What `getHelp` reaches outside itself for. The cache, the budget and the usage log are the database (`line_help`,
 * `help_requests` through `reserve_help_request` / `release_help_request`, and `ai_usage`, service key only);
 * `callModel` is the model. The request they get is the normalized one: the line trimmed and the target folded to
 * lowercase (`normalizeHelpRequest`).
 *
 * The brief had `countRecent` and `logRequest` here. Ruling R73 replaced them with `reserve` and `release`, so that two
 * requests sent together cannot both take the last slot of the budget.
 */
export interface HelpDeps {
  getCached(r: HelpRequest): Promise<string | null>;
  saveCached(r: HelpRequest, content: string): Promise<void>;
  /** Takes one request of the member's hourly budget for that kind: its id, or null when none is left. */
  reserve(userId: string, kind: HelpKind): Promise<number | null>;
  /** Gives a reservation back, when the model gave no answer at all (ruling R75). */
  release(id: number): Promise<void>;
  callModel(system: string, user: string): Promise<ModelAnswer>;
  /** Adds one row to the usage log. `getHelp` never lets a failure of it reach the player. */
  recordUsage(entry: AiUsageEntry): Promise<void>;
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

/** Logs the usage of a request. A log that cannot be written never changes what the player gets: just a warning. */
async function record(deps: HelpDeps, entry: AiUsageEntry): Promise<void> {
  try {
    await deps.recordUsage(entry);
  } catch (error) {
    console.warn('Could not record the AI usage.', error);
  }
}

/** The log row of a request the model was not asked about: the cache or a chorus line answered it, for nothing. */
function freeEntry(userId: string, r: HelpRequest, source: 'cache' | 'reuse'): AiUsageEntry {
  return {
    userId,
    youtubeId: r.youtubeId,
    lineIndex: r.lineIndex,
    kind: r.kind,
    source,
    model: null,
    inputTokens: 0,
    outputTokens: 0,
    costUsd: 0,
    latencyMs: null,
    outcome: 'ok',
  };
}

/**
 * The log row of a request the model was asked about. Without `usage` (no answer came) there are no tokens to count,
 * and without `latencyMs` the time is not known.
 */
function modelEntry(
  userId: string,
  r: HelpRequest,
  call: { usage?: TokenUsage; latencyMs?: number },
  outcome: AiUsageEntry['outcome'],
): AiUsageEntry {
  const usage = call.usage ?? { inputTokens: 0, outputTokens: 0 };
  return {
    userId,
    youtubeId: r.youtubeId,
    lineIndex: r.lineIndex,
    kind: r.kind,
    source: 'model',
    model: HELP_MODEL,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    costUsd: costUsd(HELP_MODEL, usage),
    latencyMs: call.latencyMs ?? null,
    outcome,
  };
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
 * 5. the model is asked. When no answer came (the call could not be made, timed out or was aborted), the reservation
 *    is given back; when the model answered with nothing usable (a refusal, an answer cut short or with no text), it
 *    is kept, since that call was made and billed (ruling R75). Either way the failure goes on;
 * 6. its answer is saved for every member.
 *
 * Steps 2, 3 and 5 also log their usage (`recordUsage`), as soon as the outcome is known: a cache hit and a chorus line
 * as free rows, the model call with its tokens, estimated cost and time, whatever came of it. A request turned away
 * (400, 429) asked nothing and logs nothing. The log is an addition: when it cannot be written the player still gets
 * the same answer or the same failure.
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
  if (cached !== null) {
    await record(deps, freeEntry(userId, request, 'cache'));
    return { status: 200, content: cached };
  }

  const reused = await fromSameText(deps, request, sameTextLines);
  if (reused !== null) {
    await record(deps, freeEntry(userId, request, 'reuse'));
    await save(deps, request, reused);
    return { status: 200, content: reused };
  }

  const reservation = await deps.reserve(userId, request.kind);
  if (reservation === null) return { status: 429 };

  let answer: ModelAnswer;
  try {
    answer = await deps.callModel(systemFor(request.kind), userMessage(request));
  } catch (error) {
    if (!(error instanceof ModelError && error.answered)) {
      await deps.release(reservation).catch((releaseError: unknown) => {
        console.warn('Could not give the help request back.', releaseError);
      });
    }
    const outcome = error instanceof ModelError && error.declined ? 'declined' : 'error';
    await record(deps, modelEntry(userId, request, error instanceof ModelError ? error : {}, outcome));
    throw error;
  }

  await record(deps, modelEntry(userId, request, answer, 'ok'));
  await save(deps, request, answer.text);
  return { status: 200, content: answer.text };
}
