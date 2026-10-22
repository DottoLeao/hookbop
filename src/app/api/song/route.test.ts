// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createLrclibSource, LRCLIB_CLIENT } from '@/lib/lyrics/lrclib';
import { createServiceSupabase } from '@/lib/supabase/admin';
import { createServerSupabase } from '@/lib/supabase/server';
import { createSupabaseSongStore } from '@/lib/supabase/songStore';
import { fetchOEmbedMeta } from '@/lib/youtube/oembed';
import { POST } from './route';

vi.mock('@/lib/supabase/server', () => ({ createServerSupabase: vi.fn() }));
vi.mock('@/lib/supabase/admin', () => ({ createServiceSupabase: vi.fn(() => ({ marker: 'service-client' })) }));
vi.mock('@/lib/supabase/songStore', () => ({ createSupabaseSongStore: vi.fn() }));
vi.mock('@/lib/youtube/oembed', () => ({ fetchOEmbedMeta: vi.fn() }));
vi.mock('@/lib/lyrics/lrclib', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/lyrics/lrclib')>()),
  createLrclibSource: vi.fn(),
}));

const ID = 'aaaaaaaaaaa';
// Invented lines, not lyrics.
const LRC = '[00:02.00]Paper boats on a river of light\n[00:05.00]';

const store = { getVideo: vi.fn(), upsertVideo: vi.fn() };
const find = vi.fn();

/** The member's own session client: who is signed in, and what is_member says for them. */
function sessionAs(userId: string | null, member: boolean, rpcError: { message: string } | null = null) {
  const rpc = vi.fn(async () => ({ data: rpcError ? null : member, error: rpcError }));
  const client = {
    auth: { getClaims: vi.fn(async () => ({ data: userId ? { claims: { sub: userId } } : null })) },
    rpc,
  };
  vi.mocked(createServerSupabase).mockResolvedValue(client as never);
  return { rpc };
}

function post(body: unknown = { youtubeId: ID, durationS: 200 }) {
  return POST(
    new Request('http://localhost:3000/api/song', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(createSupabaseSongStore).mockReturnValue(store);
  vi.mocked(createLrclibSource).mockReturnValue({ find });
  store.getVideo.mockResolvedValue(null);
  store.upsertVideo.mockResolvedValue(undefined);
  vi.mocked(fetchOEmbedMeta).mockResolvedValue({ title: 'Invented Artist - Invented Song', channel: 'Invented Artist' });
  find.mockResolvedValue({
    status: 'found',
    result: { source: 'lrclib', ref: '777', syncedLrc: LRC, durationS: 195, artist: 'Invented Artist', track: 'Invented Song' },
  });
});

describe('POST /api/song', () => {
  it('checks the member with their session, then resolves and saves through the service key', async () => {
    const { rpc } = sessionAs('user-1', true);

    const response = await post();

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ status: 'ready', video: { youtubeId: ID, lyricsRef: '777' } });
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(rpc).toHaveBeenCalledExactlyOnceWith('is_member');
    expect(createSupabaseSongStore).toHaveBeenCalledExactlyOnceWith({ marker: 'service-client' });
    expect(store.upsertVideo).toHaveBeenCalledOnce();
    expect(fetchOEmbedMeta).toHaveBeenCalledExactlyOnceWith(ID);
  });

  it('asks LRCLIB from the server with the app’s client header, through the server’s own fetch', async () => {
    sessionAs('user-1', true);

    await post();

    expect(createLrclibSource).toHaveBeenCalledExactlyOnceWith({ fetch: globalThis.fetch, client: LRCLIB_CLIENT });
    expect(LRCLIB_CLIENT).toMatch(/^Hookbop\//);
  });

  it('answers 401 without a session, and never makes the service client', async () => {
    sessionAs(null, false);

    const response = await post();

    expect(response.status).toBe(401);
    expect(createServiceSupabase).not.toHaveBeenCalled();
  });

  it('answers 403 to someone who is not a member, and never makes the service client', async () => {
    sessionAs('user-2', false);

    const response = await post();

    expect(response.status).toBe(403);
    expect(createServiceSupabase).not.toHaveBeenCalled();
  });

  it('answers 503 when the membership cannot be checked', async () => {
    sessionAs('user-1', true, { message: 'timeout' });
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    const response = await post();

    expect(response.status).toBe(503);
    expect(createServiceSupabase).not.toHaveBeenCalled();
  });

  it('answers 503 when the session client cannot be made', async () => {
    vi.mocked(createServerSupabase).mockRejectedValue(new Error('no request scope'));
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    expect((await post()).status).toBe(503);
  });
});
