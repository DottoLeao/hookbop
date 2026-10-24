import type { Database } from '@/lib/supabase/database.types';
import { inPeriod, lastDays, monthSoFar, PROJECTION_DAYS, type Day, type Period, type PeriodDays } from './period';

/**
 * The numbers of the owner's panel, worked out from the summaries in the database (the metrics_* views and
 * metrics_active_people of supabase/migrations/0006_metrics.sql). Plain functions over rows already read, so every sum
 * can be checked with invented rows.
 *
 * What adds up across days and what does not (see docs/analytics.md):
 * - the counts and the cost add up, so a period is the sum of its days;
 * - people do not (a person active on two days is one person), so they come from metrics_active_people, never from
 *   adding up the daily active_users;
 * - the views' averages do not either, so they are weighed by the games or requests behind them.
 */

type Views = Database['public']['Views'];
export type AiDailyRow = Views['metrics_ai_daily']['Row'];
export type UsageDailyRow = Views['metrics_usage_daily']['Row'];
export type ModeRow = Views['metrics_modes']['Row'];
export type SongRow = Views['metrics_songs']['Row'];
export type HelpRow = Views['metrics_help']['Row'];
/** The one row of `metrics_active_people(p_from, p_to)`. */
export type ActivePeople = Database['public']['Functions']['metrics_active_people']['Returns'][number];

/** Reais per dollar when app_config has no valid `brl_rate` (the migration's own default). */
export const DEFAULT_BRL_RATE = 5.5;
export const BRL_RATE_MIN = 1;
export const BRL_RATE_MAX = 20;

/** One or two digits, then up to four decimals after a dot or a comma: 5.50, 5,5, 6.1234, 20. */
const BRL_RATE_TEXT = /^\d{1,2}(?:[.,]\d{1,4})?$/;

/** The rate written as text (by the owner, or as app_config keeps it), or null unless it is a decimal from 1 to 20. */
export function parseBrlRate(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  if (!BRL_RATE_TEXT.test(text)) return null;
  const rate = Number(text.replace(',', '.'));
  return rate >= BRL_RATE_MIN && rate <= BRL_RATE_MAX ? rate : null;
}

/** The stored rate, or the default when it is missing or not a valid one. */
export function brlRateOrDefault(value: unknown): number {
  return parseBrlRate(value) ?? DEFAULT_BRL_RATE;
}

/** How many songs the panel ranks. */
export const TOP_SONGS = 10;

export interface PanelInput {
  /** Today in Brasília. */
  today: Day;
  days: PeriodDays;
  brlRate: number;
  /** The AI by day, for every day of the period, of the month so far and of the last 30 days. */
  aiDaily: AiDailyRow[];
  /** The days of the period. */
  modes: ModeRow[];
  songs: SongRow[];
  help: HelpRow[];
  /** The people and games of the period... */
  people: ActivePeople;
  /** ...and of the last 30 days, for the projection. */
  people30: ActivePeople;
  /** The latency of each answer the model gave in the period (`source = 'model'` and `outcome = 'ok'` only). */
  latenciesMs: number[];
}

export interface ModeSummary {
  mode: string;
  selections: number;
  started: number;
  finished: number;
  /** Games with a `game_abandoned`: the player left at least once ("saídas"). A game can also have finished. */
  abandoned: number;
  /** Finished over started. */
  completion: number | null;
  /** The average score of the finished games that had blanks, 0 to 100 (Karaokê has none: null). */
  avgPct: number | null;
  avgDurationMs: number | null;
}

export interface SongSummary {
  youtubeId: string;
  /** Null for a song the app's videos table does not have. */
  title: string | null;
  opens: number;
  started: number;
  finished: number;
  abandoned: number;
}

export interface HelpSummary {
  /** Null for requests that came with no mode. */
  mode: string | null;
  explain: number;
  translate: number;
  total: number;
  /** The average line asked about, as `lineIndex` counts (from 0). */
  avgLineIndex: number | null;
}

export interface PanelData {
  days: PeriodDays;
  period: Period;
  month: Period;
  brlRate: number;
  spend: { periodUsd: number; monthUsd: number };
  averages: {
    people: number;
    gamesStarted: number;
    /** Songs with at least one game started in the period. */
    songsPlayed: number;
    perPersonUsd: number | null;
    perGameUsd: number | null;
    perSongUsd: number | null;
  };
  /** The last 30 days: their cost and people, and the cost per person the projection multiplies. */
  projection: { people: number; costUsd: number; perPersonUsd: number | null };
  ai: {
    calls: number;
    model: number;
    cache: number;
    reuse: number;
    declined: number;
    errors: number;
    inputTokens: number;
    outputTokens: number;
    /** The calls answered from memory (the per-line cache and reused lines) over all calls. */
    memoryShare: number | null;
    avgLatencyMs: number | null;
  };
  /** Most started first. */
  modes: ModeSummary[];
  /** The most played, at most TOP_SONGS. */
  songs: SongSummary[];
  /** Most requests first. */
  help: HelpSummary[];
}

/** A number of a view, where every column may be null. */
function n(value: number | null | undefined): number {
  return Number(value ?? 0);
}

function ratio(part: number, whole: number): number | null {
  return whole > 0 ? part / whole : null;
}

/** Dollars to the 6 decimals `ai_usage.cost_usd` keeps, so a sum of days carries no floating point noise. */
function roundUsd(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}

/** Adds up the weighted values and weights of an average, over the rows that have one. */
class Weighted {
  private sum = 0;
  private weight = 0;

  add(value: number | null, weight: number) {
    if (value === null || weight <= 0) return;
    this.sum += Number(value) * weight;
    this.weight += weight;
  }

  get value(): number | null {
    return ratio(this.sum, this.weight);
  }
}

