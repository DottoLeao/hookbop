import type { SupabaseClient } from '@supabase/supabase-js';
import { repeatMultiplier } from '@/lib/game/scoring';
import { META_MAX_AGE_MS, type VideoRecord } from '@/lib/lyrics/resolveSong';
import type { AnswerRecord, AttemptKind, Difficulty, Mode, PlaySummary } from '@/lib/types';
import type { Database } from './database.types';
import { toRecord } from './songStore';

type Client = SupabaseClient<Database>;

/** The same song played again within this long loses XP (see `repeatMultiplier`). */
const REPEAT_WINDOW_MS = 7 * 24 * 3600 * 1000;

/** A finished game, as it is saved in `plays`. The columns are the table's own. */
export interface NewPlay {
  /** Made by the app, once per game, so that saving the same game again finds this play instead of making another. */
  id: string;
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
  /**
   * How many plays of the song the member has saved since `sinceIso`, not counting Karaokê ones: Karaokê earns no
   * XP, so singing along must not lower what the next game of the song is worth.
   */
  countPlays(userId: string, youtubeId: string, sinceIso: string): Promise<number>;
  /** Saves a play, under the id it carries, and gives that id back. */
  insertPlay(row: NewPlay): Promise<string>;
  /** The play with that id, if it is saved. */
  findPlay(id: string): Promise<{ xp: number } | null>;
  /** How many answers are saved for the play. */
  countAnswers(playId: string): Promise<number>;
  /** Saves all the answers in one statement, so either all of them land or none. */
  insertAnswers(rows: NewAnswer[]): Promise<void>;
  /**
   * Doubles the XP of the member's own play, once, and gives back the XP it ends up with. When it was doubled
   * before, it gives back the XP as it is and changes nothing.
   */
  doubleXpOnce(playId: string): Promise<{ xp: number }>;
}

