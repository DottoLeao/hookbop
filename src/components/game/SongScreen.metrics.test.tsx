import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { StrictMode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { selectBlanks } from '@/lib/game/blanks';
import { MemoryStorage } from '@/lib/game/fakeStorage';
import { saveProgress, type SavedProgress } from '@/lib/game/savedProgress';
import { createScore } from '@/lib/game/scoring';
import { parseLrc } from '@/lib/lyrics/lrc';
import type { SongResolution, VideoRecord } from '@/lib/lyrics/resolveSong';
import { track } from '@/lib/metrics/track';
import { FakePlayerAdapter } from '@/lib/player/fakeAdapter';
import type { AnswerRecord, PlaySummary } from '@/lib/types';
import { GameScreen } from './GameScreen';
import { SongScreen, type SongScreenDeps } from './SongScreen';

// What the song screen tells the owner's panel (task 13, rulings S43 and S44). The game screen is a stand-in that
// records what it was given, and `track` (a mock in every test, see vitest.setup.ts) records what the screen tracked.
vi.mock('./GameScreen', () => ({
  GameScreen: vi.fn(() => <div data-testid="game-screen" />),
}));

const ID = 'dQw4w9WgXcQ';
const NOW = 1_800_000_000_000;

// Invented lines, not lyrics: 3 s each, the first at 300 ms.
const LRC = [
  '[00:00.30]Lanterns drift across the silver river',
  '[00:03.30]We carried every secret down the hill',
  '[00:06.30]And morning paints the window gold again',
  '[00:09.30]Hold the compass steady for me now',
  "[00:12.30]We're sailing past the sleeping harbor lights",
  '[00:15.30]Tell me which road leads back to the sea',
  '[00:18.30]',
].join('\n');
const LINES = parseLrc(LRC, 200 * 1000);

const VIDEO: VideoRecord = {
  youtubeId: ID,
  title: 'Invented Artist - Invented Song (Official Video)',
  channel: 'InventedArtistVEVO',
  durationS: 213,
  ytFetchedAt: '2026-10-21T12:00:00.000Z',
  status: 'ok',
  lyricsSource: 'lrclib',
  lyricsRef: '777',
  lyricsLrc: LRC,
  lyricsDurationS: 200,
  offsetMs: 0,
};
const READY: SongResolution = { status: 'ready', video: VIDEO, lines: LINES, needsCalibration: false };
const NEEDS_CALIBRATION: SongResolution = { ...READY, needsCalibration: true };

const BLANKS = selectBlanks(LINES, 'medio', ID);
const FIRST_TRY: Omit<AnswerRecord, 'blankId'> = { kind: 'first', correct: true, beforeLineEnd: true };
const SUMMARY: PlaySummary = { totalBlanks: 12, firstTryCorrect: 11, pct: 92, maxCombo: 8, xp: 240 };

/** A saved game of Escolha on Médio, every blank right but the last. */
function savedGame(over: Partial<SavedProgress> = {}): SavedProgress {
  const before = BLANKS.slice(0, -1);
  return {
    version: 1,
    youtubeId: ID,
    mode: 'escolha',
    difficulty: 'medio',
    savedAt: NOW - 60_000,
    lastTickMs: 3800,
    status: Object.fromEntries(BLANKS.map((blank, i) => [blank.id, i === BLANKS.length - 1 ? 'pending' : 'correct'])),
    attempted: Object.fromEntries(before.map((blank) => [blank.id, true])),
    hinted: {},
    tilesPlaced: {},
    score: {
      ...createScore(BLANKS.length),
      combo: before.length,
      firstTryCorrect: before.length,
      records: before.map((blank) => ({ blankId: blank.id, ...FIRST_TRY })),
    },
    ...over,
  };
}

let fake: FakePlayerAdapter;
let storage: MemoryStorage;
let clock: number;

function makeDeps(over: Partial<SongScreenDeps> = {}): SongScreenDeps {
  return {
    createAdapter: vi.fn<SongScreenDeps['createAdapter']>().mockResolvedValue(fake),
    resolve: vi.fn<SongScreenDeps['resolve']>().mockResolvedValue(READY),
    saveOffsetVote: vi.fn<SongScreenDeps['saveOffsetVote']>().mockResolvedValue(0),
    savePlay: vi.fn<SongScreenDeps['savePlay']>().mockResolvedValue({ playId: 'play-1', xp: 120 }),
    doubleXp: vi.fn<SongScreenDeps['doubleXp']>().mockResolvedValue({ xp: 240 }),
    sleep: vi.fn<NonNullable<SongScreenDeps['sleep']>>().mockResolvedValue(undefined),
    now: () => clock,
    progressStorage: () => storage,
    wallClock: () => NOW,
    ...over,
  };
}

/** The props the (stand-in) game screen got the last time it rendered. */
function gameProps() {
  const props = vi.mocked(GameScreen).mock.lastCall?.[0];
  if (!props) throw new Error('The game screen was never shown.');
  return props;
}

async function openPicker(deps = makeDeps()) {
  render(<SongScreen youtubeId={ID} deps={deps} />);
  await screen.findByRole('button', { name: 'Jogar' });
  return deps;
}

function pick(mode: string, difficulty?: string) {
  fireEvent.click(screen.getByRole('radio', { name: mode }));
  if (difficulty) fireEvent.click(screen.getByRole('radio', { name: difficulty }));
  fireEvent.click(screen.getByRole('button', { name: 'Jogar' }));
}

/** The game on screen reports its end. */
async function finishGame(summary = SUMMARY) {
  await act(async () => gameProps().onEnd(summary, [{ blankId: 'b1', ...FIRST_TRY }]));
}

/** The names of what was tracked, in order. */
function tracked() {
  return vi.mocked(track).mock.calls.map(([name]) => name);
}

beforeEach(() => {
  fake = new FakePlayerAdapter(213000);
  storage = new MemoryStorage();
  clock = 0;
  vi.mocked(track).mockClear();
  vi.mocked(GameScreen).mockClear();
});

describe('SongScreen: song_opened', () => {
  it('is tracked when the song is ready, with the song, and not before', async () => {
    let finishLookup!: (resolution: SongResolution) => void;
    const resolve = vi.fn<SongScreenDeps['resolve']>().mockReturnValue(new Promise((done) => (finishLookup = done)));
    render(<SongScreen youtubeId={ID} deps={makeDeps({ resolve })} />);
    await waitFor(() => expect(resolve).toHaveBeenCalled());
    expect(track).not.toHaveBeenCalled();

    await act(async () => finishLookup(READY));

    expect(track).toHaveBeenCalledExactlyOnceWith('song_opened', { youtubeId: ID });
  });

  it('is tracked too when the calibration is asked for first, since the song is ready then', async () => {
    render(<SongScreen youtubeId={ID} deps={makeDeps({ resolve: vi.fn<SongScreenDeps['resolve']>().mockResolvedValue(NEEDS_CALIBRATION) })} />);
    await screen.findByRole('button', { name: 'Começou!' });

    expect(track).toHaveBeenCalledExactlyOnceWith('song_opened', { youtubeId: ID });
  });

  it.each<[string, SongResolution]>([
    ['the lyrics are slow', { status: 'lyrics_unavailable' }],
    ['the song has no lyrics', { status: 'no_lyrics', video: VIDEO }],
    ['the video is unavailable', { status: 'video_unavailable' }],
  ])('is not tracked when %s: the song did not become ready', async (_what, resolution) => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    render(<SongScreen youtubeId={ID} deps={makeDeps({ resolve: vi.fn<SongScreenDeps['resolve']>().mockResolvedValue(resolution) })} />);

    await waitFor(() => expect(screen.queryByText('Procurando a letra...')).not.toBeInTheDocument());

    expect(track).not.toHaveBeenCalled();
  });

  it('is tracked once, however the screen is rendered', async () => {
    render(
      <StrictMode>
        <SongScreen youtubeId={ID} deps={makeDeps()} />
      </StrictMode>,
    );
    await screen.findByRole('button', { name: 'Jogar' });

    expect(tracked()).toEqual(['song_opened']);
  });

  it('is tracked once when the lyrics are asked for again after a slow answer', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const resolve = vi
      .fn<SongScreenDeps['resolve']>()
      .mockResolvedValueOnce({ status: 'lyrics_unavailable' })
      .mockResolvedValue(READY);
    render(<SongScreen youtubeId={ID} deps={makeDeps({ resolve })} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Tentar de novo' }));
    await screen.findByRole('button', { name: 'Jogar' });

    expect(tracked()).toEqual(['song_opened']);
  });
});

