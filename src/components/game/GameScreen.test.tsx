import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { tokenize } from '@/lib/game/blanks';
import { makeDistractors } from '@/lib/game/distractors';
import { seededRng, shuffled } from '@/lib/game/rng';
import { playHit, playMiss } from '@/lib/game/sfx';
import { makeTiles, tileSeed } from '@/lib/game/tiles';
import { FADE_IN_MS, FADE_OUT_MS } from '@/lib/game/timing';
import { HelpError } from '@/lib/help/helpError';
import type { HelpRequest } from '@/lib/help/helpService';
import type { HelpRequester } from '@/lib/help/useLineHelp';
import type { VideoRecord } from '@/lib/lyrics/resolveSong';
import { DEFAULT_STEP_MS, supportsVolume } from '@/lib/player/fade';
import { FakePlayerAdapter } from '@/lib/player/fakeAdapter';
import { DEFAULT_SETTINGS, loadSettings, saveSettings } from '@/lib/settings';
import type { Blank, LyricLine } from '@/lib/types';
import { GameScreen, type GameScreenProps } from './GameScreen';
import { LyricPanel } from './LyricPanel';
import { ToolsBar } from './ToolsBar';

// The reducer and the player clock are the real ones. The sounds and the distractor search are stand-ins, so the
// tests can see when they are used; the wireframe's "late" and "lead" stand in for the distractors.
vi.mock('@/lib/game/sfx', () => ({ playHit: vi.fn(), playMiss: vi.fn() }));
vi.mock('@/lib/game/distractors', () => ({ makeDistractors: vi.fn(() => ['late', 'lead']) }));

// Whether the device lets the page set the volume. Real browsers say it from their user agent; a test says it here, so
// it can be an iPhone, which does not.
const device = vi.hoisted(() => ({ canSetVolume: true }));
vi.mock('@/lib/player/fade', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/player/fade')>()),
  supportsVolume: vi.fn(() => device.canSetVolume),
}));

const ID = 'dQw4w9WgXcQ';
const DURATION_MS = 60000;

const LINES: LyricLine[] = [
  { index: 0, startMs: 0, endMs: 4000, text: "Grandpa won't let geese drive" },
  { index: 1, startMs: 4000, endMs: 8000, text: 'She gave each kite a name' },
  { index: 2, startMs: 8000, endMs: 12000, text: 'Then every ferry horn sings across the bay' },
];
const LET: Blank = { id: '0:2', lineIndex: 0, tokenIndex: 2, answer: 'let' };
const GAVE: Blank = { id: '1:1', lineIndex: 1, tokenIndex: 1, answer: 'gave' };
const FERRY: Blank = { id: '2:2', lineIndex: 2, tokenIndex: 2, answer: 'ferry' };

/** Invented lines for the typing mode. */
const TYPING_LINES: LyricLine[] = [
  { index: 0, startMs: 0, endMs: 4000, text: "Soon we'll get there before the rain" },
  { index: 1, startMs: 4000, endMs: 8000, text: 'And the kettle sings by candlelight' },
  { index: 2, startMs: 8000, endMs: 12000, text: 'Every window glows tonight' },
];
const GET: Blank = { id: '0:2', lineIndex: 0, tokenIndex: 2, answer: 'get' };
const KETTLE: Blank = { id: '1:2', lineIndex: 1, tokenIndex: 2, answer: 'kettle' };

/** Invented lines for Monte o verso, each one a puzzle on its own (a blank for the whole line, tokenIndex -1). */
const BUILD_LINES: LyricLine[] = [
  { index: 0, startMs: 0, endMs: 4000, text: 'Please come back home tonight' },
  { index: 1, startMs: 4000, endMs: 8000, text: 'Hang your lantern by the old gate' },
  { index: 2, startMs: 8000, endMs: 12000, text: 'Every window glows tonight' },
];
const WHOLE_0: Blank = { id: '0:-1', lineIndex: 0, tokenIndex: -1, answer: 'Please come back home tonight' };
const WHOLE_1: Blank = { id: '1:-1', lineIndex: 1, tokenIndex: -1, answer: 'Hang your lantern by the old gate' };
const BUILD_WORDS = tokenize(BUILD_LINES[0].text);

/** An invented line with punctuation and curly apostrophes: its tiles carry neither, and the line shows as written. */
const PUNCT_LINES: LyricLine[] = [
  { index: 0, startMs: 0, endMs: 4000, text: 'It\u2019s late, so don\u2019t wait up (please)!' },
  BUILD_LINES[1],
];
const PUNCT_BLANK: Blank = { id: '0:-1', lineIndex: 0, tokenIndex: -1, answer: "It's late so don't wait up please" };

/** Five lines in a row, each with "let" blanked: enough for a combo of 5. */
const ROUND: LyricLine[] = Array.from({ length: 5 }, (_, index) => ({
  index,
  startMs: index * 4000,
  endMs: (index + 1) * 4000,
  text: "Grandpa won't let geese drive",
}));
const ROUND_BLANKS: Blank[] = ROUND.map((line) => ({ id: `${line.index}:2`, lineIndex: line.index, tokenIndex: 2, answer: 'let' }));

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

/** The help service of every test that does not set one: it is down, so no test ever reaches the network. */
const helpIsDown: HelpRequester = () => Promise.reject(new HelpError(503));

/**
 * The game screen on the fake player. It starts the clip from the top, and the clock it reads in the 300 ms after
 * that seek does not count (ruling R44), so the helper lets those go by.
 */
function renderGame(over: Partial<GameScreenProps> = {}) {
  const onEnd = vi.fn<GameScreenProps['onEnd']>();
  render(
    <GameScreen
      adapter={fake}
      mode="escolha"
      difficulty="medio"
      lines={LINES}
      blanks={[LET]}
      video={VIDEO}
      timeToReadyMs={1200}
      onEnd={onEnd}
      requestHelp={helpIsDown}
      {...over}
    />,
  );
  act(() => vi.advanceTimersByTime(300));
  return onEnd;
}

/** The clip plays on to `ms`, read by the screen at least every second of clip time, unless the game pauses it. */
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

/** One option of the Escolha question. */
function option(name: string) {
  return within(screen.getByRole('group', { name: 'Escolha a palavra que falta' })).getByRole('button', { name });
}

/** The typing game. Its area is loaded on demand, so the screen is given a moment to get it. */
async function renderTyping(over: Partial<GameScreenProps> = {}) {
  const onEnd = renderGame({ mode: 'digitacao', lines: TYPING_LINES, blanks: [GET], ...over });
  await act(async () => {
    await vi.dynamicImportSettled();
  });
  return onEnd;
}

/**
 * A game screen that is new to this test (the modules are loaded again), so nothing an earlier test loaded or kept
 * can change what this one sees: its typing area has to be asked for now. Typing round, by default.
 */
async function renderFreshGame(over: Partial<GameScreenProps> = {}) {
  vi.resetModules();
  const { GameScreen: Fresh } = await import('./GameScreen');
  render(
    <Fresh
      adapter={fake}
      mode="digitacao"
      difficulty="medio"
      lines={TYPING_LINES}
      blanks={[GET]}
      video={VIDEO}
      timeToReadyMs={1200}
      onEnd={vi.fn()}
      requestHelp={helpIsDown}
      {...over}
    />,
  );
  act(() => vi.advanceTimersByTime(300));
}

/**
 * Lets the code that was asked for with `import()` arrive, and what it sets going. Each round gives the real world a
 * turn (a mocked module that loads the real one in its factory is not seen by `dynamicImportSettled`) and React its
 * updates; it stops once `arrived` says so. (`findBy` waits on timers, which are fake in this file.)
 */
async function settleImports(arrived: () => boolean = () => true) {
  for (let round = 0; round < 200; round++) {
    await act(async () => {
      await vi.dynamicImportSettled();
    });
    if (arrived()) return;
  }
}

/** The Monte o verso game on the line "Please come back home tonight". */
function renderBuild(over: Partial<GameScreenProps> = {}) {
  return renderGame({ mode: 'montar', lines: BUILD_LINES, blanks: [WHOLE_0], ...over });
}

/** One tile of the Monte o verso question. */
function tile(name: string) {
  return within(screen.getByRole('group', { name: 'Coloque as palavras na ordem' })).getByRole('button', { name });
}

/** Taps the tiles with these words, one after the other. */
function placeWords(words: readonly string[]) {
  for (const word of words) fireEvent.click(tile(word));
}

/** The words in the row of the line being built, in order. */
function placedRow() {
  return within(screen.getByTestId('montar-row'))
    .queryAllByRole('listitem')
    .map((item) => item.textContent);
}

/** A tile that takes no tap: `aria-disabled`, and never `disabled`, which would take the focus away (ruling R58). */
function isBlocked(button: HTMLElement) {
  expect(button).not.toHaveAttribute('disabled');
  return button.getAttribute('aria-disabled') === 'true';
}

function allTiles() {
  return within(screen.getByRole('group', { name: 'Coloque as palavras na ordem' })).getAllByRole('button');
}

/** What a sighted player can read: the page's text without what is only there for screen readers. */
function visibleText() {
  const copy = document.body.cloneNode(true) as HTMLElement;
  copy.querySelectorAll('.sr-only').forEach((hidden) => hidden.remove());
  return copy.textContent ?? '';
}

/** True when each element comes after the one before it on the page. */
function inOrder(...elements: Element[]) {
  return elements.every(
    (element, i) => i === 0 || elements[i - 1].compareDocumentPosition(element) & Node.DOCUMENT_POSITION_FOLLOWING,
  );
}

function field() {
  return screen.getByLabelText<HTMLInputElement>('Digite a palavra que falta');
}

/** The box around the typing field, which is what turns lime or red. */
function fieldBox() {
  return field().parentElement!;
}

/** Types the word and sends it, as the keyboard's "done" key does. */
function type(text: string) {
  fireEvent.change(field(), { target: { value: text } });
  fireEvent.submit(field().form!);
}

function fixedLettersIn(element: Element) {
  return [...element.querySelectorAll('[data-corrected]')].map((span) => span.textContent);
}

function count(call: string) {
  return fake.calls.filter((c) => c === call).length;
}

/** What the fake player logs when the volume goes from `from` to `to` over `ms`, one step every fader step. */
function volumeSteps(from: number, to: number, ms: number) {
  const steps = ms / DEFAULT_STEP_MS;
  return Array.from({ length: steps }, (_, i) => `volume:${Math.round(from + ((to - from) * (i + 1)) / steps)}`);
}

/** The whole fade of the music out, and the one back in. */
const FADE_OUT_STEPS = volumeSteps(100, 0, FADE_OUT_MS);
const FADE_IN_STEPS = volumeSteps(0, 100, FADE_IN_MS);

/** The volumes the fake player was set to in these calls, in order. */
function volumesIn(calls: readonly string[]) {
  return calls.filter((c) => c.startsWith('volume:')).map((c) => Number(c.slice('volume:'.length)));
}

/** Time for the music to fade all the way out (and the clip to pause), or all the way back in. */
function finishFadeOut() {
  act(() => vi.advanceTimersByTime(FADE_OUT_MS));
}

function finishFadeIn() {
  act(() => vi.advanceTimersByTime(FADE_IN_MS));
}

function dj() {
  return screen.getByRole('img', { name: 'DJ Bop' });
}

function openSettings() {
  fireEvent.click(screen.getByRole('button', { name: 'Configurações' }));
  return screen.getByRole('dialog', { name: 'Configurações' });
}

function setting(name: string) {
  return within(screen.getByRole('dialog', { name: 'Configurações' })).getByRole('switch', { name });
}

/** The answers makeDistractors was asked about, in order. */
function distractorsAskedFor() {
  return vi.mocked(makeDistractors).mock.calls.map(([answer]) => answer);
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  localStorage.clear();
  device.canSetVolume = true;
  fake = new FakePlayerAdapter(DURATION_MS);
});

