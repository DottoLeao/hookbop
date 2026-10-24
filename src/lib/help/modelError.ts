import type { TokenUsage } from './pricing';

/**
 * Why the model gave no usable answer. Never cached. `declined` is a refusal or an answer cut short (ruling R74): the
 * same question would get the same, so the route answers 422 and the player is not offered a retry. Anything else (a
 * call that failed, timed out, or came back unfinished) may work when asked again: a 503.
 *
 * `answered` says the model did answer, only with nothing the app can use: a refusal, an answer cut short, one that
 * stopped for another reason, or one with no text. Such a call was made and billed, so the request it took from the
 * member's budget is kept (ruling R75); otherwise a line that never gets a usable answer could be asked without limit.
 * A declined answer is always an answered one. Without an answer (the call could not be made, timed out or was
 * aborted) the request is given back.
 *
 * What the call cost is kept on the error for the usage log: `usage` is the tokens an answered call took (there are
 * none to count when no answer came) and `latencyMs` is how long the call ran before it ended in this error.
 *
 * Kept apart from the model call, so the route can tell these apart without loading the SDK.
 */
export class ModelError extends Error {
  override name = 'ModelError';
  readonly declined: boolean;
  readonly answered: boolean;
  readonly usage: TokenUsage | undefined;
  readonly latencyMs: number | undefined;

  constructor(
    message: string,
    options: { declined?: boolean; answered?: boolean; cause?: unknown; usage?: TokenUsage; latencyMs?: number } = {},
  ) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.declined = options.declined ?? false;
    this.answered = this.declined || (options.answered ?? false);
    this.usage = options.usage;
    this.latencyMs = options.latencyMs;
  }
}
