import { describe, expect, it } from 'vitest';
import { costUsd, HELP_MODEL, PRICES } from './pricing';

describe('PRICES', () => {
  it('prices Haiku 5.5 at $0.10 per million input tokens and $0.50 per million output tokens, as of 2026-10', () => {
    expect(PRICES).toEqual({ 'claude-haiku-5-5': { inputPerMTok: 0.1, outputPerMTok: 0.5, asOf: '2026-10' } });
  });

  it('has a price for the model the help is asked of', () => {
    expect(PRICES[HELP_MODEL]).toBeDefined();
    expect(HELP_MODEL).toBe('claude-haiku-5-5');
  });
});

describe('costUsd', () => {
  it('charges $0.10 for a million input tokens', () => {
    expect(costUsd('claude-haiku-5-5', { inputTokens: 1_000_000, outputTokens: 0 })).toBe(0.1);
  });

  it('charges $0.50 for a million output tokens', () => {
    expect(costUsd('claude-haiku-5-5', { inputTokens: 0, outputTokens: 1_000_000 })).toBe(0.5);
  });

  it('adds the input and the output of one call', () => {
    // 2,000 in at $0.10 per million is $0.0002, and 300 out at $0.50 per million is $0.00015.
    expect(costUsd('claude-haiku-5-5', { inputTokens: 2_000, outputTokens: 300 })).toBe(0.00035);
  });

  it('costs nothing when no token was used', () => {
    expect(costUsd('claude-haiku-5-5', { inputTokens: 0, outputTokens: 0 })).toBe(0);
  });

  it('rounds to the 6 decimals the ai_usage column keeps, with no floating point noise', () => {
    // 3 in and 1 out is $0.0000008 exactly; the column keeps $0.000001.
    expect(costUsd('claude-haiku-5-5', { inputTokens: 3, outputTokens: 1 })).toBe(0.000001);
    // 7 x $0.10 per million + 7 x $0.50 per million would be 0.0000042000000000000004 in floating point.
    expect(costUsd('claude-haiku-5-5', { inputTokens: 7, outputTokens: 7 })).toBe(0.000004);
  });
});
