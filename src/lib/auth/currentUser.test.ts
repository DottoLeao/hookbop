import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import type { Database } from '@/lib/supabase/database.types';
import { currentUserId } from './currentUser';

function clientWith(answer: unknown) {
  const getClaims = vi.fn(async () => answer);
  return { auth: { getClaims } } as unknown as SupabaseClient<Database>;
}

describe('currentUserId', () => {
  it('is the subject of the verified session token', async () => {
    const client = clientWith({ data: { claims: { sub: 'user-1' } }, error: null });

    expect(await currentUserId(client)).toBe('user-1');
  });

  it('is null without a session', async () => {
    const client = clientWith({ data: null, error: { message: 'Auth session missing!' } });

    expect(await currentUserId(client)).toBeNull();
  });

  it('is null when the token has no subject', async () => {
    const client = clientWith({ data: { claims: {} }, error: null });

    expect(await currentUserId(client)).toBeNull();
  });
});
