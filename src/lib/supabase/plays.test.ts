import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi, type Mock } from 'vitest';
import { META_MAX_AGE_MS } from '@/lib/lyrics/resolveSong';
import type { AnswerRecord, PlaySummary } from '@/lib/types';
import type { Database } from './database.types';
import {
  applyDoubleXp,
  createSupabasePlaysDb,
  recentSongs,
  savePlay,
  type NewAnswer,
  type NewPlay,
  type PlayToSave,
  type PlaysDb,
} from './plays';

type Client = SupabaseClient<Database>;

const USER = '11111111-1111-1111-1111-111111111111';
const PLAY = '22222222-2222-4222-8222-222222222222';
const SONG = 'dQw4w9WgXcQ';
const NOW = new Date('2026-10-22T15:00:00.000Z');
const SEVEN_DAYS_AGO = '2026-10-15T15:00:00.000Z';

const SUMMARY: PlaySummary = { totalBlanks: 12, firstTryCorrect: 11, pct: 92, maxCombo: 8, xp: 120 };

const RECORDS: AnswerRecord[] = [
  { blankId: 'b1', kind: 'first', correct: true, beforeLineEnd: true },
  { blankId: 'b2', kind: 'first', correct: false, beforeLineEnd: false },
  { blankId: 'b2', kind: 'retry', correct: true, beforeLineEnd: false },
  { blankId: 'b3', kind: 'helped', correct: true, beforeLineEnd: true },
];

function game(over: Partial<PlayToSave> = {}): PlayToSave {
  return {
    playId: PLAY,
    userId: USER,
    youtubeId: SONG,
    mode: 'escolha',
    difficulty: 'medio',
    summary: SUMMARY,
    records: RECORDS,
    timeToReadyMs: 2500,
    now: NOW,
    ...over,
  };
}

/** A database in memory that keeps what is saved, and counts the earlier plays it was told about. */
function fakeDb(earlierPlays = 0) {
  const calls: string[] = [];
  const plays: (NewPlay & { double_xp_used: boolean })[] = [];
  const answers: NewAnswer[] = [];
  const db = {
    countPlays: vi.fn<PlaysDb['countPlays']>(async () => {
      calls.push('count');
      return earlierPlays;
    }),
    insertPlay: vi.fn<PlaysDb['insertPlay']>(async (row) => {
      calls.push('insertPlay');
      plays.push({ ...row, double_xp_used: false });
      return row.id;
    }),
    findPlay: vi.fn<PlaysDb['findPlay']>(async (id) => {
      calls.push('findPlay');
      const play = plays.find((p) => p.id === id);
      return play ? { xp: play.xp } : null;
    }),
    countAnswers: vi.fn<PlaysDb['countAnswers']>(async (playId) => {
      calls.push('countAnswers');
      return answers.filter((answer) => answer.play_id === playId).length;
    }),
    insertAnswers: vi.fn<PlaysDb['insertAnswers']>(async (rows) => {
      calls.push('insertAnswers');
      answers.push(...rows);
    }),
    // The same rule as apply_double_xp: the first call doubles the XP, the others give it back as it is.
    doubleXpOnce: vi.fn<PlaysDb['doubleXpOnce']>(async (id) => {
      const play = plays.find((p) => p.id === id);
      if (!play) throw new Error('unknown play');
      if (!play.double_xp_used) {
        play.xp *= 2;
        play.double_xp_used = true;
      }
      return { xp: play.xp };
    }),
  } satisfies PlaysDb;

  /** The next call to `method` is written, and then fails: the answer got lost on the way back. */
  function loseNextResponse(method: 'insertPlay' | 'insertAnswers') {
    const mock = db[method] as unknown as Mock<(...args: unknown[]) => Promise<unknown>>;
    const write = mock.getMockImplementation()!;
    mock.mockImplementationOnce(async (...args: unknown[]) => {
      await write(...args);
      throw new Error('response lost');
    });
  }

  return { db, calls, plays, answers, loseNextResponse };
}

