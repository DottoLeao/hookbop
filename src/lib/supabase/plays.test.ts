import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import type { AnswerRecord, PlaySummary } from '@/lib/types';
import type { Database } from './database.types';
import {
  AnswersNotSavedError,
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
  const plays: (NewPlay & { id: string; double_xp_used: boolean })[] = [];
  const answers: NewAnswer[] = [];
  const db = {
    countPlays: vi.fn<PlaysDb['countPlays']>(async () => {
      calls.push('count');
      return earlierPlays;
    }),
    insertPlay: vi.fn(async (row: NewPlay) => {
      calls.push('insertPlay');
      const id = `play-${plays.length + 1}`;
      plays.push({ ...row, id, double_xp_used: false });
      return id;
    }),
    insertAnswers: vi.fn(async (rows: NewAnswer[]) => {
      calls.push('insertAnswers');
      answers.push(...rows);
    }),
    // The same rule as apply_double_xp: the first call doubles the XP, the others give it back as it is.
    doubleXpOnce: vi.fn(async (id: string) => {
      const play = plays.find((p) => p.id === id);
      if (!play) throw new Error('unknown play');
      if (!play.double_xp_used) {
        play.xp *= 2;
        play.double_xp_used = true;
      }
      return { xp: play.xp };
    }),
  } satisfies PlaysDb;
  return { db, calls, plays, answers };
}

