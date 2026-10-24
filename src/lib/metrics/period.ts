/**
 * The days the owner's panel counts. Every summary in the database (the metrics_* views of
 * supabase/migrations/0006_metrics.sql) has a `day` in Brasília time, so the panel counts its periods in the same zone:
 * a game at 22:30 belongs to that evening, not to the next day in UTC.
 */
export const METRICS_TIME_ZONE = 'America/Sao_Paulo';

/** The periods the panel offers, from `?dias=`. */
export type PeriodDays = 7 | 30;
export const DEFAULT_PERIOD_DAYS: PeriodDays = 30;

/** The days behind the projection, whatever period is on screen. */
export const PROJECTION_DAYS = 30;

/** `?dias=7` or `?dias=30`. Anything else (missing, another number, the key given twice) is 30. */
export function parsePeriodDays(value: unknown): PeriodDays {
  if (value === '7') return 7;
  return DEFAULT_PERIOD_DAYS;
}

/** A day as a Postgres `date` reads: YYYY-MM-DD. */
export type Day = string;

const DAY_PARTS = new Intl.DateTimeFormat('en-US', {
  timeZone: METRICS_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** The date it is in Brasília at `now`. */
export function brasiliaDay(now: Date): Day {
  const parts = DAY_PARTS.formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

/** The day `n` days after `day` (before it when `n` is negative). */
export function addDays(day: Day, n: number): Day {
  const [year, month, date] = day.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, date + n)).toISOString().slice(0, 10);
}

/**
 * Midnight at the start of `day` in Brasília, written with the zone's name. Postgres reads it with its own time zone
 * rules, the ones the views use to make their `day`, so the bounds and the days always agree (should Brazil ever
 * bring summer time back, too).
 */
export function brasiliaMidnight(day: Day): string {
  return `${day} 00:00:00 ${METRICS_TIME_ZONE}`;
}

/**
 * Whole days in Brasília: `firstDay` to `lastDay`, both in, for the views' `day`; and `from` (in) to `to` (out), the
 * midnights around them, for a timestamp such as `created_at` or the bounds of `metrics_active_people`.
 */
export interface Period {
  firstDay: Day;
  lastDay: Day;
  from: string;
  to: string;
}

function period(firstDay: Day, lastDay: Day): Period {
  return { firstDay, lastDay, from: brasiliaMidnight(firstDay), to: brasiliaMidnight(addDays(lastDay, 1)) };
}

/** Today and the `days - 1` days before it. */
export function lastDays(today: Day, days: number): Period {
  return period(addDays(today, -(days - 1)), today);
}

/** The calendar month so far, in Brasília: from the 1st to today. */
export function monthSoFar(today: Day): Period {
  return period(`${today.slice(0, 8)}01`, today);
}

/** Whether a view's `day` is one of the days of `period`. */
export function inPeriod(day: Day | null, { firstDay, lastDay }: Period): boolean {
  return day !== null && day >= firstDay && day <= lastDay;
}
