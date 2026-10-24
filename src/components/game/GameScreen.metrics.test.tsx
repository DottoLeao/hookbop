import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { Activity, StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HelpError } from '@/lib/help/helpError';
import type { HelpRequest } from '@/lib/help/helpService';
import type { HelpRequester } from '@/lib/help/useLineHelp';
import type { VideoRecord } from '@/lib/lyrics/resolveSong';
import { layOutPage } from '@/lib/motion/laidOutPage';
import { track } from '@/lib/metrics/track';
import { FakePlayerAdapter } from '@/lib/player/fakeAdapter';
import { DEFAULT_SETTINGS, saveSettings } from '@/lib/settings';
import type { SavedProgress } from '@/lib/game/savedProgress';
import type { Blank, LyricLine } from '@/lib/types';
import { GameScreen, type GameScreenProps } from './GameScreen';

// What the game screen tells the owner's panel (task 13, rulings S43 and S44): `track` is a mock in every test (see
// vitest.setup.ts), and the player is the fake one. The lines are invented, not lyrics.
vi.mock('@/lib/game/sfx', () => ({ playHit: vi.fn(), playMiss: vi.fn() }));
vi.mock('@/lib/game/distractors', () => ({ makeDistractors: vi.fn(() => ['late', 'lead']) }));

const ID = 'dQw4w9WgXcQ';

const LINES: LyricLine[] = [
  { index: 0, startMs: 0, endMs: 4000, text: "Grandpa won't let geese drive" },
  { index: 1, startMs: 4000, endMs: 8000, text: 'She gave each kite a name' },
  { index: 2, startMs: 8000, endMs: 12000, text: 'Then every ferry horn sings across the bay' },
];
const LET: Blank = { id: '0:2', lineIndex: 0, tokenIndex: 2, answer: 'let' };
const GAVE: Blank = { id: '1:1', lineIndex: 1, tokenIndex: 1, answer: 'gave' };
const FERRY: Blank = { id: '2:2', lineIndex: 2, tokenIndex: 2, answer: 'ferry' };

const BUILD_LINES: LyricLine[] = [
  { index: 0, startMs: 0, endMs: 4000, text: 'Please come back home tonight' },
  { index: 1, startMs: 4000, endMs: 8000, text: 'Hang your lantern by the old gate' },
];
const WHOLE_0: Blank = { id: '0:-1', lineIndex: 0, tokenIndex: -1, answer: 'Please come back home tonight' };

const VIDEO: VideoRecord = {
  youtubeId: ID,
  title: 'The Paper Lanterns - Neon Harbor (Official Video)',
  channel: 'ThePaperLanternsVEVO',
  durationS: 213,
  ytFetchedAt: '2026-10-21T12:00:00.000Z',
  status: 'ok',
  lyricsSource: 'lrclib',
  lyricsRef: '777',
  offsetMs: 0,
};

let fake: FakePlayerAdapter;
let unlayPage: () => void;

/** One option of the Escolha question. */
function option(name: string) {
  return within(screen.getByRole('group', { name: 'Escolha a palavra que falta' })).getByRole('button', { name });
}

/** A help service that answers at once. */
const helpService = () =>
  vi.fn<HelpRequester>(async (r: HelpRequest) =>
    r.kind === 'translate' ? `Tradução ${r.lineIndex}` : `Explicação de ${r.target || 'tudo'}`,
  );

function renderGame(over: Partial<GameScreenProps> = {}, strict = false) {
  const onEnd = vi.fn<GameScreenProps['onEnd']>();
  const screenUnderTest = (
    <GameScreen
      adapter={fake}
      mode="escolha"
      difficulty="medio"
      lines={LINES}
      blanks={[LET]}
      video={VIDEO}
      timeToReadyMs={1200}
      onEnd={onEnd}
      requestHelp={helpService()}
      {...over}
    />
  );
  const view = render(strict ? <StrictMode>{screenUnderTest}</StrictMode> : screenUnderTest);
  act(() => vi.advanceTimersByTime(300));
  return { onEnd, ...view };
}

