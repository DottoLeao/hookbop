import { describe, expect, it } from 'vitest';
import {
  addDays,
  brasiliaDay,
  brasiliaMidnight,
  inPeriod,
  lastDays,
  monthSoFar,
  parsePeriodDays,
} from './period';

describe('parsePeriodDays', () => {
  it.each([
    ['7', 7],
    ['30', 30],
  ])('takes ?dias=%s', (value, days) => {
    expect(parsePeriodDays(value)).toBe(days);
  });

  it.each([
    ['missing', undefined],
    ['null', null],
    ['empty', ''],
    ['another number', '14'],
    ['a number with a decimal', '7.0'],
    ['a number with spaces', ' 7'],
    ['a negative number', '-7'],
    ['text', 'sete'],
    ['given twice', ['7', '7']],
    ['a number, not text', 7],
  ])('turns a value that is %s into 30', (_label, value) => {
    expect(parsePeriodDays(value)).toBe(30);
  });
});

describe('brasiliaDay', () => {
  it('is the date in Brasília, so a game at 22:30 there stays on its evening', () => {
    // 22:30 in Brasília on the 25th is 01:30 UTC on the 26th.
    expect(brasiliaDay(new Date('2026-10-26T01:30:00Z'))).toBe('2026-10-25');
  });

  it('turns at midnight in Brasília, which is 03:00 UTC', () => {
    expect(brasiliaDay(new Date('2026-10-25T02:59:59Z'))).toBe('2026-10-24');
    expect(brasiliaDay(new Date('2026-10-25T03:00:00Z'))).toBe('2026-10-25');
  });
});

describe('addDays', () => {
  it('moves across the end of a month and of a year', () => {
    expect(addDays('2026-10-25', -6)).toBe('2026-10-19');
    expect(addDays('2026-10-25', -29)).toBe('2026-09-26');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });
});

describe('brasiliaMidnight', () => {
  it('names the zone, so Postgres places midnight in Brasília by its own time zone rules', () => {
    expect(brasiliaMidnight('2026-10-01')).toBe('2026-10-01 00:00:00 America/Sao_Paulo');
  });
});

describe('lastDays', () => {
  it('is today and the days before it, from midnight on the first day to midnight after today', () => {
    expect(lastDays('2026-10-25', 7)).toEqual({
      firstDay: '2026-10-19',
      lastDay: '2026-10-25',
      from: '2026-10-19 00:00:00 America/Sao_Paulo',
      to: '2026-10-26 00:00:00 America/Sao_Paulo',
    });
    expect(lastDays('2026-10-25', 30).firstDay).toBe('2026-09-26');
  });
});

describe('monthSoFar', () => {
  it('is the calendar month in Brasília, from the 1st to today', () => {
    expect(monthSoFar('2026-10-25')).toEqual({
      firstDay: '2026-10-01',
      lastDay: '2026-10-25',
      from: '2026-10-01 00:00:00 America/Sao_Paulo',
      to: '2026-10-26 00:00:00 America/Sao_Paulo',
    });
  });

  it('is one day on the 1st', () => {
    expect(monthSoFar('2026-11-01')).toMatchObject({ firstDay: '2026-11-01', lastDay: '2026-11-01' });
  });
});

describe('inPeriod', () => {
  const period = lastDays('2026-10-25', 7);

  it('takes the first and the last day, and nothing outside them', () => {
    expect(inPeriod('2026-10-19', period)).toBe(true);
    expect(inPeriod('2026-10-25', period)).toBe(true);
    expect(inPeriod('2026-10-18', period)).toBe(false);
    expect(inPeriod('2026-10-26', period)).toBe(false);
    expect(inPeriod(null, period)).toBe(false);
  });
});
