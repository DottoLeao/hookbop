import { describe, expect, it, vi } from 'vitest';
import { PRICES } from '@/lib/help/pricing';
import { FakeMetricsDb } from './fakeMetricsDb';
import { EXPORT_SCHEMA_VERSION, exportFileName, PAGE_SIZE, readAll, readBrlRate, readExport, readPanelData } from './queries';

// 14:00 in Brasília on 25/10/2026.
const NOW = new Date('2026-10-25T17:00:00Z');
const USER_A = '0b8a3c1e-1111-4a2b-9c7a-000000000001';
const USER_B = '0b8a3c1e-2222-4a2b-9c7a-000000000002';
const SESSION = '4f0c2a9e-7b1d-4c35-9a6e-0d2b8f5e1c77';

/** `n` rows of ai_usage, one a minute from `start`, all answered by the model. */
function aiUsageRows(n: number, start: string, userId = USER_A) {
  const first = Date.parse(start);
  return Array.from({ length: n }, (_, index) => ({
    id: index + 1,
    created_at: new Date(first + index * 60_000).toISOString(),
    user_id: userId,
    youtube_id: 'aaaaaaaaaaa',
    line_index: index % 40,
    kind: 'translate',
    source: 'model',
    model: 'claude-haiku-5-5',
    input_tokens: 300,
    output_tokens: 100,
    cost_usd: 0.00008,
    latency_ms: 1000 + (index % 3) * 500,
    outcome: 'ok',
  }));
}

/** `n` rows of app_events, one a minute from `start`. */
function appEventRows(n: number, start: string, firstId = 1, userId = USER_A) {
  const first = Date.parse(start);
  return Array.from({ length: n }, (_, index) => ({
    id: firstId + index,
    created_at: new Date(first + index * 60_000).toISOString(),
    user_id: userId,
    session_id: SESSION,
    name: index % 2 === 0 ? 'game_started' : 'game_finished',
    youtube_id: 'aaaaaaaaaaa',
    mode: 'escolha',
    props: {},
  }));
}

describe('readAll', () => {
  it('asks for one page of 1000 rows after another, going on from the last row it got, until a page is empty', async () => {
    const all = Array.from({ length: 2345 }, (_, index) => index);
    const page = vi.fn(async (from: number, to: number) => ({ data: all.slice(from, to + 1), error: null }));

    const rows = await readAll('the numbers', page);

    expect(PAGE_SIZE).toBe(1000);
    expect(rows).toEqual(all);
    expect(page.mock.calls).toEqual([
      [0, 999],
      [1000, 1999],
      [2000, 2999],
      [2345, 3344],
    ]);
  });

  it('gets every row from a server that returns fewer rows per read than it asks for', async () => {
    // As if the hosted max_rows were 300: a short page is not the end.
    const all = Array.from({ length: 1234 }, (_, index) => index);
    const page = vi.fn(async (from: number, to: number) => ({ data: all.slice(from, Math.min(to + 1, from + 300)), error: null }));

    expect(await readAll('the numbers', page)).toEqual(all);
    expect(page.mock.calls.map(([from]) => from)).toEqual([0, 300, 600, 900, 1200, 1234]);
  });

  it('reads one empty page when there is nothing', async () => {
    const page = vi.fn(async () => ({ data: [], error: null }));

    expect(await readAll('the numbers', page)).toEqual([]);
    expect(page).toHaveBeenCalledOnce();
  });

  it('fails, saying what it was reading, when a page cannot be read', async () => {
    const page = vi.fn(async () => ({ data: null, error: { message: 'timeout' } }));

    await expect(readAll('metrics_songs', page)).rejects.toThrow('Could not read metrics_songs: timeout');
  });
});

describe('readBrlRate', () => {
  it('reads the rate the owner set in app_config', async () => {
    const db = new FakeMetricsDb();
    db.tables.app_config = [{ key: 'brl_rate', value: '6.10' }];

    expect(await readBrlRate(db.asClient())).toBe(6.1);
    expect(db.readsOf('app_config')[0].filters).toEqual(['key=eq.brl_rate']);
  });

  it.each([
    ['not a number', 'abc'],
    ['out of range', '50'],
  ])('goes back to 5.50 when the stored rate is %s', async (_label, value) => {
    const db = new FakeMetricsDb();
    db.tables.app_config = [{ key: 'brl_rate', value }];

    expect(await readBrlRate(db.asClient())).toBe(5.5);
  });

  it('goes back to 5.50 when there is no rate', async () => {
    expect(await readBrlRate(new FakeMetricsDb().asClient())).toBe(5.5);
  });

  it('fails when app_config cannot be read', async () => {
    const db = new FakeMetricsDb();
    db.failures.set('app_config', 'offline');

    await expect(readBrlRate(db.asClient())).rejects.toThrow('offline');
  });
});

