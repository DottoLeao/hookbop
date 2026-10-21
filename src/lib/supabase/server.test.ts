// @vitest-environment node
import { connection } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createServerSupabase } from './server';

vi.mock('next/server', () => ({ connection: vi.fn() }));
vi.mock('next/headers', () => ({ cookies: vi.fn() }));
vi.mock('@supabase/ssr', () => ({ createServerClient: vi.fn() }));

const cookieStore = { getAll: vi.fn(), set: vi.fn() };

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://127.0.0.1:54321');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'anon-key');
  vi.mocked(cookies).mockResolvedValue(cookieStore as unknown as Awaited<ReturnType<typeof cookies>>);
});

/** The cookie handlers the client was given. */
async function handlers() {
  await createServerSupabase();
  const options = vi.mocked(createServerClient).mock.calls[0][2];
  return options.cookies as {
    getAll: () => unknown;
    setAll: (cookies: { name: string; value: string; options: object }[]) => void;
  };
}

describe('createServerSupabase', () => {
  it('waits for a real request before it reads the session', async () => {
    await createServerSupabase();

    // Checking a session token against the clock cannot happen while Next.js prepares a page
    // ahead of time (it logs "Date.now() while prerendering"), so the work is held back.
    expect(connection).toHaveBeenCalledOnce();
    expect(vi.mocked(connection).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(cookies).mock.invocationCallOrder[0],
    );
  });

  it('talks to the project with the public key and the request cookies', async () => {
    cookieStore.getAll.mockReturnValue([{ name: 'sb-session', value: 'token' }]);

    const { getAll } = await handlers();

    expect(createServerClient).toHaveBeenCalledWith('http://127.0.0.1:54321', 'anon-key', expect.any(Object));
    expect(getAll()).toEqual([{ name: 'sb-session', value: 'token' }]);
  });

  it('writes refreshed session cookies when it can', async () => {
    const { setAll } = await handlers();

    setAll([{ name: 'sb-session', value: 'new-token', options: { path: '/' } }]);

    expect(cookieStore.set).toHaveBeenCalledWith('sb-session', 'new-token', { path: '/' });
  });

  it('lets a Server Component carry on when cookies cannot be written there', async () => {
    cookieStore.set.mockImplementation(() => {
      throw new Error('Cookies can only be modified in a Server Action or Route Handler.');
    });
    const { setAll } = await handlers();

    expect(() => setAll([{ name: 'sb-session', value: 'new-token', options: {} }])).not.toThrow();
  });
});
