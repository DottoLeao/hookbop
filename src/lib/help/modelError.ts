/**
 * Why the model gave no usable answer. Never cached. `declined` is a refusal or an answer cut short (ruling R74): the
 * same question would get the same, so the route answers 422 and the player is not offered a retry. Anything else (a
 * call that failed, timed out, or came back unfinished) may work when asked again: a 503.
 *
 * Kept apart from the model call, so the route can tell the two apart without loading the SDK.
 */
export class ModelError extends Error {
  override name = 'ModelError';
  readonly declined: boolean;

  constructor(message: string, options: { declined?: boolean; cause?: unknown } = {}) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.declined = options.declined ?? false;
  }
}
