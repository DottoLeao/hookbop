import type { LyricLine } from '@/lib/types';
import { cleanTitle } from './cleanTitle';
import { linesOfVideo } from './linesOfVideo';
import { applyOffset } from './lrc';
import { needsCalibration } from './offset';
import type { LyricsSource } from './source';

/** Everything the app remembers about a video. `ytFetchedAt` is the ISO time of the last YouTube metadata fetch. */
export interface VideoRecord {
  youtubeId: string;
  title: string;
  channel: string;
  durationS: number;
  ytFetchedAt: string;
  status: 'ok' | 'no_lyrics';
  lyricsSource?: string;
  lyricsRef?: string;
  lyricsLrc?: string;
  lyricsDurationS?: number;
  offsetMs: number;
}

/** Where videos are remembered between visits and between members. */
export interface SongStore {
  getVideo(id: string): Promise<VideoRecord | null>;
  upsertVideo(v: VideoRecord): Promise<void>;
}

/**
 * The store as seen by a lookup made without the video's duration (ruling R42): it reads, but saves nothing. A lookup
 * made with a duration of 0 can pick the wrong lyrics, and it must not end up in the row every member shares.
 */
export function readOnlyStore(store: SongStore): SongStore {
  return {
    getVideo: (id) => store.getVideo(id),
    upsertVideo: async (video) => {
      console.warn('The video duration is unknown, so this lookup is not saved.', video.youtubeId);
    },
  };
}

export type VideoMeta = { title: string; channel: string };

export type SongResolution =
  | { status: 'ready'; video: VideoRecord; lines: LyricLine[]; needsCalibration: boolean }
  | { status: 'no_lyrics'; video: VideoRecord }
  | { status: 'lyrics_unavailable' }
  | { status: 'video_unavailable' };

/** YouTube metadata older than this is fetched again. */
export const META_MAX_AGE_MS = 30 * 24 * 3600 * 1000;

/** A record the app can play: it says 'ok' and holds the lyrics. */
type PlayableVideo = VideoRecord & { status: 'ok'; lyricsLrc: string; lyricsDurationS: number };

function isPlayable(video: VideoRecord): video is PlayableVideo {
  return video.status === 'ok' && video.lyricsLrc !== undefined && video.lyricsDurationS !== undefined;
}

function isFresh(video: VideoRecord, now: Date): boolean {
  // A date that cannot be read gives NaN, which is never <= anything, so it counts as stale.
  return now.getTime() - Date.parse(video.ytFetchedAt) <= META_MAX_AGE_MS;
}

function ready(video: PlayableVideo, videoDurationS: number): SongResolution {
  return {
    status: 'ready',
    video,
    lines: applyOffset(linesOfVideo(video), video.offsetMs),
    needsCalibration: needsCalibration(videoDurationS, video.lyricsDurationS),
  };
}

/**
 * A video with lyrics whose metadata went stale: the metadata is fetched again and saved, and the
 * lyrics and the offset stay. This is best effort. The lyrics in hand are good, so when the metadata
 * call or the save fails the saved record is played as it is and the failure is only logged; the next
 * visit tries again. A video YouTube no longer knows is not a failure: it cannot be played.
 */
async function refreshStale(
  known: PlayableVideo,
  videoDurationS: number,
  meta: (id: string) => Promise<VideoMeta | null>,
  store: SongStore,
  now: Date,
): Promise<SongResolution> {
  try {
    const fetched = await meta(known.youtubeId);
    if (!fetched) return { status: 'video_unavailable' };

    const video: PlayableVideo = {
      ...known,
      title: fetched.title,
      channel: fetched.channel,
      durationS: videoDurationS,
      ytFetchedAt: now.toISOString(),
    };
    await store.upsertVideo(video);
    return ready(video, videoDurationS);
  } catch (error) {
    console.warn('Could not refresh the video details, using the saved ones.', error);
    return ready(known, videoDurationS);
  }
}

/**
 * Finds what the song screen needs for a video: the app's memory first, then YouTube's
 * metadata and the lyrics service for what the memory lacks.
 *
 * - A remembered video whose metadata is at most 30 days old is used as it is: nothing is asked.
 * - Older metadata is fetched again and saved. A video with lyrics keeps them, and the offset
 *   the players settled on; if that refresh fails, the saved record is played anyway (see
 *   `refreshStale`). A video with no lyrics gets one more lookup, since they may exist now.
 * - A new video gets its metadata, then its lyrics, and is saved with whatever the lookup said:
 *   `ok` with the lyrics, or `no_lyrics`.
 * - `video_unavailable` means YouTube no longer knows the video. `lyrics_unavailable` means the
 *   lyrics service could not answer, so nothing is saved and the next visit asks again.
 *
 * The lines come with the saved offset already applied. `needsCalibration` compares the length
 * of the video being played with the length of the lyrics.
 * Apart from that best-effort refresh, a failure of the store or of the metadata call is not
 * caught: it rejects.
 */
export async function resolveSong(
  youtubeId: string,
  videoDurationS: number,
  deps: {
    store: SongStore;
    meta: (id: string) => Promise<VideoMeta | null>;
    lyrics: LyricsSource;
    now: () => Date;
  },
): Promise<SongResolution> {
  const { store, meta, lyrics } = deps;
  const now = deps.now();

  const stored = await store.getVideo(youtubeId);
  // An 'ok' record that lost its lyrics cannot be played, so it is resolved again like a new video.
  const known = stored?.status === 'ok' && !isPlayable(stored) ? null : stored;

  if (known && isFresh(known, now)) {
    return isPlayable(known) ? ready(known, videoDurationS) : { status: 'no_lyrics', video: known };
  }

  if (known && isPlayable(known)) return refreshStale(known, videoDurationS, meta, store, now);

  const fetched = await meta(youtubeId);
  if (!fetched) return { status: 'video_unavailable' };

  const refreshed = {
    youtubeId,
    title: fetched.title,
    channel: fetched.channel,
    durationS: videoDurationS,
    ytFetchedAt: now.toISOString(),
  };

  const { artist, track } = cleanTitle(fetched.title, fetched.channel);
  const lookup = await lyrics.find({ artist, track, durationS: videoDurationS });
  if (lookup.status === 'unavailable') return { status: 'lyrics_unavailable' };

  if (lookup.status === 'not_found') {
    const video: VideoRecord = { ...refreshed, status: 'no_lyrics', offsetMs: 0 };
    await store.upsertVideo(video);
    return { status: 'no_lyrics', video };
  }

  const { result } = lookup;
  const video: PlayableVideo = {
    ...refreshed,
    status: 'ok',
    lyricsSource: result.source,
    lyricsRef: result.ref,
    lyricsLrc: result.syncedLrc,
    lyricsDurationS: result.durationS,
    offsetMs: 0,
  };
  await store.upsertVideo(video);
  return ready(video, videoDurationS);
}
