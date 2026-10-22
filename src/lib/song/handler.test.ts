// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SongStore, VideoMeta, VideoRecord } from '@/lib/lyrics/resolveSong';
import type { LyricsLookup, LyricsSource } from '@/lib/lyrics/source';
import { handleSongRequest, type SongHandlerDeps } from './handler';

const ID = 'aaaaaaaaaaa';
const NOW = new Date('2026-10-22T12:00:00.000Z');
// Invented lines, not lyrics.
const LRC = ['[00:02.00]Paper boats on a river of light', '[00:05.00]Lanterns hum along the quiet shore', '[00:08.00]'].join(
  '\n',
);
const META: VideoMeta = { title: 'Invented Artist - Invented Song (Official Video)', channel: 'InventedArtistVEVO' };
const FOUND: LyricsLookup = {
  status: 'found',
  result: { source: 'lrclib', ref: '777', syncedLrc: LRC, durationS: 180, artist: 'Invented Artist', track: 'Invented Song' },
};

const SAVED: VideoRecord = {
  youtubeId: ID,
  title: META.title,
  channel: META.channel,
  durationS: 200,
  ytFetchedAt: '2026-10-21T12:00:00.000Z',
  status: 'ok',
  lyricsSource: 'lrclib',
  lyricsRef: '777',
  lyricsLrc: LRC,
  lyricsDurationS: 180,
  offsetMs: 1500,
};

