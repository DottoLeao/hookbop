import { act, fireEvent, render, screen, within } from '@testing-library/react';
import gsap from 'gsap';
import { StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryStorage } from '@/lib/game/fakeStorage';
import { saveProgress, type SavedProgress } from '@/lib/game/savedProgress';
import { createScore } from '@/lib/game/scoring';
import { parseLrc } from '@/lib/lyrics/lrc';
import type { SongResolution, VideoRecord } from '@/lib/lyrics/resolveSong';
import { FakePlayerAdapter } from '@/lib/player/fakeAdapter';
import { PlayerLoadError } from '@/lib/player/youtubeAdapter';
import type { AnswerRecord, PlaySummary } from '@/lib/types';
import { GameScreen } from './GameScreen';
import { SongScreen, type SongScreenDeps } from './SongScreen';

// The game screen only records what it was given, as in SongScreen.test, and GSAP is only watched: what the song
// screen asks it to animate when the phase changes, and whether any of it can touch the YouTube player.
vi.mock('./GameScreen', () => ({
  GameScreen: vi.fn(() => <div data-testid="game-screen" />),
}));
vi.mock('gsap');
const fromTo = vi.mocked(gsap.fromTo);

const ID = 'dQw4w9WgXcQ';
const DURATION_MS = 213000;
const NOW = new Date(2027, 0, 15, 12, 0, 0).getTime();

