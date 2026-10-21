import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import type { Database } from './database.types';
import { DEFAULT_MEMBER_CAP, listActiveMembers, memberCap } from './members';

type Client = SupabaseClient<Database>;

describe('listActiveMembers', () => {
  function clientWith(answer: { data: unknown; error: { message: string } | null }) {
    const order = vi.fn(async () => answer);
    const is = vi.fn(() => ({ order }));
    const select = vi.fn(() => ({ is }));
    const from = vi.fn(() => ({ select }));
    return { client: { from } as unknown as Client, from, is, order };
  }

  it('lists who has not been removed, oldest member first', async () => {
    const { client, from, is, order } = clientWith({
      data: [
        { id: 'owner-1', display_name: 'Dono', created_at: '2026-10-20T10:00:00Z', is_owner: true },
        { id: 'user-2', display_name: 'Joana', created_at: '2026-10-21T10:00:00Z', is_owner: false },
      ],
      error: null,
    });

    expect(await listActiveMembers(client)).toEqual([
      { id: 'owner-1', displayName: 'Dono', joinedAt: '2026-10-20T10:00:00Z', isOwner: true },
      { id: 'user-2', displayName: 'Joana', joinedAt: '2026-10-21T10:00:00Z', isOwner: false },
    ]);
    expect(from).toHaveBeenCalledWith('profiles');
    expect(is).toHaveBeenCalledWith('removed_at', null);
    expect(order).toHaveBeenCalledWith('created_at', { ascending: true });
  });

  it('fails when the members cannot be read', async () => {
    const { client } = clientWith({ data: null, error: { message: 'permission denied' } });

    await expect(listActiveMembers(client)).rejects.toThrow(/permission denied/);
  });
});

describe('memberCap', () => {
  function adminWith(answer: { data: unknown; error: { message: string } | null }) {
    const maybeSingle = vi.fn(async () => answer);
    const eq = vi.fn(() => ({ maybeSingle }));
    const select = vi.fn(() => ({ eq }));
    const from = vi.fn(() => ({ select }));
    return { admin: { from } as unknown as Client, from, eq };
  }

  it('is the member_cap setting', async () => {
    const { admin, from, eq } = adminWith({ data: { value: '30' }, error: null });

    expect(await memberCap(admin)).toBe(30);
    expect(from).toHaveBeenCalledWith('app_config');
    expect(eq).toHaveBeenCalledWith('key', 'member_cap');
  });

  it('is 50 when the setting does not exist, like redeem_invite assumes', async () => {
    const { admin } = adminWith({ data: null, error: null });

    expect(DEFAULT_MEMBER_CAP).toBe(50);
    expect(await memberCap(admin)).toBe(50);
  });

  it.each(['abc', '', '0', '-5', '12.5'])('is 50 when the setting says %j, which is no usable limit', async (value) => {
    const { admin } = adminWith({ data: { value }, error: null });

    expect(await memberCap(admin)).toBe(50);
  });

  it('fails when the setting cannot be read, rather than showing a made-up limit', async () => {
    const { admin } = adminWith({ data: null, error: { message: 'invalid api key' } });

    await expect(memberCap(admin)).rejects.toThrow(/invalid api key/);
  });
});