/** A game to save. */
export interface PlayToSave {
  /** Made once for the game, before its first try: every try saves the same play under it. */
  playId: string;
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
 * Saves a finished game: first the play, with the XP the game earned times the repeat factor of the song (a song the
 * member already played 1 time in the last 7 days gives half; Karaokê plays are not counted), then one answer for each
 * record with its kind. Karaokê always saves 0 XP.
 *
 * The play goes in under `p.playId`, and the answers in one statement, so saving can be tried again without saving
 * anything twice, even when a try wrote its rows and the answer got lost on the way back (the request failed, though
 * the database has the rows). A first try goes straight to writing. With `retrying`, the play is looked up first:
 * when it is there, it is not written again and its saved XP is what comes back (counting the plays of the song would
 * now count this one too), and its answers are written only if none are saved yet. When it is not there, nothing of
 * the game was saved and the whole job is done.
 */
export async function savePlay(db: PlaysDb, p: PlayToSave, retrying = false): Promise<SavedPlay> {
  const found = retrying ? await db.findPlay(p.playId) : null;
  const saved = found ? { playId: p.playId, xp: found.xp } : await insertNewPlay(db, p);

  // A play that was just written has no answers yet; one that was found may have them.
  if (p.records.length > 0 && (!found || (await db.countAnswers(saved.playId)) === 0)) {
    await db.insertAnswers(
      p.records.map((record) => ({
        play_id: saved.playId,
        blank_id: record.blankId,
        kind: record.kind,
        correct: record.correct,
        before_line_end: record.beforeLineEnd,
      })),
    );
  }
  return saved;
}

/** The play of a game, with its XP worked out from the earlier plays of the song. */
async function insertNewPlay(db: PlaysDb, p: PlayToSave): Promise<SavedPlay> {
  const karaoke = p.mode === 'karaoke';
  // Read before the play is written, so the play is not counted against itself.
  const since = new Date(p.now.getTime() - REPEAT_WINDOW_MS).toISOString();
  const earlier = karaoke ? 0 : await db.countPlays(p.userId, p.youtubeId, since);
  const xp = karaoke ? 0 : Math.round(p.summary.xp * repeatMultiplier(earlier));

  const playId = await db.insertPlay({
    id: p.playId,
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
  return { playId, xp };
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
      // Members may read everyone's plays, so the member is named here. A play always has its mode written, so
      // leaving out Karaokê with `neq` leaves out nothing else.
      const { count, error } = await client
        .from('plays')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('youtube_id', youtubeId)
        .gte('created_at', sinceIso)
        .neq('mode', 'karaoke');
      if (error) throw new Error(`Could not count the plays: ${error.message}`);
      return count ?? 0;
    },

    async insertPlay(row) {
      const { data, error } = await client.from('plays').insert(row).select('id').single();
      if (error) throw new Error(`Could not save the play: ${error.message}`);
      return data.id;
    },

    async findPlay(id) {
      const { data, error } = await client.from('plays').select('xp').eq('id', id).maybeSingle();
      if (error) throw new Error(`Could not look for the play: ${error.message}`);
      return data ? { xp: data.xp ?? 0 } : null;
    },

    async countAnswers(playId) {
      const { count, error } = await client
        .from('answers')
        .select('play_id', { count: 'exact', head: true })
        .eq('play_id', playId);
      if (error) throw new Error(`Could not count the answers: ${error.message}`);
      return count ?? 0;
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

/** How many plays one read takes. */
const PLAYS_PER_PAGE = 100;

/**
 * How many pages `recentSongs` reads at most, which is 500 plays. This bounds the cost of a home page whose newest
 * plays are all of a few songs: fewer than `limit` songs can come back only when the newest 500 plays are of fewer
 * songs than that.
 */
const MAX_PLAY_PAGES = 5;

/**
 * The songs the gang played, newest play first, each once: the videos with lyrics (`status = 'ok'`) that any member
 * played, and whose YouTube data is no more than 30 days old (`META_MAX_AGE_MS`, as in `resolveSong`). A song whose
 * data is older stays off the list until somebody opens it, which fetches the data again. Part A has no friendships,
 * so this is every member's plays (50 members at most); part B narrows it to you and your friends.
 *
 * It reads `plays` with its `videos` row embedded (an inner join, so the filters on the video also drop the plays of
 * videos that do not qualify), through the signed-in member's client: members may read every play and every video.
 * The plays come newest first, in pages of 100 (`.range()`, ordered by time and then by id, so a page never overlaps
 * the one before), and the repeats are dropped here, keeping each song at its latest play, because PostgREST has no
 * "distinct on" to ask for it. It reads pages until it has `limit` different songs or a page comes back short, which
 * means there are no older plays, and never more than 5 pages. So it gives `limit` songs whenever the newest 500
 * plays hold that many different ones, however often a few of them were played over and over.
 *
 * `now` is the moment the 30 days are counted back from.
 */
export async function recentSongs(db: Client, limit = 20, now = new Date()): Promise<VideoRecord[]> {
  const freshSince = new Date(now.getTime() - META_MAX_AGE_MS).toISOString();
  const songs = new Map<string, VideoRecord>();

  for (let page = 0; page < MAX_PLAY_PAGES && songs.size < limit; page += 1) {
    const { data, error } = await db
      .from('plays')
      .select(`created_at, videos!inner(${SONG_COLUMNS})`)
      .eq('videos.status', 'ok')
      // A video with no YouTube data date does not pass the comparison, so it is left out too.
      .gte('videos.yt_fetched_at', freshSince)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .range(page * PLAYS_PER_PAGE, (page + 1) * PLAYS_PER_PAGE - 1);
    if (error) throw new Error(`Could not read the songs: ${error.message}`);

    for (const { videos } of data) {
      if (songs.size >= limit) break;
      if (songs.has(videos.youtube_id)) continue;
      // A half-written row (see toRecord) is left out: the home page can do without one card.
      const song = toRecord(videos);
      if (song) songs.set(song.youtubeId, song);
    }
    if (data.length < PLAYS_PER_PAGE) break;
  }
  return [...songs.values()];
}
