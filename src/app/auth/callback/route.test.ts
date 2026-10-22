// @vitest-environment node
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createServerSupabase } from '@/lib/supabase/server';
import { GET } from './route';

vi.mock('@/lib/supabase/server', () => ({ createServerSupabase: vi.fn() }));

const MARIA = { id: 'u1', email: 'maria.silva@gmail.com', user_metadata: { full_name: 'Maria Silva' } };
const NO_SESSION = { message: 'Auth session missing!' };

interface World {
  /** What ensure_owner says. */
  isOwner?: boolean;
  ownerError?: { message: string } | null;
  /** What redeem_invite says. */
  redeemResult?: string;
  redeemError?: { message: string } | null;
  /** A failed code exchange. */
  exchangeError?: { message: string } | null;
  /** Who the cookies already hold a session for (the six-digit code path). */
  sessionUser?: typeof MARIA | null;
}

function arrange({
  isOwner = false,
  ownerError = null,
  redeemResult = 'ok',
  redeemError = null,
  exchangeError = null,
  sessionUser = MARIA,
}: World = {}) {
  const exchangeCodeForSession = vi.fn(async () =>
    exchangeError ? { data: { user: null }, error: exchangeError } : { data: { user: MARIA }, error: null },
  );
  const getUser = vi.fn(async () =>
    sessionUser ? { data: { user: sessionUser }, error: null } : { data: { user: null }, error: NO_SESSION },
  );
  const rpc = vi.fn(async (name: string) =>
    name === 'ensure_owner'
      ? { data: ownerError ? null : isOwner, error: ownerError }
      : { data: redeemError ? null : redeemResult, error: redeemError },
  );
  vi.mocked(createServerSupabase).mockResolvedValue({
    auth: { exchangeCodeForSession, getUser },
    rpc,
  } as unknown as Awaited<ReturnType<typeof createServerSupabase>>);
  return { exchangeCodeForSession, getUser, rpc };
}

function callback(query: string, inviteCookie?: string) {
  const headers = inviteCookie ? { cookie: `hb_invite=${inviteCookie}` } : undefined;
  return GET(new NextRequest(`http://localhost:3000/auth/callback${query}`, { headers }));
}

/** Where the response sends the browser, as a path plus query. */
function destination(response: Response) {
  const location = new URL(response.headers.get('location') ?? '');
  return location.pathname + location.search;
}

function redeemCalls(rpc: ReturnType<typeof arrange>['rpc']) {
  return rpc.mock.calls.filter(([name]) => name === 'redeem_invite');
}