describe('savePlay', () => {
  it('counts the same song over the last 7 days before it writes anything, and looks for no earlier try', async () => {
    const { db, calls } = fakeDb();

    await savePlay(db, game());

    expect(db.countPlays).toHaveBeenCalledWith(USER, SONG, SEVEN_DAYS_AGO);
    expect(calls).toEqual(['count', 'insertPlay', 'insertAnswers']);
  });

  it('keeps the whole XP the first time the song is played', async () => {
    const { db, plays } = fakeDb(0);

    expect(await savePlay(db, game())).toEqual({ playId: PLAY, xp: 120 });
    expect(plays[0].xp).toBe(120);
  });

  it('halves the XP on the second play of the song: round(xp x 0.5)', async () => {
    const { db, plays } = fakeDb(1);

    expect(await savePlay(db, game())).toEqual({ playId: PLAY, xp: 60 });
    expect(plays[0].xp).toBe(60);
  });

  it('rounds the decayed XP to a whole number', async () => {
    const { db } = fakeDb(1);

    // 121 x 0.5 = 60.5
    expect((await savePlay(db, game({ summary: { ...SUMMARY, xp: 121 } }))).xp).toBe(61);
  });

  it('keeps shrinking it: a quarter, then a tenth from the fourth play on', async () => {
    expect((await savePlay(fakeDb(2).db, game())).xp).toBe(30);
    expect((await savePlay(fakeDb(3).db, game())).xp).toBe(12);
    expect((await savePlay(fakeDb(9).db, game())).xp).toBe(12);
  });

  it('saves the play under the id it was given, with what the game reported, the XP after the decay and the time it took to get ready', async () => {
    const { db, plays } = fakeDb(1);

    await savePlay(db, game());

    expect(db.insertPlay).toHaveBeenCalledWith({
      id: PLAY,
      user_id: USER,
      youtube_id: SONG,
      mode: 'escolha',
      difficulty: 'medio',
      total_blanks: 12,
      first_try_correct: 11,
      pct: 92,
      max_combo: 8,
      xp: 60,
      time_to_ready_ms: 2500,
    });
    expect(plays).toHaveLength(1);
  });

  it('saves one answer for each record, with its kind, and the play they belong to', async () => {
    const { db, answers } = fakeDb();

    await savePlay(db, game());

    expect(answers).toEqual([
      { play_id: PLAY, blank_id: 'b1', kind: 'first', correct: true, before_line_end: true },
      { play_id: PLAY, blank_id: 'b2', kind: 'first', correct: false, before_line_end: false },
      { play_id: PLAY, blank_id: 'b2', kind: 'retry', correct: true, before_line_end: false },
      { play_id: PLAY, blank_id: 'b3', kind: 'helped', correct: true, before_line_end: true },
    ]);
  });

  it('gives Karaokê 0 XP, whatever the summary says, and no difficulty, and counts no earlier plays for it', async () => {
    const { db, plays } = fakeDb(0);

    const saved = await savePlay(db, game({ mode: 'karaoke', summary: { ...SUMMARY, xp: 50 } }));

    expect(saved.xp).toBe(0);
    expect(plays[0]).toMatchObject({ mode: 'karaoke', xp: 0, difficulty: null });
    expect(db.countPlays).not.toHaveBeenCalled();
  });

  it('writes no answers when the game had none to give', async () => {
    const { db, plays } = fakeDb();

    await savePlay(db, game({ mode: 'karaoke', records: [] }));

    expect(plays).toHaveLength(1);
    expect(db.insertAnswers).not.toHaveBeenCalled();
  });

  it('can leave the time to get ready out (a replay did not wait for the song)', async () => {
    const { db } = fakeDb();

    await savePlay(db, game({ timeToReadyMs: null }));

    expect(db.insertPlay).toHaveBeenCalledWith(expect.objectContaining({ time_to_ready_ms: null }));
  });

  it('writes nothing when the earlier plays cannot be counted', async () => {
    const { db } = fakeDb();
    db.countPlays.mockRejectedValue(new Error('offline'));

    await expect(savePlay(db, game())).rejects.toThrow('offline');
    expect(db.insertPlay).not.toHaveBeenCalled();
    expect(db.insertAnswers).not.toHaveBeenCalled();
  });

  it('writes no answers for a play that could not be saved', async () => {
    const { db } = fakeDb();
    db.insertPlay.mockRejectedValue(new Error('offline'));

    await expect(savePlay(db, game())).rejects.toThrow('offline');
    expect(db.insertAnswers).not.toHaveBeenCalled();
  });
});

