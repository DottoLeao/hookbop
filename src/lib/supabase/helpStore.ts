import type { SupabaseClient } from '@supabase/supabase-js';
import { HELP_BUDGET_PER_HOUR, type HelpDeps } from '@/lib/help/helpService';
import type { SongDeps } from '@/lib/help/songService';
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
 * The help cache (`line_help`), the members' hourly budgets (`help_requests`, through `reserve_help_request` and
 * `release_help_request`), the usage log (`ai_usage`) and the video rows, through the service client. No member may
 * write or call any of these, and none may read the log, so this takes `createServiceSupabase()`; the route checks who
 * is asking first.
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

    async reserve(userId, kind) {
      const { data, error } = await admin.rpc('reserve_help_request', {
        p_user_id: userId,
        p_kind: kind,
        p_limit: HELP_BUDGET_PER_HOUR[kind],
      });
      if (error) throw new Error(`Could not reserve a help request: ${error.message}`);
      // The generated types cannot say it, but the function gives null when the budget has no request left.
      return (data as number | null) ?? null;
    },

    async release(id) {
      const { error } = await admin.rpc('release_help_request', { p_id: id });
      if (error) throw new Error(`Could not give the help request back: ${error.message}`);
    },

    async recordUsage(entry) {
      // Every column is written as the entry says, `kind`, `source` and `outcome` included: no row relies on a default.
      const { error } = await admin.from('ai_usage').insert({
        user_id: entry.userId,
        youtube_id: entry.youtubeId,
        line_index: entry.lineIndex,
        kind: entry.kind,
        source: entry.source,
        model: entry.model,
        input_tokens: entry.inputTokens,
        output_tokens: entry.outputTokens,
        cost_usd: entry.costUsd,
        latency_ms: entry.latencyMs,
        outcome: entry.outcome,
      });
      if (error) throw new Error(`Could not record the AI usage: ${error.message}`);
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

/** The per-line translations of a song, as the whole-song translation reads and writes them. */
export type TranslationCache = Pick<SongDeps, 'getCachedTranslations' | 'saveTranslations'>;

/**
 * The translations of `line_help` read and written a whole song at a time, through the service client. They are the
 * rows the translation by line uses (kind 'translate', target ''), so each side finds what the other saved.
 */
export function createSupabaseTranslationCache(admin: Client): TranslationCache {
  return {
    async getCachedTranslations(youtubeId, lyricsRef) {
      const { data, error } = await admin
        .from('line_help')
        .select('line_index, content')
        .eq('youtube_id', youtubeId)
        .eq('lyrics_ref', lyricsRef)
        .eq('kind', 'translate')
        .eq('target', '');
      if (error) throw new Error(`Could not read the song translations: ${error.message}`);
      return new Map((data ?? []).map((row) => [row.line_index, row.content]));
    },

    async saveTranslations(youtubeId, lyricsRef, rows) {
      if (rows.length === 0) return;
      // As one line at a time does: a row another member saved first stays, this one is dropped.
      const { error } = await admin.from('line_help').upsert(
        rows.map((row) => ({
          youtube_id: youtubeId,
          lyrics_ref: lyricsRef,
          line_index: row.lineIndex,
          kind: 'translate',
          target: '',
          content: row.text,
        })),
        { onConflict: LINE_HELP_KEY, ignoreDuplicates: true },
      );
      if (error) throw new Error(`Could not save the song translations: ${error.message}`);
    },
  };
}
