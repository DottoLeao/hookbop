// @vitest-environment node
import { refresh } from 'next/cache';
import { notFound } from 'next/navigation';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { currentUserId } from '@/lib/auth/currentUser';
import { FakeMetricsDb } from '@/lib/metrics/fakeMetricsDb';
import { createServiceSupabase } from '@/lib/supabase/admin';
import { listActiveMembers, type Member } from '@/lib/supabase/members';
import { saveBrlRateAction } from './actions';

vi.mock('next/cache', () => ({ refresh: vi.fn() }));
vi.mock('next/navigation', () => ({
  notFound: vi.fn(() => {
    throw new Error('NEXT_HTTP_ERROR_FALLBACK;404');
  }),
}));
vi.mock('@/lib/supabase/server', () => ({ createServerSupabase: vi.fn(async () => ({ fake: 'session client' })) }));
vi.mock('@/lib/supabase/admin', () => ({ createServiceSupabase: vi.fn() }));
vi.mock('@/lib/auth/currentUser', () => ({ currentUserId: vi.fn() }));
vi.mock('@/lib/supabase/members', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/supabase/members')>()),
  listActiveMembers: vi.fn(),
}));

const MEMBERS: Member[] = [
  { id: 'owner-1', displayName: 'Dono', joinedAt: '2026-10-20T10:00:00Z', isOwner: true },
  { id: 'user-2', displayName: 'Joana', joinedAt: '2026-10-21T10:00:00Z', isOwner: false },
];

function form(brlRate?: string) {
  const data = new FormData();
  if (brlRate !== undefined) data.set('brlRate', brlRate);
  return data;
}

let db: FakeMetricsDb;

beforeEach(() => {
  vi.clearAllMocks();
  db = new FakeMetricsDb();
  db.tables.app_config = [{ key: 'brl_rate', value: '5.50' }];
  vi.mocked(createServiceSupabase).mockReturnValue(db.asClient());
  vi.mocked(listActiveMembers).mockResolvedValue(MEMBERS);
  vi.mocked(currentUserId).mockResolvedValue('owner-1');
});

describe('saveBrlRateAction', () => {
  it.each([
    ['5,75', '5.75'],
    ['6.1', '6.1'],
    [' 20 ', '20'],
    ['1', '1'],
  ])('saves %j from the owner as %j in app_config, and draws the page again', async (typed, stored) => {
    expect(await saveBrlRateAction({ status: 'idle' }, form(typed))).toEqual({ status: 'saved' });

    expect(db.upserts).toEqual([{ table: 'app_config', row: { key: 'brl_rate', value: stored }, options: { onConflict: 'key' } }]);
    expect(refresh).toHaveBeenCalledOnce();
  });

  it.each([
    ['below 1', '0,5'],
    ['above 20', '25'],
    ['text', 'cinco'],
    ['empty', ''],
    ['missing', undefined],
    ['negative', '-5'],
  ])('refuses a rate that is %s, with a message and without writing', async (_label, typed) => {
    expect(await saveBrlRateAction({ status: 'idle' }, form(typed))).toEqual({ status: 'invalid' });

    expect(createServiceSupabase).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });

  it.each([
    ['a member', 'user-2'],
    ['someone signed out', null],
  ])('does not exist for %s, even with a valid rate, and never takes up the service key', async (_label, userId) => {
    vi.mocked(currentUserId).mockResolvedValue(userId);

    await expect(saveBrlRateAction({ status: 'idle' }, form('5,75'))).rejects.toThrow('NEXT_HTTP_ERROR_FALLBACK;404');

    expect(notFound).toHaveBeenCalledOnce();
    expect(createServiceSupabase).not.toHaveBeenCalled();
    expect(db.upserts).toEqual([]);
  });

  it('checks the owner before it even looks at the rate', async () => {
    vi.mocked(currentUserId).mockResolvedValue('user-2');

    await expect(saveBrlRateAction({ status: 'idle' }, form('cinco'))).rejects.toThrow('NEXT_HTTP_ERROR_FALLBACK;404');
  });

  it('says it did not work when the database refuses, and logs only the reason', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    db.upsertError = { message: 'permission denied' };

    expect(await saveBrlRateAction({ status: 'idle' }, form('5,75'))).toEqual({ status: 'failed' });

    expect(refresh).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith('Could not save the exchange rate.', 'permission denied');
  });
});
