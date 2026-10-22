import type { SupabaseClient } from '@supabase/supabase-js';
import { repeatMultiplier } from '@/lib/game/scoring';
import type { VideoRecord } from '@/lib/lyrics/resolveSong';
import type { AnswerRecord, AttemptKind, Difficulty, Mode, PlaySummary } from '@/lib/types';
import type { Database } from './database.types';
import { toRecord } from './songStore';

type Client = SupabaseClient<Database>;

/** The same song played again within this long loses XP (see `repeatMultiplier`). */
const REPEAT_WINDOW_MS = 7 * 24 * 3600 * 1000;

/** A finished game, as it is saved in `plays`. The columns are the table's own. */
export interface NewPlay {
  user_id: string;
  youtube_id: string;
  mode: Mode;
  /** Null for Karaokê, which asks for none. */
  difficulty: Difficulty | null;
  total_blanks: number;
  first_try_correct: number;
  pct: number;
  max_combo: number;
  /** After the repeat decay. */
  xp: number;
  time_to_ready_ms: number | null;
}

/** One answer of a play, as it is saved in `answers`. */
export interface NewAnswer {
  play_id: string;
  blank_id: string;
  kind: AttemptKind;
  correct: boolean;
  before_line_end: boolean;
}

/** What saving a game and doubling its XP need from the database. `createSupabasePlaysDb` is the real one. */
export interface PlaysDb {
  /** How many plays of the song the member has saved since `sinceIso`. */
  countPlays(userId: string, youtubeId: string, sinceIso: string): Promise<number>;
  /** Saves a play and gives back its id. */
  insertPlay(row: NewPlay): Promise<string>;
  insertAnswers(rows: NewAnswer[]): Promise<void>;
  /**
   * Doubles the XP of the member's own play, once, and gives back the XP it ends up with. When it was doubled
   * before, it gives back the XP as it is and changes nothing.
   */
  doubleXpOnce(playId: string): Promise<{ xp: number }>;
}

/** A game to save. */
export interface PlayToSave {
  userId: string;
  youtubeId: string;
  mode: Mode;
  difficulty: Difficulty;
  summary: PlaySummary;
  records: AnswerRecord[];
  /** How long the screen took to get the song ready; null for a game that did not have to wait for it (a replay). */
  timeToReadyMs: number | null;
  /** The moment the game is saved at, the end of the 7 days the earlier plays are counted over. */
  now: Date;
}

/** A play that is in the database, and the XP it holds. */
export interface SavedPlay {
  playId: string;
  xp: number;
}

/**
 * The play is saved, and counts, but its answers are not. `saved` is what to give `savePlay` again to finish the job
 * without a second play (which would be counted against the first and lose XP to the repeat decay).
 */
export class AnswersNotSavedError extends Error {
  constructor(
    readonly saved: SavedPlay,
    options?: ErrorOptions,
  ) {
    super('The play was saved, but its answers were not.', options);
    this.name = 'AnswersNotSavedError';
  }
}

/**
 * Saves a finished game: first the play, with the XP the game earned times the repeat factor of the song (a song the
 * member already played 1 time in the last 7 days gives half), then one answer for each record with its kind. Karaokê
 * always saves 0 XP.
 *
 * Call it once per game. When only the answers fail, it throws `AnswersNotSavedError`; calling it again with that
 * error's `saved` as `resume` writes the answers and nothing else. Any other failure happens before anything is
 * written, so calling again starts over.
 */
export async function savePlay(db: PlaysDb, p: PlayToSave, resume?: SavedPlay): Promise<SavedPlay> {
  let saved = resume;
  if (!saved) {
    const karaoke = p.mode === 'karaoke';
    // Read before the play is written, so the play is not counted against itself.
    const since = new Date(p.now.getTime() - REPEAT_WINDOW_MS).toISOString();
    const earlier = karaoke ? 0 : await db.countPlays(p.userId, p.youtubeId, since);
    const xp = karaoke ? 0 : Math.round(p.summary.xp * repeatMultiplier(earlier));

    const playId = await db.insertPlay({
      user_id: p.userId,
      youtube_id: p.youtubeId,
      mode: p.mode,
      difficulty: karaoke ? null : p.difficulty,
      total_blanks: p.summary.totalBlanks,
      first_try_correct: p.summary.firstTryCorrect,
      pct: p.summary.pct,
      max_combo: p.summary.maxCombo,
      xp,
      time_to_ready_ms: p.timeToReadyMs,
    });
    saved = { playId, xp };
  }

  if (p.records.length > 0) {
    try {
      await db.insertAnswers(
        p.records.map((record) => ({
          play_id: saved.playId,
          blank_id: record.blankId,
          kind: record.kind,
          correct: record.correct,
          before_line_end: record.beforeLineEnd,
        })),
      );
    } catch (error) {
      throw new AnswersNotSavedError(saved, { cause: error });
    }
  }
  return saved;
}

