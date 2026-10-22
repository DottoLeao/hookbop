import type { SupabaseClient } from '@supabase/supabase-js';
import type { HelpDeps } from '@/lib/help/helpService';
import type { StoredVideo } from '@/lib/help/validate';
import type { Database } from './database.types';

type Client = SupabaseClient<Database>;

/** Everything the help route keeps in the database, and the video row its line check reads. */
export type HelpStore = Omit<HelpDeps, 'callModel'> & {
  getVideo(youtubeId: string): Promise<StoredVideo | null>;
};

/** The primary key of `line_help`: one row per line, kind of help and target. */
const LINE_HELP_KEY = 'youtube_id,lyrics_ref,line_index,kind,target';

/**
 * The help cache (`line_help`), the request log (`help_requests`) and the video rows, through the service client.
 * No member may write the first two, so this takes `createServiceSupabase()`; the route checks who is asking first.
 */
export function createSupabaseHelpStore(admin: Client): HelpStore {
  return {
    async getCached(r) {
      const { data, error } = await admin
        .from('line_help')
        .select('content')
        .eq('youtube_id', r.youtubeId)
        .eq('lyrics_ref', r.lyricsRef)
        .eq('line_index', r.lineIndex)
        .eq('kind', r.kind)
        .eq('target', r.target)
        .maybeSingle();
      if (error) throw new Error(`Could not read the help cache: ${error.message}`);
      return data?.content ?? null;
    },

    async saveCached(r, content) {
      // Two members can ask for the same line at once: the first answer saved stays, the other is dropped.
      const { error } = await admin.from('line_help').upsert(
        {
          youtube_id: r.youtubeId,
          lyrics_ref: r.lyricsRef,
          line_index: r.lineIndex,
          kind: r.kind,
          target: r.target,
          content,
        },
        { onConflict: LINE_HELP_KEY, ignoreDuplicates: true },
      );
      if (error) throw new Error(`Could not save the help: ${error.message}`);
    },

    async countRecent(userId, sinceMs) {
      const { count, error } = await admin
        .from('help_requests')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .gte('created_at', new Date(sinceMs).toISOString());
      if (error) throw new Error(`Could not count the help requests: ${error.message}`);
      return count ?? 0;
    },

    async logRequest(userId) {
      const { error } = await admin.from('help_requests').insert({ user_id: userId });
      if (error) throw new Error(`Could not record the help request: ${error.message}`);
    },

    async getVideo(youtubeId) {
      const { data, error } = await admin
        .from('videos')
        .select('status, lyrics_ref, lyrics_lrc, lyrics_duration_s')
        .eq('youtube_id', youtubeId)
        .maybeSingle();
      if (error) throw new Error(`Could not read the video: ${error.message}`);
      if (!data) return null;
      return {
        status: data.status,
        lyricsRef: data.lyrics_ref,
        lyricsLrc: data.lyrics_lrc,
        lyricsDurationS: data.lyrics_duration_s,
      };
    },
  };
}
