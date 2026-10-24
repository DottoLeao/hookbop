// @vitest-environment node
import { NextRequest, type NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { updateSession, type SessionState } from '@/lib/supabase/middleware';
import { config, proxy } from './proxy';

vi.mock('@/lib/supabase/middleware', () => ({ updateSession: vi.fn() }));

// Next.js anchors the matcher to the whole path, so the same is done here.
const matcher = new RegExp(`^${config.matcher[0]}$`);

describe('proxy matcher', () => {
  it.each(['/', '/entrar', '/auth/callback', '/jogar/dQw4w9WgXcQ', '/icons/icon-192.png', '/sw.js'])(
    'runs on %s',
    (path) => {
      expect(matcher.test(path)).toBe(true);
    },
  );

  it.each(['/favicon.ico', '/_next/static/chunks/main.js', '/_next/image'])('skips %s', (path) => {
    expect(matcher.test(path)).toBe(false);
  });

  it('treats the dot in favicon.ico as a dot, not as any character', () => {
    expect(matcher.test('/faviconXico')).toBe(true);
    expect(matcher.test('/favicon-ico')).toBe(true);
  });
});

/** What the session check says about the person asking. */
function sessionSays(state: Partial<Omit<SessionState, 'apply'>>) {
  vi.mocked(updateSession).mockResolvedValue({
    signedIn: false,
    isMember: false,
    membershipFailed: false,
    ...state,
    apply: <T extends NextResponse>(response: T) => response,
  });
}

/** Where the proxy sends the browser, as a path plus query, or null when it lets the request through. */
async function destinationOf(path: string) {
  const response = await proxy(new NextRequest(`http://localhost:3000${path}`));
  const location = response.headers.get('location');
  if (!location) return null;
  const url = new URL(location);
  return url.pathname + url.search;
}

describe('proxy', () => {
  beforeEach(() => {
    vi.mocked(updateSession).mockReset();
  });

  it('lets a member through', async () => {
    sessionSays({ signedIn: true, isMember: true });

    expect(await destinationOf('/')).toBeNull();
  });

  it('sends someone with no session to sign-in', async () => {
    sessionSays({ signedIn: false });

    expect(await destinationOf('/jogar/dQw4w9WgXcQ')).toBe('/entrar');
  });

  it('sends someone signed in with no invite to "Pede um convite"', async () => {
    sessionSays({ signedIn: true, isMember: false });

    expect(await destinationOf('/')).toBe('/entrar?estado=sem-convite');
  });

  it('never says "Pede um convite" when the membership could not be checked: it says it did not work this time', async () => {
    sessionSays({ signedIn: true, isMember: false, membershipFailed: true });

    expect(await destinationOf('/')).toBe('/entrar?erro=servico');
    expect(await destinationOf('/api/song')).toBe('/entrar?erro=servico');
  });

  it('lets a request for the events route reach it with no session, for it to answer 401 and not a redirect', async () => {
    sessionSays({ signedIn: false });

    const response = await proxy(new NextRequest('http://localhost:3000/api/events', { method: 'POST' }));

    expect(response.headers.get('location')).toBeNull();
    expect(response.status).toBe(200);
    expect(updateSession).toHaveBeenLastCalledWith(expect.anything(), { checkMembership: false });
  });

  it('still sends a request for the other API routes with no session to sign-in', async () => {
    sessionSays({ signedIn: false });

    expect(await destinationOf('/api/help')).toBe('/entrar');
    expect(await destinationOf('/api/song')).toBe('/entrar');
  });

  it('lets anyone reach a public page, without checking the membership', async () => {
    sessionSays({ signedIn: false });

    expect(await destinationOf('/entrar')).toBeNull();
    expect(updateSession).toHaveBeenLastCalledWith(expect.anything(), { checkMembership: false });
  });
});
