import { describe, expect, it } from 'vitest';
import { formatDate } from './format';

describe('formatDate', () => {
  it('writes day, month and year the Brazilian way', () => {
    expect(formatDate('2026-10-22T15:00:00Z')).toBe('22/10/2026');
  });

  it('uses the date in Brazil, not in UTC', () => {
    // 02:30 UTC on the 22nd is still the evening of the 21st in São Paulo (UTC-3).
    expect(formatDate('2026-10-22T02:30:00Z')).toBe('21/10/2026');
  });
});
