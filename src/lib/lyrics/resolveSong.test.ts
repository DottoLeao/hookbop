import { describe, expect, it, vi } from 'vitest';
import { resolveSong, type SongStore, type VideoMeta, type VideoRecord } from './resolveSong';
import type { LyricsLookup, LyricsQuery, LyricsResult, LyricsSource } from './source';

const DAY_MS = 24 * 3600 * 1000;
const NOW = new Date('2026-10-22T12:00:00.000Z');
const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString();

const ID = 'dQw4w9WgXcQ';
const LRC = '[00:10.00]First line\n[00:20.00]Second line\n[00:30.00]Third line';

/** The lines LRC holds, with the last one lasting until the end of a 175 s song. */
const LINES = [
  { index: 0, startMs: 10000, endMs: 20000, text: 'First line' },
  { index: 1, startMs: 20000, endMs: 30000, text: 'Second line' },
  { index: 2, startMs: 30000, endMs: 175000, text: 'Third line' },
];

const META: VideoMeta = { title: 'The Artist - The Song (Official Video)', channel: 'TheArtistVEVO' };
const QUERY: LyricsQuery = { artist: 'The Artist', track: 'The Song', durationS: 200 };
const FOUND: LyricsResult = {
  source: 'lrclib',
  ref: '777',
  syncedLrc: LRC,
  durationS: 175,
  artist: 'The Artist',
  track: 'The Song',
};

/** A video with lyrics, fetched a day ago. */
const okVideo = (over: Partial<VideoRecord> = {}): VideoRecord => ({
  youtubeId: ID,
  title: 'Old title',
  channel: 'Old channel',
  durationS: 200,
  ytFetchedAt: ago(DAY_MS),
  status: 'ok',
  lyricsSource: 'lrclib',
  lyricsRef: '555',
  lyricsLrc: LRC,
  lyricsDurationS: 175,
  offsetMs: 0,
  ...over,
});

/** A video the app looked up before and found no lyrics for, fetched a day ago. */
const noLyricsVideo = (over: Partial<VideoRecord> = {}): VideoRecord => ({
  youtubeId: ID,
  title: 'Old title',
  channel: 'Old channel',
  durationS: 200,
  ytFetchedAt: ago(DAY_MS),
  status: 'no_lyrics',
  offsetMs: 0,
  ...over,
});

interface World {
  /** What the app remembers about the video (null: nothing). */
  stored?: VideoRecord | null;
  /** What YouTube says about the video (null: it cannot be found). */
  meta?: VideoMeta | null;
  /** What the lyrics service says. */
  lookup?: LyricsLookup;
}

function arrange({ stored = null, meta = META, lookup = { status: 'found', result: FOUND } }: World = {}) {
  const getVideo = vi.fn<SongStore['getVideo']>(async () => stored);
  const upsertVideo = vi.fn<SongStore['upsertVideo']>(async () => {});
  const store: SongStore = { getVideo, upsertVideo };
  const fetchMeta = vi.fn<(id: string) => Promise<VideoMeta | null>>(async () => meta);
  const find = vi.fn<LyricsSource['find']>(async () => lookup);
  const lyrics: LyricsSource = { find };
  const resolve = (videoDurationS = 200) =>
    resolveSong(ID, videoDurationS, { store, meta: fetchMeta, lyrics, now: () => NOW });
  return { getVideo, upsertVideo, meta: fetchMeta, find, resolve };
}

describe('resolveSong, a video the app remembers with lyrics', () => {
  it('is ready from memory, without asking YouTube or the lyrics service', async () => {
    const stored = okVideo();
    const { resolve, meta, find, upsertVideo, getVideo } = arrange({ stored });

    expect(await resolve()).toEqual({ status: 'ready', video: stored, lines: LINES, needsCalibration: true });
    expect(getVideo).toHaveBeenCalledWith(ID);
    expect(meta).not.toHaveBeenCalled();
    expect(find).not.toHaveBeenCalled();
    expect(upsertVideo).not.toHaveBeenCalled();
  });

  it('shows the lyrics at the offset the players settled on', async () => {
    const { resolve } = arrange({ stored: okVideo({ offsetMs: 1500 }) });

    const result = await resolve();

    expect(result).toMatchObject({ status: 'ready' });
    expect(result.status === 'ready' && result.lines).toEqual([
      { index: 0, startMs: 11500, endMs: 21500, text: 'First line' },
      { index: 1, startMs: 21500, endMs: 31500, text: 'Second line' },
      { index: 2, startMs: 31500, endMs: 176500, text: 'Third line' },
    ]);
  });

  it('keeps the metadata for exactly 30 days', async () => {
    const { resolve, meta } = arrange({ stored: okVideo({ ytFetchedAt: ago(30 * DAY_MS) }) });

    expect(await resolve()).toMatchObject({ status: 'ready' });
    expect(meta).not.toHaveBeenCalled();
  });

  it('asks for calibration only when the video is more than 10 s longer than the lyrics', async () => {
    const stored = okVideo();

    expect(await arrange({ stored }).resolve(201)).toMatchObject({ needsCalibration: true });
    expect(await arrange({ stored }).resolve(185)).toMatchObject({ needsCalibration: false });
  });
});