afterEach(() => {
  // Unmount while the fake timers are still installed, so the player clock's interval is cleared on them.
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('GameScreen: header', () => {
  it('shows the back button, the song and artist, the mode, the combo in lime and a small DJ Bop', () => {
    renderGame();

    expect(screen.getByRole('link', { name: 'Voltar' })).toHaveAttribute('href', '/');
    expect(screen.getByText('Neon Harbor · The Paper Lanterns')).toBeInTheDocument();
    expect(screen.getByText('Modo Escolha')).toBeInTheDocument();
    expect(screen.getByText('x0')).toHaveClass('bg-lime', 'text-bg');
    expect(dj()).toHaveAttribute('data-expression', 'idle');
  });

  it('puts its header in the slot the song screen gives it, above the player', () => {
    const slot = document.createElement('div');
    document.body.append(slot);

    renderGame({ headerSlot: slot });

    expect(within(slot).getByRole('link', { name: 'Voltar' })).toBeInTheDocument();
    expect(within(slot).getByText('Neon Harbor · The Paper Lanterns')).toBeInTheDocument();
    slot.remove();
  });
});

describe('GameScreen: the player', () => {
  it('starts the round from the top of the clip', () => {
    renderGame();
    expect(fake.calls).toEqual(['seek:0', 'play']);
  });

  it('pauses the clip at the end of a line with an open blank, and plays on once it is right', () => {
    renderGame();

    playTo(3850);
    finishFadeOut();
    expect(fake.calls.at(-1)).toBe('pause');
    const before = fake.calls.length;

    fireEvent.click(option('let'));
    finishFadeIn();
    expect(fake.calls.slice(before)).toEqual(['play', ...FADE_IN_STEPS]);
  });

  it('0.75x slows the clip down, and a second tap puts it back to normal speed', () => {
    renderGame();
    const slow = screen.getByRole('button', { name: '0.75x' });

    fireEvent.click(slow);
    expect(fake.calls.at(-1)).toBe('rate:0.75');
    expect(slow).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(slow);
    expect(fake.calls.at(-1)).toBe('rate:1');
    expect(slow).toHaveAttribute('aria-pressed', 'false');
  });

  it('Repetir verso plays the line in play again from its start', () => {
    renderGame({ blanks: [FERRY] });
    playTo(5000);
    const before = fake.calls.length;

    fireEvent.click(screen.getByRole('button', { name: 'Repetir verso' }));

    expect(fake.calls.slice(before)).toEqual(['seek:4000', 'play']);
  });
});

/** The page goes to the background or comes back, as the browser reports it. */
function setVisibility(state: DocumentVisibilityState) {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
  act(() => {
    document.dispatchEvent(new Event('visibilitychange'));
  });
}

describe('GameScreen: the page in the background (ruling R84)', () => {
  afterEach(() => {
    setVisibility('visible');
  });

  it('pauses the clip when the page is hidden, and nothing plays it again when the page comes back', () => {
    renderGame({ blanks: [FERRY] });
    playTo(2000);
    const before = fake.calls.length;

    setVisibility('hidden');
    expect(fake.calls.slice(before)).toEqual(['pause']);

    setVisibility('visible');
    act(() => vi.advanceTimersByTime(5000));
    expect(fake.calls.slice(before)).toEqual(['pause']);
    expect(fake.getCurrentTimeMs()).toBe(2000);
  });

  it('pauses the clip when the page is left or put away (pagehide)', () => {
    renderGame({ blanks: [FERRY] });
    playTo(2000);
    const before = fake.calls.length;

    act(() => {
      window.dispatchEvent(new Event('pagehide'));
    });

    expect(fake.calls.slice(before)).toEqual(['pause']);
  });

  it('plays on only when the player presses play, and the game goes on from there', () => {
    const onEnd = renderGame({ blanks: [FERRY] });
    playTo(2000);
    setVisibility('hidden');
    setVisibility('visible');

    // The player's own play button.
    act(() => fake.emitState('playing'));
    playTo(11850);

    expect(fake.calls.at(-1)).toBe('pause');
    expect(screen.getByTestId('line-current')).toHaveTextContent('Then every lacuna horn sings across the bay');
    expect(onEnd).not.toHaveBeenCalled();
  });
});

describe('GameScreen: smooth fades (spec sections 1 and 2)', () => {
  describe('at a blank', () => {
    it('lowers the volume step by step for 2 s, and only then pauses the clip', () => {
      renderGame();
      playTo(3000);
      const before = fake.calls.length;

      playTo(3850);
      // The wait has begun and the answer is open, but the music is still on.
      expect(option('let')).toBeInTheDocument();
      expect(count('pause')).toBe(0);

      finishFadeOut();
      expect(fake.calls.slice(before)).toEqual([...FADE_OUT_STEPS, 'pause']);
      expect(fake.getVolume()).toBe(0);
    });

    it('plays the clip again with a rising volume once the answer is right', () => {
      renderGame();
      playTo(3850);
      finishFadeOut();
      const before = fake.calls.length;

      fireEvent.click(option('let'));
      finishFadeIn();

      expect(fake.calls.slice(before)).toEqual(['play', ...FADE_IN_STEPS]);
      expect(fake.getVolume()).toBe(100);
    });

    it('turns the fade around when the answer comes before the pause: no pause, no play, up from where it was', () => {
      renderGame();
      playTo(3850);
      act(() => vi.advanceTimersByTime(1000));
      const level = fake.getVolume();
      expect(level).toBeGreaterThan(0);
      expect(level).toBeLessThan(100);
      const before = fake.calls.length;

      fireEvent.click(option('let'));
      finishFadeIn();
      // The pause that was coming never does.
      finishFadeOut();

      const after = fake.calls.slice(before);
      expect(after).not.toContain('pause');
      expect(after).not.toContain('play');
      const rising = volumesIn(after);
      expect(rising.length).toBeGreaterThan(1);
      expect(rising.every((volume, i) => volume > (rising[i - 1] ?? level))).toBe(true);
      expect(rising.at(-1)).toBe(100);
    });

    it('plays a line again from its start after a miss, with the volume rising', () => {
      renderGame();
      playTo(3850);
      finishFadeOut();
      const before = fake.calls.length;

      fireEvent.click(option('late'));
      finishFadeIn();

      expect(fake.calls.slice(before)).toEqual(['seek:0', 'play', ...FADE_IN_STEPS]);
    });

    it('on a device that ignores the volume, the music goes on for 2 s and pauses, with no volume step', () => {
      device.canSetVolume = false;
      renderGame();
      playTo(3850);

      act(() => vi.advanceTimersByTime(FADE_OUT_MS - 100));
      expect(count('pause')).toBe(0);
      act(() => vi.advanceTimersByTime(100));
      expect(count('pause')).toBe(1);

      fireEvent.click(option('let'));
      finishFadeIn();
      expect(fake.calls.at(-1)).toBe('play');
      expect(volumesIn(fake.calls)).toEqual([]);
    });

    it('on a device that ignores the volume, an answer before the 2 s are up cancels the pause', () => {
      device.canSetVolume = false;
      renderGame();
      playTo(3850);
      act(() => vi.advanceTimersByTime(FADE_OUT_MS / 2));
      const before = fake.calls.length;

      fireEvent.click(option('let'));
      finishFadeOut();

      // The clip never stopped, so there is nothing to play, and the pause that was coming never does.
      expect(fake.calls.slice(before)).toEqual([]);
    });

    it('Repetir verso while the music is going down plays the line again from its start: no pause, no play', () => {
      renderGame();
      playTo(3850);
      act(() => vi.advanceTimersByTime(1000));
      const level = fake.getVolume();
      expect(level).toBeGreaterThan(0);
      expect(level).toBeLessThan(100);
      const before = fake.calls.length;

      fireEvent.click(screen.getByRole('button', { name: 'Repetir verso' }));
      finishFadeIn();
      finishFadeOut();

      const after = fake.calls.slice(before);
      expect(after[0]).toBe('seek:0');
      expect(after).not.toContain('pause');
      expect(after).not.toContain('play');
      const rising = volumesIn(after);
      expect(rising[0]).toBeGreaterThan(level);
      expect(rising.at(-1)).toBe(100);
    });

    it('plays a clip the player paused during the fade when the answer comes, with the volume rising', () => {
      renderGame();
      playTo(3850);
      act(() => vi.advanceTimersByTime(1000));
      const level = fake.getVolume();
      // YouTube's own pause button, while the music was going down.
      act(() => fake.emitState('paused'));
      const before = fake.calls.length;

      fireEvent.click(option('let'));
      finishFadeIn();
      finishFadeOut();

      const after = fake.calls.slice(before);
      expect(after.filter((call) => call === 'play')).toHaveLength(1);
      expect(after).not.toContain('pause');
      expect(fake.getPlayerState()).toBe('playing');
      expect(volumesIn(after)[0]).toBeGreaterThan(level);
      expect(fake.getVolume()).toBe(100);
    });
  });

  describe('at a blank, with a player that stalls', () => {
    it('does not play a clip that is only buffering when the answer comes: it is still the music that rises', () => {
      renderGame();
      playTo(3850);
      act(() => vi.advanceTimersByTime(500));
      act(() => fake.emitState('buffering'));
      const before = fake.calls.length;

      fireEvent.click(option('let'));
      finishFadeIn();

      const after = fake.calls.slice(before);
      expect(after).not.toContain('play');
      expect(after).not.toContain('pause');
      expect(volumesIn(after).at(-1)).toBe(100);
    });
  });

  describe('a round that starts on a player an earlier round left muted', () => {
    it('brings the volume up from 0 as the round begins, and a round at full volume asks for no volume at all', () => {
      renderGame();
      playTo(3850);
      finishFadeOut();
      expect(fake.getVolume()).toBe(0);
      // The round is over, and "Jogar de novo" mounts the game again on the same player.
      cleanup();
      const before = fake.calls.length;

      renderGame();
      finishFadeIn();

      expect(fake.calls.slice(before)).toEqual(['seek:0', 'play', ...FADE_IN_STEPS]);
      expect(fake.getVolume()).toBe(100);

      cleanup();
      const full = fake.calls.length;
      renderGame();
      finishFadeIn();
      expect(fake.calls.slice(full)).toEqual(['seek:0', 'play']);
    });

    it('leaves a volume the player lowered itself alone: only a silent player is raised', () => {
      fake.setVolume(40);
      const before = fake.calls.length;

      renderGame();
      finishFadeIn();

      expect(fake.calls.slice(before)).toEqual(['seek:0', 'play']);
      expect(fake.getVolume()).toBe(40);
    });

    it('on a device that ignores the volume, starts with no volume call', () => {
      device.canSetVolume = false;
      fake.setVolume(0);
      const before = fake.calls.length;

      renderGame();
      finishFadeIn();

      expect(fake.calls.slice(before)).toEqual(['seek:0', 'play']);
    });
  });

  describe('the device', () => {
    it('is asked about the browser it runs in whether the volume can be set', () => {
      renderGame();

      expect(supportsVolume).toHaveBeenCalledWith(navigator);
    });

    it('is not touched by a fade that was still running when the game screen went away', () => {
      renderGame();
      playTo(3850);
      act(() => vi.advanceTimersByTime(500));
      const before = fake.calls.length;

      cleanup();
      act(() => vi.advanceTimersByTime(FADE_OUT_MS));

      expect(fake.calls.slice(before)).toEqual([]);
    });
  });

  describe('leaving the app', () => {
    afterEach(() => {
      setVisibility('visible');
    });

    it('pauses at once with no volume step, and a fade in progress never comes back', () => {
      renderGame();
      playTo(3850);
      act(() => vi.advanceTimersByTime(500));
      const before = fake.calls.length;

      setVisibility('hidden');
      expect(fake.calls.slice(before)).toEqual(['pause']);

      finishFadeOut();
      expect(fake.calls.slice(before)).toEqual(['pause']);
    });
  });

  describe('"Traduzir verso"', () => {
    function renderTranslating(over: Partial<GameScreenProps> = {}) {
      return renderGame({ requestHelp: helpService(), ...over });
    }

    function translate() {
      fireEvent.click(screen.getByRole('button', { name: 'Traduzir verso' }));
    }

    function continueButton() {
      return screen.queryByRole('button', { name: 'Continuar' });
    }

    it('fades the music out and pauses it, shows the translation and a "Continuar" button', async () => {
      renderTranslating();
      playTo(1000);
      const before = fake.calls.length;

      translate();
      await settleHelp();

      expect(screen.getByTestId('translation')).toHaveTextContent('Tradução 0');
      expect(continueButton()).toBeVisible();
      expect(count('pause')).toBe(0);

      finishFadeOut();
      expect(fake.calls.slice(before)).toEqual([...FADE_OUT_STEPS, 'pause']);
    });

    it('"Continuar" plays the clip from where it stopped, the volume rising, and goes away', async () => {
      fake = new SlowToStartPlayer(DURATION_MS);
      renderTranslating();
      act(() => fake.emitState('playing'));
      playTo(1000);
      translate();
      await settleHelp();
      finishFadeOut();
      const before = fake.calls.length;

      fireEvent.click(continueButton()!);
      finishFadeIn();

      expect(fake.calls.slice(before)).toEqual(['play', ...FADE_IN_STEPS]);
      expect(fake.getCurrentTimeMs()).toBe(1000);
      expect(continueButton()).not.toBeInTheDocument();
    });

    it('"Continuar" before the music is down turns the fade around: no pause, no play, up from where it was', async () => {
      renderTranslating();
      playTo(1000);
      translate();
      await settleHelp();
      act(() => vi.advanceTimersByTime(1000));
      const level = fake.getVolume();
      const before = fake.calls.length;

      fireEvent.click(continueButton()!);
      finishFadeIn();
      finishFadeOut();

      const after = fake.calls.slice(before);
      expect(after).not.toContain('pause');
      expect(after).not.toContain('play');
      expect(volumesIn(after)[0]).toBeGreaterThan(level);
      expect(fake.getVolume()).toBe(100);
      expect(continueButton()).not.toBeInTheDocument();
    });

    it('on a device that ignores the volume, pauses after 2 s and "Continuar" plays by the tap, with no volume step', async () => {
      device.canSetVolume = false;
      renderTranslating();
      playTo(1000);
      translate();
      await settleHelp();
      finishFadeOut();
      expect(fake.calls.at(-1)).toBe('pause');

      fireEvent.click(continueButton()!);
      finishFadeIn();

      expect(fake.calls.at(-1)).toBe('play');
      expect(volumesIn(fake.calls)).toEqual([]);
    });

    it('on a device that ignores the volume, "Continuar" before the 2 s are up cancels the pause', async () => {
      device.canSetVolume = false;
      renderTranslating();
      playTo(1000);
      translate();
      await settleHelp();
      act(() => vi.advanceTimersByTime(FADE_OUT_MS / 2));
      const before = fake.calls.length;

      fireEvent.click(continueButton()!);
      finishFadeOut();

      expect(fake.calls.slice(before)).toEqual([]);
      expect(continueButton()).not.toBeInTheDocument();
    });

    it('moves the focus to "Continuar", since the pill it was on goes away', async () => {
      renderTranslating();
      playTo(1000);
      expect(screen.getByRole('button', { name: 'Traduzir verso' })).not.toHaveFocus();

      translate();
      await settleHelp();

      expect(continueButton()).toHaveFocus();
    });

    it('translates and nothing else while the game waits for an answer, and answering still lets the music go', async () => {
      renderTranslating();
      playTo(3850);
      finishFadeOut();
      const before = fake.calls.length;

      translate();
      await settleHelp();

      expect(screen.getByTestId('translation')).toHaveTextContent('Tradução 0');
      expect(continueButton()).not.toBeInTheDocument();
      expect(fake.calls.slice(before)).toEqual([]);

      fireEvent.click(option('let'));
      finishFadeIn();
      expect(fake.calls.slice(before)).toEqual(['play', ...FADE_IN_STEPS]);
    });

    it('does not start the fade over when "Traduzir verso" is tapped again while the music is going down', async () => {
      const requestHelp = vi
        .fn<HelpRequester>()
        .mockRejectedValueOnce(new HelpError(503))
        .mockResolvedValueOnce('Tradução 0');
      renderTranslating({ requestHelp });
      playTo(1000);
      const before = fake.calls.length;
      translate();
      await settleHelp();
      act(() => vi.advanceTimersByTime(FADE_OUT_MS / 2));

      translate();
      await settleHelp();
      act(() => vi.advanceTimersByTime(FADE_OUT_MS / 2));

      expect(fake.calls.slice(before)).toEqual([...FADE_OUT_STEPS, 'pause']);
      expect(screen.getByTestId('translation')).toHaveTextContent('Tradução 0');
    });

    it('drops "Continuar" when DJ Bop’s sheet, opened over the translation, plays the music again on "Valeu"', async () => {
      fake = new SlowToStartPlayer(DURATION_MS);
      renderTranslating({ lines: TYPING_LINES, blanks: [GET] });
      act(() => fake.emitState('playing'));
      fireEvent.click(option('late'));
      playTo(1000);
      translate();
      await settleHelp();
      expect(continueButton()).toBeVisible();

      fireEvent.click(screen.getByRole('button', { name: 'Não entendi' }));
      await settleHelp();
      finishFadeOut();
      const sheetOpen = fake.calls.length;
      fireEvent.click(screen.getByRole('button', { name: 'Valeu' }));
      finishFadeIn();

      expect(continueButton()).not.toBeInTheDocument();
      expect(fake.calls.slice(sheetOpen)).toEqual(['play', ...FADE_IN_STEPS]);
      expect(fake.getVolume()).toBe(100);
    });

    it('leaves a clip the player had paused alone, and shows no "Continuar" for it', async () => {
      renderTranslating();
      playTo(1000);
      act(() => fake.emitState('paused'));
      const before = fake.calls.length;

      translate();
      await settleHelp();
      finishFadeOut();

      expect(screen.getByTestId('translation')).toBeInTheDocument();
      expect(continueButton()).not.toBeInTheDocument();
      expect(fake.calls.slice(before)).toEqual([]);
    });

    it('hands over to the wait when the line ends during the fade: one pause, no "Continuar", the answer lets go', async () => {
      renderTranslating();
      playTo(3000);
      const before = fake.calls.length;
      translate();
      await settleHelp();
      expect(continueButton()).toBeVisible();

      // The clip goes on for the fade and reaches the end of the line, where a blank waits for its answer.
      playTo(3850);
      expect(continueButton()).not.toBeInTheDocument();
      finishFadeOut();
      expect(fake.calls.slice(before).filter((call) => call === 'pause')).toHaveLength(1);
      expect(fake.calls.at(-1)).toBe('pause');
      const afterWait = fake.calls.length;

      fireEvent.click(option('let'));
      finishFadeIn();
      expect(fake.calls.slice(afterWait)).toEqual(['play', ...FADE_IN_STEPS]);
      expect(fake.getVolume()).toBe(100);
      expect(continueButton()).not.toBeInTheDocument();
    });

    it('lets the music go, and drops "Continuar", when a miss plays the line again', async () => {
      renderTranslating();
      playTo(1000);
      translate();
      await settleHelp();
      finishFadeOut();
      const before = fake.calls.length;

      fireEvent.click(option('late'));
      finishFadeIn();

      expect(fake.calls.slice(before)).toEqual(['seek:0', 'play', ...FADE_IN_STEPS]);
      expect(continueButton()).not.toBeInTheDocument();
    });

    it('keeps "Continuar" while the player reads, after a right answer that sends nothing to the clip', async () => {
      renderTranslating();
      playTo(1000);
      translate();
      await settleHelp();
      finishFadeOut();
      const before = fake.calls.length;

      fireEvent.click(option('let'));

      expect(fake.calls.slice(before)).toEqual([]);
      expect(continueButton()).toBeVisible();
    });

    it('drops "Continuar" and brings the volume back when the player presses play on its own', async () => {
      renderTranslating();
      playTo(1000);
      translate();
      await settleHelp();
      finishFadeOut();
      expect(fake.getVolume()).toBe(0);

      act(() => fake.emitState('playing'));
      finishFadeIn();

      expect(continueButton()).not.toBeInTheDocument();
      expect(fake.getVolume()).toBe(100);
    });
  });
});

describe('GameScreen: Escolha', () => {
  it('offers the answer and its two distractors, shuffled with the seed blank id + video id', () => {
    renderGame();

    const seed = `${LET.id}${ID}`;
    expect(makeDistractors).toHaveBeenCalledExactlyOnceWith('let', tokenize(LINES[0].text), seed);
    const group = screen.getByRole('group', { name: 'Escolha a palavra que falta' });
    const options = within(group).getAllByRole('button');
    expect(options.map((button) => button.textContent)).toEqual(shuffled(['let', 'late', 'lead'], seededRng(seed)));
  });

  it('turns the right option lime with a check, with no "Acertou" or "Errou" on screen', () => {
    renderGame();

    fireEvent.click(option('let'));

    const hit = option('let, acertou');
    expect(hit).toHaveClass('bg-lime');
    expect(hit.querySelector('[data-icon="check"]')).not.toBeNull();
    expect(document.body.textContent).not.toMatch(/acertou|errou/i);
  });

  it('turns a wrong option red and plays the line again from its start', () => {
    renderGame();
    playTo(3850);
    finishFadeOut();
    const before = fake.calls.length;

    fireEvent.click(option('late'));
    finishFadeIn();

    const miss = option('late, errou');
    expect(miss).toHaveClass('bg-error');
    expect(miss.querySelector('[data-icon="cross"]')).not.toBeNull();
    expect(document.body.textContent).not.toMatch(/acertou|errou/i);
    expect(fake.calls.slice(before)).toEqual(['seek:0', 'play', ...FADE_IN_STEPS]);
  });

  it('shows Dica with a dashed border; the free hint greys out one wrong option and the answer counts as helped', () => {
    const onEnd = renderGame();
    const hint = screen.getByRole('button', { name: 'Dica' });
    expect(hint).toHaveClass('border-dashed');

    fireEvent.click(hint);

    const greyed = [option('late'), option('lead')].filter((button) => button.hasAttribute('disabled'));
    expect(greyed).toHaveLength(1);
    expect(option('let')).toBeEnabled();
    // One hint per blank. The button stays in the tab order, so a keyboard user does not lose their place (as R58).
    expect(hint).toHaveAttribute('aria-disabled', 'true');
    expect(hint).toBeEnabled();
    fireEvent.click(hint);
    expect([option('late'), option('lead')].filter((button) => button.hasAttribute('disabled'))).toHaveLength(1);

    fireEvent.click(option('let'));
    act(() => fake.emitState('ended'));
    expect(onEnd.mock.calls[0][1]).toEqual([{ blankId: LET.id, kind: 'helped', correct: true, beforeLineEnd: true }]);
  });

  it('works the options out only for the blank in play, once per blank', () => {
    renderGame({ blanks: [LET, GAVE, FERRY] });
    expect(distractorsAskedFor()).toEqual(['let']);

    // Many clock readings, and the wait at the end of the line, ask for nothing new.
    playTo(3850);
    expect(distractorsAskedFor()).toEqual(['let']);

    fireEvent.click(option('let'));
    playTo(4500);
    expect(distractorsAskedFor()).toEqual(['let', 'gave']);
    expect(option('gave')).toBeEnabled();
  });
});

describe('GameScreen: Digitação', () => {
  afterEach(() => {
    vi.doUnmock('./DigitacaoArea');
    vi.resetModules();
  });

  it('keeps the room of the typing area while it loads, then shows the field in place of the options', async () => {
    await renderFreshGame();

    expect(screen.getByTestId('digitacao-loading')).toBeInTheDocument();
    expect(screen.queryByLabelText('Digite a palavra que falta')).not.toBeInTheDocument();

    await settleImports();

    expect(screen.queryByTestId('digitacao-loading')).not.toBeInTheDocument();
    expect(field()).toBeEnabled();
    expect(screen.queryByRole('group', { name: 'Escolha a palavra que falta' })).not.toBeInTheDocument();
    expect(screen.getByText('Modo Digitação')).toBeInTheDocument();
  });

  it('starts getting the typing area as soon as a typing round is up, before any blank is in play', async () => {
    const asked = vi.fn();
    vi.doMock('./DigitacaoArea', async (importOriginal) => {
      asked();
      return importOriginal();
    });

    await renderFreshGame({ blanks: [] });
    await settleImports();

    expect(asked).toHaveBeenCalledOnce();
    expect(screen.queryByLabelText('Digite a palavra que falta')).not.toBeInTheDocument();
  });

  it('does not ask for the typing area in the other modes', async () => {
    const asked = vi.fn();
    vi.doMock('./DigitacaoArea', async (importOriginal) => {
      asked();
      return importOriginal();
    });

    await renderFreshGame({ mode: 'escolha', lines: LINES, blanks: [LET] });
    await settleImports();

    expect(asked).not.toHaveBeenCalled();
  });

  it('forgives a typo: the lyric shows the word with the fixed letters marked, and the answer counts', async () => {
    const onEnd = await renderTyping();

    type('gte');

    const word = within(screen.getByTestId('line-current')).getByRole('button', {
      name: 'get, corrigido automaticamente',
    });
    expect(word).toHaveClass('bg-lime', 'text-bg');
    expect(word).toHaveTextContent('get');
    expect(fixedLettersIn(word)).toEqual(['e', 't']);
    // The typing area shows it too.
    expect(fieldBox()).toHaveClass('bg-lime');
    expect(fixedLettersIn(fieldBox())).toEqual(['e', 't']);
    expect(screen.getByText('x1')).toBeInTheDocument();
    expect(dj()).toHaveAttribute('data-expression', 'acertou');
    expect(playHit).toHaveBeenCalledExactlyOnceWith(1);

    act(() => fake.emitState('ended'));
    expect(onEnd.mock.calls[0][1]).toEqual([{ blankId: GET.id, kind: 'first', correct: true, beforeLineEnd: true }]);
  });

  it('shows an exact word in the lyric with a check and nothing marked', async () => {
    await renderTyping();

    type('Get');

    const word = within(screen.getByTestId('line-current')).getByRole('button', { name: 'get, acertou' });
    expect(word).toHaveClass('bg-lime');
    expect(word.querySelector('[data-icon="check"]')).not.toBeNull();
    expect(document.querySelector('[data-corrected]')).toBeNull();
  });

  it('turns a wrong word red and plays the line again from its start, keeping the blank hidden', async () => {
    const onEnd = await renderTyping();
    playTo(3850);
    finishFadeOut();
    const before = fake.calls.length;

    type('got');
    finishFadeIn();

    expect(fieldBox()).toHaveClass('bg-error');
    expect(fieldBox().querySelector('[data-icon="cross"]')).not.toBeNull();
    expect(fake.calls.slice(before)).toEqual(['seek:0', 'play', ...FADE_IN_STEPS]);
    expect(screen.getByTestId('line-current')).toHaveTextContent("Soon we'll lacuna there before the rain");
    expect(dj()).toHaveAttribute('data-expression', 'errou');
    expect(playMiss).toHaveBeenCalledOnce();

    // The same field takes the next try, and it counts as a retry.
    type('get');
    expect(fieldBox()).toHaveClass('bg-lime');
    act(() => fake.emitState('ended'));
    expect(onEnd.mock.calls[0][1]).toEqual([
      { blankId: GET.id, kind: 'first', correct: false, beforeLineEnd: true },
      { blankId: GET.id, kind: 'retry', correct: true, beforeLineEnd: true },
    ]);
  });

  it('after a miss, Dica empties the field and shows the first letter, and gives the focus back to it', async () => {
    const onEnd = await renderTyping();
    type('got');
    expect(fieldBox()).toHaveClass('bg-error');
    const hint = screen.getByRole('button', { name: 'Dica' });
    // The tap on the button takes the focus from the field.
    hint.focus();
    expect(field()).not.toHaveFocus();

    fireEvent.click(hint);

    expect(field()).toHaveValue('');
    expect(field()).toHaveAttribute('placeholder', 'g');
    expect(fieldBox()).not.toHaveClass('bg-error');
    expect(fieldBox().querySelector('[data-icon]')).toBeNull();
    expect(field()).toHaveFocus();

    // The next try counts as helped.
    type('get');
    act(() => fake.emitState('ended'));
    expect(onEnd.mock.calls[0][1]).toEqual([
      { blankId: GET.id, kind: 'first', correct: false, beforeLineEnd: true },
      { blankId: GET.id, kind: 'helped', correct: true, beforeLineEnd: true },
    ]);
  });

  it('shows the first letter in the field after Dica, and the answer counts as helped', async () => {
    const onEnd = await renderTyping();
    expect(field()).not.toHaveAttribute('placeholder');

    fireEvent.click(screen.getByRole('button', { name: 'Dica' }));
    expect(field()).toHaveAttribute('placeholder', 'g');
    expect(screen.getByRole('button', { name: 'Dica' })).toHaveAttribute('aria-disabled', 'true');

    type('get');
    act(() => fake.emitState('ended'));
    expect(onEnd.mock.calls[0][1]).toEqual([{ blankId: GET.id, kind: 'helped', correct: true, beforeLineEnd: true }]);
  });

  it('goes on to the next blank with a new field that has the focus, and brings a right one back as it was', async () => {
    await renderTyping({ blanks: [GET, KETTLE] });
    type('gte');
    expect(field()).toHaveFocus();

    playTo(4500);

    // A new question: an empty field, ready to type in.
    expect(screen.getByTestId('line-current')).toHaveTextContent('And the lacuna sings by candlelight');
    expect(field()).toHaveValue('');
    expect(field()).not.toHaveAttribute('readonly');
    expect(field()).toHaveFocus();

    // The player goes back to the line that was answered: it comes back right, with its marks.
    act(() => {
      fake.seekTo(1000);
      vi.advanceTimersByTime(100);
    });
    expect(screen.getByTestId('line-current')).toHaveTextContent("Soon we'll get there before the rain");
    expect(field()).toHaveValue('get');
    expect(field()).toHaveAttribute('readonly');
    expect(fieldBox()).toHaveClass('bg-lime');
    expect(fixedLettersIn(fieldBox())).toEqual(['e', 't']);
  });

  it('hides the blank of the line in play and works out no options', async () => {
    await renderTyping();

    expect(screen.getByTestId('line-current')).toHaveTextContent("Soon we'll lacuna there before the rain");
    expect(makeDistractors).not.toHaveBeenCalled();
  });
});

describe('GameScreen: the typing area cannot be loaded', () => {
  afterEach(() => {
    vi.doUnmock('./DigitacaoArea');
    vi.resetModules();
  });

  it('keeps the game going around a short line and "Tentar de novo", which brings the field back', async () => {
    // React logs a failure that an error boundary caught; this test makes the load fail on purpose.
    vi.spyOn(console, 'error').mockImplementation(() => {});
    let failing = true;
    vi.doMock('./DigitacaoArea', async (importOriginal) => {
      if (failing) throw new Error('Failed to fetch dynamically imported module');
      return importOriginal();
    });
    const destroy = vi.spyOn(fake, 'destroy');

    await renderFreshGame();
    await settleImports();

    expect(screen.getByRole('alert')).toHaveTextContent('O campo de digitar não carregou.');
    expect(screen.queryByLabelText('Digite a palavra que falta')).not.toBeInTheDocument();
    // The player, the header, the lyrics and the tools are all still there, and work.
    expect(screen.getByText('Neon Harbor · The Paper Lanterns')).toBeInTheDocument();
    expect(screen.getByTestId('line-current')).toHaveTextContent("Soon we'll lacuna there before the rain");
    const before = fake.calls.length;
    fireEvent.click(screen.getByRole('button', { name: 'Repetir verso' }));
    expect(fake.calls.slice(before)).toEqual(['seek:0', 'play']);
    expect(destroy).not.toHaveBeenCalled();

    failing = false;
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    await settleImports(() => screen.queryByLabelText('Digite a palavra que falta') !== null);

    expect(field()).toBeEnabled();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByText('Neon Harbor · The Paper Lanterns')).toBeInTheDocument();
  });
});

describe('GameScreen: Monte o verso', () => {
  it('shows the tiles of the line in play in the order the song seed gives, and the line itself nowhere', () => {
    renderBuild({ blanks: [WHOLE_0, WHOLE_1] });

    expect(allTiles().map((button) => button.textContent)).toEqual(makeTiles(BUILD_WORDS, tileSeed(ID, 0)));
    expect(screen.getByText('Modo Monte o verso')).toBeInTheDocument();
    // The answer area holds the line in play (ruling R59): the panel draws neither it nor the line after it, which
    // is a puzzle too, so no words of either are given away.
    expect(screen.queryByTestId('line-current')).not.toBeInTheDocument();
    expect(screen.queryByTestId('line-next')).not.toBeInTheDocument();
    expect(visibleText()).not.toContain('Please come back home tonight');
    expect(visibleText()).not.toMatch(/hang your lantern|lantern by/i);
    expect(makeDistractors).not.toHaveBeenCalled();
  });

  it('lays the line in play out once: the line before, "Traduzir verso", the row, the tiles, "Não entendi a ordem"', () => {
    renderBuild({ blanks: [WHOLE_0, WHOLE_1] });
    placeWords(BUILD_WORDS);
    playTo(4500);
    // A miss, so the line has an answer and "Não entendi a ordem" is there (ruling R65).
    fireEvent.click(tile('gate'));

    expect(
      inOrder(
        screen.getByTestId('line-previous'),
        screen.getByRole('button', { name: 'Traduzir verso' }),
        screen.getByTestId('montar-row'),
        screen.getByRole('group', { name: 'Coloque as palavras na ordem' }),
        screen.getByRole('button', { name: 'Não entendi a ordem' }),
      ),
    ).toBeTruthy();
  });

  it('puts a right tile in the row with no sound, no reaction and no answer yet', () => {
    const onEnd = renderBuild();

    fireEvent.click(tile('Please'));

    expect(placedRow()).toEqual(['Please']);
    expect(isBlocked(tile('Please'))).toBe(true);
    expect(playHit).not.toHaveBeenCalled();
    expect(playMiss).not.toHaveBeenCalled();
    expect(dj()).toHaveAttribute('data-expression', 'idle');
    expect(screen.getByText('x0')).toBeInTheDocument();
    act(() => fake.emitState('ended'));
    // The clip ran out with the line still open, so the game waits for it.
    expect(onEnd).not.toHaveBeenCalled();
  });

  it('keeps the focus on the tile that was tapped after a right tap (ruling R58)', () => {
    renderBuild();
    const tapped = tile('Please');
    tapped.focus();

    fireEvent.click(tapped);

    expect(placedRow()).toEqual(['Please']);
    expect(tile('Please')).toBe(tapped);
    expect(tapped).toHaveFocus();
    expect(isBlocked(tapped)).toBe(true);
  });

  it('settles the line as right when the row is full: hit sound, DJ Bop, and the row turned lime with a check', () => {
    const onEnd = renderBuild();

    placeWords(BUILD_WORDS);

    expect(playHit).toHaveBeenCalledExactlyOnceWith(1);
    expect(playMiss).not.toHaveBeenCalled();
    expect(dj()).toHaveAttribute('data-expression', 'acertou');
    expect(screen.getByText('x1')).toBeInTheDocument();
    // The row is lime with a check, and no tile takes another tap.
    const solvedRow = screen.getByTestId('montar-row');
    expect(solvedRow).toHaveClass('border-lime');
    expect(solvedRow.querySelector('[data-icon="check"]')).not.toBeNull();
    for (const button of allTiles()) expect(isBlocked(button)).toBe(true);
    expect(screen.getByRole('status')).toHaveTextContent('Please come back home tonight, acertou');
    expect(visibleText()).not.toMatch(/acertou|errou/i);

    act(() => fake.emitState('ended'));
    expect(onEnd.mock.calls[0][1]).toEqual([{ blankId: WHOLE_0.id, kind: 'first', correct: true, beforeLineEnd: true }]);
  });

  it('changes nothing in the lyrics when the line is solved, so nothing jumps', () => {
    renderBuild({ blanks: [WHOLE_0, WHOLE_1] });
    placeWords(BUILD_WORDS);
    playTo(4500);
    const panel = () => screen.getByTestId('line-previous').parentElement!;
    const before = panel().innerHTML;

    placeWords(tokenize(BUILD_LINES[1].text));

    expect(screen.getByTestId('montar-row')).toHaveClass('border-lime');
    expect(panel().innerHTML).toBe(before);
  });

  it('marks the line wrong when a tile is not the next word, clears the row, and plays the line again', () => {
    const onEnd = renderBuild();
    playTo(3850);
    finishFadeOut();
    placeWords(['Please', 'come']);
    expect(placedRow()).toEqual(['Please', 'come']);
    const before = fake.calls.length;

    // "back" comes next, not "tonight".
    fireEvent.click(tile('tonight'));
    finishFadeIn();

    expect(placedRow()).toEqual([]);
    const miss = tile('tonight, errou');
    expect(miss).toHaveClass('bg-error');
    expect(miss.querySelector('[data-icon="cross"]')).not.toBeNull();
    expect(screen.getByRole('status')).toHaveTextContent('tonight, errou');
    expect(visibleText()).not.toMatch(/acertou|errou/i);
    expect(fake.calls.slice(before)).toEqual(['seek:0', 'play', ...FADE_IN_STEPS]);
    expect(playMiss).toHaveBeenCalledOnce();
    expect(playHit).not.toHaveBeenCalled();
    expect(dj()).toHaveAttribute('data-expression', 'errou');
    expect(screen.getByText('x0')).toBeInTheDocument();
    // Every tile is free again, and the line stays hidden.
    expect(isBlocked(tile('Please'))).toBe(false);
    expect(screen.queryByTestId('line-current')).not.toBeInTheDocument();
    expect(visibleText()).not.toContain('Please come back home tonight');

    // The next try counts as a retry.
    placeWords(BUILD_WORDS);
    act(() => fake.emitState('ended'));
    expect(onEnd.mock.calls[0][1]).toEqual([
      { blankId: WHOLE_0.id, kind: 'first', correct: false, beforeLineEnd: true },
      { blankId: WHOLE_0.id, kind: 'retry', correct: true, beforeLineEnd: true },
    ]);
  });

  it('never shows a "Não entendi" pill for a puzzle line, after a miss or once it is right', () => {
    const pill = () => screen.queryByRole('button', { name: 'Não entendi' });
    renderBuild();
    expect(pill()).not.toBeInTheDocument();

    fireEvent.click(tile('tonight'));
    // Anywhere on the screen, not only in the lyrics: it would explain the hidden line.
    expect(pill()).not.toBeInTheDocument();

    placeWords(BUILD_WORDS);
    expect(pill()).not.toBeInTheDocument();
    // What the player has for the order is the area's own button.
    expect(screen.getByRole('button', { name: 'Não entendi a ordem' })).toBeInTheDocument();
  });

  it('Dica places the next right tile by itself, and the answer counts as helped', () => {
    const onEnd = renderBuild();
    const hint = screen.getByRole('button', { name: 'Dica' });

    fireEvent.click(hint);

    expect(placedRow()).toEqual(['Please']);
    expect(isBlocked(tile('Please'))).toBe(true);
    // One hint per line, and the tile it placed makes no sound.
    expect(hint).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(hint);
    expect(placedRow()).toEqual(['Please']);
    expect(playHit).not.toHaveBeenCalled();

    placeWords(BUILD_WORDS.slice(1));
    act(() => fake.emitState('ended'));
    expect(onEnd.mock.calls[0][1]).toEqual([{ blankId: WHOLE_0.id, kind: 'helped', correct: true, beforeLineEnd: true }]);
  });

  it('Dica after a miss takes the red cross off the tile and places the next tile', () => {
    renderBuild();
    fireEvent.click(tile('tonight'));
    expect(tile('tonight, errou')).toHaveClass('bg-error');

    fireEvent.click(screen.getByRole('button', { name: 'Dica' }));

    expect(screen.queryByRole('button', { name: /errou/ })).not.toBeInTheDocument();
    expect(placedRow()).toEqual(['Please']);
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
  });

  it('Dica on the last word finishes the line, with the sound and DJ Bop of a line that is right', () => {
    renderBuild();
    placeWords(BUILD_WORDS.slice(0, -1));
    expect(playHit).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Dica' }));

    expect(placedRow()).toEqual(BUILD_WORDS);
    expect(playHit).toHaveBeenCalledOnce();
    expect(dj()).toHaveAttribute('data-expression', 'acertou');
  });

  it('plays no sound at all while "Sons" is off', () => {
    saveSettings(localStorage, { ...DEFAULT_SETTINGS, sounds: false });
    renderBuild();

    fireEvent.click(tile('tonight'));
    placeWords(BUILD_WORDS);

    expect(playMiss).not.toHaveBeenCalled();
    expect(playHit).not.toHaveBeenCalled();
    expect(dj()).toHaveAttribute('data-expression', 'acertou');
  });

  it('"Repetir verso" plays the line again and keeps the row that was partly built', () => {
    renderBuild();
    placeWords(['Please', 'come']);

    fireEvent.click(screen.getByRole('button', { name: 'Repetir verso' }));

    expect(fake.calls.slice(-2)).toEqual(['seek:0', 'play']);
    expect(placedRow()).toEqual(['Please', 'come']);
    expect(isBlocked(tile('come'))).toBe(true);
    expect(isBlocked(tile('back'))).toBe(false);
  });

  describe('with "Repetir sozinho depois de errar" off', () => {
    beforeEach(() => {
      saveSettings(localStorage, { ...DEFAULT_SETTINGS, autoRepeatOnMiss: false });
    });

    it('lets the line pass after a miss, keeps it hidden, and the line can still be retried while it is in play', () => {
      const onEnd = renderBuild();
      playTo(3850);
      finishFadeOut();
      const before = fake.calls.length;

      fireEvent.click(tile('tonight'));
      finishFadeIn();

      // The clip plays on: it does not go back to the start of the line.
      expect(fake.calls.slice(before)).toEqual(['play', ...FADE_IN_STEPS]);
      expect(placedRow()).toEqual([]);
      expect(screen.queryByTestId('line-current')).not.toBeInTheDocument();
      expect(visibleText()).not.toContain('Please come back home tonight');

      // The line is still the one in play, so its tiles still answer it.
      expect(isBlocked(tile('Please'))).toBe(false);
      placeWords(BUILD_WORDS);
      expect(screen.getByTestId('montar-row')).toHaveClass('border-lime');
      act(() => fake.emitState('ended'));
      expect(onEnd.mock.calls[0][1]).toEqual([
        { blankId: WHOLE_0.id, kind: 'first', correct: false, beforeLineEnd: true },
        { blankId: WHOLE_0.id, kind: 'retry', correct: true, beforeLineEnd: true },
      ]);
    });

    it('keeps a line that was missed hidden once the song has moved on to the next one', () => {
      renderBuild({ blanks: [WHOLE_0, WHOLE_1] });
      playTo(3850);
      fireEvent.click(tile('tonight'));

      playTo(4500);

      // The next line is the one in play now, and the missed one is only the line before, as a hidden bar.
      expect(allTiles().map((button) => button.textContent)).toEqual(
        makeTiles(tokenize(BUILD_LINES[1].text), tileSeed(ID, 1)),
      );
      expect(screen.getByTestId('line-previous')).toHaveTextContent('verso escondido');
      expect(visibleText()).not.toContain('Please come back home tonight');
    });
  });

  it('gives tiles with no punctuation for a line with punctuation and curly apostrophes, and shows it as written once right', () => {
    renderGame({ mode: 'montar', lines: PUNCT_LINES, blanks: [PUNCT_BLANK, WHOLE_1] });
    const words = tokenize(PUNCT_LINES[0].text);
    expect(words).toEqual(["It's", 'late', 'so', "don't", 'wait', 'up', 'please']);

    const shown = allTiles().map((button) => button.textContent ?? '');
    expect([...shown].sort()).toEqual([...words].sort());
    for (const word of shown) expect(word).toMatch(/^[\p{L}']+$/u);

    placeWords(words);
    expect(playHit).toHaveBeenCalledOnce();
    playTo(4500);

    expect(screen.getByTestId('line-previous')).toHaveTextContent('It’s late, so don’t wait up (please)!');
  });

  it('moves on to the next line with a new row and its own tiles, and brings a solved line back as it was', () => {
    renderBuild({ blanks: [WHOLE_0, WHOLE_1] });
    placeWords(BUILD_WORDS);

    playTo(4500);

    expect(placedRow()).toEqual([]);
    // The line that was solved is the line before now, shown as plain text.
    expect(screen.getByTestId('line-previous')).toHaveTextContent('Please come back home tonight');
    expect(screen.queryByTestId('line-current')).not.toBeInTheDocument();
    expect(allTiles().map((button) => button.textContent)).toEqual(
      makeTiles(tokenize(BUILD_LINES[1].text), tileSeed(ID, 1)),
    );

    // Back on the first line: it is still right.
    act(() => {
      fake.seekTo(1000);
      vi.advanceTimersByTime(100);
    });
    expect(placedRow()).toEqual(BUILD_WORDS);
    expect(screen.getByTestId('montar-row')).toHaveClass('border-lime');
  });
});

describe('GameScreen: one blank in play', () => {
  const TWO_BLANK_LINES: LyricLine[] = [{ ...LINES[0], text: "Grandpa won't let geese drive, I'm asking nicely" }, LINES[1], LINES[2]];
  const A: Blank = { id: '0:2', lineIndex: 0, tokenIndex: 2, answer: 'let' };
  const B: Blank = { id: '0:6', lineIndex: 0, tokenIndex: 6, answer: 'asking' };

  /** The blank slots of the line in play, in order. */
  function slots() {
    return within(screen.getByTestId('line-current'))
      .getAllByText('lacuna')
      .map((label) => label.parentElement!);
  }

  it('moves the "sua vez" slot and the options together to the next blank after a miss with auto-repeat off', () => {
    saveSettings(localStorage, { ...DEFAULT_SETTINGS, autoRepeatOnMiss: false });
    renderGame({ lines: TWO_BLANK_LINES, blanks: [A, B] });
    expect(option('let')).toBeInTheDocument();
    expect(slots()[0]).not.toHaveClass('border-dashed');
    expect(slots()[1]).toHaveClass('border-dashed');

    fireEvent.click(option('late'));

    expect(option('asking')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'late, errou' })).not.toBeInTheDocument();
    // The missed one is marked as missed, in red with ✕; the next one is the open "sua vez" slot.
    const missed = within(screen.getByTestId('line-current')).getByText('lacuna, errou').parentElement!;
    expect(missed).toHaveClass('bg-error');
    const [slotB] = slots();
    expect(slots()).toHaveLength(1);
    expect(slotB).not.toHaveClass('border-dashed');
    expect(slotB).toHaveClass('border-lime', 'bg-card');
  });
});

describe('GameScreen: the screen follows the clock the game accepted', () => {
  /** A player that still reports the middle of the song on the first read after the game's opening seek. */
  class StalePlayer extends FakePlayerAdapter {
    private staleRead = false;

    override seekTo(ms: number): void {
      super.seekTo(ms);
      this.staleRead = true;
    }

    override getCurrentTimeMs(): number {
      if (!this.staleRead) return super.getCurrentTimeMs();
      this.staleRead = false;
      return 60000;
    }
  }

  it('never shows a line from a stale reading, nor works out options for a blank that is not in play', () => {
    fake = new StalePlayer(DURATION_MS);
    renderGame({ blanks: [LET, GAVE, FERRY] });

    expect(screen.getByTestId('line-current')).toHaveTextContent("Grandpa won't lacuna geese drive");
    expect(distractorsAskedFor()).toEqual(['let']);
    // The bar shows where the game is, not the stale reading.
    expect(screen.getByTestId('progress').style.width).toBe('0%');
  });
});

describe('GameScreen: the clock right after a seek (ruling R44)', () => {
  it('ignores the clock for 300 ms after Repetir verso, so a stale reading does not pause the line again', () => {
    renderGame();
    playTo(3850);
    finishFadeOut();
    expect(count('pause')).toBe(1);

    const before = fake.calls.length;
    fireEvent.click(screen.getByRole('button', { name: 'Repetir verso' }));
    expect(fake.calls.slice(-2)).toEqual(['seek:0', 'play']);

    // YouTube can go on reporting where the clip was for a moment after a seek.
    act(() => {
      fake.advance(3900);
      vi.advanceTimersByTime(100);
    });
    act(() => {
      fake.advance(10);
      vi.advanceTimersByTime(100);
    });
    // No wait began from it: the music is only rising (a wait would bring it down), and the clip was not paused again.
    act(() => vi.advanceTimersByTime(DEFAULT_STEP_MS));
    const rising = volumesIn(fake.calls.slice(before));
    expect(rising.length).toBeGreaterThan(0);
    expect(rising.every((volume, i) => volume > (rising[i - 1] ?? -1))).toBe(true);
    expect(count('pause')).toBe(1);

    // From 300 ms on, the clock counts again.
    act(() => {
      fake.advance(10);
      vi.advanceTimersByTime(100);
    });
    finishFadeOut();
    expect(count('pause')).toBe(2);
  });

  it('ignores the clock for 300 ms after the replay that follows a miss', () => {
    renderGame();
    playTo(3700);

    fireEvent.click(option('late'));
    expect(fake.calls.slice(-2)).toEqual(['seek:0', 'play']);

    act(() => {
      fake.advance(3900);
      vi.advanceTimersByTime(100);
    });
    // A wait would have started a fade-out, whose first step comes within 50 ms.
    act(() => vi.advanceTimersByTime(DEFAULT_STEP_MS));
    expect(volumesIn(fake.calls)).toEqual([]);
    expect(count('pause')).toBe(0);
  });
});

describe('GameScreen: the end', () => {
  it('calls onEnd once with the summary and the answers after the clip has ended', () => {
    const onEnd = renderGame();
    fireEvent.click(option('let'));
    expect(onEnd).not.toHaveBeenCalled();

    act(() => fake.emitState('ended'));
    act(() => fake.emitState('ended'));

    expect(onEnd).toHaveBeenCalledExactlyOnceWith(
      { totalBlanks: 1, firstTryCorrect: 1, pct: 100, maxCombo: 1, xp: 12 },
      [{ blankId: LET.id, kind: 'first', correct: true, beforeLineEnd: true }],
    );
  });

  it('when the clip ends with a blank still open, waits for its answer before ending', () => {
    const onEnd = renderGame();

    act(() => fake.emitState('ended'));
    expect(onEnd).not.toHaveBeenCalled();

    fireEvent.click(option('let'));
    expect(onEnd).toHaveBeenCalledOnce();
  });
});

describe('GameScreen: DJ Bop', () => {
  it('cheers for 1 s after a right answer', () => {
    renderGame();

    fireEvent.click(option('let'));
    expect(dj()).toHaveAttribute('data-expression', 'acertou');

    act(() => vi.advanceTimersByTime(999));
    expect(dj()).toHaveAttribute('data-expression', 'acertou');
    act(() => vi.advanceTimersByTime(1));
    expect(dj()).toHaveAttribute('data-expression', 'idle');
  });

  it('makes his oops face for 1 s after a wrong answer', () => {
    renderGame();

    fireEvent.click(option('late'));
    expect(dj()).toHaveAttribute('data-expression', 'errou');

    act(() => vi.advanceTimersByTime(1000));
    expect(dj()).toHaveAttribute('data-expression', 'idle');
  });

  it('counts the combo up in the chip and shows his combo face when it reaches 5', () => {
    renderGame({ lines: ROUND, blanks: ROUND_BLANKS });

    for (const line of ROUND) {
      playTo(line.startMs + 500);
      fireEvent.click(option('let'));
      expect(screen.getByText(`x${line.index + 1}`)).toBeInTheDocument();
      expect(dj()).toHaveAttribute('data-expression', line.index === 4 ? 'combo' : 'acertou');
    }
  });
});

describe('GameScreen: sounds', () => {
  it('plays the hit sound with the combo and the miss sound while "Sons" is on', () => {
    renderGame({ blanks: [LET, GAVE] });

    fireEvent.click(option('let'));
    expect(playHit).toHaveBeenCalledExactlyOnceWith(1);

    playTo(4500);
    fireEvent.click(option('late'));
    expect(playMiss).toHaveBeenCalledOnce();
  });

  it('makes no sound at all while "Sons" is off', () => {
    saveSettings(localStorage, { ...DEFAULT_SETTINGS, sounds: false });
    renderGame({ blanks: [LET, GAVE] });

    fireEvent.click(option('let'));
    playTo(4500);
    fireEvent.click(option('late'));

    expect(playHit).not.toHaveBeenCalled();
    expect(playMiss).not.toHaveBeenCalled();
  });

  it('goes quiet as soon as "Sons" is switched off in the settings', () => {
    renderGame();
    openSettings();
    fireEvent.click(setting('Sons'));
    fireEvent.click(screen.getByRole('button', { name: 'Pronto' }));

    fireEvent.click(option('late'));
    fireEvent.click(option('let'));

    expect(playHit).not.toHaveBeenCalled();
    expect(playMiss).not.toHaveBeenCalled();
  });
});

describe('GameScreen: settings', () => {
  it('opens from the gear with the three switches, at their defaults', () => {
    renderGame();

    openSettings();

    expect(setting('Mostrar tradução sempre')).toHaveAttribute('aria-checked', 'false');
    expect(setting('Repetir sozinho depois de errar')).toHaveAttribute('aria-checked', 'true');
    expect(setting('Sons')).toHaveAttribute('aria-checked', 'true');
  });

  it('shows the saved settings', () => {
    saveSettings(localStorage, { alwaysShowTranslation: true, autoRepeatOnMiss: false, sounds: false });
    renderGame();

    openSettings();

    expect(setting('Mostrar tradução sempre')).toHaveAttribute('aria-checked', 'true');
    expect(setting('Repetir sozinho depois de errar')).toHaveAttribute('aria-checked', 'false');
    expect(setting('Sons')).toHaveAttribute('aria-checked', 'false');
  });

  it('saves a change; with "Repetir sozinho depois de errar" off, a miss plays on instead of going back', () => {
    renderGame();
    openSettings();

    fireEvent.click(setting('Repetir sozinho depois de errar'));
    expect(setting('Repetir sozinho depois de errar')).toHaveAttribute('aria-checked', 'false');
    expect(loadSettings(localStorage)).toEqual({ ...DEFAULT_SETTINGS, autoRepeatOnMiss: false });

    fireEvent.click(screen.getByRole('button', { name: 'Pronto' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Configurações' })).toHaveFocus();

    playTo(3850);
    finishFadeOut();
    const before = fake.calls.length;
    fireEvent.click(option('late'));
    finishFadeIn();
    expect(fake.calls.slice(before)).toEqual(['play', ...FADE_IN_STEPS]);
  });

  it('stands in for the game area instead of covering the player, and gives the game back as it was', () => {
    renderGame();
    fireEvent.click(option('late'));

    const sheet = openSettings();

    // In the page flow: neither the sheet nor anything around it floats over the page.
    expect(sheet.closest('.fixed, .absolute')).toBeNull();
    expect(screen.queryByRole('group', { name: 'Escolha a palavra que falta' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Pronto' }));
    expect(option('late, errou')).toBeVisible();
  });

  it('closes with Escape', () => {
    renderGame();
    const sheet = openSettings();

    fireEvent.keyDown(sheet, { key: 'Escape' });

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('plays on with the defaults when the browser refuses its storage', () => {
    vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => {
      throw new DOMException('The operation is insecure.', 'SecurityError');
    });
    renderGame();

    openSettings();
    fireEvent.click(setting('Sons'));

    expect(setting('Sons')).toHaveAttribute('aria-checked', 'false');
    expect(setting('Repetir sozinho depois de errar')).toHaveAttribute('aria-checked', 'true');
  });
});

describe('GameScreen: lyrics', () => {
  it('shows the line in play in Space Grotesk with its blank, and the line after it muted, its blank hidden', () => {
    renderGame({ blanks: [LET, GAVE] });

    const current = screen.getByTestId('line-current');
    expect(current).toHaveClass('font-heading');
    expect(current).toHaveTextContent("Grandpa won't lacuna geese drive");
    const next = screen.getByTestId('line-next');
    expect(next).toHaveClass('text-muted');
    expect(next).toHaveTextContent('She lacuna each kite a name');
    expect(screen.queryByTestId('line-previous')).not.toBeInTheDocument();
  });

  it('moves on with the clip, and shows a blank that is right with its word', () => {
    renderGame({ blanks: [LET, GAVE] });
    fireEvent.click(option('let'));

    playTo(4500);

    expect(screen.getByTestId('line-previous')).toHaveTextContent("Grandpa won't let geese drive");
    expect(screen.getByTestId('line-previous')).toHaveClass('text-muted');
    expect(screen.getByTestId('line-current')).toHaveTextContent('She lacuna each kite a name');
    expect(screen.getByTestId('line-next')).toHaveTextContent('Then every ferry horn sings across the bay');
  });

  it('hides the translation and shows "Traduzir verso" while "Mostrar tradução sempre" is off', () => {
    saveSettings(localStorage, { ...DEFAULT_SETTINGS, alwaysShowTranslation: false });
    renderGame();

    expect(screen.getByRole('button', { name: 'Traduzir verso' })).toBeVisible();
    expect(screen.queryByTestId('translation')).not.toBeInTheDocument();
  });

  it('shows "Não entendi" once the blank in play has an answer', () => {
    renderGame();
    expect(screen.queryByRole('button', { name: 'Não entendi' })).not.toBeInTheDocument();

    fireEvent.click(option('late'));

    expect(screen.getByRole('button', { name: 'Não entendi' })).toBeInTheDocument();
  });

  it.each(['escolha', 'digitacao'] as const)(
    'in %s, keeps the words of the line in play from being tapped until its blank has an answer (ruling R83)',
    (mode) => {
      renderGame({ mode, lines: TYPING_LINES, blanks: [GET] });

      expect(within(screen.getByTestId('line-current')).queryAllByRole('button')).toHaveLength(0);
      expect(screen.queryByRole('button', { name: 'Não entendi' })).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Traduzir verso' })).toBeInTheDocument();
    },
  );

  it('lets the words of the line in play be tapped once its blank has an answer', () => {
    renderGame({ lines: TYPING_LINES, blanks: [GET] });

    fireEvent.click(option('late'));

    expect(within(screen.getByTestId('line-current')).getByRole('button', { name: 'rain' })).toBeInTheDocument();
  });
});

/**
 * A help service that answers every ask at once: "Tradução <line>" for a translation, "Explicação de <target>" for an
 * explanation ("Explicação de tudo" for the whole line).
 */
function helpService() {
  return vi.fn<HelpRequester>(async (r: HelpRequest) =>
    r.kind === 'translate' ? `Tradução ${r.lineIndex}` : `Explicação de ${r.target || 'tudo'}`,
  );
}

/** Lets the answers of the help service come in. */
async function settleHelp() {
  await act(async () => {});
}

function helpSheet() {
  return screen.getByRole('dialog', { name: 'Explicação do DJ Bop' });
}

/** A player whose pause is not reported back at once, as YouTube's may not be: the game still sees it playing. */
class SlowToReportPlayer extends FakePlayerAdapter {
  override pause(): void {
    this.calls.push('pause');
  }
}

/**
 * A player whose play is not reported back at once, as YouTube's may not be: the game goes on seeing it stopped, so
 * nothing in the test but the game's own command can tell the screen that the music is back.
 */
class SlowToStartPlayer extends FakePlayerAdapter {
  override play(): void {
    this.calls.push('play');
  }
}

describe('GameScreen: help with a line', () => {
  /** The typing lines, in Escolha, with "get" blanked. */
  function renderHelped(over: Partial<GameScreenProps> = {}) {
    const requestHelp = helpService();
    const onEnd = renderGame({ lines: TYPING_LINES, blanks: [GET], requestHelp, ...over });
    return { requestHelp, onEnd };
  }

  /** The word of the line in play, as a button. */
  function word(name: string) {
    return within(screen.getByTestId('line-current')).getByRole('button', { name });
  }

  /** A first answer, a wrong one: help opens on the line only once its blank has had one (ruling R83). */
  function answerFirst() {
    fireEvent.click(option('late'));
  }

  describe('"Não entendi" and a tapped word', () => {
    it('opens DJ Bop’s explanation of the blank word in place of the game, asking for it with its line', async () => {
      const { requestHelp } = renderHelped();
      fireEvent.click(option('late'));

      fireEvent.click(screen.getByRole('button', { name: 'Não entendi' }));
      await settleHelp();

      expect(within(helpSheet()).getByRole('heading', { name: 'get' })).toBeInTheDocument();
      expect(within(helpSheet()).getByText('Explicação de get')).toHaveAttribute('lang', 'pt-BR');
      expect(within(helpSheet()).getByRole('img', { name: 'DJ Bop' })).toBeInTheDocument();
      expect(requestHelp).toHaveBeenCalledExactlyOnceWith({
        youtubeId: ID,
        lyricsRef: '777',
        lineIndex: 0,
        lineText: TYPING_LINES[0].text,
        kind: 'explain',
        target: 'get',
      });
      // It stands in for the game area, which is only hidden.
      expect(screen.getByTestId('line-current')).not.toBeVisible();
      expect(screen.queryByRole('group', { name: 'Escolha a palavra que falta' })).not.toBeInTheDocument();
    });

    it('explains a word of the line in play that was tapped', async () => {
      const { requestHelp } = renderHelped();
      answerFirst();

      fireEvent.click(word('rain'));
      await settleHelp();

      expect(within(helpSheet()).getByText('Explicação de rain')).toBeInTheDocument();
      expect(requestHelp).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ lineIndex: 0, target: 'rain' }));
    });

    it('"Valeu" closes it, shows the game again and gives the focus back to what opened it', async () => {
      renderHelped();
      fireEvent.click(option('late'));
      // Not focused first: Safari gives a tapped button no focus, and the focus must still come back to it.
      const pill = screen.getByRole('button', { name: 'Não entendi' });
      expect(pill).not.toHaveFocus();
      fireEvent.click(pill);
      await settleHelp();

      fireEvent.click(screen.getByRole('button', { name: 'Valeu' }));

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(screen.getByTestId('line-current')).toBeVisible();
      expect(screen.getByRole('button', { name: 'Não entendi' })).toHaveFocus();
    });

    it('asks only once for the same help, however often the sheet is opened', async () => {
      const { requestHelp } = renderHelped();
      answerFirst();

      for (let i = 0; i < 2; i++) {
        fireEvent.click(word('rain'));
        await settleHelp();
        fireEvent.click(screen.getByRole('button', { name: 'Valeu' }));
      }

      expect(requestHelp).toHaveBeenCalledOnce();
    });

    it('gives a calm line in place of the explanation when the member asked too much, and never a status', async () => {
      renderHelped({ requestHelp: vi.fn<HelpRequester>(() => Promise.reject(new HelpError(429))) });
      answerFirst();

      fireEvent.click(word('rain'));
      await settleHelp();

      expect(within(helpSheet()).getByRole('status')).toHaveTextContent('Pausa rapidinha! Volta daqui a pouco?');
      expect(helpSheet()).not.toHaveTextContent(/429/);
    });
  });

  describe('the clip while the sheet is open (ruling R70)', () => {
    it('closes on Escape too, playing the clip again and giving the focus back', async () => {
      renderHelped();
      answerFirst();
      playTo(1000);
      const before = fake.calls.length;

      fireEvent.click(word('rain'));
      await settleHelp();
      finishFadeOut();
      fireEvent.keyDown(helpSheet(), { key: 'Escape' });
      finishFadeIn();

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(fake.calls.slice(before)).toEqual([...FADE_OUT_STEPS, 'pause', 'play', ...FADE_IN_STEPS]);
      expect(word('rain')).toHaveFocus();
    });

    it('pauses a clip that plays, and plays it again on "Valeu"', async () => {
      renderHelped();
      answerFirst();
      playTo(1000);
      const before = fake.calls.length;

      fireEvent.click(word('rain'));
      await settleHelp();
      // The music goes down first, and the clip pauses once it is.
      expect(count('pause')).toBe(0);
      finishFadeOut();
      expect(fake.calls.slice(before)).toEqual([...FADE_OUT_STEPS, 'pause']);

      fireEvent.click(screen.getByRole('button', { name: 'Valeu' }));
      finishFadeIn();
      expect(fake.calls.slice(before)).toEqual([...FADE_OUT_STEPS, 'pause', 'play', ...FADE_IN_STEPS]);
    });

    it('turns the fade around on "Valeu" before the music is down: no pause, no play, the volume rises again', async () => {
      renderHelped();
      answerFirst();
      playTo(1000);

      fireEvent.click(word('rain'));
      await settleHelp();
      act(() => vi.advanceTimersByTime(1000));
      const level = fake.getVolume();
      const before = fake.calls.length;
      fireEvent.click(screen.getByRole('button', { name: 'Valeu' }));
      finishFadeIn();
      finishFadeOut();

      const after = fake.calls.slice(before);
      expect(after).not.toContain('pause');
      expect(after).not.toContain('play');
      expect(volumesIn(after)[0]).toBeGreaterThan(level);
      expect(fake.getVolume()).toBe(100);
    });

    it('leaves a clip the game paused for an answer alone, and still paused after "Valeu"', async () => {
      renderHelped();
      answerFirst();
      playTo(3850);
      finishFadeOut();
      expect(fake.calls.at(-1)).toBe('pause');
      const before = fake.calls.length;

      fireEvent.click(word('rain'));
      await settleHelp();
      fireEvent.click(screen.getByRole('button', { name: 'Valeu' }));

      expect(fake.calls.slice(before)).toEqual([]);
      // The game still waits for the answer, which plays the clip on.
      fireEvent.click(option('get'));
      finishFadeIn();
      expect(fake.calls.slice(before)).toEqual(['play', ...FADE_IN_STEPS]);
    });

    it('opened while the music goes down for a wait, neither pauses again nor starts the fade over', async () => {
      renderHelped();
      answerFirst();
      playTo(3850);
      const before = fake.calls.length;
      act(() => vi.advanceTimersByTime(500));

      fireEvent.click(word('rain'));
      await settleHelp();
      finishFadeOut();

      // The wait's own fade went on as it was: the same steps over the same 2 s, and the one pause at the end.
      expect(fake.calls.slice(before)).toEqual([...FADE_OUT_STEPS, 'pause']);
      const waiting = fake.calls.length;

      fireEvent.click(screen.getByRole('button', { name: 'Valeu' }));
      finishFadeIn();
      expect(fake.calls.slice(waiting)).toEqual([]);
    });

    it('does not play on after "Valeu" when the game began to wait for an answer while the sheet was open', async () => {
      fake = new SlowToReportPlayer(DURATION_MS);
      renderHelped();
      answerFirst();
      playTo(1000);

      fireEvent.click(word('rain'));
      await settleHelp();
      // YouTube had not said it paused, so the clock went on to the end of the line, and the game paused it there.
      playTo(3850);
      const before = fake.calls.length;
      fireEvent.click(screen.getByRole('button', { name: 'Valeu' }));

      expect(fake.calls.slice(before)).toEqual([]);
    });

    it('does not start a clip the player had paused', async () => {
      renderHelped();
      answerFirst();
      playTo(1000);
      act(() => fake.emitState('paused'));
      const before = fake.calls.length;

      fireEvent.click(word('rain'));
      await settleHelp();
      fireEvent.click(screen.getByRole('button', { name: 'Valeu' }));

      expect(fake.calls.slice(before)).toEqual([]);
    });
  });

  describe('"Traduzir verso" (ruling R64)', () => {
    it('shows the translation under the line in play, even with "Mostrar tradução sempre" off', async () => {
      const { requestHelp } = renderHelped();

      fireEvent.click(screen.getByRole('button', { name: 'Traduzir verso' }));
      expect(screen.getByRole('status')).toHaveTextContent('Traduzindo...');
      await settleHelp();

      expect(screen.getByTestId('translation')).toHaveTextContent('Tradução 0');
      expect(screen.queryByRole('button', { name: 'Traduzir verso' })).not.toBeInTheDocument();
      expect(requestHelp).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({ lineIndex: 0, kind: 'translate', target: '' }),
      );
    });

    it('asks for no translation by itself while "Mostrar tradução sempre" is off', async () => {
      const { requestHelp } = renderHelped({ blanks: [] });

      playTo(5000);
      await settleHelp();

      expect(requestHelp).not.toHaveBeenCalled();
    });

    it('gives a calm line when the translation cannot be had, and asks again on a tap', async () => {
      const requestHelp = vi
        .fn<HelpRequester>()
        .mockRejectedValueOnce(new HelpError(503))
        .mockResolvedValueOnce('Tradução 0');
      renderHelped({ requestHelp });

      fireEvent.click(screen.getByRole('button', { name: 'Traduzir verso' }));
      await settleHelp();
      expect(screen.getByRole('status')).toHaveTextContent('Não rolou agora. Tenta de novo?');

      fireEvent.click(screen.getByRole('button', { name: 'Traduzir verso' }));
      await settleHelp();

      expect(screen.getByTestId('translation')).toHaveTextContent('Tradução 0');
      expect(requestHelp).toHaveBeenCalledTimes(2);
    });

    describe('with "Mostrar tradução sempre" on', () => {
      beforeEach(() => {
        saveSettings(localStorage, { ...DEFAULT_SETTINGS, alwaysShowTranslation: true });
      });

      it('translates each line as it comes into play, without a tap, and each line once', async () => {
        const { requestHelp } = renderHelped({ blanks: [] });
        await settleHelp();
        expect(screen.getByTestId('translation')).toHaveTextContent('Tradução 0');

        playTo(4500);
        await settleHelp();
        expect(screen.getByTestId('translation')).toHaveTextContent('Tradução 1');

        fireEvent.click(screen.getByRole('button', { name: 'Repetir verso' }));
        act(() => vi.advanceTimersByTime(400));
        playTo(4500);
        await settleHelp();

        expect(requestHelp.mock.calls.map(([r]) => r.lineIndex)).toEqual([0, 1]);
      });

      it('shows nothing, and no error, when a translation it asked for by itself cannot be had', async () => {
        renderHelped({ blanks: [], requestHelp: vi.fn<HelpRequester>(() => Promise.reject(new HelpError(503))) });
        await settleHelp();

        expect(screen.queryByTestId('translation')).not.toBeInTheDocument();
        expect(screen.queryByRole('status')).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Traduzir verso' })).toBeInTheDocument();
      });
    });
  });

  describe('Monte o verso', () => {
    function renderHelpedBuild(over: Partial<GameScreenProps> = {}) {
      const requestHelp = helpService();
      renderBuild({ requestHelp, ...over });
      return requestHelp;
    }

    it('shows "Não entendi a ordem" only once the line has an answer (ruling R65)', () => {
      renderHelpedBuild();
      expect(screen.queryByRole('button', { name: 'Não entendi a ordem' })).not.toBeInTheDocument();

      fireEvent.click(tile('tonight'));

      expect(screen.getByRole('button', { name: 'Não entendi a ordem' })).toBeInTheDocument();
    });

    it('"Não entendi a ordem" explains the whole line, with no word', async () => {
      const requestHelp = renderHelpedBuild();
      fireEvent.click(tile('tonight'));

      fireEvent.click(screen.getByRole('button', { name: 'Não entendi a ordem' }));
      await settleHelp();

      expect(within(helpSheet()).getByRole('heading', { name: 'O verso inteiro' })).toBeInTheDocument();
      expect(within(helpSheet()).getByText('Explicação de tudo')).toBeInTheDocument();
      expect(requestHelp).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ lineIndex: 0, kind: 'explain', target: '' }));
    });

    it('lets the words of a line that is right be tapped in its row, to explain them', async () => {
      const requestHelp = renderHelpedBuild();
      placeWords(BUILD_WORDS);

      fireEvent.click(within(screen.getByTestId('montar-row')).getByRole('button', { name: 'home' }));
      await settleHelp();

      expect(within(helpSheet()).getByText('Explicação de home')).toBeInTheDocument();
      expect(requestHelp).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ lineIndex: 0, target: 'home' }));
    });

    it('translates the line in play, which is still hidden: a translation scores nothing (ruling R60)', async () => {
      const requestHelp = renderHelpedBuild();

      fireEvent.click(screen.getByRole('button', { name: 'Traduzir verso' }));
      await settleHelp();

      expect(screen.getByTestId('translation')).toHaveTextContent('Tradução 0');
      expect(requestHelp).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ lineIndex: 0, kind: 'translate' }));
    });
  });
});

