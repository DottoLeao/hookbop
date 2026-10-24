import { describe, expect, it, vi } from 'vitest';
import type { Blank, LyricLine } from '@/lib/types';
import { BrokenStorage, MemoryStorage } from './fakeStorage';
import { gameReducer, initGame, type GameEvent, type GameState } from './reducer';
import {
  PROGRESS_MAX_AGE_MS,
  clearProgress,
  loadProgress,
  progressOf,
  saveProgress,
  type SavedProgress,
} from './savedProgress';

const ID = 'dQw4w9WgXcQ';
const OTHER_ID = 'M7lc1UVf-VE';
const NOW = 1_800_000_000_000;

const LINES: LyricLine[] = [
  { index: 0, startMs: 0, endMs: 4000, text: 'Lanterns drift across the river' },
  { index: 1, startMs: 4000, endMs: 8000, text: 'We carried every secret home' },
];
const LANTERNS: Blank = { id: '0:2', lineIndex: 0, tokenIndex: 2, answer: 'across' };
const SECRET: Blank = { id: '1:3', lineIndex: 1, tokenIndex: 3, answer: 'secret' };

/** A progress as `progressOf` would write it, a minute before `NOW` unless said otherwise. */
function progress(over: Partial<SavedProgress> = {}): SavedProgress {
  return {
    version: 1,
    youtubeId: ID,
    mode: 'escolha',
    difficulty: 'medio',
    savedAt: NOW - 60_000,
    lastTickMs: 5200,
    status: { '0:2': 'correct', '1:3': 'pending' },
    attempted: { '0:2': true },
    hinted: {},
    tilesPlaced: {},
    score: {
      combo: 1,
      maxCombo: 1,
      xp: 12,
      firstTryCorrect: 1,
      totalBlanks: 2,
      records: [{ blankId: '0:2', kind: 'first', correct: true, beforeLineEnd: true }],
    },
    ...over,
  };
}

const KEY = `hb_progress:${ID}`;

describe('saveProgress and loadProgress', () => {
  it('keeps a progress under hb_progress:<youtubeId> and gives the same one back', () => {
    const storage = new MemoryStorage();
    const saved = progress();

    saveProgress(storage, saved);

    expect(storage.keys()).toEqual([KEY]);
    expect(loadProgress(storage, ID, NOW)).toEqual(saved);
  });

  it('keeps one progress per song, and the last save of a song replaces the one before', () => {
    const storage = new MemoryStorage();
    saveProgress(storage, progress());
    saveProgress(storage, progress({ youtubeId: OTHER_ID, mode: 'karaoke' }));
    saveProgress(storage, progress({ lastTickMs: 7000 }));

    expect(storage.keys().sort()).toEqual([`hb_progress:${OTHER_ID}`, KEY].sort());
    expect(loadProgress(storage, ID, NOW)?.lastTickMs).toBe(7000);
    expect(loadProgress(storage, OTHER_ID, NOW)?.mode).toBe('karaoke');
  });

  it('is null when nothing was saved for the song', () => {
    const storage = new MemoryStorage();
    saveProgress(storage, progress({ youtubeId: OTHER_ID }));

    expect(loadProgress(storage, ID, NOW)).toBeNull();
  });

  it('keeps a progress of exactly 24 hours, and gives none after that, taking the entry out of the storage', () => {
    const storage = new MemoryStorage();
    saveProgress(storage, progress({ savedAt: NOW - PROGRESS_MAX_AGE_MS }));
    expect(loadProgress(storage, ID, NOW)).not.toBeNull();

    expect(loadProgress(storage, ID, NOW + 1)).toBeNull();
    expect(storage.keys()).toEqual([]);
  });

  it('is null for a progress from another version, which is taken out of the storage', () => {
    const storage = new MemoryStorage();
    storage.setItem(KEY, JSON.stringify({ ...progress(), version: 2 }));

    expect(loadProgress(storage, ID, NOW)).toBeNull();
    expect(storage.keys()).toEqual([]);
  });

  it('is null for JSON that cannot be read', () => {
    const storage = new MemoryStorage();
    storage.setItem(KEY, '{"version":1,"youtubeId":');

    expect(loadProgress(storage, ID, NOW)).toBeNull();
    expect(storage.keys()).toEqual([]);
  });

  it.each([
    ['null', null],
    ['a number', 7],
    ['a list', [progress()]],
    ['a progress of another song', progress({ youtubeId: OTHER_ID })],
    ['a mode that does not exist', { ...progress(), mode: 'dancar' }],
    ['a difficulty that does not exist', { ...progress(), difficulty: 'lendario' }],
    ['a time that is not a number', { ...progress(), savedAt: 'ontem' }],
    ['a clock that is not a number', { ...progress(), lastTickMs: null }],
    ['a status that does not exist', { ...progress(), status: { '0:2': 'maybe' } }],
    ['no status', { ...progress(), status: undefined }],
    ['attempts that are not booleans', { ...progress(), attempted: { '0:2': 'yes' } }],
    ['a row of tiles that is not a list of words', { ...progress(), tilesPlaced: { '0:-1': 'Lanterns' } }],
    ['no score', { ...progress(), score: undefined }],
    ['a score with no records', { ...progress(), score: { ...progress().score, records: undefined } }],
    [
      'a record of an attempt that does not exist',
      { ...progress(), score: { ...progress().score, records: [{ blankId: '0:2', kind: 'third', correct: true, beforeLineEnd: true }] } },
    ],
  ])('is null for a stored value with %s', (_, stored) => {
    const storage = new MemoryStorage();
    storage.setItem(KEY, JSON.stringify(stored));

    expect(loadProgress(storage, ID, NOW)).toBeNull();
  });

  it('gives a progress with a row of placed tiles back as it was saved', () => {
    const storage = new MemoryStorage();
    const saved = progress({
      mode: 'montar',
      status: { '0:-1': 'pending' },
      tilesPlaced: { '0:-1': ['Lanterns', 'drift'] },
      score: { ...progress().score, totalBlanks: 1, records: [] },
    });
    saveProgress(storage, saved);

    expect(loadProgress(storage, ID, NOW)).toEqual(saved);
  });

  it('does not break when the storage refuses: nothing is saved and nothing is found', () => {
    const storage = new BrokenStorage();

    expect(() => saveProgress(storage, progress())).not.toThrow();
    expect(loadProgress(storage, ID, NOW)).toBeNull();
  });

  it('is null, without throwing, when the storage is read but refuses to forget a progress that is too old', () => {
    const storage = new MemoryStorage();
    saveProgress(storage, progress({ savedAt: NOW - PROGRESS_MAX_AGE_MS - 1 }));
    vi.spyOn(storage, 'removeItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError');
    });

    expect(loadProgress(storage, ID, NOW)).toBeNull();
  });
});

