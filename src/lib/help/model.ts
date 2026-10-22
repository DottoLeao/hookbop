import 'server-only';
import Anthropic from '@anthropic-ai/sdk';
import { ModelError } from './modelError';

// The marker import above makes the build fail if a Client Component ever pulls this module in, so the key
// (ANTHROPIC_API_KEY, which the SDK reads from the environment) is only ever read on the server.

/** The model every explanation and translation comes from. */
export const HELP_MODEL = 'claude-haiku-5-5';

/** Two short sentences, or one translated line. */
const MAX_TOKENS = 300;

/** The whole call, its retry and any `retry-after` wait included, never takes longer than this. */
const DEADLINE_MS = 20_000;

let shared: Anthropic | undefined;

/** One client for the server, made on first use: 15 s per try, and one retry. */
function client(): Anthropic {
  shared ??= new Anthropic({ timeout: 15_000, maxRetries: 1 });
  return shared;
}

/** What went wrong, by the SDK's error types, for the server log. */
function reasonOf(error: unknown): string {
  // The deadline aborting the call. It is an APIError too, so it is checked first.
  if (error instanceof Anthropic.APIUserAbortError) return 'The model gave no answer in 20 s';
  if (error instanceof Anthropic.RateLimitError) return 'The model service is rate limiting the app';
  // A timeout of one try is a connection error too.
  if (error instanceof Anthropic.APIConnectionError) return 'The model service could not be reached';
  if (error instanceof Anthropic.APIError) return `The model service answered ${error.status}`;
  return 'The model call failed';
}

/**
 * Asks Haiku 5.5 once, with `system` as the system prompt and `user` as the only message, and gives back the text of
 * its answer. Thinking is off and effort low (ruling R66), so the 300 tokens all go to the answer.
 *
 * Anything but a finished answer with text in it is a ModelError, which must never reach the cache. A refusal or an
 * answer cut short (`max_tokens`) is `declined`: asking again would not change it. A call that failed or ran past the
 * 20 s, an answer that stopped for another reason, or one with no text may work the next time.
 */
export async function callModel(system: string, user: string): Promise<string> {
  let response: Anthropic.Message;
  try {
    response = await client().messages.create(
      {
        model: HELP_MODEL,
        max_tokens: MAX_TOKENS,
        thinking: { type: 'disabled' },
        output_config: { effort: 'low' },
        system,
        messages: [{ role: 'user', content: user }],
      },
      { signal: AbortSignal.timeout(DEADLINE_MS) },
    );
  } catch (error) {
    throw new ModelError(reasonOf(error), { cause: error });
  }

  const stopReason = response.stop_reason;
  if (stopReason === 'refusal' || stopReason === 'max_tokens') {
    throw new ModelError(`The model stopped with ${stopReason}`, { declined: true });
  }
  if (stopReason !== 'end_turn') throw new ModelError(`The model stopped with ${stopReason}`);

  const text = response.content
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('')
    .trim();
  if (!text) throw new ModelError('The model answered with no text');
  return text;
}