describe('LyricPanel', () => {
  function renderPanel(over: Partial<Parameters<typeof LyricPanel>[0]> = {}) {
    const onTranslate = vi.fn<(lineIndex: number) => void>();
    const onExplain = vi.fn<(target: string, lineIndex: number, opener: HTMLElement) => void>();
    render(
      <LyricPanel
        lines={LINES}
        current={0}
        blanks={[LET]}
        status={{ [LET.id]: 'pending' }}
        onTranslate={onTranslate}
        onExplain={onExplain}
        {...over}
      />,
    );
    return { onTranslate, onExplain };
  }

  it('lets the player tap a word of the line in play to have it explained once its blank has an answer', () => {
    const { onExplain } = renderPanel({ status: { [LET.id]: 'wrong' } });

    fireEvent.click(within(screen.getByTestId('line-current')).getByRole('button', { name: 'drive' }));

    expect(onExplain).toHaveBeenCalledExactlyOnceWith('drive', 0, expect.any(HTMLButtonElement));
    expect(within(screen.getByTestId('line-next')).queryAllByRole('button')).toHaveLength(0);
  });

  describe('a missed blank', () => {
    const DRIVE: Blank = { id: '0:4', lineIndex: 0, tokenIndex: 4, answer: 'drive' };

    it('is drawn red with ✕ once it is no longer in play, so it reads as missed and not as still open', () => {
      renderPanel({ blanks: [LET, DRIVE], status: { [LET.id]: 'wrong', [DRIVE.id]: 'pending' }, inPlayId: DRIVE.id });

      const line = screen.getByTestId('line-current');
      const missed = within(line).getByText('lacuna, errou').parentElement!;
      expect(missed).toHaveClass('bg-error', 'text-bg', 'rounded-blank');
      expect(missed.querySelector('[data-icon="cross"]')).not.toBeNull();
      // The answer is not shown, and no word says "errou" on screen.
      expect(line).not.toHaveTextContent('let');
      expect(visibleText()).not.toMatch(/acertou|errou/i);
      // The blank in play is still the solid "sua vez" slot.
      expect(within(line).getAllByText('lacuna')).toHaveLength(1);
    });

    it('stays an open slot while it is the blank in play, since it can still be answered', () => {
      renderPanel({ status: { [LET.id]: 'wrong' }, inPlayId: LET.id });

      const line = screen.getByTestId('line-current');
      expect(within(line).queryByText('lacuna, errou')).not.toBeInTheDocument();
      expect(within(line).getByText('lacuna').parentElement).toHaveClass('border-lime', 'bg-card');
    });
  });

  describe('"Continuar" (the music paused for the translation)', () => {
    it('is not there unless the panel is given something to do with it', () => {
      renderPanel();

      expect(screen.queryByRole('button', { name: 'Continuar' })).not.toBeInTheDocument();
    });

    it('is a button of at least 44 px, next to the translation, that does what it was given', () => {
      const onContinue = vi.fn<() => void>();
      renderPanel({ onContinue, translation: { status: 'done', text: 'Vovô não deixa os gansos dirigirem' } });

      const button = screen.getByRole('button', { name: 'Continuar' });
      expect(button).toHaveClass('min-h-11');
      // The ring is lime and offset from the button: a dark one would vanish on the dark page.
      expect(button).toHaveClass('focus-visible:outline-2', 'focus-visible:outline-offset-2', 'focus-visible:outline-lime');
      expect(button).not.toHaveClass('focus-visible:outline-bg');
      expect(inOrder(screen.getByTestId('translation'), button, screen.getByTestId('line-next'))).toBe(true);
      fireEvent.click(button);
      expect(onContinue).toHaveBeenCalledOnce();
    });

    it('takes the focus when it appears, without scrolling the page to it', () => {
      const focus = vi.spyOn(HTMLElement.prototype, 'focus');
      renderPanel({ onContinue: vi.fn() });

      expect(screen.getByRole('button', { name: 'Continuar' })).toHaveFocus();
      expect(focus).toHaveBeenCalledWith({ preventScroll: true });
    });

    it('stays while the translation is on its way, next to "Traduzir verso" when that is still there', () => {
      renderPanel({ onContinue: vi.fn(), translation: { status: 'error', message: 'Não rolou agora. Tenta de novo?' } });

      expect(screen.getByRole('button', { name: 'Continuar' })).toBeVisible();
      expect(screen.getByRole('button', { name: 'Traduzir verso' })).toBeVisible();
    });
  });

  describe('no spoilers from help (ruling R83)', () => {
    const DRIVE: Blank = { id: '0:4', lineIndex: 0, tokenIndex: 4, answer: 'drive' };

    it('a line with one open blank: no word can be tapped and "Não entendi" waits, but "Traduzir verso" is there', () => {
      const { onTranslate } = renderPanel({ status: { [LET.id]: 'pending' } });

      const line = screen.getByTestId('line-current');
      expect(within(line).queryAllByRole('button')).toHaveLength(0);
      expect(line).toHaveTextContent("Grandpa won't lacuna geese drive");
      expect(screen.queryByRole('button', { name: 'Não entendi' })).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Traduzir verso' }));
      expect(onTranslate).toHaveBeenCalledExactlyOnceWith(0);
    });

    it('a blank skipped by a seek is still open: nothing to tap yet', () => {
      renderPanel({ status: { [LET.id]: 'skipped' } });

      expect(within(screen.getByTestId('line-current')).queryAllByRole('button')).toHaveLength(0);
      expect(screen.queryByRole('button', { name: 'Não entendi' })).not.toBeInTheDocument();
    });

    it('a line with two blanks where one is answered: nothing can be tapped, not even the right one', () => {
      renderPanel({ blanks: [LET, DRIVE], status: { [LET.id]: 'correct', [DRIVE.id]: 'pending' }, inPlayId: DRIVE.id });

      const line = screen.getByTestId('line-current');
      expect(within(line).queryAllByRole('button')).toHaveLength(0);
      expect(screen.queryByRole('button', { name: 'Não entendi' })).not.toBeInTheDocument();
      // The right one still looks right, and says so to screen readers.
      const right = within(line).getByText('let, acertou').parentElement!;
      expect(right).toHaveClass('bg-lime', 'text-bg');
      expect(right.querySelector('[data-icon="check"]')).not.toBeNull();
      expect(screen.getByRole('button', { name: 'Traduzir verso' })).toBeInTheDocument();
    });

    it('once every blank of the line has had its first answer, right or wrong, help opens as before', () => {
      const { onExplain } = renderPanel({
        blanks: [LET, DRIVE],
        status: { [LET.id]: 'correct', [DRIVE.id]: 'wrong' },
        inPlayId: DRIVE.id,
      });

      const line = within(screen.getByTestId('line-current'));
      fireEvent.click(line.getByRole('button', { name: "won't" }));
      expect(onExplain).toHaveBeenLastCalledWith("won't", 0, expect.any(HTMLButtonElement));
      fireEvent.click(line.getByRole('button', { name: 'let, acertou' }));
      expect(onExplain).toHaveBeenLastCalledWith('let', 0, expect.any(HTMLButtonElement));
      fireEvent.click(screen.getByRole('button', { name: 'Não entendi' }));
      expect(onExplain).toHaveBeenLastCalledWith('drive', 0, expect.any(HTMLButtonElement));
    });
  });

  it('hands over the very button that was tapped, so the focus can go back to it even on Safari', () => {
    const { onExplain } = renderPanel({ status: { [LET.id]: 'wrong' } });

    const word = within(screen.getByTestId('line-current')).getByRole('button', { name: 'drive' });
    fireEvent.click(word);
    expect(onExplain.mock.lastCall?.[2]).toBe(word);

    const pill = screen.getByRole('button', { name: 'Não entendi' });
    fireEvent.click(pill);
    expect(onExplain.mock.lastCall?.[2]).toBe(pill);
  });

  it('"Traduzir verso" asks for the translation of the line it is under', () => {
    const { onTranslate } = renderPanel();

    fireEvent.click(screen.getByRole('button', { name: 'Traduzir verso' }));

    expect(onTranslate).toHaveBeenCalledExactlyOnceWith(0);
  });

  it('reports the index of the line it drew, for a word, "Não entendi" and "Traduzir verso"', () => {
    const { onExplain, onTranslate } = renderPanel({
      lines: TYPING_LINES,
      current: 1,
      blanks: [KETTLE],
      status: { [KETTLE.id]: 'wrong' },
    });

    fireEvent.click(within(screen.getByTestId('line-current')).getByRole('button', { name: 'sings' }));
    expect(onExplain).toHaveBeenLastCalledWith('sings', 1, expect.any(HTMLButtonElement));
    fireEvent.click(screen.getByRole('button', { name: 'Não entendi' }));
    expect(onExplain).toHaveBeenLastCalledWith('kettle', 1, expect.any(HTMLButtonElement));
    fireEvent.click(screen.getByRole('button', { name: 'Traduzir verso' }));
    expect(onTranslate).toHaveBeenCalledExactlyOnceWith(1);
  });

  it('shows the translation under the line, in Portuguese, in place of "Traduzir verso"', () => {
    renderPanel({ translation: { status: 'done', text: 'Tradução do verso' } });

    expect(screen.getByTestId('translation')).toHaveTextContent('Tradução do verso');
    expect(screen.getByTestId('translation')).toHaveAttribute('lang', 'pt-BR');
    expect(screen.queryByRole('button', { name: 'Traduzir verso' })).not.toBeInTheDocument();
  });

  it('says the translation is on its way in place of "Traduzir verso"', () => {
    renderPanel({ translation: { status: 'loading' } });

    expect(screen.getByRole('status')).toHaveTextContent('Traduzindo...');
    expect(screen.queryByRole('button', { name: 'Traduzir verso' })).not.toBeInTheDocument();
    expect(screen.queryByTestId('translation')).not.toBeInTheDocument();
  });

  it('gives a calm line when the translation cannot be had, and keeps "Traduzir verso" to ask again', () => {
    const { onTranslate } = renderPanel({ translation: { status: 'error', message: 'Não rolou agora. Tenta de novo?' } });

    expect(screen.getByRole('status')).toHaveTextContent('Não rolou agora. Tenta de novo?');
    expect(screen.queryByTestId('translation')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Traduzir verso' }));
    expect(onTranslate).toHaveBeenCalledExactlyOnceWith(0);
  });

  it('after an answer, "Não entendi" explains the blank word, and a right blank can be tapped too', () => {
    const { onExplain } = renderPanel({ status: { [LET.id]: 'correct' } });

    fireEvent.click(screen.getByRole('button', { name: 'Não entendi' }));
    expect(onExplain).toHaveBeenLastCalledWith('let', 0, expect.any(HTMLButtonElement));

    fireEvent.click(within(screen.getByTestId('line-current')).getByRole('button', { name: 'let, acertou' }));
    expect(onExplain).toHaveBeenCalledTimes(2);
    expect(onExplain).toHaveBeenLastCalledWith('let', 0, expect.any(HTMLButtonElement));
  });

  it('shows a blank the typing mode corrected with its fixed letters marked, and says so to screen readers', () => {
    const { onExplain } = renderPanel({ status: { [LET.id]: 'correct' }, corrected: { [LET.id]: [1, 2] } });

    const word = within(screen.getByTestId('line-current')).getByRole('button', {
      name: 'let, corrigido automaticamente',
    });
    expect(word).toHaveClass('bg-lime', 'text-bg', 'min-h-11');
    expect(word).toHaveTextContent('let');
    expect(word.querySelector('[data-icon="check"]')).not.toBeNull();
    expect(fixedLettersIn(word)).toEqual(['e', 't']);
    // It is still the word to explain.
    fireEvent.click(word);
    expect(onExplain).toHaveBeenCalledExactlyOnceWith('let', 0, expect.any(HTMLButtonElement));
  });

  it('shows every right blank with a check and its result for screen readers, with no letters marked unless fixed', () => {
    const { onExplain } = renderPanel({ status: { [LET.id]: 'correct' }, corrected: {} });

    const word = within(screen.getByTestId('line-current')).getByRole('button', { name: 'let, acertou' });
    expect(word).toHaveClass('bg-lime', 'text-bg', 'min-h-11');
    expect(word).toHaveTextContent('let');
    expect(word.querySelector('[data-icon="check"]')).not.toBeNull();
    expect(fixedLettersIn(word)).toEqual([]);
    // The result is the accessible name, not text on screen.
    expect(document.body.textContent).not.toMatch(/acertou|errou/i);
    fireEvent.click(word);
    expect(onExplain).toHaveBeenCalledExactlyOnceWith('let', 0, expect.any(HTMLButtonElement));
  });

  it('draws two right words on one line the same way, whether one of them was fixed or not (ruling R55)', () => {
    const DRIVE: Blank = { id: '0:4', lineIndex: 0, tokenIndex: 4, answer: 'drive' };
    renderPanel({
      blanks: [LET, DRIVE],
      status: { [LET.id]: 'correct', [DRIVE.id]: 'correct' },
      corrected: { [LET.id]: [1, 2] },
    });

    const line = within(screen.getByTestId('line-current'));
    const fixedWord = line.getByRole('button', { name: 'let, corrigido automaticamente' });
    const plainWord = line.getByRole('button', { name: 'drive, acertou' });
    for (const word of [fixedWord, plainWord]) {
      expect(word.querySelector('[data-icon="check"]')).not.toBeNull();
    }
    expect(plainWord.className).toBe(fixedWord.className);
    expect(fixedLettersIn(fixedWord)).toEqual(['e', 't']);
    expect(fixedLettersIn(plainWord)).toEqual([]);
  });

  it('shows a right blank in the muted lines around the line in play as plain text, with no check', () => {
    renderPanel({
      current: 1,
      blanks: [LET, GAVE],
      status: { [LET.id]: 'correct', [GAVE.id]: 'pending' },
    });

    expect(screen.getByTestId('line-previous')).toHaveTextContent("Grandpa won't let geese drive");
    expect(screen.getByTestId('line-previous').querySelector('[data-icon]')).toBeNull();
    expect(within(screen.getByTestId('line-previous')).queryAllByRole('button')).toHaveLength(0);
  });

  it('marks the corrected letters only in the line in play, not in the muted lines around it', () => {
    renderPanel({
      current: 1,
      blanks: [LET, GAVE],
      status: { [LET.id]: 'correct', [GAVE.id]: 'pending' },
      corrected: { [LET.id]: [1, 2] },
    });

    expect(screen.getByTestId('line-previous')).toHaveTextContent("Grandpa won't let geese drive");
    expect(fixedLettersIn(screen.getByTestId('line-previous'))).toEqual([]);
  });

  it('keeps every button at least 44 px tall', () => {
    renderPanel({ status: { [LET.id]: 'wrong' } });
    for (const button of screen.getAllByRole('button')) expect(button).toHaveClass('min-h-11');
  });

  describe('a line that is a puzzle (Monte o verso, rulings R52, R55 and R59)', () => {
    const WHOLE_LINES = { lines: BUILD_LINES, blanks: [WHOLE_0, WHOLE_1] };
    const FIRST_LINE_WORDS = /please|come|back|home|tonight/i;
    const SECOND_LINE_WORDS = /hang|lantern|gate/i;

    describe('not in play (ruling R52)', () => {
      it('never shows the words of a line whose blank is not right yet, the line in play of the panel or around it', () => {
        for (const state of ['pending', 'skipped', 'wrong'] as const) {
          const { unmount } = render(
            <LyricPanel
              {...WHOLE_LINES}
              current={0}
              status={{ [WHOLE_0.id]: state, [WHOLE_1.id]: 'pending' }}
              onTranslate={vi.fn()}
              onExplain={vi.fn()}
            />,
          );

          const current = screen.getByTestId('line-current');
          expect(current).toHaveTextContent('verso escondido');
          expect(current).not.toHaveTextContent(FIRST_LINE_WORDS);
          expect(within(current).queryAllByRole('button')).toHaveLength(0);
          expect(screen.getByTestId('line-next')).toHaveTextContent('verso escondido');
          expect(screen.getByTestId('line-next')).not.toHaveTextContent(SECOND_LINE_WORDS);
          unmount();
        }
      });

      it('hides the line before the one in play too, until it is right', () => {
        renderPanel({
          ...WHOLE_LINES,
          current: 1,
          status: { [WHOLE_0.id]: 'wrong', [WHOLE_1.id]: 'pending' },
        });

        expect(screen.getByTestId('line-previous')).not.toHaveTextContent(FIRST_LINE_WORDS);
        expect(screen.getByTestId('line-previous')).toHaveTextContent('verso escondido');
      });

      it('draws a puzzle line that is not in play as one dashed lime bar, and the lines around it as small dashed bars', () => {
        renderPanel({ ...WHOLE_LINES, status: { [WHOLE_0.id]: 'pending', [WHOLE_1.id]: 'pending' } });

        const own = within(screen.getByTestId('line-current')).getByText('verso escondido').parentElement!;
        expect(own).toHaveClass('border-dashed', 'border-lime', 'w-full');
        expect(own).not.toHaveClass('bg-card');
        const around = within(screen.getByTestId('line-next')).getByText('verso escondido').parentElement!;
        expect(around).toHaveClass('border-dashed', 'border-faint');
        expect(around).not.toHaveClass('w-full');
      });

      // In the game, a right puzzle line in play is drawn by the answer area, whose row has the check and the words to
      // tap (see MontarArea). The panel draws such a line as an ordinary one, whose words can be tapped.
      it('shows the line once its blank is right, as plain words that can be explained', () => {
        const { onExplain } = renderPanel({
          ...WHOLE_LINES,
          status: { [WHOLE_0.id]: 'correct', [WHOLE_1.id]: 'pending' },
        });

        const current = screen.getByTestId('line-current');
        expect(current).toHaveTextContent('Please come back home tonight');
        const words = within(current).getAllByRole('button');
        expect(words.map((word) => word.textContent)).toEqual(['Please', 'come', 'back', 'home', 'tonight']);
        for (const word of words) {
          expect(word).toHaveClass('min-h-11');
          expect(word).not.toHaveClass('bg-lime');
          expect(word.querySelector('[data-icon]')).toBeNull();
        }
        expect(current).not.toHaveTextContent('verso escondido');
        fireEvent.click(words[1]);
        expect(onExplain).toHaveBeenCalledExactlyOnceWith('come', 0, expect.any(HTMLButtonElement));
      });

      it('shows a right line around the line in play as plain text, with no check', () => {
        renderPanel({
          ...WHOLE_LINES,
          current: 1,
          status: { [WHOLE_0.id]: 'correct', [WHOLE_1.id]: 'pending' },
        });

        expect(screen.getByTestId('line-previous')).toHaveTextContent('Please come back home tonight');
        expect(screen.getByTestId('line-previous').querySelector('[data-icon]')).toBeNull();
        expect(within(screen.getByTestId('line-previous')).queryAllByRole('button')).toHaveLength(0);
      });

      it('shows a line with no puzzle as it is, whatever the other lines are', () => {
        renderPanel({
          lines: [BUILD_LINES[0], LINES[1], LINES[2]],
          blanks: [WHOLE_0],
          current: 1,
          status: { [WHOLE_0.id]: 'pending' },
        });

        expect(screen.getByTestId('line-current')).toHaveTextContent('She gave each kite a name');
        expect(screen.getByTestId('line-previous')).toHaveTextContent('verso escondido');
      });
    });

    describe('in play, held by the answer area (ruling R59)', () => {
      it.each(['pending', 'wrong', 'correct'] as const)(
        'draws neither the line nor the line after it while its blank is %s, and keeps the line before and "Traduzir verso"',
        (state) => {
          renderPanel({
            ...WHOLE_LINES,
            current: 1,
            status: { [WHOLE_0.id]: 'correct', [WHOLE_1.id]: state },
            inPlayId: WHOLE_1.id,
          });

          expect(screen.queryByTestId('line-current')).not.toBeInTheDocument();
          expect(screen.queryByTestId('line-next')).not.toBeInTheDocument();
          // No placeholder bar either: the area's row is the line in play.
          expect(screen.queryByText('verso escondido')).not.toBeInTheDocument();
          expect(document.body).not.toHaveTextContent(SECOND_LINE_WORDS);
          expect(screen.getByTestId('line-previous')).toHaveTextContent('Please come back home tonight');
          expect(screen.getByRole('button', { name: 'Traduzir verso' })).toBeInTheDocument();
        },
      );

      it('looks the same before and after the line is solved, so nothing in it changes size', () => {
        const props = { ...WHOLE_LINES, current: 1, inPlayId: WHOLE_1.id };
        const { container, rerender } = render(
          <LyricPanel
            {...props}
            status={{ [WHOLE_0.id]: 'correct', [WHOLE_1.id]: 'pending' }}
            onTranslate={vi.fn()}
            onExplain={vi.fn()}
          />,
        );
        const before = container.innerHTML;

        rerender(
          <LyricPanel
            {...props}
            status={{ [WHOLE_0.id]: 'correct', [WHOLE_1.id]: 'correct' }}
            onTranslate={vi.fn()}
            onExplain={vi.fn()}
          />,
        );

        expect(container.innerHTML).toBe(before);
      });

      it('keeps the translation of the line in play where "Traduzir verso" would be', () => {
        renderPanel({
          ...WHOLE_LINES,
          current: 1,
          status: { [WHOLE_0.id]: 'correct', [WHOLE_1.id]: 'pending' },
          inPlayId: WHOLE_1.id,
          translation: { status: 'done', text: 'Pendure sua lanterna no velho portão' },
        });

        expect(screen.getByTestId('translation')).toHaveTextContent('Pendure sua lanterna no velho portão');
        expect(screen.queryByRole('button', { name: 'Traduzir verso' })).not.toBeInTheDocument();
        expect(screen.queryByTestId('line-current')).not.toBeInTheDocument();
      });

      it('shows the line before as a hidden bar when it is not right, since it is still a puzzle', () => {
        renderPanel({
          ...WHOLE_LINES,
          current: 1,
          status: { [WHOLE_0.id]: 'wrong', [WHOLE_1.id]: 'pending' },
          inPlayId: WHOLE_1.id,
        });

        expect(screen.getByTestId('line-previous')).toHaveTextContent('verso escondido');
        expect(screen.getByTestId('line-previous')).not.toHaveTextContent(FIRST_LINE_WORDS);
      });

      it('still draws a line with words to blank around it: only a blank for the whole line is held by the area', () => {
        renderPanel({ current: 0, status: { [LET.id]: 'pending' }, inPlayId: LET.id });

        expect(screen.getByTestId('line-current')).toHaveTextContent("Grandpa won't lacuna geese drive");
        expect(screen.getByTestId('line-next')).toBeInTheDocument();
      });
    });

    describe('"Não entendi" on a puzzle line', () => {
      it.each(['wrong', 'correct'] as const)(
        'never gives a puzzle line the "Não entendi" pill when it is %s, so the hidden line is never handed on',
        (state) => {
          const { onExplain } = renderPanel({
            ...WHOLE_LINES,
            status: { [WHOLE_0.id]: state, [WHOLE_1.id]: 'pending' },
            inPlayId: WHOLE_0.id,
          });

          expect(screen.queryByRole('button', { name: 'Não entendi' })).not.toBeInTheDocument();
          expect(onExplain).not.toHaveBeenCalled();
        },
      );

      it('still gives a line with words to blank its pill once a blank has an answer', () => {
        renderPanel({ status: { [LET.id]: 'wrong' } });

        expect(screen.getByRole('button', { name: 'Não entendi' })).toBeInTheDocument();
      });
    });
  });
});

describe('GameScreen: Karaokê', () => {
  // Invented lines, not lyrics.
  const KARAOKE_LINES: LyricLine[] = [
    { index: 0, startMs: 0, endMs: 4000, text: 'Paper boats on a river of light' },
    { index: 1, startMs: 4000, endMs: 8000, text: "We're counting the stars from the roof" },
    { index: 2, startMs: 8000, endMs: 12000, text: 'Hold the line till the morning comes' },
  ];
  const scrollTo = vi.fn();

  // jsdom has neither Element.scrollTo nor matchMedia, which the lyrics list reaches for to follow the song.
  beforeEach(() => {
    scrollTo.mockClear();
    Object.defineProperty(Element.prototype, 'scrollTo', { configurable: true, writable: true, value: scrollTo });
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({ matches: false })),
    );
  });

  afterEach(() => {
    Reflect.deleteProperty(Element.prototype, 'scrollTo');
    vi.unstubAllGlobals();
  });

  function renderKaraoke(over: Partial<GameScreenProps> = {}) {
    return renderGame({ mode: 'karaoke', lines: KARAOKE_LINES, blanks: [], ...over });
  }

  /** The lines of the lyrics list, in order. */
  function karaokeRows() {
    return within(screen.getByRole('list', { name: 'Letra' })).getAllByRole('listitem');
  }

  function currentRow() {
    return karaokeRows().find((row) => row.getAttribute('aria-current') === 'true');
  }

  it('pauses when the page is hidden, since no blank ever stops its clip, and never plays again by itself (ruling R84)', () => {
    renderKaraoke();
    playTo(6000);
    const before = fake.calls.length;

    setVisibility('hidden');
    setVisibility('visible');
    act(() => vi.advanceTimersByTime(5000));

    expect(fake.calls.slice(before)).toEqual(['pause']);
    expect(fake.getCurrentTimeMs()).toBe(6000);
  });

  it('shows "Livre" in the header in place of the combo, and no combo or points anywhere', () => {
    renderKaraoke();

    expect(screen.getByText('Modo Karaokê')).toBeInTheDocument();
    const pill = screen.getByText('Livre');
    expect(pill).toHaveClass('rounded-full', 'border-border');
    expect(pill).not.toHaveClass('bg-lime');
    expect(screen.queryByText('Combo')).not.toBeInTheDocument();
    expect(screen.queryByText(/^x\d+$/)).not.toBeInTheDocument();
    expect(visibleText()).not.toMatch(/combo|ponto|xp/i);
  });

  it('keeps the combo pill in the other modes', () => {
    renderGame();

    expect(screen.getByText('x0')).toBeInTheDocument();
    expect(screen.queryByText('Livre')).not.toBeInTheDocument();
  });

  it('shows the scrolling lyrics in place of the lyric panel and the answer area', () => {
    renderKaraoke();

    expect(karaokeRows()).toHaveLength(3);
    expect(screen.queryByTestId('line-current')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Traduzir verso' })).not.toBeInTheDocument();
    expect(screen.queryByRole('group')).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('has 0.75x, Repetir verso and the translation switch in the tools, and no Dica', () => {
    renderKaraoke();

    expect(screen.getByRole('button', { name: '0.75x' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Repetir verso' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Esconder tradução' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Dica/ })).not.toBeInTheDocument();
  });

  it('"Esconder tradução" becomes "Mostrar tradução" and back, and nothing is saved', () => {
    renderKaraoke();

    fireEvent.click(screen.getByRole('button', { name: 'Esconder tradução' }));
    expect(screen.getByRole('button', { name: 'Mostrar tradução' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Esconder tradução' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Mostrar tradução' }));
    expect(screen.getByRole('button', { name: 'Esconder tradução' })).toBeInTheDocument();
    expect(localStorage.getItem('hb_settings')).toBeNull();
  });

  it('hands each click of the switch to the lyrics, which then lay the current line out again', () => {
    renderKaraoke();
    scrollTo.mockClear();

    // The lyrics cannot show a translation yet (ruling R56), but a change of the switch always centers the line again,
    // so it is a change the view has seen. If the screen kept the switch to itself, nothing would be seen here.
    fireEvent.click(screen.getByRole('button', { name: 'Esconder tradução' }));
    expect(scrollTo).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Mostrar tradução' }));
    expect(scrollTo).toHaveBeenCalledTimes(2);
  });

  it('starts with the translations shown, whatever "Mostrar tradução sempre" says', () => {
    saveSettings(localStorage, { ...DEFAULT_SETTINGS, alwaysShowTranslation: false });
    renderKaraoke();

    expect(screen.getByRole('button', { name: 'Esconder tradução' })).toBeInTheDocument();
  });

  it('puts the current line where the clock is, and moves it along', () => {
    renderKaraoke();
    expect(currentRow()).toBe(karaokeRows()[0]);

    playTo(4500);

    expect(currentRow()).toBe(karaokeRows()[1]);
    expect(currentRow()).toHaveClass('bg-lime');
  });

  it('follows the clock the game accepted, not a stale reading of the player (ruling R44)', () => {
    class StalePlayer extends FakePlayerAdapter {
      private staleRead = false;

      override seekTo(ms: number): void {
        super.seekTo(ms);
        this.staleRead = true;
      }

      override getCurrentTimeMs(): number {
        if (!this.staleRead) return super.getCurrentTimeMs();
        this.staleRead = false;
        return 60000;
      }
    }
    fake = new StalePlayer(DURATION_MS);

    renderKaraoke();

    expect(currentRow()).toBe(karaokeRows()[0]);
  });

  it('plays the song through without ever pausing, and reports the end once with no points', () => {
    const onEnd = renderKaraoke();

    playTo(11900);
    expect(count('pause')).toBe(0);

    act(() => fake.emitState('ended'));
    act(() => fake.emitState('ended'));

    expect(onEnd).toHaveBeenCalledExactlyOnceWith(
      { totalBlanks: 0, firstTryCorrect: 0, pct: 0, maxCombo: 0, xp: 0 },
      [],
    );
  });

  it('Repetir verso plays the line in play again from its start', () => {
    renderKaraoke();
    playTo(5000);

    fireEvent.click(screen.getByRole('button', { name: 'Repetir verso' }));

    expect(fake.calls.slice(-2)).toEqual(['seek:4000', 'play']);
  });

  it('0.75x slows the clip down, and a second tap puts it back to normal speed', () => {
    renderKaraoke();
    const slow = screen.getByRole('button', { name: '0.75x' });

    fireEvent.click(slow);
    expect(fake.calls.at(-1)).toBe('rate:0.75');
    fireEvent.click(slow);
    expect(fake.calls.at(-1)).toBe('rate:1');
  });

  it('shows the translations of the current line and the next one, from the help service', async () => {
    const requestHelp = helpService();
    renderKaraoke({ requestHelp });
    await settleHelp();

    expect(karaokeRows()[0].querySelector('[lang="pt-BR"]')).toHaveTextContent('Tradução 0');
    expect(karaokeRows()[1].querySelector('[lang="pt-BR"]')).toHaveTextContent('Tradução 1');
    expect(karaokeRows()[2].querySelector('[lang="pt-BR"]')).toBeNull();
    expect(requestHelp.mock.calls.map(([r]) => [r.lineIndex, r.kind])).toEqual([
      [0, 'translate'],
      [1, 'translate'],
    ]);
  });

  it('shows nothing under the lines, and no error, when the translations cannot be had', async () => {
    renderKaraoke();
    await settleHelp();

    expect(screen.getByRole('list', { name: 'Letra' }).querySelector('[lang="pt-BR"]')).toBeNull();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(visibleText()).not.toMatch(/erro|falha|não deu|tenta/i);
  });

  it('explains a tapped word of the current line in place of the lyrics, and brings them back on "Valeu"', async () => {
    const requestHelp = helpService();
    renderKaraoke({ requestHelp });
    const river = within(currentRow()!).getByRole('button', { name: 'river' });

    fireEvent.click(river);
    await settleHelp();

    expect(within(helpSheet()).getByText('Explicação de river')).toBeInTheDocument();
    expect(requestHelp).toHaveBeenCalledWith(expect.objectContaining({ lineIndex: 0, kind: 'explain', target: 'river' }));
    expect(screen.queryByRole('list', { name: 'Letra' })).not.toBeInTheDocument();
    scrollTo.mockClear();

    fireEvent.click(screen.getByRole('button', { name: 'Valeu' }));

    expect(screen.getByRole('list', { name: 'Letra' })).toBeVisible();
    expect(within(currentRow()!).getByRole('button', { name: 'river' })).toHaveFocus();
    // The list was hidden and lost its scroll, so the current line is centered again.
    expect(scrollTo).toHaveBeenCalled();
  });

  it('reports the end once when the song ends while a word is explained, and does not play on after "Valeu"', async () => {
    const onEnd = renderKaraoke({ requestHelp: helpService() });
    playTo(11000);
    fireEvent.click(within(currentRow()!).getByRole('button', { name: 'Hold' }));
    await settleHelp();
    const before = fake.calls.length;

    // The player ran the clip out from its own controls.
    act(() => fake.emitState('ended'));
    expect(onEnd).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: 'Valeu' }));

    expect(fake.calls.slice(before)).toEqual([]);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(onEnd).toHaveBeenCalledOnce();
  });

  it('pauses the song while a word is explained, and plays it again on "Valeu"', async () => {
    renderKaraoke({ requestHelp: helpService() });
    playTo(1000);
    const before = fake.calls.length;

    fireEvent.click(within(currentRow()!).getByRole('button', { name: 'river' }));
    await settleHelp();
    finishFadeOut();
    fireEvent.click(screen.getByRole('button', { name: 'Valeu' }));
    finishFadeIn();

    expect(fake.calls.slice(before)).toEqual([...FADE_OUT_STEPS, 'pause', 'play', ...FADE_IN_STEPS]);
  });

  it('has no "Traduzir verso": the translations come by themselves, and showing or hiding them leaves the clip alone', async () => {
    renderKaraoke({ requestHelp: helpService() });
    playTo(1000);
    await settleHelp();
    const before = fake.calls.length;

    expect(screen.queryByRole('button', { name: 'Traduzir verso' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Esconder tradução' }));
    finishFadeOut();

    expect(screen.queryByRole('button', { name: 'Continuar' })).not.toBeInTheDocument();
    expect(fake.calls.slice(before)).toEqual([]);
  });

  it('centers the current line again after the settings sheet, which hides the list and loses its scroll', () => {
    renderKaraoke();
    scrollTo.mockClear();

    openSettings();
    expect(scrollTo).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Pronto' }));

    expect(scrollTo).toHaveBeenCalledOnce();
  });

  it('scrolls only the list, never the page under the player', () => {
    const pageScroll = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    renderKaraoke();

    playTo(4500);

    expect(scrollTo).toHaveBeenCalled();
    expect(pageScroll).not.toHaveBeenCalled();
  });
});

describe('ToolsBar', () => {
  function renderTools(hintPerk: 'free' | 'ad' | 'off') {
    const handlers = { onSlow: vi.fn(), onRepeat: vi.fn(), onHint: vi.fn() };
    render(<ToolsBar {...handlers} hintPerk={hintPerk} slow={false} />);
    return handlers;
  }

  describe('with an action of the mode in place of the hint', () => {
    function renderAction() {
      const onClick = vi.fn();
      render(<ToolsBar onSlow={vi.fn()} onRepeat={vi.fn()} slow={false} action={{ label: 'Esconder tradução', onClick }} />);
      return onClick;
    }

    it('shows the action, drawn like the other tools, and no hint', () => {
      const onClick = renderAction();

      const action = screen.getByRole('button', { name: 'Esconder tradução' });
      expect(action).toHaveClass('bg-card', 'min-h-11');
      // The dashed lime border is the mark of an ad spot, and this is not one.
      expect(action).not.toHaveClass('border-dashed');
      expect(action).not.toHaveAttribute('aria-pressed');
      fireEvent.click(action);
      expect(onClick).toHaveBeenCalledOnce();
      expect(screen.queryByRole('button', { name: /Dica/ })).not.toBeInTheDocument();
    });

    it('keeps 0.75x and Repetir verso, each at least 44 px tall', () => {
      renderAction();

      expect(screen.getAllByRole('button').map((button) => button.textContent)).toEqual([
        '0.75x',
        'Repetir verso',
        'Esconder tradução',
      ]);
      for (const button of screen.getAllByRole('button')) expect(button).toHaveClass('min-h-11');
    });

    it('gives the action the widest share of the row, so its label fits on one line on most phones', () => {
      renderAction();

      const share = (name: string) => Number(/flex-\[([\d.]+)\]/.exec(screen.getByRole('button', { name }).className)?.[1]);
      expect(share('Esconder tradução')).toBeGreaterThan(share('Repetir verso'));
      expect(share('Esconder tradução')).toBeGreaterThan(share('0.75x'));
    });

    it('lets a long label wrap onto a second line, so it fits on a 320 px phone', () => {
      renderAction();

      expect(screen.getByRole('button', { name: 'Esconder tradução' })).not.toHaveClass('whitespace-nowrap');
      expect(screen.getByRole('button', { name: 'Repetir verso' })).toHaveClass('whitespace-nowrap');
    });
  });

  it('the free hint is "Dica" in a dashed lime border', () => {
    const { onHint } = renderTools('free');

    const hint = screen.getByRole('button', { name: 'Dica' });
    expect(hint).toHaveClass('border-dashed', 'border-lime');
    fireEvent.click(hint);
    expect(onHint).toHaveBeenCalledOnce();
  });

  it('a free hint with nothing to help with greys out but keeps the focus: aria-disabled, and a tap does nothing', () => {
    const onHint = vi.fn();
    render(<ToolsBar onSlow={vi.fn()} onRepeat={vi.fn()} onHint={onHint} hintPerk="free" hintDisabled slow={false} />);

    const hint = screen.getByRole('button', { name: 'Dica' });
    hint.focus();
    expect(hint).toHaveAttribute('aria-disabled', 'true');
    expect(hint).toBeEnabled();
    expect(hint).toHaveClass('aria-disabled:border-border', 'aria-disabled:text-faint');
    fireEvent.click(hint);
    expect(onHint).not.toHaveBeenCalled();
    expect(hint).toHaveFocus();
  });

  it('a free hint that can be used carries no aria-disabled', () => {
    renderTools('free');

    expect(screen.getByRole('button', { name: 'Dica' })).not.toHaveAttribute('aria-disabled');
  });

  it('a hint behind an ad shows the ad spot but gives nothing until ads exist', () => {
    const { onHint } = renderTools('ad');

    const hint = screen.getByRole('button', { name: 'Dica · anúncio' });
    // The ad spot keeps its lime dashed border (ruling R46), never the grey of a tool that is off.
    expect(hint).toHaveClass('border-dashed', 'border-lime');
    expect(hint.className).not.toMatch(/disabled:border-border|aria-disabled:border-border/);
    expect(hint).toBeDisabled();
    fireEvent.click(hint);
    expect(onHint).not.toHaveBeenCalled();
  });

  it('shows no hint when it is off', () => {
    renderTools('off');
    expect(screen.queryByRole('button', { name: /Dica/ })).not.toBeInTheDocument();
  });

  it('keeps every tool at least 44 px tall', () => {
    renderTools('free');
    for (const button of screen.getAllByRole('button')) expect(button).toHaveClass('min-h-11');
  });
});
