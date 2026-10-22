import type { SupabaseClient } from '@supabase/supabase-js';
import type { SongStore, VideoRecord } from '@/lib/lyrics/resolveSong';
import type { Database } from './database.types';

type Client = SupabaseClient<Database>;
/** What `getVideo` selects: every column the record is made of, and not `updated_at`. */
type VideoRow = Omit<Database['public']['Tables']['videos']['Row'], 'updated_at'>;

const COLUMNS =
  'youtube_id, title, channel, duration_s, yt_fetched_at, status, lyrics_source, lyrics_ref, lyrics_lrc, lyrics_duration_s, offset_ms';

/** The columns a record needs, and the lyrics' columns, which a read may leave out (the home page's cards do). */
export type VideoColumns = Pick<
  VideoRow,
  'youtube_id' | 'title' | 'channel' | 'duration_s' | 'yt_fetched_at' | 'status' | 'offset_ms'
> &
  Partial<Pick<VideoRow, 'lyrics_source' | 'lyrics_ref' | 'lyrics_lrc' | 'lyrics_duration_s'>>;

/**
 * The row as a video record, or null when it lacks what a record needs. The app always writes
 * those columns, so a gap means a half-written row: the video is resolved again and saved whole.
 */
export function toRecord(row: VideoColumns): VideoRecord | null {
  const { title, channel, duration_s: durationS, yt_fetched_at: ytFetchedAt, status } = row;
  if (title === null || channel === null || durationS === null || ytFetchedAt === null) return null;
  if (status !== 'ok' && status !== 'no_lyrics') return null;

  return {
    youtubeId: row.youtube_id,
    title,
    channel,
    durationS,
    ytFetchedAt,
    status,
    lyricsSource: row.lyrics_source ?? undefined,
    lyricsRef: row.lyrics_ref ?? undefined,
    lyricsLrc: row.lyrics_lrc ?? undefined,
    lyricsDurationS: row.lyrics_duration_s ?? undefined,
    offsetMs: row.offset_ms,
  };
}

/**
 * The `videos` table as a song store. Every member may read, add and update videos, so any
 * member's client works; the song screen passes the browser client. The record's camelCase
 * names become the table's snake_case columns here and nowhere else.
 * `upsertVideo` never writes the offset: it belongs to `set_offset_vote`, so `offsetMs` is read but not saved.
 */
export function createSupabaseSongStore(client: Client): SongStore {
  return {
    async getVideo(id) {
      const { data, error } = await client.from('videos').select(COLUMNS).eq('youtube_id', id).maybeSingle();
      if (error) throw new Error(`Could not read the video: ${error.message}`);
      return data ? toRecord(data) : null;
    },

    async upsertVideo(v) {
      const { error } = await client.from('videos').upsert(
        {
          youtube_id: v.youtubeId,
          title: v.title,
          channel: v.channel,
          // The columns hold whole seconds; the player and the lyrics service report fractions.
          duration_s: Math.round(v.durationS),
          yt_fetched_at: v.ytFetchedAt,
          status: v.status,
          lyrics_source: v.lyricsSource ?? null,
          lyrics_ref: v.lyricsRef ?? null,
          lyrics_lrc: v.lyricsLrc ?? null,
          lyrics_duration_s: v.lyricsDurationS === undefined ? null : Math.round(v.lyricsDurationS),
          // offset_ms is left out on purpose: only set_offset_vote writes it, so saving a video can never
          // overwrite a newer vote. A new row gets the column default, 0.
          // Nothing else keeps this column current when a row is updated.
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'youtube_id' },
      );
      if (error) throw new Error(`Could not save the video: ${error.message}`);
    },
  };
}