describe('SongScreen: mode_selected and game_started', () => {
  it('are tracked together, in that order, when the player picks a mode and plays, with the song and the mode', async () => {
    await openPicker();
    vi.mocked(track).mockClear();

    pick('Digitação', 'Difícil');

    expect(vi.mocked(track).mock.calls).toEqual([
      ['mode_selected', { youtubeId: ID, mode: 'digitacao' }],
      ['game_started', { youtubeId: ID, mode: 'digitacao' }],
    ]);
  });

  it('are tracked for Karaokê too, which has no difficulty', async () => {
    await openPicker();
    vi.mocked(track).mockClear();

    pick('Karaokê');

    expect(vi.mocked(track).mock.calls).toEqual([
      ['mode_selected', { youtubeId: ID, mode: 'karaoke' }],
      ['game_started', { youtubeId: ID, mode: 'karaoke' }],
    ]);
  });

  it('are tracked again for "Jogar de novo", which is a new game', async () => {
    await openPicker();
    pick('Escolha', 'Médio');
    await finishGame();
    vi.mocked(track).mockClear();

    fireEvent.click(await screen.findByRole('button', { name: 'Jogar de novo' }));

    expect(vi.mocked(track).mock.calls).toEqual([
      ['mode_selected', { youtubeId: ID, mode: 'escolha' }],
      ['game_started', { youtubeId: ID, mode: 'escolha' }],
    ]);
  });

  it('are not tracked when the player only changes the mode they are about to play', async () => {
    await openPicker();
    vi.mocked(track).mockClear();

    fireEvent.click(screen.getByRole('radio', { name: 'Karaokê' }));
    fireEvent.click(screen.getByRole('radio', { name: 'Monte o verso' }));

    expect(track).not.toHaveBeenCalled();
  });

  it('are not tracked when the game goes on from a saved one (ruling S43): it is the same game', async () => {
    saveProgress(storage, savedGame());
    await openPicker();
    vi.mocked(track).mockClear();

    fireEvent.click(screen.getByRole('button', { name: 'Continuar de onde parou' }));

    expect(screen.getByTestId('game-screen')).toBeInTheDocument();
    expect(gameProps().resume).toBeDefined();
    expect(track).not.toHaveBeenCalled();
  });

  it('are tracked when "Continuar de onde parou" cannot go on, because the saved game is not this song’s game: it starts from zero', async () => {
    saveProgress(
      storage,
      savedGame({ status: { '9:9': 'correct', '8:8': 'pending' }, attempted: { '9:9': true }, score: { ...createScore(2), records: [] } }),
    );
    await openPicker();
    vi.mocked(track).mockClear();

    fireEvent.click(screen.getByRole('button', { name: 'Continuar de onde parou' }));

    expect(vi.mocked(track).mock.calls).toEqual([
      ['mode_selected', { youtubeId: ID, mode: 'escolha' }],
      ['game_started', { youtubeId: ID, mode: 'escolha' }],
    ]);
  });

  it('are tracked for "Começar do zero" and then a mode, as for any new game, and not for "Começar do zero" itself', async () => {
    saveProgress(storage, savedGame());
    await openPicker();
    vi.mocked(track).mockClear();

    fireEvent.click(screen.getByRole('button', { name: 'Começar do zero' }));
    expect(track).not.toHaveBeenCalled();

    pick('Monte o verso');

    expect(vi.mocked(track).mock.calls).toEqual([
      ['mode_selected', { youtubeId: ID, mode: 'montar' }],
      ['game_started', { youtubeId: ID, mode: 'montar' }],
    ]);
  });
});