describe('savePlay, trying again after a failure', () => {
  it('writes only the answers when the play was saved and the answers failed, and gives back the XP the play holds', async () => {
    const { db, plays, answers } = fakeDb(1);
    db.insertAnswers.mockRejectedValueOnce(new Error('offline'));
    await expect(savePlay(db, game())).rejects.toThrow('offline');

    const saved = await savePlay(db, game(), true);

    expect(saved).toEqual({ playId: PLAY, xp: 60 });
    expect(plays).toHaveLength(1);
    expect(db.insertPlay).toHaveBeenCalledTimes(1);
    expect(db.countPlays).toHaveBeenCalledTimes(1);
    expect(answers).toHaveLength(RECORDS.length);
    expect(answers.every((answer) => answer.play_id === PLAY)).toBe(true);
  });

  it('does not save the play twice when the answer to saving it got lost', async () => {
    const { db, plays, answers, loseNextResponse } = fakeDb(0);
    loseNextResponse('insertPlay');
    await expect(savePlay(db, game())).rejects.toThrow('response lost');
    expect(plays).toHaveLength(1);
    // The play is there now, so counting the plays of the song would count this one too.
    db.countPlays.mockResolvedValue(1);

    const saved = await savePlay(db, game(), true);

    expect(saved).toEqual({ playId: PLAY, xp: 120 });
    expect(plays).toHaveLength(1);
    expect(db.insertPlay).toHaveBeenCalledTimes(1);
    expect(db.countPlays).toHaveBeenCalledTimes(1);
    expect(answers).toHaveLength(RECORDS.length);
  });

  it('does not save the answers twice when the answer to saving them got lost', async () => {
    const { db, answers, loseNextResponse } = fakeDb(0);
    loseNextResponse('insertAnswers');
    await expect(savePlay(db, game())).rejects.toThrow('response lost');
    expect(answers).toHaveLength(RECORDS.length);

    const saved = await savePlay(db, game(), true);

    expect(saved).toEqual({ playId: PLAY, xp: 120 });
    expect(db.insertAnswers).toHaveBeenCalledTimes(1);
    expect(answers).toHaveLength(RECORDS.length);
  });

  it('saves everything when the play never got there', async () => {
    const { db, plays, answers } = fakeDb(1);
    db.insertPlay.mockRejectedValueOnce(new Error('offline'));
    await expect(savePlay(db, game())).rejects.toThrow('offline');
    expect(plays).toHaveLength(0);

    const saved = await savePlay(db, game(), true);

    expect(saved).toEqual({ playId: PLAY, xp: 60 });
    expect(plays).toHaveLength(1);
    expect(answers).toHaveLength(RECORDS.length);
  });

  it('looks for the play before anything else, and for answers only when there is a play and something to save', async () => {
    const { db, calls } = fakeDb();
    await savePlay(db, game({ mode: 'karaoke', records: [] }));
    calls.length = 0;

    await savePlay(db, game({ mode: 'karaoke', records: [] }), true);

    expect(calls).toEqual(['findPlay']);
  });
});

describe('applyDoubleXp', () => {
  it('doubles the XP of the play and gives it back', async () => {
    const { db, plays } = fakeDb();
    const { playId } = await savePlay(db, game());

    expect(await applyDoubleXp(db, playId)).toEqual({ xp: 240 });
    expect(plays[0]).toMatchObject({ xp: 240, double_xp_used: true });
  });

  it('doubles it only once, however many times it is asked', async () => {
    const { db, plays } = fakeDb();
    const { playId } = await savePlay(db, game());

    const first = await applyDoubleXp(db, playId);
    const second = await applyDoubleXp(db, playId);

    expect(first).toEqual({ xp: 240 });
    expect(second).toEqual({ xp: 240 });
    expect(plays[0].xp).toBe(240);
  });

  it('fails when the database does', async () => {
    const { db } = fakeDb();

    await expect(applyDoubleXp(db, 'no-such-play')).rejects.toThrow('unknown play');
  });
});

