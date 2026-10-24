import { act, render, renderHook } from '@testing-library/react';
import { Activity } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BrokenStorage, MemoryStorage } from '@/lib/game/fakeStorage';
import { gameReducer, initGame, type GameEvent, type GameState } from '@/lib/game/reducer';
import { loadProgress, saveProgress, type SavedProgress } from '@/lib/game/savedProgress';
import type { Blank, LyricLine } from '@/lib/types';
import { SAVE_EVERY_MS, startingGame, useSavedProgress } from './useSavedProgress';

const ID = 'dQw4w9WgXcQ';
const NOW = 1_800_000_000_000;

// Invented lines, not lyrics.
const LINES: LyricLine[] = [
  { index: 0, startMs: 0, endMs: 4000, text: "Grandpa won't let geese drive" },
  { index: 1, startMs: 4000, endMs: 8000, text: 'She gave each kite a name' },
];
const LET: Blank = { id: '0:2', lineIndex: 0, tokenIndex: 2, answer: 'let' };
const GAVE: Blank = { id: '1:1', lineIndex: 1, tokenIndex: 1, answer: 'gave' };

function newGame(blanks: Blank[] = [LET, GAVE]): GameState {
  return initGame({ mode: 'escolha', lines: LINES, blanks, autoRepeat: true });
}

/** The game with the first blank answered right, the clock in the second line. */
function playedGame(): GameState {
  const events: GameEvent[] = [
    { type: 'TICK', timeMs: 1000 },
    { type: 'ANSWER', blankId: LET.id, correct: true, atMs: 1200 },
    { type: 'TICK', timeMs: 5200 },
  ];
  return events.reduce(gameReducer, newGame());
}

function savedGame(over: Partial<SavedProgress> = {}): SavedProgress {
  const game = playedGame();
  return {
    version: 1,
    youtubeId: ID,
    mode: 'escolha',
    difficulty: 'medio',
    savedAt: NOW,
    lastTickMs: game.lastTickMs,
    status: game.status,
    attempted: game.attempted,
    hinted: game.hinted,
    tilesPlaced: game.tilesPlaced,
    score: game.score,
    ...over,
  };
}

let storage: MemoryStorage;
let gameRef: { current: GameState };

type Options = Parameters<typeof useSavedProgress>[0];

function options(over: Partial<Options> = {}): Options {
  return {
    gameRef,
    storage,
    youtubeId: ID,
    difficulty: 'medio',
    wallClock: () => Date.now(),
    resume: undefined,
    resumed: false,
    ended: false,
    ...over,
  };
}

function UsesSavedProgress({ resume }: { resume?: SavedProgress }) {
  useSavedProgress(options({ resume, resumed: false }));
  return null;
}

/** The hook in a screen that Next keeps in an <Activity>, hidden or shown. */
function Saving({ mode, resume }: { mode: 'visible' | 'hidden'; resume?: SavedProgress }) {
  return (
    <Activity mode={mode}>
      <UsesSavedProgress resume={resume} />
    </Activity>
  );
}

function setVisibility(state: DocumentVisibilityState) {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
  act(() => {
    document.dispatchEvent(new Event('visibilitychange'));
  });
}

function stored() {
  return loadProgress(storage, ID, Date.now());
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  storage = new MemoryStorage();
  gameRef = { current: playedGame() };
});

afterEach(() => {
  setVisibility('visible');
  vi.useRealTimers();
});

describe('startingGame', () => {
  it('is a new game, from the top, when there is nothing to go on from', () => {
    const start = startingGame({ mode: 'escolha', lines: LINES, blanks: [LET, GAVE] }, undefined);

    expect(start.resumeAtMs).toBeNull();
    expect(start.game).toEqual(newGame());
  });

  it('is the saved game, with the clock at the start of the line it will play from, when it is this game', () => {
    const start = startingGame({ mode: 'escolha', lines: LINES, blanks: [LET, GAVE] }, savedGame());

    expect(start.resumeAtMs).toBe(4000);
    expect(start.game.lastTickMs).toBe(4000);
    expect(start.game.status).toEqual({ [LET.id]: 'correct', [GAVE.id]: 'pending' });
    expect(start.game.score.records).toHaveLength(1);
    expect(start.game.commands).toEqual([]);
  });

  it('is a new game when the saved one has other blanks (ruling S22)', () => {
    const start = startingGame({ mode: 'escolha', lines: LINES, blanks: [LET] }, savedGame());

    expect(start.resumeAtMs).toBeNull();
    expect(start.game).toEqual(newGame([LET]));
  });
});

