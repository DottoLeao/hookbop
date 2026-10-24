import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { selectBlanks } from '@/lib/game/blanks';
import { MemoryStorage } from '@/lib/game/fakeStorage';
import { loadProgress, saveProgress, type SavedProgress } from '@/lib/game/savedProgress';
import { createScore } from '@/lib/game/scoring';
import { parseLrc } from '@/lib/lyrics/lrc';
import type { SongResolution, VideoRecord } from '@/lib/lyrics/resolveSong';
import { FakePlayerAdapter } from '@/lib/player/fakeAdapter';
import type { AnswerRecord } from '@/lib/types';
import { SongScreen, type SongScreenDeps } from './SongScreen';

// The song screen and the game screen are the real ones here, on the fake player and a storage in memory: what
// "Continuar de onde parou" does from the tap to the end of the song. The sounds and the distractor search are stand-ins.
vi.mock('@/lib/game/sfx', () => ({ playHit: vi.fn(), playMiss: vi.fn() }));
vi.mock('@/lib/game/distractors', () => ({ makeDistractors: vi.fn(() => ['late', 'lead']) }));

const ID = 'dQw4w9WgXcQ';
const DURATION_MS = 213000;
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

const BLANKS = selectBlanks(LINES, 'medio', ID);
const LAST = BLANKS[BLANKS.length - 1];
const FIRST_TRY: Omit<AnswerRecord, 'blankId'> = { kind: 'first', correct: true, beforeLineEnd: true };

let fake: FakePlayerAdapter;
let storage: MemoryStorage;

function makeDeps() {
  return {
    createAdapter: vi.fn<SongScreenDeps['createAdapter']>().mockResolvedValue(fake),
    resolve: vi.fn<SongScreenDeps['resolve']>().mockResolvedValue(READY),
    saveOffsetVote: vi.fn<SongScreenDeps['saveOffsetVote']>().mockResolvedValue(0),
    savePlay: vi.fn<SongScreenDeps['savePlay']>().mockResolvedValue({ playId: 'play-1', xp: 120 }),
    doubleXp: vi.fn<SongScreenDeps['doubleXp']>().mockResolvedValue({ xp: 240 }),
    sleep: vi.fn<NonNullable<SongScreenDeps['sleep']>>().mockResolvedValue(undefined),
    now: () => 0,
    progressStorage: () => storage,
    wallClock: () => NOW,
  };
}

/** A game of Escolha on Médio with every blank right but the last, the clock a little way into the last one's line. */
function savedGame(over: Partial<SavedProgress> = {}): SavedProgress {
  const before = BLANKS.slice(0, -1);
  return {
    version: 1,
    youtubeId: ID,
    mode: 'escolha',
    difficulty: 'medio',
    savedAt: NOW - 60_000,
    lastTickMs: LINES[LAST.lineIndex].startMs + 500,
    status: Object.fromEntries(BLANKS.map((blank) => [blank.id, blank === LAST ? 'pending' : 'correct'])),
    attempted: Object.fromEntries(before.map((blank) => [blank.id, true])),
    hinted: {},
    tilesPlaced: {},
    score: {
      ...createScore(BLANKS.length),
      combo: before.length,
      maxCombo: before.length,
      xp: before.length * 12,
      firstTryCorrect: before.length,
      records: before.map((blank) => ({ blankId: blank.id, ...FIRST_TRY })),
    },
    ...over,
  };
}

async function openPicker(deps = makeDeps()) {
  render(<SongScreen youtubeId={ID} deps={deps} />);
  await screen.findByRole('button', { name: 'Jogar' });
  return deps;
}

beforeEach(() => {
  fake = new FakePlayerAdapter(DURATION_MS);
  storage = new MemoryStorage();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('SongScreen with the real game: going on from a saved game', () => {
  it('has the blanks the saved game needs: more than one, so a game can be half done', () => {
    expect(BLANKS.length).toBeGreaterThan(1);
  });

  it('plays from the start of the line the saved clock was in, with the saved combo, and not from the top', async () => {
    saveProgress(storage, savedGame());
    await openPicker();

    fireEvent.click(screen.getByRole('button', { name: 'Continuar de onde parou' }));

    expect(fake.calls).toEqual([`seek:${LINES[LAST.lineIndex].startMs}`, 'play']);
    expect(screen.getByText('Modo Escolha')).toBeInTheDocument();
    expect(screen.getByText(`x${BLANKS.length - 1}`)).toBeInTheDocument();
    expect(screen.getByTestId('line-current')).toHaveTextContent('lacuna');
  });

  it('keeps the game as the player answers, and a finished song is saved once with every answer, the restored ones included', async () => {
    saveProgress(storage, savedGame());
    const deps = await openPicker();
    fireEvent.click(screen.getByRole('button', { name: 'Continuar de onde parou' }));

    fireEvent.click(within(screen.getByRole('group', { name: 'Escolha a palavra que falta' })).getByRole('button', { name: LAST.answer }));

    // The game stamps what it keeps with the clock the song screen was given, the one that judges its age.
    expect(loadProgress(storage, ID, NOW)).toMatchObject({ savedAt: NOW });
    expect(loadProgress(storage, ID, NOW)?.score.records).toHaveLength(BLANKS.length);

    act(() => fake.emitState('ended'));
    await waitFor(() => expect(deps.savePlay).toHaveBeenCalledOnce());
    const [game] = deps.savePlay.mock.calls[0];
    expect(game.records.map((record) => record.blankId)).toEqual(BLANKS.map((blank) => blank.id));
    expect(game.summary).toMatchObject({ totalBlanks: BLANKS.length, firstTryCorrect: BLANKS.length, pct: 100 });
    // The song is over: nothing is kept for the next visit.
    expect(storage.keys()).toEqual([]);
  });

  it('"Começar do zero" and then "Jogar" start from the top with nothing answered', async () => {
    saveProgress(storage, savedGame());
    await openPicker();

    fireEvent.click(screen.getByRole('button', { name: 'Começar do zero' }));
    fireEvent.click(screen.getByRole('button', { name: 'Jogar' }));

    expect(fake.calls).toEqual(['seek:0', 'play']);
    expect(screen.getByText('x0')).toBeInTheDocument();
    expect(storage.keys()).toEqual([]);
  });

  it('starts from zero when the saved game has other blanks than this song’s, and forgets it', async () => {
    const stale = savedGame({
      status: { '9:9': 'correct', '8:8': 'pending' },
      attempted: { '9:9': true },
      score: { ...createScore(2), combo: 1, records: [{ blankId: '9:9', ...FIRST_TRY }] },
    });
    saveProgress(storage, stale);
    await openPicker();

    fireEvent.click(screen.getByRole('button', { name: 'Continuar de onde parou' }));

    expect(fake.calls).toEqual(['seek:0', 'play']);
    expect(screen.getByText('x0')).toBeInTheDocument();
    expect(storage.keys()).toEqual([]);
  });
});