describe('createSupabasePlaysDb', () => {
  type Answer = { data?: unknown; error: { message: string } | null; count?: number | null };

  it("counts the member's scored plays of the song since a moment, and not their Karaokê ones", async () => {
    const neq = vi.fn(async (): Promise<Answer> => ({ count: 3, error: null }));
    const gte = vi.fn(() => ({ neq }));
    const eqYoutube = vi.fn(() => ({ gte }));
    const eqUser = vi.fn(() => ({ eq: eqYoutube }));
    const select = vi.fn(() => ({ eq: eqUser }));
    const from = vi.fn(() => ({ select }));

    const count = await createSupabasePlaysDb({ from } as unknown as Client).countPlays(USER, SONG, SEVEN_DAYS_AGO);

    expect(count).toBe(3);
    expect(from).toHaveBeenCalledWith('plays');
    expect(select).toHaveBeenCalledWith('id', { count: 'exact', head: true });
    expect(eqUser).toHaveBeenCalledWith('user_id', USER);
    expect(eqYoutube).toHaveBeenCalledWith('youtube_id', SONG);
    expect(gte).toHaveBeenCalledWith('created_at', SEVEN_DAYS_AGO);
    expect(neq).toHaveBeenCalledWith('mode', 'karaoke');
  });

  it('fails to count when the database says no', async () => {
    const neq = vi.fn(async (): Promise<Answer> => ({ count: null, error: { message: 'permission denied' } }));
    const select = vi.fn(() => ({ eq: () => ({ eq: () => ({ gte: () => ({ neq }) }) }) }));
    const client = { from: () => ({ select }) } as unknown as Client;

    await expect(createSupabasePlaysDb(client).countPlays(USER, SONG, SEVEN_DAYS_AGO)).rejects.toThrow(
      /permission denied/,
    );
  });

  it('inserts a play under its own id and gives that id back', async () => {
    const single = vi.fn(async (): Promise<Answer> => ({ data: { id: PLAY }, error: null }));
    const select = vi.fn(() => ({ single }));
    const insert = vi.fn(() => ({ select }));
    const from = vi.fn(() => ({ insert }));
    const row: NewPlay = {
      id: PLAY,
      user_id: USER,
      youtube_id: SONG,
      mode: 'escolha',
      difficulty: 'facil',
      total_blanks: 12,
      first_try_correct: 11,
      pct: 92,
      max_combo: 8,
      xp: 120,
      time_to_ready_ms: null,
    };

    expect(await createSupabasePlaysDb({ from } as unknown as Client).insertPlay(row)).toBe(PLAY);
    expect(from).toHaveBeenCalledWith('plays');
    expect(insert).toHaveBeenCalledWith(row);
    expect(select).toHaveBeenCalledWith('id');
  });

  it('fails to insert a play when the database says no', async () => {
    const single = async (): Promise<Answer> => ({ data: null, error: { message: 'row-level security' } });
    const client = { from: () => ({ insert: () => ({ select: () => ({ single }) }) }) } as unknown as Client;

    await expect(createSupabasePlaysDb(client).insertPlay({} as NewPlay)).rejects.toThrow(/row-level security/);
  });

  it('finds a play by its id and says what it earned, or that there is none', async () => {
    const maybeSingle = vi
      .fn<() => Promise<Answer>>()
      .mockResolvedValueOnce({ data: { xp: 60 }, error: null })
      .mockResolvedValueOnce({ data: { xp: null }, error: null })
      .mockResolvedValueOnce({ data: null, error: null });
    const eq = vi.fn(() => ({ maybeSingle }));
    const select = vi.fn(() => ({ eq }));
    const from = vi.fn(() => ({ select }));
    const plays = createSupabasePlaysDb({ from } as unknown as Client);

    expect(await plays.findPlay(PLAY)).toEqual({ xp: 60 });
    expect(from).toHaveBeenCalledWith('plays');
    expect(select).toHaveBeenCalledWith('xp');
    expect(eq).toHaveBeenCalledWith('id', PLAY);
    // A play with no XP written counts as 0.
    expect(await plays.findPlay(PLAY)).toEqual({ xp: 0 });
    expect(await plays.findPlay(PLAY)).toBeNull();
  });

  it('fails to find a play when the database says no', async () => {
    const maybeSingle = async (): Promise<Answer> => ({ data: null, error: { message: 'boom' } });
    const client = { from: () => ({ select: () => ({ eq: () => ({ maybeSingle }) }) }) } as unknown as Client;

    await expect(createSupabasePlaysDb(client).findPlay(PLAY)).rejects.toThrow(/boom/);
  });

  it('counts the answers of a play', async () => {
    const eq = vi.fn(async (): Promise<Answer> => ({ count: 4, error: null }));
    const select = vi.fn(() => ({ eq }));
    const from = vi.fn(() => ({ select }));

    expect(await createSupabasePlaysDb({ from } as unknown as Client).countAnswers(PLAY)).toBe(4);
    expect(from).toHaveBeenCalledWith('answers');
    expect(select).toHaveBeenCalledWith('play_id', { count: 'exact', head: true });
    expect(eq).toHaveBeenCalledWith('play_id', PLAY);
  });

  it('fails to count the answers when the database says no', async () => {
    const eq = async (): Promise<Answer> => ({ count: null, error: { message: 'boom' } });
    const client = { from: () => ({ select: () => ({ eq }) }) } as unknown as Client;

    await expect(createSupabasePlaysDb(client).countAnswers(PLAY)).rejects.toThrow(/boom/);
  });

  it('inserts all the answers in one go', async () => {
    const insert = vi.fn(async (): Promise<Answer> => ({ error: null }));
    const from = vi.fn(() => ({ insert }));
    const rows: NewAnswer[] = [{ play_id: 'p', blank_id: 'b1', kind: 'first', correct: true, before_line_end: true }];

    await createSupabasePlaysDb({ from } as unknown as Client).insertAnswers(rows);

    expect(from).toHaveBeenCalledWith('answers');
    expect(insert).toHaveBeenCalledWith(rows);
  });

  it('fails to insert answers when the database says no', async () => {
    const client = { from: () => ({ insert: async (): Promise<Answer> => ({ error: { message: 'boom' } }) }) } as unknown as Client;

    await expect(createSupabasePlaysDb(client).insertAnswers([])).rejects.toThrow(/boom/);
  });

  it('doubles through apply_double_xp, the only way a play changes', async () => {
    const rpc = vi.fn(async (): Promise<Answer> => ({ data: 240, error: null }));

    expect(await createSupabasePlaysDb({ rpc } as unknown as Client).doubleXpOnce('play-1')).toEqual({ xp: 240 });
    expect(rpc).toHaveBeenCalledWith('apply_double_xp', { p_play_id: 'play-1' });
  });

  it('fails to double when the database says no, or answers with something that is not a number', async () => {
    const refused = { rpc: async (): Promise<Answer> => ({ data: null, error: { message: 'unknown play' } }) };
    const empty = { rpc: async (): Promise<Answer> => ({ data: null, error: null }) };

    await expect(createSupabasePlaysDb(refused as unknown as Client).doubleXpOnce('p')).rejects.toThrow(/unknown play/);
    await expect(createSupabasePlaysDb(empty as unknown as Client).doubleXpOnce('p')).rejects.toThrow(/no XP/);
  });
});