describe('readPanelData', () => {
  function seeded() {
    const db = new FakeMetricsDb();
    db.tables.app_config = [{ key: 'brl_rate', value: '5.00' }];
    db.tables.metrics_ai_daily = [
      { day: '2026-09-27', calls: 2, calls_model: 2, calls_cache: 0, calls_reuse: 0, calls_declined: 0, calls_error: 0, input_tokens: 600, output_tokens: 200, cost_usd: 0.4 },
      { day: '2026-10-22', calls: 4, calls_model: 1, calls_cache: 3, calls_reuse: 0, calls_declined: 0, calls_error: 0, input_tokens: 300, output_tokens: 100, cost_usd: 0.2 },
    ];
    db.tables.metrics_modes = [
      { day: '2026-10-22', mode: 'escolha', mode_selections: 2, games_started: 2, games_finished: 1, games_abandoned: 1, avg_pct: 70, avg_duration_ms: 90_000 },
    ];
    db.tables.metrics_songs = [];
    db.tables.metrics_help = [];
    db.tables.app_events = [
      ...appEventRows(2, '2026-10-22T15:00:00Z', 1, USER_A),
      ...appEventRows(2, '2026-09-28T15:00:00Z', 10, USER_B),
    ];
    db.tables.ai_usage = [
      ...aiUsageRows(3, '2026-10-22T15:00:00Z'),
      { ...aiUsageRows(1, '2026-10-22T16:00:00Z')[0], id: 50, source: 'model', outcome: 'error', latency_ms: 30_000 },
      { ...aiUsageRows(1, '2026-10-22T16:00:00Z')[0], id: 51, source: 'cache', model: null, latency_ms: null },
      // Two translations of a whole song: a long call of the model, and one the cache answered.
      { ...aiUsageRows(1, '2026-10-22T17:00:00Z')[0], id: 52, line_index: -1, cost_usd: 0.003, latency_ms: 12_000 },
      { ...aiUsageRows(1, '2026-10-22T17:30:00Z')[0], id: 53, line_index: -1, source: 'cache', model: null, cost_usd: 0, latency_ms: null },
      // One of a whole song before the period.
      { ...aiUsageRows(1, '2026-10-01T17:00:00Z')[0], id: 54, line_index: -1, youtube_id: 'bbbbbbbbbbb', cost_usd: 0.005 },
    ];
    return db;
  }

  it('reads each summary for the days of the period, in Brasília time', async () => {
    const db = seeded();

    await readPanelData(db.asClient(), { days: 7, now: NOW });

    for (const view of ['metrics_modes', 'metrics_songs', 'metrics_help']) {
      expect(db.readsOf(view)[0].filters).toEqual(['day=gte.2026-10-19', 'day=lte.2026-10-25']);
    }
    // The AI cost also covers the month and the last 30 days, so it starts at the earlier of the two.
    expect(db.readsOf('metrics_ai_daily')[0].filters).toEqual(['day=gte.2026-09-26', 'day=lte.2026-10-25']);
  });

  it('counts the people of the period and of the last 30 days with metrics_active_people, from midnight in Brasília', async () => {
    const db = seeded();

    const panel = await readPanelData(db.asClient(), { days: 7, now: NOW });

    expect(db.rpcs).toEqual([
      {
        name: 'metrics_active_people',
        args: { p_from: '2026-10-19 00:00:00 America/Sao_Paulo', p_to: '2026-10-26 00:00:00 America/Sao_Paulo' },
      },
      {
        name: 'metrics_active_people',
        args: { p_from: '2026-09-26 00:00:00 America/Sao_Paulo', p_to: '2026-10-26 00:00:00 America/Sao_Paulo' },
      },
    ]);
    expect(panel.averages.people).toBe(1);
    expect(panel.projection.people).toBe(2);
    expect(panel.projection.perPersonUsd).toBeCloseTo(0.6 / 2, 6);
  });

  it('counts the people once when the period is the last 30 days', async () => {
    const db = seeded();

    await readPanelData(db.asClient(), { days: 30, now: NOW });

    expect(db.rpcs).toHaveLength(1);
  });

  it('averages the latency of the answers the model gave for one line, and of nothing else', async () => {
    const db = seeded();

    const panel = await readPanelData(db.asClient(), { days: 7, now: NOW });

    const latency = db.readsOf('ai_usage').find((call) => call.select === 'latency_ms')!;
    expect(latency.filters).toEqual([
      'source=eq.model',
      'outcome=eq.ok',
      'line_index=gte.0',
      'latency_ms=not.is.null',
      'created_at=gte.2026-10-19 00:00:00 America/Sao_Paulo',
      'created_at=lt.2026-10-26 00:00:00 America/Sao_Paulo',
    ]);
    // 1000, 1500 and 2000 ms; the error row's 30 s, the cache row and the whole song's 12 s are left out.
    expect(panel.ai.avgLatencyMs).toBe(1500);
  });

  it('reads the translations of whole songs of the period apart, and counts the calls by line without them', async () => {
    const db = seeded();

    const panel = await readPanelData(db.asClient(), { days: 7, now: NOW });

    const whole = db.readsOf('ai_usage').find((call) => call.select === 'youtube_id, source, cost_usd')!;
    expect(whole.filters).toEqual([
      'line_index=eq.-1',
      'created_at=gte.2026-10-19 00:00:00 America/Sao_Paulo',
      'created_at=lt.2026-10-26 00:00:00 America/Sao_Paulo',
    ]);
    expect(panel.ai.wholeSong).toEqual({ songs: 1, calls: 2, costUsd: 0.003 });
    // The view has 4 calls on 22/10 (1 of the model, 3 of the cache); 2 of them were for a whole song.
    expect(panel.ai).toMatchObject({ calls: 2, model: 0, cache: 2 });
    // The cost of the period still has everything.
    expect(panel.spend.periodUsd).toBeCloseTo(0.2, 6);
  });

  it('puts the reads together into the panel, with the rate in app_config', async () => {
    const panel = await readPanelData(seeded().asClient(), { days: 7, now: NOW });

    expect(panel.days).toBe(7);
    expect(panel.brlRate).toBe(5);
    expect(panel.spend.periodUsd).toBeCloseTo(0.2, 6);
    expect(panel.spend.monthUsd).toBeCloseTo(0.2, 6);
    expect(panel.modes[0]).toMatchObject({ mode: 'escolha', started: 2, finished: 1 });
  });

  it('reads a summary past the 1000 rows one read can bring', async () => {
    const db = seeded();
    db.tables.metrics_songs = Array.from({ length: 1500 }, (_, index) => ({
      day: '2026-10-24',
      youtube_id: `s${String(index).padStart(10, '0')}`,
      title: `Invented Song ${index}`,
      song_opens: 1,
      games_started: 1,
      games_finished: 0,
      games_abandoned: 0,
      players: 1,
    }));

    const panel = await readPanelData(db.asClient(), { days: 7, now: NOW });

    expect(db.readsOf('metrics_songs').map((call) => call.range)).toEqual([
      [0, 999],
      [1000, 1999],
      [1500, 2499],
    ]);
    expect(panel.averages.songsPlayed).toBe(1500);
  });
});

