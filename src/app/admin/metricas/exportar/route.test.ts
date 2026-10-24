// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { currentUserId } from '@/lib/auth/currentUser';
import { FakeMetricsDb } from '@/lib/metrics/fakeMetricsDb';
import type { MetricsExport } from '@/lib/metrics/queries';
import { createServiceSupabase } from '@/lib/supabase/admin';
import { listActiveMembers, type Member } from '@/lib/supabase/members';
import { DELETE, GET, OPTIONS, PATCH, POST, PUT } from './route';

// Who is asking is read with the person's own session (fakes here); the export is read through the service key,
// which here is a database in memory.
vi.mock('@/lib/supabase/server', () => ({ createServerSupabase: vi.fn(async () => ({ fake: 'session client' })) }));
vi.mock('@/lib/supabase/admin', () => ({ createServiceSupabase: vi.fn() }));
vi.mock('@/lib/auth/currentUser', () => ({ currentUserId: vi.fn() }));
vi.mock('@/lib/supabase/members', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/supabase/members')>()),
  listActiveMembers: vi.fn(),
}));

const NOW = new Date('2026-10-25T17:00:00Z');
const OWNER = '0b8a3c1e-1111-4a2b-9c7a-000000000001';
const MEMBER = '0b8a3c1e-2222-4a2b-9c7a-000000000002';
const SESSION = '4f0c2a9e-7b1d-4c35-9a6e-0d2b8f5e1c77';
const MEMBERS: Member[] = [
  { id: OWNER, displayName: 'Dono', joinedAt: '2026-10-20T10:00:00Z', isOwner: true },
  { id: MEMBER, displayName: 'Joana', joinedAt: '2026-10-21T10:00:00Z', isOwner: false },
];

function seeded() {
  const db = new FakeMetricsDb();
  const start = Date.parse('2026-10-20T03:00:00Z');
  db.tables.ai_usage = Array.from({ length: 2300 }, (_, index) => ({
    id: index + 1,
    created_at: new Date(start + index * 60_000).toISOString(),
    user_id: MEMBER,
    youtube_id: 'aaaaaaaaaaa',
    line_index: index % 30,
    kind: 'explain',
    source: index % 2 === 0 ? 'model' : 'cache',
    model: index % 2 === 0 ? 'claude-haiku-5-5' : null,
    input_tokens: index % 2 === 0 ? 300 : 0,
    output_tokens: index % 2 === 0 ? 100 : 0,
    cost_usd: index % 2 === 0 ? 0.00008 : 0,
    latency_ms: index % 2 === 0 ? 1200 : null,
    outcome: 'ok',
  }));
  db.tables.app_events = Array.from({ length: 1700 }, (_, index) => ({
    id: index + 1,
    created_at: new Date(start + index * 60_000).toISOString(),
    user_id: MEMBER,
    session_id: SESSION,
    name: 'song_opened',
    youtube_id: 'aaaaaaaaaaa',
    mode: null,
    props: {},
  }));
  db.tables.metrics_ai_daily = [{ day: '2026-10-20', calls: 2300 }];
  return db;
}

function get(query = '?dias=30') {
  return GET(new Request(`http://localhost:3000/admin/metricas/exportar${query}`));
}

let db: FakeMetricsDb;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  db = seeded();
  vi.mocked(createServiceSupabase).mockReturnValue(db.asClient());
  vi.mocked(listActiveMembers).mockResolvedValue(MEMBERS);
  vi.mocked(currentUserId).mockResolvedValue(OWNER);
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe('GET /admin/metricas/exportar for anyone but the owner', () => {
  it.each([
    ['a member', MEMBER],
    ['someone signed out', null],
  ])('answers %s with a bare 404, as if there were no such address, and reads nothing', async (_label, userId) => {
    vi.mocked(currentUserId).mockResolvedValue(userId);

    const response = await get();

    expect(response.status).toBe(404);
    expect(await response.text()).toBe('');
    expect(response.headers.get('Content-Disposition')).toBeNull();
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(createServiceSupabase).not.toHaveBeenCalled();
  });

  it('answers 404 when who is asking cannot be checked', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.mocked(listActiveMembers).mockRejectedValue(new Error('offline'));

    const response = await get();

    expect(response.status).toBe(404);
    expect(createServiceSupabase).not.toHaveBeenCalled();
  });

  it('answers every other method with the same 404, not with a 405 or a list of methods that would say it is here', async () => {
    for (const handler of [POST, PUT, PATCH, DELETE, OPTIONS]) {
      const response = handler();
      expect(response.status).toBe(404);
      expect(response.headers.get('Allow')).toBeNull();
      expect(await response.text()).toBe('');
    }
    expect(createServiceSupabase).not.toHaveBeenCalled();
  });
});

describe('GET /admin/metricas/exportar for the owner', () => {
  it('downloads a JSON file that no cache keeps', async () => {
    const response = await get();

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('application/json; charset=utf-8');
    expect(response.headers.get('Content-Disposition')).toBe('attachment; filename="hookbop-metricas-2026-10-25-30dias.json"');
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });

  it('holds the summaries, every record of the period past 1000 rows, when it was made and its version', async () => {
    const body = (await (await get()).json()) as MetricsExport;

    expect(body.schemaVersion).toBe(1);
    expect(body.generatedAt).toBe('2026-10-25T17:00:00.000Z');
    expect(body.period).toMatchObject({ days: 30, firstDay: '2026-09-26', lastDay: '2026-10-25' });
    expect(body.summaries.metrics_ai_daily).toEqual([{ day: '2026-10-20', calls: 2300 }]);
    expect(body.summaries.metrics_active_people).toEqual({ people: 1, games_started: 0, games_finished: 0 });
    expect(body.records.ai_usage).toHaveLength(2300);
    expect(body.records.app_events).toHaveLength(1700);
    expect(body.records.ai_usage[2299]).toMatchObject({ id: 2300, user_id: MEMBER });
  });

  it.each([
    ['?dias=7', 7],
    ['?dias=30', 30],
    ['', 30],
    ['?dias=90', 30],
    ['?dias=sete', 30],
    ['?dias=7&dias=30', 30],
  ])('takes the period from %j: %d days', async (query, days) => {
    const response = await get(query);
    const body = (await response.json()) as MetricsExport;

    expect(body.period.days).toBe(days);
    expect(response.headers.get('Content-Disposition')).toContain(`-${days}dias.json`);
  });

  it('answers 503, with nothing in it, when the records cannot be read', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    db.failures.set('app_events', 'statement timeout');

    const response = await get();

    expect(response.status).toBe(503);
    expect(await response.text()).toBe('');
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(warn).toHaveBeenCalledOnce();
  });
});