/** The clip plays on to `ms`, read by the screen as it goes, unless the game pauses it. */
function playTo(ms: number) {
  for (let step = 0; step < 100 && fake.getCurrentTimeMs() < ms; step++) {
    const before = fake.getCurrentTimeMs();
    act(() => {
      fake.advance(Math.min(1000, ms - before));
      vi.advanceTimersByTime(100);
    });
    if (fake.getCurrentTimeMs() === before) return;
  }
}

async function settle() {
  await act(async () => {});
}

function setVisibility(state: DocumentVisibilityState) {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
  act(() => {
    document.dispatchEvent(new Event('visibilitychange'));
  });
}

/** The names of what was tracked, in order. */
function tracked() {
  return vi.mocked(track).mock.calls.map(([name]) => name);
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.mocked(track).mockClear();
  localStorage.clear();
  fake = new FakePlayerAdapter(60000);
  unlayPage = layOutPage();
  // jsdom has neither Element.scrollTo nor matchMedia, which Karaokê's list reaches for to follow the song.
  Object.defineProperty(Element.prototype, 'scrollTo', { configurable: true, writable: true, value: vi.fn() });
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
  );
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(Element.prototype, 'scrollTo');
  Reflect.deleteProperty(document, 'visibilityState');
  unlayPage();
});

describe('GameScreen: help_explain', () => {
  it('is tracked when "Não entendi" opens DJ Bop’s explanation, with the song, the mode and the line', async () => {
    renderGame({ blanks: [LET, GAVE] });
    fireEvent.click(option('let'));
    playTo(4500);
    fireEvent.click(option('late'));
    vi.mocked(track).mockClear();

    fireEvent.click(screen.getByRole('button', { name: 'Não entendi' }));
    await settle();

    expect(track).toHaveBeenCalledExactlyOnceWith('help_explain', { youtubeId: ID, mode: 'escolha', props: { lineIndex: 1 } });
  });

  it('is tracked when a word of the line in play is tapped', async () => {
    renderGame();
    fireEvent.click(option('late'));
    vi.mocked(track).mockClear();

    fireEvent.click(within(screen.getByTestId('line-current')).getByRole('button', { name: 'geese' }));
    await settle();

    expect(track).toHaveBeenCalledExactlyOnceWith('help_explain', { youtubeId: ID, mode: 'escolha', props: { lineIndex: 0 } });
  });

  it('is tracked by "Não entendi a ordem" in Monte o verso, which explains the whole line', async () => {
    renderGame({ mode: 'montar', lines: BUILD_LINES, blanks: [WHOLE_0] });
    const tiles = within(screen.getByRole('group', { name: 'Coloque as palavras na ordem' }));
    fireEvent.click(tiles.getByRole('button', { name: 'tonight' }));
    vi.mocked(track).mockClear();

    fireEvent.click(screen.getByRole('button', { name: 'Não entendi a ordem' }));
    await settle();

    expect(track).toHaveBeenCalledExactlyOnceWith('help_explain', { youtubeId: ID, mode: 'montar', props: { lineIndex: 0 } });
  });

  it('is tracked by a word tapped in Karaokê', async () => {
    renderGame({ mode: 'karaoke', blanks: [] });
    vi.mocked(track).mockClear();

    fireEvent.click(screen.getByRole('button', { name: 'geese' }));
    await settle();

    expect(track).toHaveBeenCalledExactlyOnceWith('help_explain', { youtubeId: ID, mode: 'karaoke', props: { lineIndex: 0 } });
  });

  it('is tracked for each ask, and not for closing the sheet', async () => {
    renderGame();
    fireEvent.click(option('late'));
    vi.mocked(track).mockClear();

    fireEvent.click(screen.getByRole('button', { name: 'Não entendi' }));
    await settle();
    fireEvent.click(screen.getByRole('button', { name: 'Valeu' }));
    expect(tracked()).toEqual(['help_explain']);

    fireEvent.click(screen.getByRole('button', { name: 'Não entendi' }));
    await settle();
    expect(tracked()).toEqual(['help_explain', 'help_explain']);
  });

  it('is tracked even when the help service is down: the player asked', async () => {
    renderGame({ requestHelp: () => Promise.reject(new HelpError(503)) });
    fireEvent.click(option('late'));
    vi.mocked(track).mockClear();

    fireEvent.click(screen.getByRole('button', { name: 'Não entendi' }));
    await settle();

    expect(tracked()).toEqual(['help_explain']);
  });
});