// Invented lines, not lyrics.
const LRC = [
  '[00:00.30]Lanterns drift across the silver river',
  '[00:03.30]We carried every secret down the hill',
  '[00:06.30]And morning paints the window gold again',
  '[00:09.30]Hold the compass steady for me now',
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
const SUMMARY: PlaySummary = { totalBlanks: 12, firstTryCorrect: 11, pct: 92, maxCombo: 8, xp: 240 };
const RECORDS: AnswerRecord[] = [{ blankId: 'b1', kind: 'first', correct: true, beforeLineEnd: true }];

type Vars = Record<string, unknown>;

let fake: FakePlayerAdapter;
let storage: MemoryStorage;

function makeDeps(over: Partial<SongScreenDeps> = {}) {
  return {
    createAdapter: vi.fn<SongScreenDeps['createAdapter']>().mockResolvedValue(fake),
    resolve: vi.fn<SongScreenDeps['resolve']>().mockResolvedValue(READY),
    saveOffsetVote: vi.fn<SongScreenDeps['saveOffsetVote']>().mockResolvedValue(0),
    savePlay: vi.fn<SongScreenDeps['savePlay']>().mockResolvedValue({ playId: 'play-1', xp: 120 }),
    doubleXp: vi.fn<SongScreenDeps['doubleXp']>().mockResolvedValue({ xp: 240 }),
    sleep: vi.fn<NonNullable<SongScreenDeps['sleep']>>().mockResolvedValue(undefined),
    progressStorage: () => storage,
    wallClock: () => NOW,
    ...over,
  };
}

/** A game of Escolha on Médio with a blank answered, kept on the device a minute ago. */
function savedGame(): SavedProgress {
  return {
    version: 1,
    youtubeId: ID,
    mode: 'escolha',
    difficulty: 'medio',
    savedAt: NOW - 60_000,
    lastTickMs: 4000,
    status: {},
    attempted: {},
    hinted: {},
    tilesPlaced: {},
    score: createScore(0),
  };
}

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

async function finishGame() {
  await act(async () => gameProps().onEnd(SUMMARY, RECORDS));
}

/** The box under the player, that holds whichever screen the song is at. */
function screenBox() {
  return screen.getByTestId('player').nextElementSibling as HTMLElement;
}

/** What the song screen asked GSAP to animate for `box` (the whole box, not the things in it). */
function swaps() {
  const calls = fromTo.mock.calls as unknown as [Element | Element[], Vars, Vars][];
  return calls.filter(([target]) => target === screenBox()).map(([, from, to]) => ({ from, to }));
}

/** Every element anything was ever animated on, the lists flattened. */
function animated(): Element[] {
  const calls = fromTo.mock.calls as unknown as [Element | Element[], Vars, Vars][];
  return calls.flatMap(([target]) => [target].flat());
}

function preferReducedMotion() {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: query === '(prefers-reduced-motion: reduce)',
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
}

beforeEach(() => {
  fake = new FakePlayerAdapter(DURATION_MS);
  storage = new MemoryStorage();
  vi.mocked(GameScreen).mockClear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  fromTo.mockClear();
});

describe('SongScreen: a short change between loading, picking, playing and the end', () => {
  it('does not animate the first screen, only the changes: loading, the picker, the game, the end', async () => {
    render(<SongScreen youtubeId={ID} deps={makeDeps()} />);
    expect(swaps()).toHaveLength(0);

    await screen.findByRole('button', { name: 'Jogar' });
    expect(swaps()).toHaveLength(1);

    fireEvent.click(screen.getByRole('button', { name: 'Jogar' }));
    expect(screen.getByTestId('game-screen')).toBeInTheDocument();
    expect(swaps()).toHaveLength(2);

    await finishGame();
    expect(screen.getByRole('button', { name: 'Jogar de novo' })).toBeInTheDocument();
    expect(swaps()).toHaveLength(3);

    fireEvent.click(screen.getByRole('button', { name: 'Outro modo' }));
    expect(screen.getByRole('button', { name: 'Jogar' })).toBeInTheDocument();
    expect(swaps()).toHaveLength(4);
  });

  it('comes down into place from a few px below, fading in, in no more than 0.3 s, with only transform and opacity', async () => {
    await openPicker();

    const [swap] = swaps();
    expect(swap.from.y).toBeGreaterThan(0);
    expect(swap.from.y).toBeLessThanOrEqual(12);
    expect(swap.from.opacity).toBe(0);
    expect(swap.to).toEqual(expect.objectContaining({ y: 0, opacity: 1 }));
    expect(swap.to.duration).toBeLessThanOrEqual(0.3);
    expect(Object.keys(swap.from).sort()).toEqual(['opacity', 'y']);
    expect(Object.keys(swap.to).filter((name) => !['duration', 'ease', 'clearProps'].includes(name)).sort()).toEqual([
      'opacity',
      'y',
    ]);
  });

  it('only fades when motion is reduced', async () => {
    preferReducedMotion();
    await openPicker();

    const [swap] = swaps();
    expect(Object.keys(swap.from)).toEqual(['opacity']);
    expect(Object.keys(swap.to)).not.toContain('y');
  });

  it('does not animate the picker again for a change inside it: "Começar do zero" drops the saved game and that is all', async () => {
    saveProgress(storage, savedGame());
    await openPicker();
    expect(swaps()).toHaveLength(1);

    fireEvent.click(screen.getByRole('button', { name: 'Começar do zero' }));

    expect(screen.queryByRole('button', { name: 'Continuar de onde parou' })).not.toBeInTheDocument();
    expect(swaps()).toHaveLength(1);
  });

  it('brings the picker’s cards in with the saved game among them, besides the change of screen', async () => {
    saveProgress(storage, savedGame());
    await openPicker();

    const lists = fromTo.mock.calls.map(([target]) => target).filter(Array.isArray) as unknown as HTMLElement[][];
    expect(lists).toHaveLength(1);
    expect(lists[0]).toContain(screen.getByRole('button', { name: 'Continuar de onde parou' }).closest('section'));
    expect(lists[0]).toHaveLength(6);
  });

  it('changes the screen too when the player cannot be had, and "Tentar de novo" starts it over', async () => {
    const deps = makeDeps({ createAdapter: vi.fn<SongScreenDeps['createAdapter']>().mockRejectedValue(new PlayerLoadError('other')) });
    render(<SongScreen youtubeId={ID} deps={deps} />);
    await screen.findByRole('button', { name: 'Tentar de novo' });

    expect(swaps()).toHaveLength(1);
  });

  it('takes the focus to the result when the end comes in, as it did, and the keyboard is not held up', async () => {
    await openPicker();
    fireEvent.click(screen.getByRole('button', { name: 'Jogar' }));

    await finishGame();

    expect(screen.getByRole('region', { name: 'Mandou bem!' })).toHaveFocus();
    // The way out is there to be pressed while the screen comes in.
    fireEvent.click(screen.getByRole('button', { name: 'Jogar de novo' }));
    expect(screen.getByTestId('game-screen')).toBeInTheDocument();
  });

  it('answers a tap on the picker at once, while its change of screen is still running', async () => {
    await openPicker();

    fireEvent.click(screen.getByRole('radio', { name: 'Karaokê' }));
    fireEvent.click(screen.getByRole('button', { name: 'Jogar' }));

    expect(gameProps().mode).toBe('karaoke');
  });
});

describe('SongScreen: the transitions never touch the YouTube player', () => {
  /** The player box and the element the player is put in, to see whether they are the same all the way. */
  function playerNodes() {
    const box = screen.getByTestId('player');
    return { box, host: box.firstElementChild, count: box.childElementCount };
  }

  async function walk(): Promise<ReturnType<typeof playerNodes>[]> {
    const seen: ReturnType<typeof playerNodes>[] = [];
    const deps = await openPicker();
    seen.push(playerNodes());
    fireEvent.click(screen.getByRole('button', { name: 'Jogar' }));
    seen.push(playerNodes());
    await finishGame();
    seen.push(playerNodes());
    fireEvent.click(screen.getByRole('button', { name: 'Outro modo' }));
    seen.push(playerNodes());
    fireEvent.click(screen.getByRole('button', { name: 'Jogar' }));
    seen.push(playerNodes());
    await finishGame();
    fireEvent.click(screen.getByRole('button', { name: 'Jogar de novo' }));
    seen.push(playerNodes());
    expect(deps.createAdapter).toHaveBeenCalledOnce();
    return seen;
  }

  it('keeps the same player box and the same player inside it through every phase: nothing remounts it', async () => {
    const seen = await walk();

    const [first, ...rest] = seen;
    for (const now of rest) {
      expect(now.box).toBe(first.box);
      expect(now.host).toBe(first.host);
      expect(now.count).toBe(1);
    }
    expect(first.box.isConnected).toBe(true);
  });

  it('never animates the player box, what is inside it, or anything that holds it', async () => {
    await walk();

    const box = screen.getByTestId('player');
    expect(animated().length).toBeGreaterThan(0);
    for (const target of animated()) {
      expect(target.contains(box)).toBe(false);
      expect(box.contains(target)).toBe(false);
    }
    // What it animates for the change of screen is the box under the player, and it is not a part of it.
    expect(screenBox()).not.toBe(box);
    expect(screenBox().contains(box)).toBe(false);
  });

  it('leaves the player box without a style: not moved, not resized, not covered by a faded or lifted layer', async () => {
    await walk();

    const box = screen.getByTestId('player');
    expect(box.getAttribute('style')).toBeNull();
    expect(box.firstElementChild?.getAttribute('style')).toBe('width: 100%; height: 100%;');
    expect(box.parentElement?.getAttribute('style') ?? '').toBe('');
  });

  it('puts the screens under the player and moves them only down into place, so none comes up over it', async () => {
    await walk();

    const box = screen.getByTestId('player');
    expect(box.compareDocumentPosition(screenBox()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    for (const swap of swaps()) expect(Number(swap.from.y)).toBeGreaterThanOrEqual(0);
    const calls = fromTo.mock.calls as unknown as [unknown, Vars, Vars][];
    for (const [, from, to] of calls) {
      // No scale: a thing that grows out of its place is drawn bigger than the space it has.
      expect(Object.keys({ ...from, ...to })).not.toContain('scale');
      expect(Number(from.y ?? 0)).toBeGreaterThanOrEqual(0);
    }
  });

  it('keeps pausing the clip when the page is hidden and again when it comes back (ruling S19)', async () => {
    await openPicker();
    act(() => fake.emitState('playing'));
    const before = fake.calls.length;

    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });

    expect(fake.calls.slice(before)).toEqual(['pause', 'pause']);
  });

  it('is the same under StrictMode, which runs every effect twice: one player', async () => {
    const deps = makeDeps();
    render(
      <StrictMode>
        <SongScreen youtubeId={ID} deps={deps} />
      </StrictMode>,
    );
    await screen.findByRole('button', { name: 'Jogar' });
    const box = screen.getByTestId('player');

    fireEvent.click(screen.getByRole('button', { name: 'Jogar' }));

    expect(screen.getByTestId('player')).toBe(box);
    expect(within(box).queryAllByRole('button')).toHaveLength(0);
  });
});