function costOf(rows: AiDailyRow[], period: Period): number {
  return roundUsd(rows.filter((row) => inPeriod(row.day, period)).reduce((sum, row) => sum + n(row.cost_usd), 0));
}

function summarizeAi(rows: AiDailyRow[], latenciesMs: number[]): PanelData['ai'] {
  const total = (column: keyof AiDailyRow) => rows.reduce((sum, row) => sum + n(row[column] as number | null), 0);
  const calls = total('calls');
  const cache = total('calls_cache');
  const reuse = total('calls_reuse');
  return {
    calls,
    model: total('calls_model'),
    cache,
    reuse,
    declined: total('calls_declined'),
    errors: total('calls_error'),
    inputTokens: total('input_tokens'),
    outputTokens: total('output_tokens'),
    memoryShare: ratio(cache + reuse, calls),
    avgLatencyMs: ratio(
      latenciesMs.reduce((sum, ms) => sum + ms, 0),
      latenciesMs.length,
    ),
  };
}

function summarizeModes(rows: ModeRow[]): ModeSummary[] {
  const byMode = new Map<string, { summary: ModeSummary; pct: Weighted; duration: Weighted }>();
  for (const row of rows) {
    if (row.mode === null) continue;
    let entry = byMode.get(row.mode);
    if (!entry) {
      entry = {
        summary: {
          mode: row.mode,
          selections: 0,
          started: 0,
          finished: 0,
          abandoned: 0,
          completion: null,
          avgPct: null,
          avgDurationMs: null,
        },
        pct: new Weighted(),
        duration: new Weighted(),
      };
      byMode.set(row.mode, entry);
    }
    const { summary } = entry;
    summary.selections += n(row.mode_selections);
    summary.started += n(row.games_started);
    summary.finished += n(row.games_finished);
    summary.abandoned += n(row.games_abandoned);
    entry.pct.add(row.avg_pct, n(row.games_finished));
    entry.duration.add(row.avg_duration_ms, n(row.games_finished));
  }

  return [...byMode.values()]
    .map(({ summary, pct, duration }) => ({
      ...summary,
      // Never finished over finished plus saídas: a game left once and then finished has both.
      completion: ratio(summary.finished, summary.started),
      avgPct: pct.value,
      avgDurationMs: duration.value,
    }))
    .sort((a, b) => b.started - a.started || b.selections - a.selections || a.mode.localeCompare(b.mode));
}

function summarizeSongs(rows: SongRow[]): SongSummary[] {
  const bySong = new Map<string, SongSummary>();
  for (const row of rows) {
    if (row.youtube_id === null) continue;
    const song = bySong.get(row.youtube_id) ?? {
      youtubeId: row.youtube_id,
      title: row.title,
      opens: 0,
      started: 0,
      finished: 0,
      abandoned: 0,
    };
    song.title ??= row.title;
    song.opens += n(row.song_opens);
    song.started += n(row.games_started);
    song.finished += n(row.games_finished);
    song.abandoned += n(row.games_abandoned);
    bySong.set(row.youtube_id, song);
  }
  return [...bySong.values()].sort(
    (a, b) => b.started - a.started || b.opens - a.opens || a.youtubeId.localeCompare(b.youtubeId),
  );
}

function summarizeHelp(rows: HelpRow[]): HelpSummary[] {
  const byMode = new Map<string | null, { summary: HelpSummary; line: Weighted }>();
  for (const row of rows) {
    let entry = byMode.get(row.mode);
    if (!entry) {
      entry = { summary: { mode: row.mode, explain: 0, translate: 0, total: 0, avgLineIndex: null }, line: new Weighted() };
      byMode.set(row.mode, entry);
    }
    const requests = n(row.requests);
    if (row.kind === 'explain') entry.summary.explain += requests;
    if (row.kind === 'translate') entry.summary.translate += requests;
    entry.summary.total += requests;
    entry.line.add(row.avg_line_index, requests);
  }
  return [...byMode.values()]
    .map(({ summary, line }) => ({ ...summary, avgLineIndex: line.value }))
    .sort((a, b) => b.total - a.total || String(a.mode).localeCompare(String(b.mode)));
}

/** Every number of the panel, from the rows of its period, of the month and of the last 30 days. */
export function buildPanel(input: PanelInput): PanelData {
  const period = lastDays(input.today, input.days);
  const month = monthSoFar(input.today);
  const last30 = lastDays(input.today, PROJECTION_DAYS);

  const periodUsd = costOf(input.aiDaily, period);
  const projectionUsd = costOf(input.aiDaily, last30);
  const songs = summarizeSongs(input.songs.filter((row) => inPeriod(row.day, period)));
  const songsPlayed = songs.filter((song) => song.started > 0).length;
  const people = n(input.people.people);
  const gamesStarted = n(input.people.games_started);
  const people30 = n(input.people30.people);

  return {
    days: input.days,
    period,
    month,
    brlRate: input.brlRate,
    spend: { periodUsd, monthUsd: costOf(input.aiDaily, month) },
    averages: {
      people,
      gamesStarted,
      songsPlayed,
      perPersonUsd: ratio(periodUsd, people),
      perGameUsd: ratio(periodUsd, gamesStarted),
      perSongUsd: ratio(periodUsd, songsPlayed),
    },
    projection: { people: people30, costUsd: projectionUsd, perPersonUsd: ratio(projectionUsd, people30) },
    ai: summarizeAi(
      input.aiDaily.filter((row) => inPeriod(row.day, period)),
      input.latenciesMs,
    ),
    modes: summarizeModes(input.modes.filter((row) => inPeriod(row.day, period))),
    songs: songs.slice(0, TOP_SONGS),
    help: summarizeHelp(input.help.filter((row) => inPeriod(row.day, period))),
  };
}
