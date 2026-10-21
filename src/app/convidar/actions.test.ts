// @vitest-environment node
import { refresh } from 'next/cache';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createInvite } from '@/lib/supabase/invites';
import { createServerSupabase } from '@/lib/supabase/server';
import { createInviteAction } from './actions';

vi.mock('next/cache', () => ({ refresh: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createServerSupabase: vi.fn() }));
vi.mock('@/lib/supabase/invites', () => ({ createInvite: vi.fn() }));

/** A member's client, as the server action gets it. `sub` is who the session token says is signed in. */
function arrange(sub: string | null) {
  const client = {
    auth: { getClaims: vi.fn(async () => (sub ? { data: { claims: { sub } }, error: null } : { data: null, error: { message: 'no session' } })) },
  };
  vi.mocked(createServerSupabase).mockResolvedValue(client as unknown as Awaited<ReturnType<typeof createServerSupabase>>);
  return client;
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe('createInviteAction', () => {
  it('creates one invite in the name of the signed-in member and refreshes the page', async () => {
    const client = arrange('user-1');
    vi.mocked(createInvite).mockResolvedValue('ABCDEFGH23');

    expect(await createInviteAction()).toEqual({ failed: false });

    expect(createInvite).toHaveBeenCalledExactlyOnceWith(client, 'user-1');
    expect(refresh).toHaveBeenCalledOnce();
  });

  it('does nothing without a session', async () => {
    arrange(null);

    expect(await createInviteAction()).toEqual({ failed: true });

    expect(createInvite).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });

  it('reports a failure when the invite could not be created', async () => {
    arrange('user-1');
    vi.mocked(createInvite).mockResolvedValue(null);

    expect(await createInviteAction()).toEqual({ failed: true });

    expect(refresh).not.toHaveBeenCalled();
  });
});