/**
 * Doubles the XP of a saved play, once: the database does it in a single step and writes `double_xp_used`. Asked
 * again, it gives back the doubled XP as it is.
 */
export function applyDoubleXp(db: PlaysDb, playId: string): Promise<{ xp: number }> {
  return db.doubleXpOnce(playId);
}

/**
 * The plays table through the signed-in member's own client. Row-level security lets a member read every play and
 * write only their own; a play never changes after it is saved, except through `apply_double_xp`.
 */
export function createSupabasePlaysDb(client: Client): PlaysDb {
  return {
    async countPlays(userId, youtubeId, sinceIso) {
      // Members may read everyone's plays, so the member is named here.
      const { count, error } = await client
        .from('plays')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('youtube_id', youtubeId)
        .gte('created_at', sinceIso);
      if (error) throw new Error(`Could not count the plays: ${error.message}`);
      return count ?? 0;
    },

    async insertPlay(row) {
      const { data, error } = await client.from('plays').insert(row).select('id').single();
      if (error) throw new Error(`Could not save the play: ${error.message}`);
      return data.id;
    },

    async insertAnswers(rows) {
      const { error } = await client.from('answers').insert(rows);
      if (error) throw new Error(`Could not save the answers: ${error.message}`);
    },

    async doubleXpOnce(playId) {
      const { data, error } = await client.rpc('apply_double_xp', { p_play_id: playId });
      if (error) throw new Error(`Could not double the XP: ${error.message}`);
      if (typeof data !== 'number') throw new Error('Could not double the XP: the database gave back no XP.');
      return { xp: data };
    },
  };
}

/** What a song card needs of a video. The lyrics are large and stay out of the query. */
const SONG_COLUMNS = 'youtube_id, title, channel, duration_s, yt_fetched_at, status, offset_ms';

/**
 * How many of the newest plays are read for each song wanted. A song that was played again takes more than one row,
 * so reading exactly `limit` plays could end with fewer than `limit` songs. With at most 50 members, 5 times as many
 * rows is room enough, and still a small read.
 */
const PLAYS_READ_PER_SONG = 5;

/**
 * The songs the gang played, newest play first, each once: the videos with lyrics (`status = 'ok'`) that any member
 * played. Part A has no friendships, so this is every member's plays (50 at most); part B narrows it to you and your
 * friends.
 *
 * It is one query, `plays` with its `videos` row embedded (an inner join, so the filter on the video's status also
 * drops the plays of videos without lyrics), through the signed-in member's client: members may read every play and
 * every video. The plays come newest first and the repeats are dropped here, keeping each song at its latest play,
 * because PostgREST has no "distinct on" to ask for it. Two queries (the plays, then the videos by id) would give the
 * same list in two round trips, and one more place to disagree.
 */
export async function recentSongs(db: Client, limit = 20): Promise<VideoRecord[]> {
  const { data, error } = await db
    .from('plays')
    .select(`created_at, videos!inner(${SONG_COLUMNS})`)
    .eq('videos.status', 'ok')
    .order('created_at', { ascending: false })
    .limit(limit * PLAYS_READ_PER_SONG);
  if (error) throw new Error(`Could not read the songs: ${error.message}`);

  const songs = new Map<string, VideoRecord>();
  for (const { videos } of data) {
    if (songs.size >= limit) break;
    if (songs.has(videos.youtube_id)) continue;
    // A half-written row (see toRecord) is left out: the home page can do without one card.
    const song = toRecord(videos);
    if (song) songs.set(song.youtubeId, song);
  }
  return [...songs.values()];
}
