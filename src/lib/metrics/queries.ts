import type { SupabaseClient } from '@supabase/supabase-js';
import { PRICES } from '@/lib/help/pricing';
import type { Database } from '@/lib/supabase/database.types';
import {
  brasiliaDay,
  lastDays,
  METRICS_TIME_ZONE,
  monthSoFar,
  PROJECTION_DAYS,
  type Day,
  type Period,
  type PeriodDays,
} from './period';
import { brlRateOrDefault, buildPanel, type ActivePeople, type PanelData } from './summary';

/**
 * The reads of the owner's panel and of its export. Every one goes through the service client, the only one that may
 * read the metrics (supabase/migrations/0006_metrics.sql): the caller checks that the owner is asking before making
 * that client, and nothing here makes one.
 */
type Admin = SupabaseClient<Database>;
type Tables = Database['public']['Tables'];
type Views = Database['public']['Views'];

/**
 * The rows one read asks for. PostgREST never returns more than `max_rows` rows at once (1000, in
 * supabase/config.toml and on the hosted project), so a read that can be longer goes page by page.
 */
export const PAGE_SIZE = 1000;

type PageResult<T> = { data: T[] | null; error: { message: string } | null };

/**
 * Every row of a read, one page of PAGE_SIZE after another, until a page comes back short. `page(from, to)` is the
 * read with `.range(from, to)`, over an order that does not change between pages. A page that fails fails it all:
 * a sum over part of the rows would look right and be wrong.
 */
export async function readAll<T>(what: string, page: (from: number, to: number) => PromiseLike<PageResult<T>>): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await page(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(`Could not read ${what}: ${error.message}`);
    const got = data ?? [];
    rows.push(...got);
    if (got.length < PAGE_SIZE) return rows;
  }
}

/** Reais per dollar, as the owner set it in app_config (`brl_rate`), or 5.50 when it is missing or not valid. */
export async function readBrlRate(admin: Admin): Promise<number> {
  const { data, error } = await admin.from('app_config').select('value').eq('key', 'brl_rate').maybeSingle();
  if (error) throw new Error(`Could not read the exchange rate: ${error.message}`);
  return brlRateOrDefault(data?.value);
}

/** The people, and games started and finished, from `period.from` (in) to `period.to` (out). */
async function activePeople(admin: Admin, period: Period): Promise<ActivePeople> {
  const { data, error } = await admin.rpc('metrics_active_people', { p_from: period.from, p_to: period.to });
  if (error) throw new Error(`Could not count the people of the period: ${error.message}`);
  const row = data?.[0];
  return {
    people: Number(row?.people ?? 0),
    games_started: Number(row?.games_started ?? 0),
    games_finished: Number(row?.games_finished ?? 0),
  };
}

// Each view, ordered by its key so that the pages do not overlap.
function readAiDaily(admin: Admin, firstDay: Day, lastDay: Day) {
  return readAll<Views['metrics_ai_daily']['Row']>('metrics_ai_daily', (from, to) =>
    admin.from('metrics_ai_daily').select('*').gte('day', firstDay).lte('day', lastDay).order('day').range(from, to),
  );
}

function readUsageDaily(admin: Admin, { firstDay, lastDay }: Period) {
  return readAll<Views['metrics_usage_daily']['Row']>('metrics_usage_daily', (from, to) =>
    admin.from('metrics_usage_daily').select('*').gte('day', firstDay).lte('day', lastDay).order('day').range(from, to),
  );
}

function readModes(admin: Admin, { firstDay, lastDay }: Period) {
  return readAll<Views['metrics_modes']['Row']>('metrics_modes', (from, to) =>
    admin
      .from('metrics_modes')
      .select('*')
      .gte('day', firstDay)
      .lte('day', lastDay)
      .order('day')
      .order('mode')
      .range(from, to),
  );
}

function readSongs(admin: Admin, { firstDay, lastDay }: Period) {
  return readAll<Views['metrics_songs']['Row']>('metrics_songs', (from, to) =>
    admin
      .from('metrics_songs')
      .select('*')
      .gte('day', firstDay)
      .lte('day', lastDay)
      .order('day')
      .order('youtube_id')
      .range(from, to),
  );
}

function readHelp(admin: Admin, { firstDay, lastDay }: Period) {
  return readAll<Views['metrics_help']['Row']>('metrics_help', (from, to) =>
    admin
      .from('metrics_help')
      .select('*')
      .gte('day', firstDay)
      .lte('day', lastDay)
      .order('day')
      .order('mode')
      .order('kind')
      .range(from, to),
  );
}

/**
 * How long each answer of the model took in the period. Only `source = 'model'` and `outcome = 'ok'`: the cache and
 * reused lines took no model time, and an error's latency means something else (how long until it failed).
 */