describe('GET /auth/callback', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe('turning the one-time code into a session', () => {
    it('goes back to sign-in when there is no code', async () => {
      const { exchangeCodeForSession, rpc } = arrange();

      const response = await callback('', 'CODE123');

      expect(destination(response)).toBe('/entrar');
      expect(exchangeCodeForSession).not.toHaveBeenCalled();
      expect(rpc).not.toHaveBeenCalled();
    });

    it('says the link did not work when Supabase reports an expired or used e-mail link', async () => {
      const { exchangeCodeForSession } = arrange();

      const response = await callback('?error=access_denied&error_code=otp_expired&error_description=expired');

      expect(destination(response)).toBe('/entrar?erro=link');
      expect(exchangeCodeForSession).not.toHaveBeenCalled();
    });

    it('goes back to sign-in when Google reports an error instead of a code', async () => {
      arrange();

      const response = await callback('?error=access_denied&error_description=cancelled');

      expect(destination(response)).toBe('/entrar');
    });

    it('goes back to sign-in saying the link did not work, keeping the invite, when the code does not work', async () => {
      // An expired code, one already used, or a link opened in another browser than the one that asked for it.
      const { rpc } = arrange({ exchangeError: { message: 'invalid flow state' } });

      const response = await callback('?code=bad', 'CODE123');

      expect(destination(response)).toBe('/entrar?erro=link');
      expect(rpc).not.toHaveBeenCalled();
      expect(response.headers.get('set-cookie')).toBeNull();
    });
  });

  describe('after a six-digit code (?via=otp), when the session is already in the cookies', () => {
    it('does not exchange a code, it reads the signed-in user', async () => {
      const { exchangeCodeForSession, getUser } = arrange();

      const response = await callback('?via=otp');

      expect(getUser).toHaveBeenCalledTimes(1);
      expect(exchangeCodeForSession).not.toHaveBeenCalled();
      expect(destination(response)).toBe('/');
    });

    it('runs the same invite redemption as the link does', async () => {
      const { rpc } = arrange({ redeemResult: 'full' });

      const response = await callback('?via=otp', 'CODE123');

      expect(rpc).toHaveBeenCalledWith('redeem_invite', { p_code: 'CODE123', p_display_name: 'Maria Silva' });
      expect(destination(response)).toBe('/entrar?estado=full');
      expect(response.headers.get('set-cookie')).toMatch(/hb_invite=;/);
    });

    it('goes back to sign-in when nobody is signed in', async () => {
      const { rpc } = arrange({ sessionUser: null });

      const response = await callback('?via=otp', 'CODE123');

      expect(destination(response)).toBe('/entrar');
      expect(rpc).not.toHaveBeenCalled();
      expect(response.headers.get('set-cookie')).toBeNull();
    });
  });

  describe('the owner', () => {
    it('goes to the app and never redeems an invite', async () => {
      const { rpc } = arrange({ isOwner: true });

      const response = await callback('?code=abc', 'CODE123');

      expect(destination(response)).toBe('/');
      expect(redeemCalls(rpc)).toHaveLength(0);
    });

    it('still clears a stray invite cookie', async () => {
      arrange({ isOwner: true });

      const response = await callback('?code=abc', 'CODE123');

      expect(response.headers.get('set-cookie')).toMatch(/hb_invite=;/);
    });
  });

  describe('someone with an invite', () => {
    it('is let into the app when the invite is ok', async () => {
      const { rpc } = arrange({ redeemResult: 'ok' });

      const response = await callback('?code=abc', 'CODE123');

      expect(destination(response)).toBe('/');
      expect(rpc).toHaveBeenCalledWith('redeem_invite', { p_code: 'CODE123', p_display_name: 'Maria Silva' });
    });

    it('is let into the app when already a member', async () => {
      arrange({ redeemResult: 'already_member' });

      expect(destination(await callback('?code=abc', 'CODE123'))).toBe('/');
    });

    it.each(['used', 'full', 'removed', 'not_found'])('is sent back to sign-in with "%s"', async (result) => {
      arrange({ redeemResult: result });

      const response = await callback('?code=abc', 'CODE123');

      expect(destination(response)).toBe(`/entrar?estado=${result}`);
    });

    it('has the hb_invite cookie deleted once the invite has been answered', async () => {
      arrange({ redeemResult: 'full' });

      const response = await callback('?code=abc', 'CODE123');

      expect(response.headers.get('set-cookie')).toMatch(/hb_invite=;.*(Max-Age=0|Expires=Thu, 01 Jan 1970)/i);
    });

    it('keeps the hb_invite cookie when the redeem call itself fails, so signing in again can retry, and says why', async () => {
      arrange({ redeemError: { message: 'connection reset' } });

      const response = await callback('?code=abc', 'CODE123');

      expect(destination(response)).toBe('/entrar?erro=servico');
      expect(response.headers.get('set-cookie')).toBeNull();
    });
  });

  describe('someone without an invite', () => {
    it('goes to "/" so the proxy decides, and nothing is redeemed', async () => {
      const { rpc } = arrange();

      const response = await callback('?code=abc');

      expect(destination(response)).toBe('/');
      expect(redeemCalls(rpc)).toHaveLength(0);
      expect(response.headers.get('set-cookie')).toBeNull();
    });
  });

  it('goes back to sign-in, keeping the invite, when ensure_owner fails, and says why', async () => {
    const { rpc } = arrange({ ownerError: { message: 'boom' } });

    const response = await callback('?code=abc', 'CODE123');

    expect(destination(response)).toBe('/entrar?erro=servico');
    expect(redeemCalls(rpc)).toHaveLength(0);
    expect(response.headers.get('set-cookie')).toBeNull();
  });
});