describe('clearProgress', () => {
  it('forgets the progress of that song only', () => {
    const storage = new MemoryStorage();
    saveProgress(storage, progress());
    saveProgress(storage, progress({ youtubeId: OTHER_ID }));

    clearProgress(storage, ID);

    expect(loadProgress(storage, ID, NOW)).toBeNull();
    expect(loadProgress(storage, OTHER_ID, NOW)).not.toBeNull();
  });

  it('does nothing for a song with no progress, and does not break when the storage refuses', () => {
    expect(() => clearProgress(new MemoryStorage(), ID)).not.toThrow();
    expect(() => clearProgress(new BrokenStorage(), ID)).not.toThrow();
  });
});

describe('progressOf', () => {
  const META = { youtubeId: ID, difficulty: 'medio' as const, now: NOW };

  function start(blanks: Blank[] = [LANTERNS, SECRET]): GameState {
    return initGame({ mode: 'escolha', lines: LINES, blanks, autoRepeat: true });
  }

  function play(s: GameState, ...events: GameEvent[]): GameState {
    return events.reduce(gameReducer, s);
  }

  it('is what the game has to remember: where the clock is, the blanks, the answers and the score', () => {
    const s = play(
      start(),
      { type: 'TICK', timeMs: 1000 },
      { type: 'ANSWER', blankId: '0:2', correct: true, atMs: 1200 },
      { type: 'HINT', blankId: '1:3' },
      { type: 'TICK', timeMs: 5200 },
    );

    expect(progressOf(s, META)).toEqual({
      version: 1,
      youtubeId: ID,
      mode: 'escolha',
      difficulty: 'medio',
      savedAt: NOW,
      lastTickMs: 5200,
      status: { '0:2': 'correct', '1:3': 'pending' },
      attempted: { '0:2': true },
      hinted: { '1:3': true },
      tilesPlaced: {},
      score: s.score,
    });
  });

  it('is saved as JSON and read back the same', () => {
    const s = play(start(), { type: 'TICK', timeMs: 1000 }, { type: 'ANSWER', blankId: '0:2', correct: false, atMs: 1200 });
    const storage = new MemoryStorage();

    saveProgress(storage, progressOf(s, META));

    expect(loadProgress(storage, ID, NOW)).toEqual(progressOf(s, META));
  });

  it('keeps the blank a wait holds for as still pending, so that it is waited for again (ruling S24)', () => {
    const waiting = play(start(), { type: 'TICK', timeMs: 3900 });
    expect(waiting.phase).toBe('waiting');

    expect(progressOf(waiting, META).status).toEqual({ '0:2': 'pending', '1:3': 'pending' });
  });

  it('keeps a skipped or missed blank a wait holds for as pending too, since it was left unanswered', () => {
    const skipped = play(start([LANTERNS]), { type: 'TICK', timeMs: 3000 }, { type: 'TICK', timeMs: 6000 });
    expect(skipped.status['0:2']).toBe('skipped');
    const waitingAgain: GameState = { ...skipped, phase: 'waiting', waitingBlankId: '0:2' };

    expect(progressOf(waitingAgain, META).status).toEqual({ '0:2': 'pending' });
    expect(waitingAgain.status['0:2']).toBe('skipped');
  });

  it('does not change the game it is given', () => {
    const waiting = play(start(), { type: 'TICK', timeMs: 3900 });
    const before = structuredClone(waiting);

    progressOf(waiting, META);

    expect(waiting).toEqual(before);
  });
});