describe('useSavedProgress: persist', () => {
  it('keeps the game as it is when it is called, not as it was when the hook last rendered', () => {
    const { result } = renderHook(() => useSavedProgress(options()));
    gameRef.current = { ...gameRef.current, lastTickMs: 6100 };

    result.current();

    expect(stored()).toMatchObject({ youtubeId: ID, mode: 'escolha', difficulty: 'medio', savedAt: NOW, lastTickMs: 6100 });
  });

  it('has the same identity on every render, whatever else changes, and writes to the storage it is given last', () => {
    const first = new MemoryStorage();
    const second = new MemoryStorage();
    const { result, rerender } = renderHook((p: Options) => useSavedProgress(p), {
      initialProps: options({ storage: first, wallClock: () => 1 }),
    });
    const persist = result.current;

    rerender(options({ storage: second, wallClock: () => 2, difficulty: 'dificil' }));
    expect(result.current).toBe(persist);

    persist();
    expect(first.keys()).toEqual([]);
    expect(loadProgress(second, ID, 2)).toMatchObject({ savedAt: 2, difficulty: 'dificil' });
  });

  it('stamps the save with the clock it is given', () => {
    const { result } = renderHook(() => useSavedProgress(options({ wallClock: () => NOW - 5000 })));

    result.current();

    expect(stored()?.savedAt).toBe(NOW - 5000);
  });

  it('keeps nothing of a finished game', () => {
    gameRef.current = { ...gameRef.current, phase: 'ended' };
    const { result } = renderHook(() => useSavedProgress(options()));

    result.current();

    expect(storage.keys()).toEqual([]);
  });

  it('does nothing without a storage, and does not break when the storage refuses', () => {
    const none = renderHook(() => useSavedProgress(options({ storage: null })));
    const broken = renderHook(() => useSavedProgress(options({ storage: new BrokenStorage() })));

    expect(() => none.result.current()).not.toThrow();
    expect(() => broken.result.current()).not.toThrow();
  });
});

describe('useSavedProgress: saving on its own', () => {
  it('saves every 5 s while it is mounted, and not before', () => {
    renderHook(() => useSavedProgress(options()));

    act(() => vi.advanceTimersByTime(SAVE_EVERY_MS - 1));
    expect(storage.keys()).toEqual([]);

    act(() => vi.advanceTimersByTime(1));
    expect(stored()?.savedAt).toBe(NOW + SAVE_EVERY_MS);

    gameRef.current = { ...gameRef.current, lastTickMs: 9000 };
    act(() => vi.advanceTimersByTime(SAVE_EVERY_MS));
    expect(stored()).toMatchObject({ savedAt: NOW + 2 * SAVE_EVERY_MS, lastTickMs: 9000 });
  });

  it('does not start the 5 s over when the options get new identities', () => {
    const { rerender } = renderHook((p: Options) => useSavedProgress(p), { initialProps: options() });

    act(() => vi.advanceTimersByTime(3000));
    rerender(options({ storage, wallClock: () => Date.now() }));
    act(() => vi.advanceTimersByTime(2000));

    expect(stored()?.savedAt).toBe(NOW + SAVE_EVERY_MS);
  });

  it('saves once as it is unmounted, the game as it is then (ruling S54)', () => {
    const { unmount } = renderHook(() => useSavedProgress(options()));
    gameRef.current = { ...gameRef.current, lastTickMs: 7300 };

    unmount();

    expect(stored()).toMatchObject({ savedAt: NOW, lastTickMs: 7300 });
  });

  it('stops saving when it is unmounted', () => {
    const { unmount } = renderHook(() => useSavedProgress(options()));
    unmount();
    storage.removeItem(`hb_progress:${ID}`);

    act(() => vi.advanceTimersByTime(20000));
    setVisibility('hidden');

    expect(storage.keys()).toEqual([]);
  });

  it('saves once as Next hides the screen (an <Activity>), and not again until it is shown', () => {
    const { rerender } = render(<Saving mode="visible" />);
    gameRef.current = { ...gameRef.current, lastTickMs: 7300 };

    rerender(<Saving mode="hidden" />);
    expect(stored()).toMatchObject({ lastTickMs: 7300 });

    storage.removeItem(`hb_progress:${ID}`);
    act(() => vi.advanceTimersByTime(20000));
    expect(storage.keys()).toEqual([]);
  });

  it('saves when the page is hidden or put away, which is the last it may be heard of (ruling S23)', () => {
    renderHook(() => useSavedProgress(options()));

    setVisibility('hidden');
    expect(stored()).not.toBeNull();

    storage.removeItem(`hb_progress:${ID}`);
    act(() => {
      window.dispatchEvent(new Event('pagehide'));
    });
    expect(stored()).not.toBeNull();
  });

  it('does not save when the page comes back', () => {
    renderHook(() => useSavedProgress(options()));
    setVisibility('hidden');
    storage.removeItem(`hb_progress:${ID}`);

    setVisibility('visible');

    expect(storage.keys()).toEqual([]);
  });
});