describe('GameScreen: help_translate', () => {
  it('is tracked when "Traduzir verso" is tapped, with the song, the mode and the line', async () => {
    renderGame();

    fireEvent.click(screen.getByRole('button', { name: 'Traduzir verso' }));
    await settle();

    expect(track).toHaveBeenCalledExactlyOnceWith('help_translate', { youtubeId: ID, mode: 'escolha', props: { lineIndex: 0 } });
  });

  it('is tracked for a line of Monte o verso that is still hidden', async () => {
    renderGame({ mode: 'montar', lines: BUILD_LINES, blanks: [WHOLE_0] });

    fireEvent.click(screen.getByRole('button', { name: 'Traduzir verso' }));
    await settle();

    expect(track).toHaveBeenCalledExactlyOnceWith('help_translate', { youtubeId: ID, mode: 'montar', props: { lineIndex: 0 } });
  });

  it('is not tracked for the translation "Mostrar tradução sempre" asks for by itself: the player did not ask', async () => {
    saveSettings(localStorage, { ...DEFAULT_SETTINGS, alwaysShowTranslation: true });
    const requestHelp = helpService();
    renderGame({ requestHelp });
    await settle();

    expect(requestHelp).toHaveBeenCalledWith(expect.objectContaining({ kind: 'translate' }));
    expect(tracked()).not.toContain('help_translate');
  });

  it('is not tracked for the translations Karaokê shows by itself', async () => {
    const requestHelp = helpService();
    renderGame({ mode: 'karaoke', blanks: [], requestHelp });
    await settle();

    expect(requestHelp).toHaveBeenCalledWith(expect.objectContaining({ kind: 'translate' }));
    expect(tracked()).not.toContain('help_translate');
  });
});

describe('GameScreen: continue_after_leave', () => {
  it('is tracked when the player taps "Continuar" after coming back to the app, with the song and the mode', () => {
    renderGame();
    setVisibility('hidden');
    setVisibility('visible');
    expect(track).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));

    expect(track).toHaveBeenCalledExactlyOnceWith('continue_after_leave', { youtubeId: ID, mode: 'escolha' });
  });

  it('is not tracked for leaving the app and coming back, nor for the "Continuar" of "Traduzir verso"', async () => {
    renderGame();

    fireEvent.click(screen.getByRole('button', { name: 'Traduzir verso' }));
    await settle();
    act(() => vi.advanceTimersByTime(2000));
    vi.mocked(track).mockClear();
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));

    expect(tracked()).toEqual([]);
  });
});

describe('GameScreen: game_abandoned', () => {
  it('is tracked when the screen goes away without the song being over, with the song and the mode', async () => {
    const { unmount } = renderGame({ mode: 'montar', lines: BUILD_LINES, blanks: [WHOLE_0] });
    expect(track).not.toHaveBeenCalled();

    unmount();
    await settle();

    expect(track).toHaveBeenCalledExactlyOnceWith('game_abandoned', { youtubeId: ID, mode: 'montar' });
  });

  it('is tracked when the page is left or put away (pagehide), and only once for the game', async () => {
    const { unmount } = renderGame();

    act(() => {
      window.dispatchEvent(new Event('pagehide'));
    });
    expect(track).toHaveBeenCalledExactlyOnceWith('game_abandoned', { youtubeId: ID, mode: 'escolha' });

    unmount();
    await settle();
    expect(track).toHaveBeenCalledOnce();
  });

  it('is not tracked for the page going to the background and coming back (ruling S44)', async () => {
    renderGame();

    setVisibility('hidden');
    setVisibility('visible');
    await settle();

    expect(tracked()).not.toContain('game_abandoned');
  });

  it('is not tracked for a game that finished and whose screen is gone', async () => {
    const { onEnd, unmount } = renderGame({ mode: 'karaoke', blanks: [] });
    act(() => fake.emitState('ended'));
    expect(onEnd).toHaveBeenCalledOnce();

    act(() => {
      window.dispatchEvent(new Event('pagehide'));
    });
    unmount();
    await settle();

    expect(tracked()).not.toContain('game_abandoned');
  });

  it('is not tracked when the screen comes up in StrictMode, only when it goes away', async () => {
    const { unmount } = renderGame({}, true);
    await settle();
    expect(track).not.toHaveBeenCalled();

    unmount();
    await settle();

    expect(track).toHaveBeenCalledExactlyOnceWith('game_abandoned', { youtubeId: ID, mode: 'escolha' });
  });
});

