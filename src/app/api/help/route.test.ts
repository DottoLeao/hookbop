// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { callModel } from '@/lib/help/model';
import { createServiceSupabase } from '@/lib/supabase/admin';
import { createSupabaseHelpStore } from '@/lib/supabase/helpStore';
import { createServerSupabase } from '@/lib/supabase/server';
import { POST } from './route';

vi.mock('@/lib/supabase/server', () => ({ createServerSupabase: vi.fn() }));
vi.mock('@/lib/supabase/admin', () => ({ createServiceSupabase: vi.fn(() => ({ marker: 'service-client' })) }));
vi.mock('@/lib/supabase/helpStore', () => ({ createSupabaseHelpStore: vi.fn() }));
vi.mock('@/lib/help/model', () => ({ callModel: vi.fn() }));

// Invented lines, not lyrics.
const ASK = {
  youtubeId: 'aaaaaaaaaaa',
  lyricsRef: '777',
  lineIndex: 0,
  lineText: 'Paper boats on a river of light',
  kind: 'translate',
  target: '',
};

const store = {
  getCached: vi.fn(),
  saveCached: vi.fn(),
  reserve: vi.fn(),
  release: vi.fn(),
  recordUsage: vi.fn(),
  getVideo: vi.fn(),
};

/** The member's own session client: who is signed in, and what is_member says for them. */
function sessionAs(userId: string | null, member: boolean) {
  const rpc = vi.fn(async () => ({ data: member, error: null }));
  const client = {
    auth: { getClaims: vi.fn(async () => ({ data: userId ? { claims: { sub: userId } } : null })) },
    rpc,
  };
  vi.mocked(createServerSupabase).mockResolvedValue(client as never);
  return { rpc };
}

function post() {
  return POST(
    new Request('http://localhost:3000/api/help', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(ASK),
    }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(createSupabaseHelpStore).mockReturnValue(store);
  store.getVideo.mockResolvedValue({
    status: 'ok',
    lyricsRef: '777',
    lyricsLrc: '[00:02.00]Paper boats on a river of light',
    lyricsDurationS: 30,
  });
  store.getCached.mockResolvedValue(null);
  store.reserve.mockResolvedValue(41);
  vi.mocked(callModel).mockResolvedValue({
    text: 'Barcos de papel num rio de luz',
    usage: { inputTokens: 210, outputTokens: 40 },
    latencyMs: 800,
  });
});

describe('POST /api/help', () => {
  it('answers a member with the help, reading and writing through the service key', async () => {
    const { rpc } = sessionAs('user-1', true);

    const response = await post();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ content: 'Barcos de papel num rio de luz' });
    expect(rpc).toHaveBeenCalledExactlyOnceWith('is_member');
    expect(createSupabaseHelpStore).toHaveBeenCalledExactlyOnceWith({ marker: 'service-client' });
    expect(callModel).toHaveBeenCalledOnce();
    expect(store.reserve).toHaveBeenCalledExactlyOnceWith('user-1', 'translate');
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });

  it('asks for the session once, for both the user and the membership', async () => {
    sessionAs('user-1', true);

    await post();

    expect(createServerSupabase).toHaveBeenCalledOnce();
  });

  it('answers 503 with no-store when the session client cannot be made', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.mocked(createServerSupabase).mockRejectedValue(new Error('cookies() outside a request'));

    const response = await post();

    expect(response.status).toBe(503);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    warn.mockRestore();
  });

  it('answers 401 with no session, and never makes the service client', async () => {
    sessionAs(null, false);

    expect((await post()).status).toBe(401);
    expect(createServiceSupabase).not.toHaveBeenCalled();
  });

  it('answers 403 when is_member, asked with the session, says no', async () => {
    sessionAs('user-2', false);

    expect((await post()).status).toBe(403);
    expect(createServiceSupabase).not.toHaveBeenCalled();
    expect(callModel).not.toHaveBeenCalled();
  });

  it('answers 503 when the membership check fails', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { rpc } = sessionAs('user-1', true);
    rpc.mockResolvedValue({ data: null, error: { message: 'timeout' } } as never);

    expect((await post()).status).toBe(503);
    warn.mockRestore();
  });
});
