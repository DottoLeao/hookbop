import type { SupabaseClient } from '@supabase/supabase-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { VideoRecord } from '@/lib/lyrics/resolveSong';
import type { Database } from './database.types';
import { createSupabaseSongStore } from './songStore';

type Client = SupabaseClient<Database>;
type Answer = { data: unknown; error: { message: string } | null };

const ID = 'dQw4w9WgXcQ';

const FULL_ROW = {
  youtube_id: ID,
  title: 'The Artist - The Song',
  channel: 'The Artist',
  duration_s: 200,
  yt_fetched_at: '2026-10-20T10:00:00+00:00',
  status: 'ok',
  lyrics_source: 'lrclib',
  lyrics_ref: '777',
  lyrics_lrc: '[00:10.00]First line',
  lyrics_duration_s: 175,
  offset_ms: 1500,
};

describe('createSupabaseSongStore.getVideo', () => {
  function clientAnswering(answer: Answer) {
    const maybeSingle = vi.fn(async () => answer);
    const eq = vi.fn(() => ({ maybeSingle }));
    const select = vi.fn(() => ({ eq }));
    const from = vi.fn(() => ({ select }));
    return { client: { from } as unknown as Client, from, select, eq };
  }

  it('reads the video by its id and names the fields the way the app does', async () => {
    const { client, from, select, eq } = clientAnswering({ data: FULL_ROW, error: null });

    expect(await createSupabaseSongStore(client).getVideo(ID)).toEqual({
      youtubeId: ID,
      title: 'The Artist - The Song',
      channel: 'The Artist',
      durationS: 200,
      ytFetchedAt: '2026-10-20T10:00:00+00:00',
      status: 'ok',
      lyricsSource: 'lrclib',
      lyricsRef: '777',
      lyricsLrc: '[00:10.00]First line',
      lyricsDurationS: 175,
      offsetMs: 1500,
    });
    expect(from).toHaveBeenCalledWith('videos');
    expect(eq).toHaveBeenCalledWith('youtube_id', ID);
    expect(select).toHaveBeenCalledWith(expect.stringContaining('lyrics_lrc'));
  });

  it('leaves the lyrics out when the video has none', async () => {
    const row = {
      ...FULL_ROW,
      status: 'no_lyrics',
      lyrics_source: null,
      lyrics_ref: null,
      lyrics_lrc: null,
      lyrics_duration_s: null,
      offset_ms: 0,
    };
    const { client } = clientAnswering({ data: row, error: null });

    expect(await createSupabaseSongStore(client).getVideo(ID)).toStrictEqual({
      youtubeId: ID,
      title: 'The Artist - The Song',
      channel: 'The Artist',
      durationS: 200,
      ytFetchedAt: '2026-10-20T10:00:00+00:00',
      status: 'no_lyrics',
      lyricsSource: undefined,
      lyricsRef: undefined,
      lyricsLrc: undefined,
      lyricsDurationS: undefined,
      offsetMs: 0,
    });
  });

  it('knows nothing about a video that is not there', async () => {
    const { client } = clientAnswering({ data: null, error: null });

    expect(await createSupabaseSongStore(client).getVideo(ID)).toBeNull();
  });

  it.each([
    ['title', { title: null }],
    ['channel', { channel: null }],
    ['duration', { duration_s: null }],
    ['fetch date', { yt_fetched_at: null }],
    ['status', { status: null }],
    ['a status the app does not know', { status: 'broken' }],
  ])('knows nothing about a row with no %s, so the video is resolved again', async (_name, hole) => {
    const { client } = clientAnswering({ data: { ...FULL_ROW, ...hole }, error: null });

    expect(await createSupabaseSongStore(client).getVideo(ID)).toBeNull();
  });

  it('fails when the video cannot be read, rather than pretending it is new', async () => {
    const { client } = clientAnswering({ data: null, error: { message: 'permission denied' } });

    await expect(createSupabaseSongStore(client).getVideo(ID)).rejects.toThrow(/permission denied/);
  });
});

describe('createSupabaseSongStore.upsertVideo', () => {
  const WRITTEN_AT = new Date('2026-10-22T12:00:00.000Z');

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(WRITTEN_AT);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function clientSaving(error: { message: string } | null = null) {
    const upsert = vi.fn(async () => ({ error }));
    const from = vi.fn(() => ({ upsert }));
    return { client: { from } as unknown as Client, from, upsert };
  }

  const video: VideoRecord = {
    youtubeId: ID,
    title: 'The Artist - The Song',
    channel: 'The Artist',
    durationS: 200,
    ytFetchedAt: '2026-10-22T12:00:00.000Z',
    status: 'ok',
    lyricsSource: 'lrclib',
    lyricsRef: '777',
    lyricsLrc: '[00:10.00]First line',
    lyricsDurationS: 175,
    offsetMs: 1500,
  };

  it('writes the video under its id with the database column names', async () => {
    const { client, from, upsert } = clientSaving();

    await createSupabaseSongStore(client).upsertVideo(video);

    expect(from).toHaveBeenCalledWith('videos');
    expect(upsert).toHaveBeenCalledWith(
      {
        youtube_id: ID,
        title: 'The Artist - The Song',
        channel: 'The Artist',
        duration_s: 200,
        yt_fetched_at: '2026-10-22T12:00:00.000Z',
        status: 'ok',
        lyrics_source: 'lrclib',
        lyrics_ref: '777',
        lyrics_lrc: '[00:10.00]First line',
        lyrics_duration_s: 175,
        offset_ms: 1500,
        updated_at: WRITTEN_AT.toISOString(),
      },
      { onConflict: 'youtube_id' },
    );
  });

  it('rounds the durations, which the database keeps as whole seconds', async () => {
    const { client, upsert } = clientSaving();

    await createSupabaseSongStore(client).upsertVideo({ ...video, durationS: 200.4, lyricsDurationS: 174.5 });

    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ duration_s: 200, lyrics_duration_s: 175 }),
      expect.anything(),
    );
  });

  it('clears the lyrics columns for a video without lyrics', async () => {
    const { client, upsert } = clientSaving();
    const noLyrics: VideoRecord = {
      youtubeId: ID,
      title: video.title,
      channel: video.channel,
      durationS: 200,
      ytFetchedAt: video.ytFetchedAt,
      status: 'no_lyrics',
      offsetMs: 0,
    };

    await createSupabaseSongStore(client).upsertVideo(noLyrics);

    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'no_lyrics',
        lyrics_source: null,
        lyrics_ref: null,
        lyrics_lrc: null,
        lyrics_duration_s: null,
        offset_ms: 0,
      }),
      expect.anything(),
    );
  });

  it('fails when the video cannot be saved', async () => {
    const { client } = clientSaving({ message: 'new row violates row-level security policy' });

    await expect(createSupabaseSongStore(client).upsertVideo(video)).rejects.toThrow(/row-level security/);
  });
});