describe('savePlay', () => {
  it('counts the same song over the last 7 days before it writes anything', async () => {
    const { db, calls } = fakeDb();

    await savePlay(db, game());

    expect(db.countPlays).toHaveBeenCalledWith(USER, SONG, SEVEN_DAYS_AGO);
    expect(calls).toEqual(['count', 'insertPlay', 'insertAnswers']);
  });

  it('keeps the whole XP the first time the song is played', async () => {
    const { db, plays } = fakeDb(0);

    expect(await savePlay(db, game())).toEqual({ playId: 'play-1', xp: 120 });
    expect(plays[0].xp).toBe(120);
  });

  it('halves the XP on the second play of the song: round(xp x 0.5)', async () => {
    const { db, plays } = fakeDb(1);

    expect(await savePlay(db, game())).toEqual({ playId: 'play-1', xp: 60 });
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

  it('saves the play with what the game reported, the XP after the decay and the time it took to get ready', async () => {
    const { db, plays } = fakeDb(1);

    await savePlay(db, game());

    expect(db.insertPlay).toHaveBeenCalledWith({
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
      { play_id: 'play-1', blank_id: 'b1', kind: 'first', correct: true, before_line_end: true },
      { play_id: 'play-1', blank_id: 'b2', kind: 'first', correct: false, before_line_end: false },
      { play_id: 'play-1', blank_id: 'b2', kind: 'retry', correct: true, before_line_end: false },
      { play_id: 'play-1', blank_id: 'b3', kind: 'helped', correct: true, before_line_end: true },
    ]);
  });

  it('gives Karaokê 0 XP, whatever the summary says, and no difficulty', async () => {
    const { db, plays } = fakeDb(0);

    const saved = await savePlay(db, game({ mode: 'karaoke', summary: { ...SUMMARY, xp: 50 } }));

    expect(saved.xp).toBe(0);
    expect(plays[0]).toMatchObject({ mode: 'karaoke', xp: 0, difficulty: null });
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

  describe('when the answers fail after the play was saved', () => {
    it('says which play was saved and what it earned', async () => {
      const { db } = fakeDb(1);
      db.insertAnswers.mockRejectedValue(new Error('offline'));

      const failure = await savePlay(db, game()).catch((error: unknown) => error);

      expect(failure).toBeInstanceOf(AnswersNotSavedError);
      expect(failure).toMatchObject({ saved: { playId: 'play-1', xp: 60 } });
      expect((failure as Error).cause).toEqual(new Error('offline'));
    });

    it('finishes the job on the next try without a second play or a second count', async () => {
      const { db, plays, answers } = fakeDb(1);
      db.insertAnswers.mockRejectedValueOnce(new Error('offline'));
      const failure = (await savePlay(db, game()).catch((error: unknown) => error)) as AnswersNotSavedError;

      const saved = await savePlay(db, game(), failure.saved);

      expect(saved).toEqual({ playId: 'play-1', xp: 60 });
      expect(plays).toHaveLength(1);
      expect(db.countPlays).toHaveBeenCalledTimes(1);
      expect(answers).toHaveLength(RECORDS.length);
      expect(answers.every((answer) => answer.play_id === 'play-1')).toBe(true);
    });
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

  it('counts the member\'s plays of the song since a moment, and nothing else', async () => {
    const gte = vi.fn(async (): Promise<Answer> => ({ count: 3, error: null }));
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
  });

  it('fails to count when the database says no', async () => {
    const gte = vi.fn(async (): Promise<Answer> => ({ count: null, error: { message: 'permission denied' } }));
    const select = vi.fn(() => ({ eq: () => ({ eq: () => ({ gte }) }) }));
    const client = { from: () => ({ select }) } as unknown as Client;

    await expect(createSupabasePlaysDb(client).countPlays(USER, SONG, SEVEN_DAYS_AGO)).rejects.toThrow(
      /permission denied/,
    );
  });

  it('inserts a play and gives back the id the database made', async () => {
    const single = vi.fn(async (): Promise<Answer> => ({ data: { id: 'new-play' }, error: null }));
    const select = vi.fn(() => ({ single }));
    const insert = vi.fn(() => ({ select }));
    const from = vi.fn(() => ({ insert }));
    const row: NewPlay = {
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

    expect(await createSupabasePlaysDb({ from } as unknown as Client).insertPlay(row)).toBe('new-play');
    expect(from).toHaveBeenCalledWith('plays');
    expect(insert).toHaveBeenCalledWith(row);
    expect(select).toHaveBeenCalledWith('id');
  });

  it('fails to insert a play when the database says no', async () => {
    const single = async (): Promise<Answer> => ({ data: null, error: { message: 'row-level security' } });
    const client = { from: () => ({ insert: () => ({ select: () => ({ single }) }) }) } as unknown as Client;

    await expect(createSupabasePlaysDb(client).insertPlay({} as NewPlay)).rejects.toThrow(/row-level security/);
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
  function play(id: string, title: string, over: Record<string, unknown> = {}) {
    return { created_at: '2026-10-22T12:00:00Z', videos: video(id, title, over) };
  }

  function clientAnswering(answer: { data: unknown; error: { message: string } | null }) {
    const limit = vi.fn(async () => answer);
    const order = vi.fn(() => ({ limit }));
    const eq = vi.fn(() => ({ order }));
    const select = vi.fn(() => ({ eq }));
    const from = vi.fn(() => ({ select }));
    return { client: { from } as unknown as Client, from, select, eq, order, limit };
  }

  it('reads the newest plays together with their videos, the ones with lyrics only', async () => {
    const { client, from, select, eq, order } = clientAnswering({ data: [], error: null });

    await recentSongs(client);

    expect(from).toHaveBeenCalledWith('plays');
    expect(select).toHaveBeenCalledWith(expect.stringMatching(/^created_at, videos!inner\(.*youtube_id.*title.*\)$/));
    // The lyrics are large and the cards do not show them.
    expect(select).toHaveBeenCalledWith(expect.not.stringContaining('lyrics_lrc'));
    expect(eq).toHaveBeenCalledWith('videos.status', 'ok');
    expect(order).toHaveBeenCalledWith('created_at', { ascending: false });
  });

  it('lists each song once, in the order of its latest play', async () => {
    const { client } = clientAnswering({
      data: [
        play('aaaaaaaaaaa', 'Invented Artist - First Invented Song'),
        play('bbbbbbbbbbb', 'Invented Artist - Second Invented Song'),
        play('aaaaaaaaaaa', 'Invented Artist - First Invented Song'),
        play('ccccccccccc', 'Invented Artist - Third Invented Song'),
        play('bbbbbbbbbbb', 'Invented Artist - Second Invented Song'),
      ],
      error: null,
    });

    const songs = await recentSongs(client);

    expect(songs.map((song) => song.youtubeId)).toEqual(['aaaaaaaaaaa', 'bbbbbbbbbbb', 'ccccccccccc']);
  });

  it('gives each song as a video record', async () => {
    const { client } = clientAnswering({ data: [play('aaaaaaaaaaa', 'Invented Artist - First Invented Song')], error: null });

    expect(await recentSongs(client)).toEqual([
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
    const rows = ['aaaaaaaaaaa', 'bbbbbbbbbbb', 'ccccccccccc', 'ddddddddddd'].map((id) => play(id, `Invented Artist - ${id}`));
    const { client } = clientAnswering({ data: rows, error: null });

    const songs = await recentSongs(client, 2);

    expect(songs.map((song) => song.youtubeId)).toEqual(['aaaaaaaaaaa', 'bbbbbbbbbbb']);
  });

  it('is 20 songs by default', async () => {
    const rows = Array.from({ length: 30 }, (_, i) => play(`song${String(i).padStart(7, '0')}`, `Invented Artist - Song ${i}`));
    const { client } = clientAnswering({ data: rows, error: null });

    expect(await recentSongs(client)).toHaveLength(20);
  });

  it('looks further back than the limit, since a song played again takes more than one row', async () => {
    const { client, limit } = clientAnswering({ data: [], error: null });

    await recentSongs(client, 20);

    expect(limit.mock.calls[0]).toEqual([expect.any(Number)]);
    expect((limit.mock.calls[0] as unknown as [number])[0]).toBeGreaterThan(20);
  });

  it('leaves out a half-written video row instead of failing the home page', async () => {
    const { client } = clientAnswering({
      data: [
        play('aaaaaaaaaaa', 'x', { title: null }),
        play('bbbbbbbbbbb', 'Invented Artist - Second Invented Song'),
      ],
      error: null,
    });

    expect((await recentSongs(client)).map((song) => song.youtubeId)).toEqual(['bbbbbbbbbbb']);
  });

  it('is empty when nobody played anything yet', async () => {
    const { client } = clientAnswering({ data: [], error: null });

    expect(await recentSongs(client)).toEqual([]);
  });

  it('fails when the plays cannot be read', async () => {
    const { client } = clientAnswering({ data: null, error: { message: 'permission denied' } });

    await expect(recentSongs(client)).rejects.toThrow(/permission denied/);
  });
});
