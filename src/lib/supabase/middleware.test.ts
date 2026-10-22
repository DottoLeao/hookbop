// @vitest-environment node
import { createServerClient } from '@supabase/ssr';
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { updateSession } from './middleware';

vi.mock('@supabase/ssr', () => ({ createServerClient: vi.fn() }));

/** The session client the proxy makes: who the token says is signed in, and what is_member answers. */
function sessionClient(
  userId: string | null,
  isMember: () => Promise<{ data: boolean | null; error: { message: string } | null }>,
) {
  const rpc = vi.fn(isMember);
  vi.mocked(createServerClient).mockReturnValue({
    auth: { getClaims: vi.fn(async () => ({ data: userId ? { claims: { sub: userId } } : null })) },
    rpc,
  } as never);
  return { rpc };
}

const request = () => new NextRequest('http://localhost:3000/');

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://127.0.0.1:54321');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'test-anon-key');
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe('updateSession', () => {
  it('says a signed-in member is a member', async () => {
    sessionClient('user-1', async () => ({ data: true, error: null }));

    expect(await updateSession(request(), { checkMembership: true })).toMatchObject({
      signedIn: true,
      isMember: true,
      membershipFailed: false,
    });
  });

  it('says someone signed in without a profile is not a member, and that the check itself worked', async () => {
    sessionClient('user-2', async () => ({ data: false, error: null }));

    expect(await updateSession(request(), { checkMembership: true })).toMatchObject({
      signedIn: true,
      isMember: false,
      membershipFailed: false,
    });
  });

  it('says the check failed when is_member answers with an error, never that the person is no member', async () => {
    sessionClient('user-1', async () => ({ data: null, error: { message: 'canceling statement due to statement timeout' } }));

    expect(await updateSession(request(), { checkMembership: true })).toMatchObject({
      signedIn: true,
      isMember: false,
      membershipFailed: true,
    });
  });

  it('says the check failed when the call to is_member throws', async () => {
    sessionClient('user-1', async () => {
      throw new TypeError('fetch failed');
    });

    expect(await updateSession(request(), { checkMembership: true })).toMatchObject({ membershipFailed: true });
  });

  it('asks nothing about membership without a session, or when not told to', async () => {
    const signedOut = sessionClient(null, async () => ({ data: true, error: null }));
    expect(await updateSession(request(), { checkMembership: true })).toMatchObject({
      signedIn: false,
      isMember: false,
      membershipFailed: false,
    });
    expect(signedOut.rpc).not.toHaveBeenCalled();

    const onPublicPage = sessionClient('user-1', async () => ({ data: true, error: null }));
    expect(await updateSession(request(), { checkMembership: false })).toMatchObject({ membershipFailed: false });
    expect(onPublicPage.rpc).not.toHaveBeenCalled();
  });
});