function post(body: unknown, headers: Record<string, string> = {}) {
  return new Request('http://localhost:3000/api/song', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

function makeDeps(over: Partial<SongHandlerDeps> = {}) {
  const store = {
    getVideo: vi.fn<SongStore['getVideo']>().mockResolvedValue(null),
    upsertVideo: vi.fn<SongStore['upsertVideo']>().mockResolvedValue(undefined),
  };
  const find = vi.fn<LyricsSource['find']>().mockResolvedValue(FOUND);
  const deps = {
    userId: vi.fn<SongHandlerDeps['userId']>().mockResolvedValue('user-1'),
    isMember: vi.fn<SongHandlerDeps['isMember']>().mockResolvedValue(true),
    store: vi.fn<SongHandlerDeps['store']>(() => store),
    meta: vi.fn<SongHandlerDeps['meta']>().mockResolvedValue(META),
    lyrics: vi.fn<SongHandlerDeps['lyrics']>(() => ({ find })),
    now: () => NOW,
    ...over,
  };
  return { deps, store, find };
}

let warn: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('handleSongRequest', () => {
  it('resolves a new video on the server and saves it through the service store', async () => {
    const { deps, store, find } = makeDeps();

    const response = await handleSongRequest(post({ youtubeId: ID, durationS: 200.4 }), deps);

    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    const body = await response.json();
    expect(body).toMatchObject({ status: 'ready', needsCalibration: true, video: { youtubeId: ID, lyricsRef: '777' } });
    expect(body.lines).toHaveLength(2);
    expect(body.lines[0]).toMatchObject({ text: 'Paper boats on a river of light', startMs: 2000 });
    expect(deps.meta).toHaveBeenCalledExactlyOnceWith(ID);
    expect(find).toHaveBeenCalledExactlyOnceWith({ artist: 'Invented Artist', track: 'Invented Song', durationS: 200.4 });
    expect(store.upsertVideo).toHaveBeenCalledOnce();
    expect(store.upsertVideo.mock.calls[0][0]).toMatchObject({ youtubeId: ID, status: 'ok', lyricsLrc: LRC });
  });

  it('answers from the saved video, with its offset applied, without asking anyone', async () => {
    const { deps, store, find } = makeDeps();
    store.getVideo.mockResolvedValue(SAVED);

    const response = await handleSongRequest(post({ youtubeId: ID, durationS: 200 }), deps);

    const body = await response.json();
    expect(body).toMatchObject({ status: 'ready', video: { offsetMs: 1500 } });
    expect(body.lines[0].startMs).toBe(3500);
    expect(deps.meta).not.toHaveBeenCalled();
    expect(find).not.toHaveBeenCalled();
    expect(store.upsertVideo).not.toHaveBeenCalled();
  });

  it.each([
    ['null', null],
    ['0', 0],
  ])('resolves read-only when the duration is %s: it saves nothing and never asks for a calibration (ruling R42)', async (_name, durationS) => {
    const { deps, store, find } = makeDeps();

    const response = await handleSongRequest(post({ youtubeId: ID, durationS }), deps);

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ status: 'ready', needsCalibration: false });
    expect(find).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ durationS: 0 }));
    expect(store.getVideo).toHaveBeenCalledExactlyOnceWith(ID);
    expect(store.upsertVideo).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalled();
  });

  it('passes on what the resolver says when there are no lyrics, and when the lyrics service is slow', async () => {
    const { deps, find } = makeDeps();
    find.mockResolvedValueOnce({ status: 'not_found' });
    expect(await (await handleSongRequest(post({ youtubeId: ID, durationS: 200 }), deps)).json()).toMatchObject({
      status: 'no_lyrics',
      video: { youtubeId: ID, status: 'no_lyrics' },
    });

    find.mockResolvedValueOnce({ status: 'unavailable' });
    const slow = await handleSongRequest(post({ youtubeId: ID, durationS: 200 }), deps);
    expect(slow.status).toBe(200);
    expect(await slow.json()).toEqual({ status: 'lyrics_unavailable' });
  });

  it('says so when YouTube no longer knows the video', async () => {
    const { deps } = makeDeps({ meta: vi.fn<SongHandlerDeps['meta']>().mockResolvedValue(null) });

    expect(await (await handleSongRequest(post({ youtubeId: ID, durationS: 200 }), deps)).json()).toEqual({
      status: 'video_unavailable',
    });
  });

  it('answers 401 with no session, before reading anything else', async () => {
    const { deps } = makeDeps({ userId: vi.fn<SongHandlerDeps['userId']>().mockResolvedValue(null) });

    const response = await handleSongRequest(post({ youtubeId: ID, durationS: 200 }), deps);

    expect(response.status).toBe(401);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(deps.isMember).not.toHaveBeenCalled();
    expect(deps.store).not.toHaveBeenCalled();
  });

  it('answers 403 to someone signed in who is not a member, without touching the service key', async () => {
    const { deps } = makeDeps({ isMember: vi.fn<SongHandlerDeps['isMember']>().mockResolvedValue(false) });

    const response = await handleSongRequest(post({ youtubeId: ID, durationS: 200 }), deps);

    expect(response.status).toBe(403);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(deps.store).not.toHaveBeenCalled();
    expect(deps.meta).not.toHaveBeenCalled();
  });

  describe('the body', () => {
    it.each([
      ['is not JSON', '{nope'],
      ['is not an object', '"aaaaaaaaaaa"'],
      ['has no video id', { durationS: 200 }],
      ['has an id that is too short', { youtubeId: 'abc', durationS: 200 }],
      ['has an id with characters a video id cannot have', { youtubeId: 'aaaaaaaaaa/', durationS: 200 }],
      ['has a link in place of the id', { youtubeId: `https://youtu.be/${ID}`, durationS: 200 }],
      ['has no duration at all', { youtubeId: ID }],
      ['has a duration that is text', { youtubeId: ID, durationS: '200' }],
      ['has a negative duration', { youtubeId: ID, durationS: -1 }],
      ['has a duration longer than 12 hours', { youtubeId: ID, durationS: 12 * 3600 + 1 }],
      ['has a duration that is not finite', '{"youtubeId":"aaaaaaaaaaa","durationS":1e999}'],
    ])('answers 400 when it %s, before the database is touched', async (_name, body) => {
      const { deps } = makeDeps();

      const response = await handleSongRequest(post(body), deps);

      expect(response.status).toBe(400);
      expect(response.headers.get('Cache-Control')).toBe('no-store');
      expect(deps.store).not.toHaveBeenCalled();
    });

    it('answers 400 for a body that says it is too big, without reading it', async () => {
      const { deps } = makeDeps();

      const response = await handleSongRequest(post({ youtubeId: ID, durationS: 200 }, { 'Content-Length': '5000' }), deps);

      expect(response.status).toBe(400);
      expect(deps.store).not.toHaveBeenCalled();
    });

    it('answers 400 for a body that grows past 1 KB', async () => {
      const { deps } = makeDeps();

      const response = await handleSongRequest(post({ youtubeId: ID, durationS: 200, pad: 'x'.repeat(2000) }), deps);

      expect(response.status).toBe(400);
      expect(deps.store).not.toHaveBeenCalled();
    });

    it('takes a duration of 12 hours exactly', async () => {
      const { deps } = makeDeps();

      expect((await handleSongRequest(post({ youtubeId: ID, durationS: 12 * 3600 }), deps)).status).toBe(200);
    });
  });

  it('answers 503, with no-store and no reason, when the database fails', async () => {
    const { deps, store } = makeDeps();
    store.getVideo.mockRejectedValue(new Error('connection refused at 10.0.0.1'));

    const response = await handleSongRequest(post({ youtubeId: ID, durationS: 200 }), deps);

    expect(response.status).toBe(503);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(await response.text()).not.toContain('10.0.0.1');
    expect(warn).toHaveBeenCalled();
  });

  it('answers 503 when the session cannot be read', async () => {
    const { deps } = makeDeps({ userId: vi.fn<SongHandlerDeps['userId']>().mockRejectedValue(new Error('no cookies')) });

    const response = await handleSongRequest(post({ youtubeId: ID, durationS: 200 }), deps);

    expect(response.status).toBe(503);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });

  it('answers 503 when YouTube cannot be asked about a new video', async () => {
    const { deps, store } = makeDeps({ meta: vi.fn<SongHandlerDeps['meta']>().mockRejectedValue(new Error('oEmbed 500')) });

    const response = await handleSongRequest(post({ youtubeId: ID, durationS: 200 }), deps);

    expect(response.status).toBe(503);
    expect(store.upsertVideo).not.toHaveBeenCalled();
  });
});