describe('resolveSong, a video with stale metadata', () => {
  const stale = (over: Partial<VideoRecord> = {}) => okVideo({ ytFetchedAt: ago(30 * DAY_MS + 1), ...over });

  it('fetches the metadata again and saves the new date, keeping the lyrics and the offset', async () => {
    const stored = stale({ offsetMs: 2500 });
    const { resolve, meta, find, upsertVideo } = arrange({ stored });

    const result = await resolve(201);

    const refreshed: VideoRecord = {
      ...stored,
      title: META.title,
      channel: META.channel,
      durationS: 201,
      ytFetchedAt: NOW.toISOString(),
    };
    expect(meta).toHaveBeenCalledWith(ID);
    expect(upsertVideo).toHaveBeenCalledOnce();
    expect(upsertVideo).toHaveBeenCalledWith(refreshed);
    expect(find).not.toHaveBeenCalled();
    expect(result).toEqual({
      status: 'ready',
      video: refreshed,
      lines: [
        { index: 0, startMs: 12500, endMs: 22500, text: 'First line' },
        { index: 1, startMs: 22500, endMs: 32500, text: 'Second line' },
        { index: 2, startMs: 32500, endMs: 177500, text: 'Third line' },
      ],
      needsCalibration: true,
    });
  });

  it('cannot be played when YouTube no longer knows the video', async () => {
    const { resolve, upsertVideo } = arrange({ stored: stale(), meta: null });

    expect(await resolve()).toEqual({ status: 'video_unavailable' });
    expect(upsertVideo).not.toHaveBeenCalled();
  });

  it('counts a date it cannot read as stale', async () => {
    const { resolve, meta } = arrange({ stored: okVideo({ ytFetchedAt: 'not a date' }) });

    expect(await resolve()).toMatchObject({ status: 'ready' });
    expect(meta).toHaveBeenCalledOnce();
  });
});

describe('resolveSong, a new video', () => {
  it('reads the metadata, looks the lyrics up with the clean artist and track, and saves it', async () => {
    const { resolve, meta, find, upsertVideo } = arrange();

    const result = await resolve(200);

    expect(meta).toHaveBeenCalledWith(ID);
    expect(find).toHaveBeenCalledWith(QUERY);
    expect(meta.mock.invocationCallOrder[0]).toBeLessThan(find.mock.invocationCallOrder[0]);

    const saved: VideoRecord = {
      youtubeId: ID,
      title: META.title,
      channel: META.channel,
      durationS: 200,
      ytFetchedAt: NOW.toISOString(),
      status: 'ok',
      lyricsSource: 'lrclib',
      lyricsRef: '777',
      lyricsLrc: LRC,
      lyricsDurationS: 175,
      offsetMs: 0,
    };
    expect(upsertVideo).toHaveBeenCalledOnce();
    expect(upsertVideo).toHaveBeenCalledWith(saved);
    expect(result).toEqual({ status: 'ready', video: saved, lines: LINES, needsCalibration: true });
  });

  it('asks for calibration when a 201 s video has 175 s of lyrics', async () => {
    expect(await arrange().resolve(201)).toMatchObject({ status: 'ready', needsCalibration: true });
  });

  it('does not ask for calibration when the lyrics are about as long as the video', async () => {
    expect(await arrange().resolve(180)).toMatchObject({ status: 'ready', needsCalibration: false });
  });

  it('cannot be played when YouTube does not know the video, and the lyrics are not looked up', async () => {
    const { resolve, find, upsertVideo } = arrange({ meta: null });

    expect(await resolve()).toEqual({ status: 'video_unavailable' });
    expect(find).not.toHaveBeenCalled();
    expect(upsertVideo).not.toHaveBeenCalled();
  });

  it('remembers that there are no lyrics when the service has none', async () => {
    const { resolve, upsertVideo } = arrange({ lookup: { status: 'not_found' } });

    const result = await resolve(200);

    const saved: VideoRecord = {
      youtubeId: ID,
      title: META.title,
      channel: META.channel,
      durationS: 200,
      ytFetchedAt: NOW.toISOString(),
      status: 'no_lyrics',
      offsetMs: 0,
    };
    expect(upsertVideo).toHaveBeenCalledOnce();
    expect(upsertVideo).toHaveBeenCalledWith(saved);
    expect(result).toEqual({ status: 'no_lyrics', video: saved });
  });

  it('saves nothing when the lyrics service could not answer, so the next visit asks again', async () => {
    const { resolve, upsertVideo } = arrange({ lookup: { status: 'unavailable' } });

    expect(await resolve()).toEqual({ status: 'lyrics_unavailable' });
    expect(upsertVideo).not.toHaveBeenCalled();
  });

  it('treats a remembered video with lyrics missing like a new one', async () => {
    const broken = okVideo({ lyricsLrc: undefined, lyricsDurationS: undefined, offsetMs: 900 });
    const { resolve, meta, find, upsertVideo } = arrange({ stored: broken });

    const result = await resolve();

    expect(meta).toHaveBeenCalledOnce();
    expect(find).toHaveBeenCalledOnce();
    expect(upsertVideo).toHaveBeenCalledWith(expect.objectContaining({ status: 'ok', lyricsLrc: LRC, offsetMs: 0 }));
    expect(result).toMatchObject({ status: 'ready', lines: LINES });
  });
});

