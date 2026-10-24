import { formatDuration } from '@/lib/format';
import type { Day } from './period';

/**
 * How the owner's panel writes its numbers, the Brazilian way. Plain functions with no server code, so the projection,
 * which runs in the browser, writes money exactly as the cards do.
 */

function currency(code: 'USD' | 'BRL') {
  return {
    cents: new Intl.NumberFormat('pt-BR', { style: 'currency', currency: code }),
    // One help costs a small fraction of a cent: two significant digits keep it from reading as 0,00.
    fraction: new Intl.NumberFormat('pt-BR', { style: 'currency', currency: code, maximumSignificantDigits: 2 }),
  };
}

const USD = currency('USD');
const BRL = currency('BRL');

function money(formats: ReturnType<typeof currency>, value: number): string {
  return value !== 0 && Math.abs(value) < 0.01 ? formats.fraction.format(value) : formats.cents.format(value);
}

/** Dollars, as Anthropic charges: US$ 12,35, or US$ 0,0034 below a cent. */
export function formatUsd(value: number): string {
  return money(USD, value);
}

/** Reais: R$ 1.234,50, or R$ 0,0046 below a cent. */
export function formatBrl(value: number): string {
  return money(BRL, value);
}

const RATE = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4, useGrouping: false });

/** Reais per dollar as the owner would type them: 5,50 or 6,1234. */
export function formatRateInput(rate: number): string {
  return RATE.format(rate);
}

const COUNT = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });

/** A count: 1.234.567. */
export function formatCount(value: number): string {
  return COUNT.format(value);
}

const PERCENT = new Intl.NumberFormat('pt-BR', { style: 'percent', maximumFractionDigits: 1 });

/** A share from 0 to 1 as a percentage: 42% or 42,6%. */
export function formatPercent(share: number): string {
  return PERCENT.format(share);
}

const ONE_DECIMAL = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
/** A space a line never breaks at, so a number and its unit stay together (Intl puts the same one after US$ and R$). */
const NO_BREAK_SPACE = String.fromCharCode(0xa0);

/** How long an answer of the model took: 1,2 s, with a no-break space before the unit. */
export function formatLatency(ms: number): string {
  return `${ONE_DECIMAL.format(ms / 1000)}${NO_BREAK_SPACE}s`;
}

/** How long a game lasted: 3:20. */
export function formatGameLength(ms: number): string {
  return formatDuration(ms / 1000);
}

/** A day as 05/10. */
export function formatShortDay(day: Day): string {
  return `${day.slice(8, 10)}/${day.slice(5, 7)}`;
}

const MONTH = new Intl.DateTimeFormat('pt-BR', { month: 'long', timeZone: 'UTC' });

/** The name of the month of `day`: outubro. */
export function formatMonthName(day: Day): string {
  return MONTH.format(new Date(`${day.slice(0, 7)}-01T12:00:00Z`));
}