describe('recentSongs', () => {
  const FETCHED = '2026-10-20T10:00:00+00:00';
  /** 30 days before NOW: the oldest metadata the home may still show. */
  const FRESH_SINCE = new Date(NOW.getTime() - META_MAX_AGE_MS).toISOString();

  function video(id: string, title: string, over: Record<string, unknown> = {}) {
    return {
      youtube_id: id,
      title,
      channel: 'Invented Artist',
      duration_s: 185,
      yt_fetched_at: FETCHED,
      status: 'ok',
      offset_ms: 0,
      ...over,
    };
  }

  /** A row of the plays query: one play, with the video it embeds. */
  function play(id: string, title = `Invented Artist - ${id}`, over: Record<string, unknown> = {}) {
    return { created_at: '2026-10-22T12:00:00Z', videos: video(id, title, over) };
  }

  /** An id for the n-th song, 11 characters like a real one. */
  function songId(n: number) {
    return `song${String(n).padStart(7, '0')}`;
  }

  /** A client whose plays query answers like PostgREST does: `rows` are all the plays, newest first, and `range` cuts a page. */
  function clientServing(rows: unknown[], failure: { message: string } | null = null) {
    const ranges: [number, number][] = [];
    const orders: unknown[][] = [];
    const range = vi.fn(async (from: number, to: number) => {
      ranges.push([from, to]);
      return failure ? { data: null, error: failure } : { data: rows.slice(from, to + 1), error: null };
    });
    const order = vi.fn((...args: unknown[]) => {
      orders.push(args);
      return { order, range };
    });
    const gte = vi.fn(() => ({ order }));
    const eq = vi.fn(() => ({ gte }));
    const select = vi.fn(() => ({ eq }));
    const from = vi.fn(() => ({ select }));
    return { client: { from } as unknown as Client, from, select, eq, gte, orders, ranges };
  }

  it('reads the newest plays together with their videos, the ones with lyrics only', async () => {
    const { client, from, select, eq, orders } = clientServing([]);

    await recentSongs(client, 20, NOW);

    expect(from).toHaveBeenCalledWith('plays');
    expect(select).toHaveBeenCalledWith(expect.stringMatching(/^created_at, videos!inner\(.*youtube_id.*title.*\)$/));
    // The lyrics are large and the cards do not show them.
    expect(select).toHaveBeenCalledWith(expect.not.stringContaining('lyrics_lrc'));
    expect(eq).toHaveBeenCalledWith('videos.status', 'ok');
    // Newest first, with the id to break a tie, so that the pages never overlap or skip a play.
    expect(orders).toEqual([
      ['created_at', { ascending: false }],
      ['id', { ascending: false }],
    ]);
  });

  it('leaves out the videos whose YouTube data is more than 30 days old, until somebody opens them again', async () => {
    const { client, gte } = clientServing([]);

    await recentSongs(client, 20, NOW);

    expect(gte).toHaveBeenCalledWith('videos.yt_fetched_at', FRESH_SINCE);
    expect(FRESH_SINCE).toBe('2026-09-22T15:00:00.000Z');
  });

  it('uses the 30 days a video is kept for before it is fetched again (resolveSong)', () => {
    expect(META_MAX_AGE_MS).toBe(30 * 24 * 3600 * 1000);
  });

  it('lists each song once, in the order of its latest play', async () => {
    const { client } = clientServing([
      play('aaaaaaaaaaa'),
      play('bbbbbbbbbbb'),
      play('aaaaaaaaaaa'),
      play('ccccccccccc'),
      play('bbbbbbbbbbb'),
    ]);

    const songs = await recentSongs(client, 20, NOW);

    expect(songs.map((song) => song.youtubeId)).toEqual(['aaaaaaaaaaa', 'bbbbbbbbbbb', 'ccccccccccc']);
  });

  it('gives each song as a video record', async () => {
    const { client } = clientServing([play('aaaaaaaaaaa', 'Invented Artist - First Invented Song')]);

    expect(await recentSongs(client, 20, NOW)).toEqual([
      {
        youtubeId: 'aaaaaaaaaaa',
        title: 'Invented Artist - First Invented Song',
        channel: 'Invented Artist',
        durationS: 185,
        ytFetchedAt: FETCHED,
        status: 'ok',
        lyricsSource: undefined,
        lyricsRef: undefined,
        lyricsLrc: undefined,
        lyricsDurationS: undefined,
        offsetMs: 0,
      },
    ]);
  });

  it('stops at the limit', async () => {
    const { client } = clientServing(['aaaaaaaaaaa', 'bbbbbbbbbbb', 'ccccccccccc', 'ddddddddddd'].map((id) => play(id)));

    const songs = await recentSongs(client, 2, NOW);

    expect(songs.map((song) => song.youtubeId)).toEqual(['aaaaaaaaaaa', 'bbbbbbbbbbb']);
  });

  it('is 20 songs by default', async () => {
    const { client } = clientServing(Array.from({ length: 30 }, (_, i) => play(songId(i))));

    expect(await recentSongs(client)).toHaveLength(20);
  });

  describe('when a few songs fill the newest plays', () => {
    it('reads on, page by page, until it has 20 different songs', async () => {
      // 130 newest plays are of 3 songs; the other 17 songs it needs were played before that.
      const newest = Array.from({ length: 130 }, (_, i) => play(songId(i % 3)));
      const older = Array.from({ length: 30 }, (_, i) => play(songId(100 + i)));
      const { client, ranges } = clientServing([...newest, ...older]);

      const songs = await recentSongs(client, 20, NOW);

      expect(songs.map((song) => song.youtubeId)).toEqual([
        songId(0),
        songId(1),
        songId(2),
        ...Array.from({ length: 17 }, (_, i) => songId(100 + i)),
      ]);
      expect(ranges).toEqual([
        [0, 99],
        [100, 199],
      ]);
    });

    it('does not ask for another page once it has the 20 songs', async () => {
      const { client, ranges } = clientServing(Array.from({ length: 450 }, (_, i) => play(songId(i))));

      expect(await recentSongs(client, 20, NOW)).toHaveLength(20);
      expect(ranges).toEqual([[0, 99]]);
    });

    it('stops when a page comes back short, since there is nothing older', async () => {
      const { client, ranges } = clientServing(Array.from({ length: 150 }, (_, i) => play(songId(i % 5))));

      const songs = await recentSongs(client, 20, NOW);

      expect(songs).toHaveLength(5);
      expect(ranges).toEqual([
        [0, 99],
        [100, 199],
      ]);
    });

    it('stops at 5 pages of 100 plays, so the cost stays bounded', async () => {
      // 2 songs in the newest 500 plays, and a lot of other songs behind them.
      const rows = [
        ...Array.from({ length: 500 }, (_, i) => play(songId(i % 2))),
        ...Array.from({ length: 300 }, (_, i) => play(songId(100 + i))),
      ];
      const { client, ranges } = clientServing(rows);

      const songs = await recentSongs(client, 20, NOW);

      expect(songs.map((song) => song.youtubeId)).toEqual([songId(0), songId(1)]);
      expect(ranges).toEqual([
        [0, 99],
        [100, 199],
        [200, 299],
        [300, 399],
        [400, 499],
      ]);
    });

    it('keeps going over a page whose rows are all songs it already has', async () => {
      const rows = [
        ...Array.from({ length: 100 }, () => play(songId(0))),
        ...Array.from({ length: 100 }, () => play(songId(0))),
        play(songId(1)),
      ];
      const { client } = clientServing(rows);

      expect((await recentSongs(client, 20, NOW)).map((song) => song.youtubeId)).toEqual([songId(0), songId(1)]);
    });
  });

  it('reads nothing when asked for no songs', async () => {
    const { client, from } = clientServing([play('aaaaaaaaaaa')]);

    expect(await recentSongs(client, 0, NOW)).toEqual([]);
    expect(from).not.toHaveBeenCalled();
  });

  it('leaves out a half-written video row instead of failing the home page', async () => {
    const { client } = clientServing([
      play('aaaaaaaaaaa', 'x', { title: null }),
      play('bbbbbbbbbbb', 'Invented Artist - Second Invented Song'),
    ]);

    expect((await recentSongs(client, 20, NOW)).map((song) => song.youtubeId)).toEqual(['bbbbbbbbbbb']);
  });

  it('is empty when nobody played anything yet', async () => {
    const { client } = clientServing([]);

    expect(await recentSongs(client, 20, NOW)).toEqual([]);
  });

  it('fails when the plays cannot be read', async () => {
    const { client } = clientServing([], { message: 'permission denied' });

    await expect(recentSongs(client, 20, NOW)).rejects.toThrow(/permission denied/);
  });
});