describe('useSavedProgress: the end of the game', () => {
  it('forgets the saved game when the game ends, and keeps it until then', () => {
    saveProgress(storage, savedGame());
    const { rerender } = renderHook((p: Options) => useSavedProgress(p), { initialProps: options() });
    expect(stored()).not.toBeNull();

    rerender(options({ ended: true }));

    expect(storage.keys()).toEqual([]);
  });

  it('does not save the finished game again, on the timer, when the page goes away or when it is unmounted', () => {
    const { rerender, unmount } = renderHook((p: Options) => useSavedProgress(p), { initialProps: options() });
    gameRef.current = { ...gameRef.current, phase: 'ended' };
    rerender(options({ ended: true }));

    act(() => vi.advanceTimersByTime(20000));
    setVisibility('hidden');
    unmount();

    expect(storage.keys()).toEqual([]);
  });

  it('does not break when the storage refuses', () => {
    expect(() => renderHook(() => useSavedProgress(options({ storage: new BrokenStorage(), ended: true })))).not.toThrow();
  });
});

describe('useSavedProgress: a saved game that was not taken (ruling S22)', () => {
  it('forgets the saved game when the game it was given for is another one', () => {
    const saved = savedGame();
    saveProgress(storage, saved);

    renderHook(() => useSavedProgress(options({ resume: saved, resumed: false })));

    expect(storage.keys()).toEqual([]);
  });

  it('keeps it when the game took it', () => {
    const saved = savedGame();
    saveProgress(storage, saved);

    renderHook(() => useSavedProgress(options({ resume: saved, resumed: true })));

    expect(stored()).toEqual(saved);
  });

  it('forgets nothing when it was given no saved game', () => {
    saveProgress(storage, savedGame());

    renderHook(() => useSavedProgress(options({ resume: undefined, resumed: false })));

    expect(stored()).not.toBeNull();
  });

  it('forgets it once, when the screen comes up, not again on later renders', () => {
    const saved = savedGame();
    const { rerender } = renderHook((p: Options) => useSavedProgress(p), {
      initialProps: options({ resume: saved, resumed: false }),
    });
    saveProgress(storage, savedGame({ lastTickMs: 7000 }));

    rerender(options({ resume: saved, resumed: false, storage }));

    expect(stored()?.lastTickMs).toBe(7000);
  });

  it('does not forget it again when Next hides the screen and shows it again: what is kept by then is this game', () => {
    const saved = savedGame();
    saveProgress(storage, saved);
    const { rerender } = render(<Saving mode="visible" resume={saved} />);
    expect(storage.keys()).toEqual([]);

    gameRef.current = { ...gameRef.current, lastTickMs: 7300 };
    rerender(<Saving mode="hidden" resume={saved} />);
    rerender(<Saving mode="visible" resume={saved} />);

    expect(stored()?.lastTickMs).toBe(7300);
  });

  it('does not break when the storage refuses or there is none', () => {
    const saved = savedGame();
    expect(() => renderHook(() => useSavedProgress(options({ resume: saved, storage: new BrokenStorage() })))).not.toThrow();
    expect(() => renderHook(() => useSavedProgress(options({ resume: saved, storage: null })))).not.toThrow();
  });
});
