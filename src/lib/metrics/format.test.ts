import { describe, expect, it } from 'vitest';
import {
  formatBrl,
  formatCount,
  formatGameLength,
  formatLatency,
  formatMonthName,
  formatPercent,
  formatRateInput,
  formatShortDay,
  formatUsd,
} from './format';

// Intl puts a no-break space between the currency and the number.
const NBSP = String.fromCharCode(0xa0);

describe('formatUsd and formatBrl', () => {
  it('write dollars and reais the Brazilian way', () => {
    expect(formatUsd(12.345)).toBe(`US$${NBSP}12,35`);
    expect(formatBrl(1234.5)).toBe(`R$${NBSP}1.234,50`);
    expect(formatUsd(0)).toBe(`US$${NBSP}0,00`);
  });

  it('keep two significant digits of an amount below a cent, which is what one help costs', () => {
    expect(formatUsd(0.0034)).toBe(`US$${NBSP}0,0034`);
    expect(formatUsd(0.000081)).toBe(`US$${NBSP}0,000081`);
    expect(formatBrl(0.00456)).toBe(`R$${NBSP}0,0046`);
  });
});

describe('formatRateInput', () => {
  it('writes the rate as the owner types it, with a comma and two to four decimals', () => {
    expect(formatRateInput(5.5)).toBe('5,50');
    expect(formatRateInput(6.1234)).toBe('6,1234');
    expect(formatRateInput(20)).toBe('20,00');
  });
});

describe('formatCount', () => {
  it('groups thousands with a dot', () => {
    expect(formatCount(1234567)).toBe('1.234.567');
    expect(formatCount(0)).toBe('0');
  });
});

describe('formatPercent', () => {
  it('writes a share as a percentage, with at most one decimal', () => {
    expect(formatPercent(0.42)).toBe(`42%`);
    expect(formatPercent(0.4256)).toBe(`42,6%`);
    expect(formatPercent(1)).toBe(`100%`);
  });
});

describe('formatLatency', () => {
  it('writes milliseconds as seconds with one decimal', () => {
    expect(formatLatency(1234)).toBe(`1,2${NBSP}s`);
    expect(formatLatency(850)).toBe(`0,9${NBSP}s`);
  });
});

describe('formatGameLength', () => {
  it('writes milliseconds as minutes and seconds', () => {
    expect(formatGameLength(200_000)).toBe('3:20');
    expect(formatGameLength(65_400)).toBe('1:05');
  });
});

describe('formatShortDay and formatMonthName', () => {
  it('write a day as day/month and its month by name', () => {
    expect(formatShortDay('2026-10-05')).toBe('05/10');
    expect(formatMonthName('2026-10-25')).toBe('outubro');
    expect(formatMonthName('2027-01-01')).toBe('janeiro');
  });
});