describe('GameScreen: a game that goes on from a saved one (ruling S43)', () => {
  /** The game as the device kept it: Escolha on Médio, the first blank right, the clock in the second line. */
  const SAVED: SavedProgress = {
    version: 1,
    youtubeId: ID,
    mode: 'escolha',
    difficulty: 'medio',
    savedAt: 1_800_000_000_000,
    lastTickMs: 5200,
    status: { [LET.id]: 'correct', [GAVE.id]: 'pending', [FERRY.id]: 'pending' },
    attempted: { [LET.id]: true },
    hinted: {},
    tilesPlaced: {},
    score: {
      combo: 1,
      maxCombo: 1,
      xp: 12,
      firstTryCorrect: 1,
      totalBlanks: 3,
      records: [{ blankId: LET.id, kind: 'first', correct: true, beforeLineEnd: true }],
    },
  };
  const resumed = () => renderGame({ blanks: [LET, GAVE, FERRY], resume: SAVED });

  it('tells the panel about nothing when it starts: the song screen already counted this game', async () => {
    resumed();
    await settle();

    // It did go on from the saved game: the clip started again at the line it was in.
    expect(fake.calls).toContain('seek:4000');
    expect(track).not.toHaveBeenCalled();
  });

  it('is abandoned once when the screen goes away, with neither mode_selected nor game_started', async () => {
    const { unmount } = resumed();

    unmount();
    await settle();

    expect(vi.mocked(track).mock.calls).toEqual([['game_abandoned', { youtubeId: ID, mode: 'escolha' }]]);
  });

  it('is abandoned once when the page is left (pagehide), and not again when the screen then goes away', async () => {
    const { unmount } = resumed();

    act(() => {
      window.dispatchEvent(new Event('pagehide'));
    });
    unmount();
    await settle();

    expect(vi.mocked(track).mock.calls).toEqual([['game_abandoned', { youtubeId: ID, mode: 'escolha' }]]);
  });
});

describe('GameScreen: hidden and shown again', () => {
  // Next keeps the page it leaves in an <Activity>, hidden, and "Voltar" shows it with its effects made anew.
  it('reports the end of the song once, which is what game_finished is told from', async () => {
    const onEnd = vi.fn<GameScreenProps['onEnd']>();
    const game = (mode: 'visible' | 'hidden') => (
      <Activity mode={mode}>
        <GameScreen
          adapter={fake}
          mode="karaoke"
          difficulty="medio"
          lines={LINES}
          blanks={[]}
          video={VIDEO}
          timeToReadyMs={1200}
          onEnd={onEnd}
          requestHelp={helpService()}
        />
      </Activity>
    );
    const { rerender } = render(game('visible'));
    act(() => vi.advanceTimersByTime(300));
    act(() => fake.emitState('ended'));
    expect(onEnd).toHaveBeenCalledOnce();

    rerender(game('hidden'));
    rerender(game('visible'));
    act(() => vi.advanceTimersByTime(1000));
    await settle();

    expect(onEnd).toHaveBeenCalledOnce();
    expect(tracked()).not.toContain('game_abandoned');
  });
});
