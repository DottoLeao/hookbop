import { describe, expect, it } from 'vitest';
import {
  brlRateOrDefault,
  buildPanel,
  DEFAULT_BRL_RATE,
  parseBrlRate,
  type AiDailyRow,
  type HelpRow,
  type ModeRow,
  type PanelInput,
  type SongRow,
} from './summary';

// Invented numbers only. Today is 25/10/2026 in Brasília and the period is 7 days (19/10 to 25/10); the month runs
// from 01/10 and the last 30 days from 26/09.
function aiDay(day: string, row: Partial<AiDailyRow>): AiDailyRow {
  return {
    day,
    calls: 0,
    calls_model: 0,
    calls_cache: 0,
    calls_reuse: 0,
    calls_declined: 0,
    calls_error: 0,
    input_tokens: 0,
    output_tokens: 0,
    cost_usd: 0,
    ...row,
  };
}

const AI_DAILY: AiDailyRow[] = [
  // Before the last 30 days: counts nowhere.
  aiDay('2026-09-20', { calls: 99, calls_model: 99, input_tokens: 9999, output_tokens: 9999, cost_usd: 9.99 }),
  // In the last 30 days only.
  aiDay('2026-09-27', { calls: 10, calls_model: 10, input_tokens: 3000, output_tokens: 1000, cost_usd: 0.8 }),
  // In the month and the last 30 days, not in the period.
  aiDay('2026-10-02', {
    calls: 20,
    calls_model: 8,
    calls_cache: 10,
    calls_reuse: 2,
    calls_declined: 1,
    calls_error: 1,
    input_tokens: 2400,
    output_tokens: 800,
    cost_usd: 0.64,
  }),
  // In the period.
  aiDay('2026-10-20', {
    calls: 40,
    calls_model: 10,
    calls_cache: 25,
    calls_reuse: 5,
    calls_error: 2,
    input_tokens: 3000,
    output_tokens: 1000,
    cost_usd: 0.8,
  }),
  aiDay('2026-10-25', {
    calls: 30,
    calls_model: 6,
    calls_cache: 20,
    calls_reuse: 4,
    calls_declined: 1,
    input_tokens: 1800,
    output_tokens: 600,
    cost_usd: 0.48,
  }),
];

function modeDay(day: string, mode: string, row: Partial<ModeRow>): ModeRow {
  return {
    day,
    mode,
    mode_selections: 0,
    games_started: 0,
    games_finished: 0,
    games_abandoned: 0,
    avg_pct: null,
    avg_duration_ms: null,
    ...row,
  };
}

const MODES: ModeRow[] = [
  modeDay('2026-10-20', 'escolha', {
    mode_selections: 5,
    games_started: 5,
    games_finished: 4,
    games_abandoned: 1,
    avg_pct: 80,
    avg_duration_ms: 200_000,
  }),
  modeDay('2026-10-25', 'escolha', {
    mode_selections: 3,
    games_started: 3,
    games_finished: 1,
    games_abandoned: 1,
    avg_pct: 60,
    avg_duration_ms: 100_000,
  }),
  // Karaokê has no blanks, so the view gives no score; a player who left and came back has a saída and a finish.
  modeDay('2026-10-21', 'karaoke', {
    mode_selections: 6,
    games_started: 6,
    games_finished: 4,
    games_abandoned: 3,
    avg_duration_ms: 180_000,
  }),
  modeDay('2026-10-22', 'digitacao', { mode_selections: 2, games_started: 2, games_abandoned: 2 }),
  // Outside the period.
  modeDay('2026-10-01', 'montar', { mode_selections: 9, games_started: 9, games_finished: 9 }),
];

function songDay(day: string, youtubeId: string, title: string | null, row: Partial<SongRow>): SongRow {
  return {
    day,
    youtube_id: youtubeId,
    title,
    song_opens: 0,
    games_started: 0,
    games_finished: 0,
    games_abandoned: 0,
    players: 0,
    ...row,
  };
}

const SONGS: SongRow[] = [
  songDay('2026-10-20', 'aaaaaaaaaaa', 'Invented Artist - Paper Lanterns', {
    song_opens: 5,
    games_started: 4,
    games_finished: 3,
    games_abandoned: 1,
    players: 3,
  }),
  songDay('2026-10-25', 'aaaaaaaaaaa', 'Invented Artist - Paper Lanterns', {
    song_opens: 3,
    games_started: 2,
    games_finished: 2,
    players: 2,
  }),
  songDay('2026-10-21', 'bbbbbbbbbbb', 'Invented Artist - Neon Tide', {
    song_opens: 6,
    games_started: 6,
    games_finished: 3,
    games_abandoned: 3,
    players: 4,
  }),
  // Opened, never played, and not in the app's videos.
  songDay('2026-10-22', 'ccccccccccc', null, { song_opens: 2 }),
  songDay('2026-10-23', 'ddddddddddd', 'Invented Band - Quiet Harbor', {
    song_opens: 1,
    games_started: 4,
    games_finished: 2,
    games_abandoned: 2,
    players: 1,
  }),
  // Outside the period.
  songDay('2026-10-10', 'eeeeeeeeeee', 'Invented Band - Old Lighthouse', { song_opens: 9, games_started: 9 }),
];