async function readLatencies(admin: Admin, period: Period): Promise<number[]> {
  const rows = await readAll<{ latency_ms: number | null }>('ai_usage latency', (from, to) =>
    admin
      .from('ai_usage')
      .select('latency_ms')
      .eq('source', 'model')
      .eq('outcome', 'ok')
      .not('latency_ms', 'is', null)
      .gte('created_at', period.from)
      .lt('created_at', period.to)
      .order('id')
      .range(from, to),
  );
  return rows.map((row) => Number(row.latency_ms));
}

/** Everything on the panel for the last `days` days in Brasília, with the month so far and the last 30 days. */
export async function readPanelData(admin: Admin, { days, now }: { days: PeriodDays; now: Date }): Promise<PanelData> {
  const today = brasiliaDay(now);
  const period = lastDays(today, days);
  const last30 = lastDays(today, PROJECTION_DAYS);
  const month = monthSoFar(today);
  // The cost by day covers the period (inside the last 30 days), the month and the last 30 days in one read.
  const aiFrom = month.firstDay < last30.firstDay ? month.firstDay : last30.firstDay;

  const [aiDaily, modes, songs, help, people, people30, latenciesMs, brlRate] = await Promise.all([
    readAiDaily(admin, aiFrom, today),
    readModes(admin, period),
    readSongs(admin, period),
    readHelp(admin, period),
    activePeople(admin, period),
    days === PROJECTION_DAYS ? null : activePeople(admin, last30),
    readLatencies(admin, period),
    readBrlRate(admin),
  ]);

  return buildPanel({
    today,
    days,
    brlRate,
    aiDaily,
    modes,
    songs,
    help,
    people,
    people30: people30 ?? people,
    latenciesMs,
  });
}

/** The version of the export's shape. Bump it when a field changes meaning or goes away. */
export const EXPORT_SCHEMA_VERSION = 1;

/**
 * The file "Exportar dados" downloads: the summaries of the period and every record in it, for an AI assistant to
 * analyze (docs/analytics.md describes each field). It holds user ids, so it is personal data: only the owner gets it.
 */
export interface MetricsExport {
  schemaVersion: typeof EXPORT_SCHEMA_VERSION;
  generatedAt: string;
  timeZone: typeof METRICS_TIME_ZONE;
  period: Period & { days: PeriodDays };
  brlRate: number;
  /** The model prices the costs were estimated with, and the month they were checked. */
  prices: typeof PRICES;
  summaries: {
    metrics_ai_daily: Views['metrics_ai_daily']['Row'][];
    metrics_usage_daily: Views['metrics_usage_daily']['Row'][];
    metrics_modes: Views['metrics_modes']['Row'][];
    metrics_songs: Views['metrics_songs']['Row'][];
    metrics_help: Views['metrics_help']['Row'][];
    metrics_active_people: ActivePeople;
  };
  records: {
    ai_usage: Tables['ai_usage']['Row'][];
    app_events: Tables['app_events']['Row'][];
  };
}

/** Every record of a table made in the period, in id order. */
function readRecords<T extends 'ai_usage' | 'app_events'>(admin: Admin, table: T, period: Period) {
  return readAll<Tables[T]['Row']>(table, (from, to) =>
    admin
      .from(table)
      .select('*')
      .gte('created_at', period.from)
      .lt('created_at', period.to)
      .order('id')
      .range(from, to) as unknown as PromiseLike<PageResult<Tables[T]['Row']>>,
  );
}

/** The export of the last `days` days in Brasília. */
export async function readExport(admin: Admin, { days, now }: { days: PeriodDays; now: Date }): Promise<MetricsExport> {
  const period = lastDays(brasiliaDay(now), days);

  const [aiDaily, usageDaily, modes, songs, help, people, brlRate, aiUsage, appEvents] = await Promise.all([
    readAiDaily(admin, period.firstDay, period.lastDay),
    readUsageDaily(admin, period),
    readModes(admin, period),
    readSongs(admin, period),
    readHelp(admin, period),
    activePeople(admin, period),
    readBrlRate(admin),
    readRecords(admin, 'ai_usage', period),
    readRecords(admin, 'app_events', period),
  ]);

  return {
    schemaVersion: EXPORT_SCHEMA_VERSION,
    generatedAt: now.toISOString(),
    timeZone: METRICS_TIME_ZONE,
    period: { days, ...period },
    brlRate,
    prices: PRICES,
    summaries: {
      metrics_ai_daily: aiDaily,
      metrics_usage_daily: usageDaily,
      metrics_modes: modes,
      metrics_songs: songs,
      metrics_help: help,
      metrics_active_people: people,
    },
    records: { ai_usage: aiUsage, app_events: appEvents },
  };
}

/** The name of the downloaded file: hookbop-metricas-2026-10-25-30dias.json. */
export function exportFileName({ days, lastDay }: { days: PeriodDays; lastDay: Day }): string {
  return `hookbop-metricas-${lastDay}-${days}dias.json`;
}
