import { describe, expect, it } from 'vitest';
import { HelpError, helpErrorCopy } from './helpError';

describe('HelpError', () => {
  it('carries the status of the failed request', () => {
    const error = new HelpError(429);

    expect(error).toBeInstanceOf(Error);
    expect(error.status).toBe(429);
    expect(error.name).toBe('HelpError');
  });
});

describe('helpErrorCopy', () => {
  it('asks the player to come back later past the limit, with no retry', () => {
    expect(helpErrorCopy(new HelpError(429))).toEqual({ message: 'ajuda.later', retry: false });
  });

  it('offers a retry when the service is down', () => {
    expect(helpErrorCopy(new HelpError(503))).toEqual({ message: 'ajuda.retryable', retry: true });
  });

  it.each([400, 401, 403] as const)('gives a calm general line for %i', (status) => {
    expect(helpErrorCopy(new HelpError(status))).toEqual({ message: 'ajuda.unavailable', retry: false });
  });

  it('treats anything else as the service being down', () => {
    expect(helpErrorCopy(new Error('boom'))).toEqual({ message: 'ajuda.retryable', retry: true });
  });
});