function helpDay(day: string, mode: string | null, kind: 'explain' | 'translate', requests: number, avg: number | null): HelpRow {
  return { day, mode, kind, requests, users: 1, songs: 1, avg_line_index: avg };
}

const HELP: HelpRow[] = [
  helpDay('2026-10-20', 'escolha', 'explain', 6, 10),
  helpDay('2026-10-20', 'escolha', 'translate', 2, 4),
  helpDay('2026-10-21', 'karaoke', 'translate', 10, 20),
  // No event of this row carried the line.
  helpDay('2026-10-21', 'karaoke', 'explain', 2, null),
  helpDay('2026-10-22', null, 'explain', 1, 3),
  // Outside the period.
  helpDay('2026-10-05', 'escolha', 'explain', 50, 1),
];

function input(overrides: Partial<PanelInput> = {}): PanelInput {
  return {
    today: '2026-10-25',
    days: 7,
    brlRate: 5.5,
    aiDaily: AI_DAILY,
    modes: MODES,
    songs: SONGS,
    help: HELP,
    people: { people: 4, games_started: 16, games_finished: 10 },
    people30: { people: 8, games_started: 40, games_finished: 25 },
    latenciesMs: [1000, 2000, 1500],
    ...overrides,
  };
}

describe('buildPanel: spend and averages', () => {
  it('adds up the cost of the days of the period and of the calendar month', () => {
    const panel = buildPanel(input());

    expect(panel.period).toMatchObject({ firstDay: '2026-10-19', lastDay: '2026-10-25' });
    expect(panel.month).toMatchObject({ firstDay: '2026-10-01', lastDay: '2026-10-25' });
    expect(panel.spend.periodUsd).toBeCloseTo(1.28, 6);
    expect(panel.spend.monthUsd).toBeCloseTo(1.92, 6);
  });

  it('divides the cost of the period by its people, its games and the songs played in it', () => {
    const { averages } = buildPanel(input());

    expect(averages).toMatchObject({ people: 4, gamesStarted: 16, songsPlayed: 3 });
    expect(averages.perPersonUsd).toBeCloseTo(1.28 / 4, 6);
    expect(averages.perGameUsd).toBeCloseTo(1.28 / 16, 6);
    expect(averages.perSongUsd).toBeCloseTo(1.28 / 3, 6);
  });

  it('bases the projection on the last 30 days, whatever the period on screen', () => {
    const { projection } = buildPanel(input());

    expect(projection.people).toBe(8);
    expect(projection.costUsd).toBeCloseTo(2.72, 6);
    expect(projection.perPersonUsd).toBeCloseTo(2.72 / 8, 6);
  });

  it('has no average when nothing divides it, instead of a division by zero', () => {
    const panel = buildPanel(
      input({
        aiDaily: [],
        modes: [],
        songs: [],
        help: [],
        people: { people: 0, games_started: 0, games_finished: 0 },
        people30: { people: 0, games_started: 0, games_finished: 0 },
        latenciesMs: [],
      }),
    );

    expect(panel.spend).toEqual({ periodUsd: 0, monthUsd: 0 });
    expect(panel.averages).toMatchObject({ perPersonUsd: null, perGameUsd: null, perSongUsd: null });
    expect(panel.projection.perPersonUsd).toBeNull();
    expect(panel.ai.memoryShare).toBeNull();
    expect(panel.ai.avgLatencyMs).toBeNull();
    expect(panel.modes).toEqual([]);
    expect(panel.songs).toEqual([]);
    expect(panel.help).toEqual([]);
  });

  it('reads a null of a view as zero', () => {
    const panel = buildPanel(input({ aiDaily: [aiDay('2026-10-24', { calls: 4, calls_cache: null, cost_usd: null })] }));

    expect(panel.spend.periodUsd).toBe(0);
    expect(panel.ai).toMatchObject({ calls: 4, cache: 0, memoryShare: 0 });
  });
});

describe('buildPanel: the AI', () => {
  it('counts the calls, tokens and the share that came from memory (the cache and reused lines) over all calls', () => {
    const { ai } = buildPanel(input());

    expect(ai).toMatchObject({
      calls: 70,
      model: 16,
      cache: 45,
      reuse: 9,
      declined: 1,
      errors: 2,
      inputTokens: 4800,
      outputTokens: 1600,
    });
    expect(ai.memoryShare).toBeCloseTo(54 / 70, 6);
  });

  it('averages the latency it is given', () => {
    expect(buildPanel(input()).ai.avgLatencyMs).toBe(1500);
  });
});

