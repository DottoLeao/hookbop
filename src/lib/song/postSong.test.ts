import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SongResolution } from '@/lib/lyrics/resolveSong';
import { postSong } from './postSong';

const ID = 'aaaaaaaaaaa';
const READY: SongResolution = {
  status: 'ready',
  video: {
    youtubeId: ID,
    title: 'Invented Artist - Invented Song',
    channel: 'Invented Artist',
    durationS: 200,
    ytFetchedAt: '2026-10-21T12:00:00.000Z',
    status: 'ok',
    lyricsSource: 'lrclib',
    lyricsRef: '777',
    // Invented lines, not lyrics.
    lyricsLrc: '[00:02.00]Paper boats on a river of light\n[00:05.00]',
    lyricsDurationS: 180,
    offsetMs: 0,
  },
  lines: [{ index: 0, startMs: 2000, endMs: 5000, text: 'Paper boats on a river of light' }],
  needsCalibration: true,
};

function answers(body: unknown, status = 200) {
  const fetchFn = vi.fn<typeof fetch>(async () => new Response(JSON.stringify(body), { status }));
  vi.stubGlobal('fetch', fetchFn);
  return fetchFn;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('postSong', () => {
  it('posts the video and its duration to /api/song, kept by no cache, and gives back the answer', async () => {
    const fetchFn = answers(READY);

    expect(await postSong(ID, 213.5)).toEqual(READY);

    expect(fetchFn).toHaveBeenCalledOnce();
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe('/api/song');
    expect(init).toMatchObject({ method: 'POST', cache: 'no-store', headers: { 'Content-Type': 'application/json' } });
    expect(JSON.parse(String(init?.body))).toEqual({ youtubeId: ID, durationS: 213.5 });
  });

  it('sends a duration nobody knows as null', async () => {
    const fetchFn = answers({ status: 'lyrics_unavailable' });

    expect(await postSong(ID, null)).toEqual({ status: 'lyrics_unavailable' });
    expect(JSON.parse(String(fetchFn.mock.calls[0][1]?.body))).toEqual({ youtubeId: ID, durationS: null });
  });

  it.each([
    { status: 'no_lyrics', video: READY.video },
    { status: 'video_unavailable' },
  ])('gives back the other answers as they are: $status', async (body) => {
    answers(body);

    expect(await postSong(ID, 200)).toEqual(body);
  });

  it.each([401, 403, 400, 503])('throws on a %i, which says nothing about the song', async (status) => {
    answers({ error: 'x' }, status);

    await expect(postSong(ID, 200)).rejects.toThrow(String(status));
  });

  it('throws when the network is out', async () => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockRejectedValue(new TypeError('Failed to fetch')));

    await expect(postSong(ID, 200)).rejects.toThrow('Failed to fetch');
  });

  it.each([
    ['an unknown status', { status: 'maybe' }],
    ['a ready answer with no lines', { ...READY, lines: undefined }],
    ['a ready answer with no video', { ...READY, video: null }],
    ['a no-lyrics answer with no video', { status: 'no_lyrics' }],
    ['null', null],
  ])('throws on a 200 with %s', async (_name, body) => {
    answers(body);

    await expect(postSong(ID, 200)).rejects.toThrow();
  });
});
