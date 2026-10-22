import 'server-only';
import Anthropic from '@anthropic-ai/sdk';

// The marker import above makes the build fail if a Client Component ever pulls this module in, so the key
// (ANTHROPIC_API_KEY, which the SDK reads from the environment) is only ever read on the server.

/** The model every explanation and translation comes from. */
export const HELP_MODEL = 'claude-haiku-5-5';

/** Two short sentences, or one translated line. */
const MAX_TOKENS = 300;

/** Why the model gave no usable answer. Never cached, never counted against the member. */
export class ModelError extends Error {
  override name = 'ModelError';
}

let shared: Anthropic | undefined;

/** One client for the server, made on first use: 15 s per try, and one retry. */
function client(): Anthropic {
  shared ??= new Anthropic({ timeout: 15_000, maxRetries: 1 });
  return shared;
}

/** What went wrong, by the SDK's error types, for the server log. */
function reasonOf(error: unknown): string {
  if (error instanceof Anthropic.RateLimitError) return 'The model service is rate limiting the app';
  // A timeout is a connection error too.
  if (error instanceof Anthropic.APIConnectionError) return 'The model service could not be reached';
  if (error instanceof Anthropic.APIError) return `The model service answered ${error.status}`;
  return 'The model call failed';
}

/**
 * Asks Haiku 5.5 once, with `system` as the system prompt and `user` as the only message, and gives back the text of
 * its answer. Thinking is off and effort low (ruling R66), so the 300 tokens all go to the answer.
 *
 * Anything but a finished answer with text in it is a ModelError: a call that failed, an answer cut short
 * (`max_tokens`), a refusal, or no text at all. Such an answer must never reach the cache.
 */
export async function callModel(system: string, user: string): Promise<string> {
  let response: Anthropic.Message;
  try {
    response = await client().messages.create({
      model: HELP_MODEL,
      max_tokens: MAX_TOKENS,
      thinking: { type: 'disabled' },
      output_config: { effort: 'low' },
      system,
      messages: [{ role: 'user', content: user }],
    });
  } catch (error) {
    throw new ModelError(reasonOf(error), { cause: error });
  }

  if (response.stop_reason !== 'end_turn') {
    throw new ModelError(`The model stopped with ${response.stop_reason}`);
  }
  const text = response.content
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('')
    .trim();
  if (!text) throw new ModelError('The model answered with no text');
  return text;
}
