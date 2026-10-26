// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { streamModel } from '@/lib/help/model';
import { createServiceSupabase } from '@/lib/supabase/admin';
import { createSupabaseHelpStore, createSupabaseTranslationCache } from '@/lib/supabase/helpStore';
import { createServerSupabase } from '@/lib/supabase/server';
import { maxDuration, POST } from './route';

vi.mock('@/lib/supabase/server', () => ({ createServerSupabase: vi.fn() }));
vi.mock('@/lib/supabase/admin', () => ({ createServiceSupabase: vi.fn(() => ({ marker: 'service-client' })) }));
vi.mock('@/lib/supabase/helpStore', () => ({
  createSupabaseHelpStore: vi.fn(),
  createSupabaseTranslationCache: vi.fn(),
}));
vi.mock('@/lib/help/model', () => ({ streamModel: vi.fn() }));

// Next's `after` only works inside a real request. Here it is a fake that keeps the callback, which the platform would
// run once the response is over.
const after = vi.hoisted(() => vi.fn<(callback: () => unknown) => void>());
vi.mock('next/server', () => ({ after }));

// Invented lines, not lyrics.
const store = {
  getCached: vi.fn(),
  saveCached: vi.fn(),
  reserve: vi.fn(),
  release: vi.fn(),
  recordUsage: vi.fn(),
  getVideo: vi.fn(),
};
const cache = { getCachedTranslations: vi.fn(), saveTranslations: vi.fn() };

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
    new Request('http://localhost:3000/api/translate-song', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ youtubeId: 'aaaaaaaaaaa', lyricsRef: '777' }),
    }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  after.mockReset();
  vi.mocked(createSupabaseHelpStore).mockReturnValue(store);
  vi.mocked(createSupabaseTranslationCache).mockReturnValue(cache);
  store.getVideo.mockResolvedValue({
    status: 'ok',
    lyricsRef: '777',
    lyricsLrc: '[00:02.00]Paper boats on a river of light',
    lyricsDurationS: 30,
  });
  store.reserve.mockResolvedValue(41);
  store.release.mockResolvedValue(undefined);
  store.recordUsage.mockResolvedValue(undefined);
  cache.getCachedTranslations.mockResolvedValue(new Map());
  cache.saveTranslations.mockResolvedValue(undefined);
  vi.mocked(streamModel).mockImplementation(async (_request, onText) => {
    onText('{"lines":[{"n":1,"translation":"Barcos de papel num rio de luz"}]}');
    return { usage: { inputTokens: 210, outputTokens: 40 }, latencyMs: 800 };
  });
});

describe('POST /api/translate-song', () => {
  it('may run for 60 s, for a long song streamed and saved after it', () => {
    expect(maxDuration).toBe(60);
  });

  it('streams a member the translations, reading and writing through the service key', async () => {
    const { rpc } = sessionAs('user-1', true);

    const response = await post();

    expect(response.status).toBe(200);
    expect(await response.text()).toBe('{"lineIndex":0,"text":"Barcos de papel num rio de luz"}\n');
    expect(rpc).toHaveBeenCalledExactlyOnceWith('is_member');
    expect(createSupabaseHelpStore).toHaveBeenCalledExactlyOnceWith({ marker: 'service-client' });
    expect(createSupabaseTranslationCache).toHaveBeenCalledExactlyOnceWith({ marker: 'service-client' });
    expect(streamModel).toHaveBeenCalledOnce();
    expect(store.reserve).toHaveBeenCalledExactlyOnceWith('user-1', 'translate');
  });

  it('asks for the session once, for both the user and the membership', async () => {
    sessionAs('user-1', true);

    await (await post()).text();

    expect(createServerSupabase).toHaveBeenCalledOnce();
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
    expect(streamModel).not.toHaveBeenCalled();
  });

  it('answers 503 with no-store when the session client cannot be made', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.mocked(createServerSupabase).mockRejectedValue(new Error('cookies() outside a request'));

    const response = await post();

    expect(response.status).toBe(503);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    warn.mockRestore();
  });

  it('keeps the work going after the response with after(), which then saves and logs the call (ruling S42)', async () => {
    sessionAs('user-1', true);

    const response = await post();
    await response.text();

    expect(after).toHaveBeenCalledOnce();
    await after.mock.calls[0][0]();
    expect(cache.saveTranslations).toHaveBeenCalledExactlyOnceWith('aaaaaaaaaaa', '777', [
      { lineIndex: 0, text: 'Barcos de papel num rio de luz' },
    ]);
    expect(store.recordUsage).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ userId: 'user-1', lineIndex: -1, source: 'model', costUsd: 0.000041, latencyMs: 800 }),
    );
  });

  it('writes nothing for a request that never reaches the model or the cache', async () => {
    sessionAs('user-2', false);

    await post();

    expect(after).not.toHaveBeenCalled();
    expect(store.recordUsage).not.toHaveBeenCalled();
  });
});
