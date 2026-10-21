// @vitest-environment node
import { refresh } from 'next/cache';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createServerSupabase } from '@/lib/supabase/server';
import { removeMemberAction } from './actions';

vi.mock('next/cache', () => ({ refresh: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createServerSupabase: vi.fn() }));

const MEMBER_ID = '3f2b6c1e-8a4d-4e2b-9c7a-1d5e6f708192';

function arrange(rpcError: { code: string; message: string } | null = null) {
  const rpc = vi.fn(async () => ({ data: null, error: rpcError }));
  vi.mocked(createServerSupabase).mockResolvedValue({ rpc } as unknown as Awaited<ReturnType<typeof createServerSupabase>>);
  return { rpc };
}

function form(userId?: string) {
  const data = new FormData();
  if (userId !== undefined) data.set('userId', userId);
  return data;
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe('removeMemberAction', () => {
  it('removes the member through remove_member and refreshes the page', async () => {
    const { rpc } = arrange();

    expect(await removeMemberAction({ failed: false }, form(MEMBER_ID))).toEqual({ failed: false });

    expect(rpc).toHaveBeenCalledExactlyOnceWith('remove_member', { p_user: MEMBER_ID });
    expect(refresh).toHaveBeenCalledOnce();
  });

  it('reports a failure when the database refuses, as it does for anyone but the owner', async () => {
    const { rpc } = arrange({ code: '42501', message: 'only the owner can remove members' });

    expect(await removeMemberAction({ failed: false }, form(MEMBER_ID))).toEqual({ failed: true });

    expect(rpc).toHaveBeenCalledOnce();
    expect(refresh).not.toHaveBeenCalled();
  });

  it.each([
    ['missing', undefined],
    ['empty', ''],
    ['not a uuid', 'joana'],
    ['a uuid with something tacked on', `${MEMBER_ID}'; drop table profiles;--`],
  ])('does not call the database when the member id is %s', async (_label, userId) => {
    const { rpc } = arrange();

    expect(await removeMemberAction({ failed: false }, form(userId))).toEqual({ failed: true });

    expect(rpc).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });
});
