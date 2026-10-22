import type { MessageKey } from '@/i18n/t';

/** The answers of `POST /api/help` that are not the help itself. */
export type HelpStatus = 400 | 401 | 403 | 429 | 503;

/** An ask for help that failed, with the status that says why. */
export class HelpError extends Error {
  override name = 'HelpError';

  constructor(readonly status: HelpStatus) {
    super(`The help request failed with ${status}`);
  }
}

/**
 * What DJ Bop says when the help cannot be had, and whether trying again can work: past the limit he asks the player
 * to come back later, when the service is down he offers a retry, and for anything else he gives a calm general line.
 * Never a status code or an error message.
 */
export function helpErrorCopy(error: unknown): { message: MessageKey; retry: boolean } {
  const status = error instanceof HelpError ? error.status : 503;
  if (status === 429) return { message: 'ajuda.later', retry: false };
  if (status === 503) return { message: 'ajuda.retryable', retry: true };
  return { message: 'ajuda.unavailable', retry: false };
}