describe('readExport', () => {
  function seededForExport() {
    const db = new FakeMetricsDb();
    db.tables.app_config = [{ key: 'brl_rate', value: '5.25' }];
    db.tables.ai_usage = [
      // The day before the period, at 23:59 in Brasília: left out.
      ...aiUsageRows(1, '2026-09-26T02:59:00Z', USER_B).map((row) => ({ ...row, id: 99_999 })),
      ...aiUsageRows(2500, '2026-10-20T03:00:00Z'),
    ];
    db.tables.app_events = appEventRows(1200, '2026-10-21T03:00:00Z');
    db.tables.metrics_ai_daily = [{ day: '2026-10-20', calls: 2500 }];
    db.tables.metrics_usage_daily = [{ day: '2026-10-21', active_users: 1 }];
    db.tables.metrics_modes = [{ day: '2026-10-21', mode: 'escolha' }];
    db.tables.metrics_songs = [{ day: '2026-10-21', youtube_id: 'aaaaaaaaaaa' }];
    db.tables.metrics_help = [{ day: '2026-10-21', mode: 'escolha', kind: 'explain' }];
    return db;
  }

  it('gets every record of the period, past the 1000 rows one read can bring', async () => {
    const db = seededForExport();

    const exported = await readExport(db.asClient(), { days: 30, now: NOW });

    expect(exported.records.ai_usage).toHaveLength(2500);
    expect(exported.records.app_events).toHaveLength(1200);
    expect(db.readsOf('ai_usage').map((call) => call.range)).toEqual([
      [0, 999],
      [1000, 1999],
      [2000, 2999],
      [2500, 3499],
    ]);
    expect(db.readsOf('app_events').map((call) => call.range)).toEqual([
      [0, 999],
      [1000, 1999],
      [1200, 2199],
    ]);
  });

  it('gets every record from a database that returns fewer than 1000 rows per read', async () => {
    const db = seededForExport();
    db.maxRows = 300;

    const exported = await readExport(db.asClient(), { days: 30, now: NOW });

    expect(exported.records.ai_usage).toHaveLength(2500);
    expect(exported.records.app_events).toHaveLength(1200);
    expect(new Set(exported.records.ai_usage.map((row) => row.id)).size).toBe(2500);
  });

  it('keeps the whole row, user_id included, and nothing from before the period', async () => {
    const exported = await readExport(seededForExport().asClient(), { days: 30, now: NOW });

    expect(exported.records.ai_usage[0]).toMatchObject({ id: 1, user_id: USER_A, cost_usd: 0.00008, latency_ms: 1000 });
    expect(exported.records.ai_usage.some((row) => row.id === 99_999)).toBe(false);
    expect(exported.records.app_events[0]).toMatchObject({ user_id: USER_A, session_id: SESSION, name: 'game_started' });
  });

  it('reads the records in [midnight of the first day, midnight after today) in Brasília, in id order', async () => {
    const db = seededForExport();

    await readExport(db.asClient(), { days: 7, now: NOW });

    for (const table of ['ai_usage', 'app_events']) {
      expect(db.readsOf(table)[0]).toMatchObject({
        select: '*',
        filters: ['created_at=gte.2026-10-19 00:00:00 America/Sao_Paulo', 'created_at=lt.2026-10-26 00:00:00 America/Sao_Paulo'],
      });
    }
  });

  it('carries the summaries of the period, when it was made and the version of its shape', async () => {
    const exported = await readExport(seededForExport().asClient(), { days: 30, now: NOW });

    expect(EXPORT_SCHEMA_VERSION).toBe(1);
    expect(exported).toMatchObject({
      schemaVersion: 1,
      generatedAt: '2026-10-25T17:00:00.000Z',
      timeZone: 'America/Sao_Paulo',
      period: {
        days: 30,
        firstDay: '2026-09-26',
        lastDay: '2026-10-25',
        from: '2026-09-26 00:00:00 America/Sao_Paulo',
        to: '2026-10-26 00:00:00 America/Sao_Paulo',
      },
      brlRate: 5.25,
      prices: PRICES,
    });
    expect(exported.summaries.metrics_ai_daily).toEqual([{ day: '2026-10-20', calls: 2500 }]);
    expect(exported.summaries.metrics_usage_daily).toHaveLength(1);
    expect(exported.summaries.metrics_modes).toHaveLength(1);
    expect(exported.summaries.metrics_songs).toHaveLength(1);
    expect(exported.summaries.metrics_help).toHaveLength(1);
    // 1200 events of one person: 600 started, 600 finished.
    expect(exported.summaries.metrics_active_people).toEqual({ people: 1, games_started: 600, games_finished: 600 });
  });

  it('fails when a record cannot be read, instead of exporting part of it', async () => {
    const db = seededForExport();
    db.failures.set('app_events', 'statement timeout');

    await expect(readExport(db.asClient(), { days: 30, now: NOW })).rejects.toThrow('statement timeout');
  });
});

describe('exportFileName', () => {
  it('names the file after the app, the last day and the length of the period', () => {
    expect(exportFileName({ days: 7, lastDay: '2026-10-25' })).toBe('hookbop-metricas-2026-10-25-7dias.json');
  });
});