describe('SongScreen: game_finished', () => {
  it('is tracked when the game ends, with the song, the mode and its score, how long it took and how many blanks it had', async () => {
    await openPicker();
    clock = 1000;
    pick('Escolha', 'Médio');
    vi.mocked(track).mockClear();

    clock = 91_400;
    await finishGame({ ...SUMMARY, pct: 92, totalBlanks: 12 });

    expect(track).toHaveBeenCalledExactlyOnceWith('game_finished', {
      youtubeId: ID,
      mode: 'escolha',
      props: { pct: 92, durationMs: 90_400, totalBlanks: 12 },
    });
  });

  it('is tracked for Karaokê with no blanks', async () => {
    await openPicker();
    clock = 0;
    pick('Karaokê');
    vi.mocked(track).mockClear();

    clock = 200_000;
    await finishGame({ totalBlanks: 0, firstTryCorrect: 0, pct: 0, maxCombo: 0, xp: 0 });

    expect(track).toHaveBeenCalledExactlyOnceWith('game_finished', {
      youtubeId: ID,
      mode: 'karaoke',
      props: { pct: 0, durationMs: 200_000, totalBlanks: 0 },
    });
  });

  it('is tracked for a game that went on from a saved one, which is one game with one start and one finish', async () => {
    saveProgress(storage, savedGame());
    await openPicker();
    clock = 500;
    fireEvent.click(screen.getByRole('button', { name: 'Continuar de onde parou' }));

    clock = 40_500;
    await finishGame();

    expect(tracked()).toEqual(['song_opened', 'game_finished']);
    expect(vi.mocked(track).mock.lastCall?.[1]).toMatchObject({ mode: 'escolha', props: { durationMs: 40_000 } });
  });

  it('is tracked for each game played on the screen, with its own length', async () => {
    await openPicker();
    clock = 0;
    pick('Escolha', 'Médio');
    clock = 60_000;
    await finishGame();
    vi.mocked(track).mockClear();

    clock = 100_000;
    fireEvent.click(await screen.findByRole('button', { name: 'Jogar de novo' }));
    clock = 130_000;
    await finishGame();

    expect(vi.mocked(track).mock.calls.at(-1)).toEqual([
      'game_finished',
      { youtubeId: ID, mode: 'escolha', props: { pct: 92, durationMs: 30_000, totalBlanks: 12 } },
    ]);
  });

  it('is not tracked before the game ends', async () => {
    await openPicker();
    pick('Escolha', 'Médio');

    expect(tracked()).not.toContain('game_finished');
  });
});
