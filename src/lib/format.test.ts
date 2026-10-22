import { describe, expect, it } from 'vitest';
import { formatDate, formatDuration } from './format';

describe('formatDate', () => {
  it('writes day, month and year the Brazilian way', () => {
    expect(formatDate('2026-10-22T15:00:00Z')).toBe('22/10/2026');
  });

  it('uses the date in Brazil, not in UTC', () => {
    // 02:30 UTC on the 22nd is still the evening of the 21st in São Paulo (UTC-3).
    expect(formatDate('2026-10-22T02:30:00Z')).toBe('21/10/2026');
  });
});

describe('formatDuration', () => {
  it('writes minutes and two-digit seconds', () => {
    expect(formatDuration(185)).toBe('3:05');
    expect(formatDuration(60)).toBe('1:00');
    expect(formatDuration(59)).toBe('0:59');
  });

  it('goes past 59 minutes without hours', () => {
    expect(formatDuration(3725)).toBe('62:05');
  });

  it('rounds a fraction of a second and never goes below 0:00', () => {
    expect(formatDuration(184.6)).toBe('3:05');
    expect(formatDuration(0)).toBe('0:00');
    expect(formatDuration(-4)).toBe('0:00');
    expect(formatDuration(Number.NaN)).toBe('0:00');
  });
});
