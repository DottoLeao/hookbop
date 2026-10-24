import { formatDuration } from '@/lib/format';
import type { Day } from './period';

/**
 * How the owner's panel writes its numbers, the Brazilian way. Plain functions with no server code, so the projection,
 * which runs in the browser, writes money exactly as the cards do.
 */

function currency(code: 'USD' | 'BRL') {
  return {
    cents: new Intl.NumberFormat('pt-BR', { style: 'currency', currency: code }),
    small: new Intl.NumberFormat('pt-BR', { style: 'currency', currency: code, maximumSignificantDigits: 3 }),
  };
}

const USD = currency('USD');
const BRL = currency('BRL');

/** Below this, an amount keeps three significant digits instead of being rounded to the cent. */
const SMALL_AMOUNT = 0.1;

/**
 * One help costs a fraction of a cent, and the cost per person or per game is around a cent. Rounded to the cent, those
 * would read 0,00 or 0,01, and a projection made from them would not match what it says it multiplies. So an amount
 * below 0,10 keeps three significant digits (0,0133, 0,0034); from 0,10 up, cents. An amount that rounds up to 0,10 is
 * written in cents too, so it reads 0,10 and not 0,1.
 */
function money(formats: ReturnType<typeof currency>, value: number): string {
  const small = value !== 0 && Math.abs(Number(value.toPrecision(3))) < SMALL_AMOUNT;
  return small ? formats.small.format(value) : formats.cents.format(value);
}

/** Dollars, as Anthropic charges: US$ 12,35, or US$ 0,0133 below 0,10. */
export function formatUsd(value: number): string {
  return money(USD, value);
}

/** Reais: R$ 1.234,50, or R$ 0,0733 below 0,10. */
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