describe('resolveSong, a video with no lyrics on record', () => {
  it('stays without lyrics while the metadata is fresh, and does not ask again', async () => {
    const stored = noLyricsVideo();
    const { resolve, meta, find, upsertVideo } = arrange({ stored });

    expect(await resolve()).toEqual({ status: 'no_lyrics', video: stored });
    expect(meta).not.toHaveBeenCalled();
    expect(find).not.toHaveBeenCalled();
    expect(upsertVideo).not.toHaveBeenCalled();
  });

  const stale = (over: Partial<VideoRecord> = {}) => noLyricsVideo({ ytFetchedAt: ago(31 * DAY_MS), ...over });

  it('tries the lyrics once more when the metadata is stale, because they may exist by now', async () => {
    const { resolve, meta, find, upsertVideo } = arrange({ stored: stale() });

    const result = await resolve(200);

    expect(meta).toHaveBeenCalledOnce();
    expect(find).toHaveBeenCalledOnce();
    expect(find).toHaveBeenCalledWith(QUERY);
    expect(upsertVideo).toHaveBeenCalledOnce();
    expect(upsertVideo).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'ok', lyricsRef: '777', lyricsLrc: LRC, ytFetchedAt: NOW.toISOString() }),
    );
    expect(result).toMatchObject({ status: 'ready', lines: LINES, needsCalibration: true });
  });

  it('records the new date when there are still no lyrics, so the next try waits another 30 days', async () => {
    const { resolve, upsertVideo } = arrange({ stored: stale(), lookup: { status: 'not_found' } });

    const result = await resolve(200);

    const saved: VideoRecord = {
      youtubeId: ID,
      title: META.title,
      channel: META.channel,
      durationS: 200,
      ytFetchedAt: NOW.toISOString(),
      status: 'no_lyrics',
      offsetMs: 0,
    };
    expect(upsertVideo).toHaveBeenCalledWith(saved);
    expect(result).toEqual({ status: 'no_lyrics', video: saved });
  });

  it('saves nothing when the lyrics service could not answer', async () => {
    const { resolve, upsertVideo } = arrange({ stored: stale(), lookup: { status: 'unavailable' } });

    expect(await resolve()).toEqual({ status: 'lyrics_unavailable' });
    expect(upsertVideo).not.toHaveBeenCalled();
  });

  it('cannot be played when YouTube no longer knows the video, and the lyrics are not looked up', async () => {
    const { resolve, find } = arrange({ stored: stale(), meta: null });

    expect(await resolve()).toEqual({ status: 'video_unavailable' });
    expect(find).not.toHaveBeenCalled();
  });
});

describe('resolveSong, failures', () => {
  it('lets a store failure through instead of showing a song it could not look up', async () => {
    const world = arrange();
    const failing: SongStore = {
      getVideo: vi.fn(async () => {
        throw new Error('permission denied');
      }),
      upsertVideo: world.upsertVideo,
    };

    await expect(
      resolveSong(ID, 200, { store: failing, meta: world.meta, lyrics: { find: world.find }, now: () => NOW }),
    ).rejects.toThrow('permission denied');
    expect(world.meta).not.toHaveBeenCalled();
  });

  it('lets a failure to save through, so the song is not shown as remembered when it is not', async () => {
    const world = arrange();
    world.upsertVideo.mockRejectedValueOnce(new Error('network down'));

    await expect(world.resolve()).rejects.toThrow('network down');
  });
});