describe('buildPanel: modes', () => {
  it('adds up each mode over the days of the period, most played first', () => {
    const { modes } = buildPanel(input());

    expect(modes.map((mode) => mode.mode)).toEqual(['escolha', 'karaoke', 'digitacao']);
    expect(modes[0]).toMatchObject({ selections: 8, started: 8, finished: 5, abandoned: 2 });
    expect(modes[1]).toMatchObject({ selections: 6, started: 6, finished: 4, abandoned: 3 });
  });

  it('takes completion as finished over started, never finished over finished plus saídas', () => {
    const [escolha, karaoke, digitacao] = buildPanel(input()).modes;

    expect(escolha.completion).toBeCloseTo(5 / 8, 6);
    expect(karaoke.completion).toBeCloseTo(4 / 6, 6);
    expect(digitacao.completion).toBe(0);
  });

  it('caps completion at 100%: a game resumed from a saved one finishes without a new start, maybe in a later period', () => {
    const modes = [
      modeDay('2026-10-24', 'montar', { mode_selections: 1, games_started: 1, games_finished: 3, avg_duration_ms: 90_000 }),
    ];

    const [montar] = buildPanel(input({ modes })).modes;

    expect(montar).toMatchObject({ started: 1, finished: 3, completion: 1 });
  });

  it('weighs the daily score and length by the games finished each day', () => {
    const [escolha, karaoke, digitacao] = buildPanel(input()).modes;

    expect(escolha.avgPct).toBeCloseTo((80 * 4 + 60 * 1) / 5, 6);
    expect(escolha.avgDurationMs).toBeCloseTo((200_000 * 4 + 100_000 * 1) / 5, 6);
    expect(karaoke.avgPct).toBeNull();
    expect(karaoke.avgDurationMs).toBe(180_000);
    expect(digitacao.avgDurationMs).toBeNull();
  });
});

describe('buildPanel: songs', () => {
  it('adds up each song over the days, most games first, then most opened', () => {
    const { songs } = buildPanel(input());

    expect(songs.map((song) => song.youtubeId)).toEqual(['aaaaaaaaaaa', 'bbbbbbbbbbb', 'ddddddddddd', 'ccccccccccc']);
    expect(songs[0]).toEqual({
      youtubeId: 'aaaaaaaaaaa',
      title: 'Invented Artist - Paper Lanterns',
      opens: 8,
      started: 6,
      finished: 5,
      abandoned: 1,
    });
    expect(songs[3]).toMatchObject({ title: null, opens: 2, started: 0 });
  });

  it('keeps the ten most played', () => {
    const many = Array.from({ length: 12 }, (_, index) =>
      songDay('2026-10-24', `song${String(index).padStart(7, '0')}`, `Invented Song ${index}`, { games_started: index + 1 }),
    );

    const { songs } = buildPanel(input({ songs: many }));

    expect(songs).toHaveLength(10);
    expect(songs[0].started).toBe(12);
    expect(songs[9].started).toBe(3);
  });
});

describe('buildPanel: help', () => {
  it('adds up the requests of each mode by kind, the most asked first', () => {
    const { help } = buildPanel(input());

    expect(help.map((row) => row.mode)).toEqual(['karaoke', 'escolha', null]);
    expect(help[0]).toMatchObject({ explain: 2, translate: 10, total: 12 });
    expect(help[1]).toMatchObject({ explain: 6, translate: 2, total: 8 });
    expect(help[2]).toMatchObject({ explain: 1, translate: 0, total: 1 });
  });

  it('carries no average line: line numbers of songs of different lengths do not average into a part of a song', () => {
    expect(buildPanel(input()).help[0]).toEqual({ mode: 'karaoke', explain: 2, translate: 10, total: 12 });
  });
});

describe('parseBrlRate', () => {
  it.each([
    ['5.50', 5.5],
    ['5,75', 5.75],
    ['1', 1],
    ['20', 20],
    ['20.0', 20],
    [' 6.1234 ', 6.1234],
  ])('takes %j as reais per dollar', (text, rate) => {
    expect(parseBrlRate(text)).toBe(rate);
  });

  it.each([
    ['below 1', '0.99'],
    ['above 20', '20.01'],
    ['far above 20', '21'],
    ['negative', '-5'],
    ['text', 'cinco'],
    ['empty', ''],
    ['blank', '   '],
    ['five decimals', '5.12345'],
    ['exponent', '1e1'],
    ['Infinity', 'Infinity'],
    ['NaN', 'NaN'],
    ['two separators', '5.5.5'],
    ['a thousands comma', '5,5,5'],
    ['three digits', '005.5'],
    ['a number, not text', 5.5],
    ['null', null],
    ['missing', undefined],
  ])('refuses a rate that is %s', (_label, value) => {
    expect(parseBrlRate(value)).toBeNull();
  });
});

describe('brlRateOrDefault', () => {
  it('goes back to the default when the stored rate is not a valid one', () => {
    expect(DEFAULT_BRL_RATE).toBe(5.5);
    expect(brlRateOrDefault('5.10')).toBe(5.1);
    expect(brlRateOrDefault('abc')).toBe(5.5);
    expect(brlRateOrDefault('0')).toBe(5.5);
    expect(brlRateOrDefault(undefined)).toBe(5.5);
  });
});
