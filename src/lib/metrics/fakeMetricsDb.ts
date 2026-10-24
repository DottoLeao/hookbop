import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/database.types';

/**
 * A stand-in for the service client, for tests: the metrics tables and views as plain rows in memory, read the way
 * PostgREST reads them. Like the real API (`max_rows = 1000` in supabase/config.toml), one read never returns more than
 * `maxRows` rows (1000 unless a test lowers it), so a read that forgets to page comes back short here too.
 *
 * Only what the metrics code uses is here: `select`, `eq`, `gte`, `gt`, `lte`, `lt`, `not(column, 'is', null)`,
 * `order`, `range`, `maybeSingle`, `upsert` and the `metrics_active_people` function, which it counts from `app_events`.
 */
export const FAKE_MAX_ROWS = 1000;

type Row = Record<string, unknown>;
type Filter = (row: Row) => boolean;

/** `2026-10-01 00:00:00 America/Sao_Paulo`, the way the panel writes midnight in Brasília (UTC-3). */
const BRASILIA_MIDNIGHT = /^(\d{4}-\d{2}-\d{2}) 00:00:00 America\/Sao_Paulo$/;

/** A timestamp bound as an instant, so it can be compared with a row's `created_at`. */
function instant(value: unknown): number {
  const text = String(value);
  const midnight = BRASILIA_MIDNIGHT.exec(text);
  return Date.parse(midnight ? `${midnight[1]}T00:00:00-03:00` : text);
}

function compare(column: string, a: unknown, b: unknown): number {
  if (column === 'created_at') return instant(a) - instant(b);
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b));
}

export interface FakeCall {
  table: string;
  select?: string;
  filters: string[];
  range?: [number, number];
}

class FakeQuery implements PromiseLike<{ data: unknown; error: { message: string } | null }> {
  private readonly filters: Filter[] = [];
  private readonly orders: string[] = [];
  private columns = '*';
  private single = false;
  private window: [number, number] | null = null;

  constructor(
    private readonly db: FakeMetricsDb,
    private readonly table: string,
    private readonly call: FakeCall,
  ) {}

  select(columns = '*') {
    this.columns = columns;
    this.call.select = columns;
    return this;
  }

  private where(label: string, filter: Filter) {
    this.call.filters.push(label);
    this.filters.push(filter);
    return this;
  }

  eq(column: string, value: unknown) {
    return this.where(`${column}=eq.${value}`, (row) => row[column] === value);
  }

  gte(column: string, value: unknown) {
    return this.where(`${column}=gte.${value}`, (row) => row[column] != null && compare(column, row[column], value) >= 0);
  }

  gt(column: string, value: unknown) {
    return this.where(`${column}=gt.${value}`, (row) => row[column] != null && compare(column, row[column], value) > 0);
  }

  lte(column: string, value: unknown) {
    return this.where(`${column}=lte.${value}`, (row) => row[column] != null && compare(column, row[column], value) <= 0);
  }

  lt(column: string, value: unknown) {
    return this.where(`${column}=lt.${value}`, (row) => row[column] != null && compare(column, row[column], value) < 0);
  }

  not(column: string, operator: string, value: unknown) {
    if (operator !== 'is' || value !== null) throw new Error(`The fake only knows not(column, 'is', null).`);
    return this.where(`${column}=not.is.null`, (row) => row[column] != null);
  }

  order(column: string) {
    this.orders.push(column);
    return this;
  }

  range(from: number, to: number) {
    this.window = [from, to];
    this.call.range = [from, to];
    return this;
  }

  maybeSingle() {
    this.single = true;
    return this;
  }

  private run() {
    const failure = this.db.failures.get(this.table);
    if (failure) return { data: null, error: { message: failure } };

    let rows = (this.db.tables[this.table] ?? []).filter((row) => this.filters.every((filter) => filter(row)));
    if (this.orders.length > 0) {
      rows = [...rows].sort((a, b) => {
        for (const column of this.orders) {
          const order = a[column] == null ? (b[column] == null ? 0 : 1) : b[column] == null ? -1 : compare(column, a[column], b[column]);
          if (order !== 0) return order;
        }
        return 0;
      });
    }
    if (this.columns !== '*') {
      const picked = this.columns.split(',').map((column) => column.trim());
      rows = rows.map((row) => Object.fromEntries(picked.map((column) => [column, row[column]])));
    }
    if (this.single) return { data: rows[0] ?? null, error: null };

    const [from, to] = this.window ?? [0, Number.MAX_SAFE_INTEGER];
    const end = Math.min(to + 1, from + this.db.maxRows);
    return { data: rows.slice(from, end), error: null };
  }

  then<A = { data: unknown; error: { message: string } | null }, B = never>(
    onfulfilled?: ((value: { data: unknown; error: { message: string } | null }) => A | PromiseLike<A>) | null,
    onrejected?: ((reason: unknown) => B | PromiseLike<B>) | null,
  ): PromiseLike<A | B> {
    return Promise.resolve().then(() => this.run()).then(onfulfilled, onrejected);
  }
}

export class FakeMetricsDb {
  /** The rows of each table and view, by name. */
  tables: Record<string, Row[]> = {};
  /** The most rows one read returns, as PostgREST's `max_rows`. */
  maxRows = FAKE_MAX_ROWS;
  /** A table or view whose reads fail with this message. */
  failures = new Map<string, string>();
  /** Every read, in order: which table, which columns, which filters and which page. */
  calls: FakeCall[] = [];
  /** Every call of a database function, in order. */
  rpcs: { name: string; args: Record<string, unknown> }[] = [];
  /** Every upsert, in order. */
  upserts: { table: string; row: Row; options: unknown }[] = [];
  /** The error the next upserts answer with, if any. */
  upsertError: { message: string } | null = null;

  from(table: string) {
    const call: FakeCall = { table, filters: [] };
    this.calls.push(call);
    const query = new FakeQuery(this, table, call);
    return Object.assign(query, {
      upsert: async (row: Row, options?: unknown) => {
        this.upserts.push({ table, row, options });
        if (this.upsertError) return { data: null, error: this.upsertError };
        const rows = (this.tables[table] ??= []);
        const index = rows.findIndex((existing) => existing.key === row.key);
        if (index >= 0) rows[index] = row;
        else rows.push(row);
        return { data: null, error: null };
      },
    });
  }

  async rpc(name: string, args: Record<string, unknown>) {
    this.rpcs.push({ name, args });
    if (name !== 'metrics_active_people') throw new Error(`The fake has no function ${name}.`);
    const failure = this.failures.get(name);
    if (failure) return { data: null, error: { message: failure } };

    const from = instant(args.p_from);
    const to = instant(args.p_to);
    const events = (this.tables.app_events ?? []).filter((row) => {
      const at = instant(row.created_at);
      return at >= from && at < to;
    });
    return {
      data: [
        {
          people: new Set(events.map((row) => row.user_id)).size,
          games_started: events.filter((row) => row.name === 'game_started').length,
          games_finished: events.filter((row) => row.name === 'game_finished').length,
        },
      ],
      error: null,
    };
  }

  /** The reads of one table or view. */
  readsOf(table: string): FakeCall[] {
    return this.calls.filter((call) => call.table === table);
  }

  /** This stand-in, typed as the service client the code under test takes. */
  asClient(): SupabaseClient<Database> {
    return this as unknown as SupabaseClient<Database>;
  }
}
