import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { tokenize } from '@/lib/game/blanks';
import { makeDistractors } from '@/lib/game/distractors';
import { seededRng, shuffled } from '@/lib/game/rng';
import { playHit, playMiss } from '@/lib/game/sfx';
import { makeTiles, tileSeed } from '@/lib/game/tiles';
import { HelpError } from '@/lib/help/helpError';
import type { HelpRequest } from '@/lib/help/helpService';
import type { HelpRequester } from '@/lib/help/useLineHelp';
import type { VideoRecord } from '@/lib/lyrics/resolveSong';
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

const ID = 'dQw4w9WgXcQ';
const DURATION_MS = 60000;

const LINES: LyricLine[] = [
  { index: 0, startMs: 0, endMs: 4000, text: "Please don't let me down" },
  { index: 1, startMs: 4000, endMs: 8000, text: 'I gave you everything I had' },
  { index: 2, startMs: 8000, endMs: 12000, text: 'And every street looks the same to me' },
];
const LET: Blank = { id: '0:2', lineIndex: 0, tokenIndex: 2, answer: 'let' };
const GAVE: Blank = { id: '1:1', lineIndex: 1, tokenIndex: 1, answer: 'gave' };
const STREET: Blank = { id: '2:2', lineIndex: 2, tokenIndex: 2, answer: 'street' };

/** Invented lines for the typing mode; "I can't get you off my mind" is the line the wireframe draws. */
const TYPING_LINES: LyricLine[] = [
  { index: 0, startMs: 0, endMs: 4000, text: "I can't get you off my mind" },
  { index: 1, startMs: 4000, endMs: 8000, text: 'And the radio plays our song' },
  { index: 2, startMs: 8000, endMs: 12000, text: 'Nothing else matters tonight' },
];
const GET: Blank = { id: '0:2', lineIndex: 0, tokenIndex: 2, answer: 'get' };
const RADIO: Blank = { id: '1:2', lineIndex: 1, tokenIndex: 2, answer: 'radio' };

/** Invented lines for Monte o verso, each one a puzzle on its own (a blank for the whole line, tokenIndex -1). */
const BUILD_LINES: LyricLine[] = [
  { index: 0, startMs: 0, endMs: 4000, text: 'Please come back home tonight' },
  { index: 1, startMs: 4000, endMs: 8000, text: 'Keep the porch light on for me' },
  { index: 2, startMs: 8000, endMs: 12000, text: 'Nothing else matters tonight' },
];
const WHOLE_0: Blank = { id: '0:-1', lineIndex: 0, tokenIndex: -1, answer: 'Please come back home tonight' };
const WHOLE_1: Blank = { id: '1:-1', lineIndex: 1, tokenIndex: -1, answer: 'Keep the porch light on for me' };
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
  text: "Please don't let me down",
}));
const ROUND_BLANKS: Blank[] = ROUND.map((line) => ({ id: `${line.index}:2`, lineIndex: line.index, tokenIndex: 2, answer: 'let' }));

const VIDEO: VideoRecord = {
  youtubeId: ID,
  title: 'The Beatles - Let It Be (Official Video)',
  channel: 'TheBeatlesVEVO',
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
    expect(screen.getByText('Let It Be · The Beatles')).toBeInTheDocument();
    expect(screen.getByText('Modo Escolha')).toBeInTheDocument();
    expect(screen.getByText('x0')).toHaveClass('bg-lime', 'text-bg');
    expect(dj()).toHaveAttribute('data-expression', 'idle');
  });

  it('puts its header in the slot the song screen gives it, above the player', () => {
    const slot = document.createElement('div');
    document.body.append(slot);

    renderGame({ headerSlot: slot });

    expect(within(slot).getByRole('link', { name: 'Voltar' })).toBeInTheDocument();
    expect(within(slot).getByText('Let It Be · The Beatles')).toBeInTheDocument();
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
    expect(fake.calls.at(-1)).toBe('pause');

    fireEvent.click(option('let'));
    expect(fake.calls.at(-1)).toBe('play');
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
    renderGame({ blanks: [STREET] });
    playTo(5000);
    const before = fake.calls.length;

    fireEvent.click(screen.getByRole('button', { name: 'Repetir verso' }));

    expect(fake.calls.slice(before)).toEqual(['seek:4000', 'play']);
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
    const before = fake.calls.length;

    fireEvent.click(option('late'));

    const miss = option('late, errou');
    expect(miss).toHaveClass('bg-error');
    expect(miss.querySelector('[data-icon="cross"]')).not.toBeNull();
    expect(document.body.textContent).not.toMatch(/acertou|errou/i);
    expect(fake.calls.slice(before)).toEqual(['seek:0', 'play']);
  });

  it('shows Dica with a dashed border; the free hint greys out one wrong option and the answer counts as helped', () => {
    const onEnd = renderGame();
    const hint = screen.getByRole('button', { name: 'Dica' });
    expect(hint).toHaveClass('border-dashed');

    fireEvent.click(hint);

    const greyed = [option('late'), option('lead')].filter((button) => button.hasAttribute('disabled'));
    expect(greyed).toHaveLength(1);
    expect(option('let')).toBeEnabled();
    // One hint per blank.
    expect(hint).toBeDisabled();

    fireEvent.click(option('let'));
    act(() => fake.emitState('ended'));
    expect(onEnd.mock.calls[0][1]).toEqual([{ blankId: LET.id, kind: 'helped', correct: true, beforeLineEnd: true }]);
  });

  it('works the options out only for the blank in play, once per blank', () => {
    renderGame({ blanks: [LET, GAVE, STREET] });
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
    const before = fake.calls.length;

    type('got');

    expect(fieldBox()).toHaveClass('bg-error');
    expect(fieldBox().querySelector('[data-icon="cross"]')).not.toBeNull();
    expect(fake.calls.slice(before)).toEqual(['seek:0', 'play']);
    expect(screen.getByTestId('line-current')).toHaveTextContent("I can't lacuna you off my mind");
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
    expect(screen.getByRole('button', { name: 'Dica' })).toBeDisabled();

    type('get');
    act(() => fake.emitState('ended'));
    expect(onEnd.mock.calls[0][1]).toEqual([{ blankId: GET.id, kind: 'helped', correct: true, beforeLineEnd: true }]);
  });

  it('goes on to the next blank with a new field that has the focus, and brings a right one back as it was', async () => {
    await renderTyping({ blanks: [GET, RADIO] });
    type('gte');
    expect(field()).toHaveFocus();

    playTo(4500);

    // A new question: an empty field, ready to type in.
    expect(screen.getByTestId('line-current')).toHaveTextContent('And the lacuna plays our song');
    expect(field()).toHaveValue('');
    expect(field()).not.toHaveAttribute('readonly');
    expect(field()).toHaveFocus();

    // The player goes back to the line that was answered: it comes back right, with its marks.
    act(() => {
      fake.seekTo(1000);
      vi.advanceTimersByTime(100);
    });
    expect(screen.getByTestId('line-current')).toHaveTextContent("I can't get you off my mind");
    expect(field()).toHaveValue('get');
    expect(field()).toHaveAttribute('readonly');
    expect(fieldBox()).toHaveClass('bg-lime');
    expect(fixedLettersIn(fieldBox())).toEqual(['e', 't']);
  });

  it('hides the blank of the line in play and works out no options', async () => {
    await renderTyping();

    expect(screen.getByTestId('line-current')).toHaveTextContent("I can't lacuna you off my mind");
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
    expect(screen.getByText('Let It Be · The Beatles')).toBeInTheDocument();
    expect(screen.getByTestId('line-current')).toHaveTextContent("I can't lacuna you off my mind");
    const before = fake.calls.length;
    fireEvent.click(screen.getByRole('button', { name: 'Repetir verso' }));
    expect(fake.calls.slice(before)).toEqual(['seek:0', 'play']);
    expect(destroy).not.toHaveBeenCalled();

    failing = false;
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    await settleImports(() => screen.queryByLabelText('Digite a palavra que falta') !== null);

    expect(field()).toBeEnabled();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByText('Let It Be · The Beatles')).toBeInTheDocument();
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
    expect(visibleText()).not.toMatch(/keep the porch|porch light/i);
    expect(makeDistractors).not.toHaveBeenCalled();
  });

  it('lays the line in play out once: the line before, "Traduzir verso", the row, the tiles, "Não entendi a ordem"', () => {
    renderBuild({ blanks: [WHOLE_0, WHOLE_1] });
    placeWords(BUILD_WORDS);
    playTo(4500);
    // A miss, so the line has an answer and "Não entendi a ordem" is there (ruling R65).
    fireEvent.click(tile('me'));

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
    placeWords(['Please', 'come']);
    expect(placedRow()).toEqual(['Please', 'come']);
    const before = fake.calls.length;

    // "back" comes next, not "tonight".
    fireEvent.click(tile('tonight'));

    expect(placedRow()).toEqual([]);
    const miss = tile('tonight, errou');
    expect(miss).toHaveClass('bg-error');
    expect(miss.querySelector('[data-icon="cross"]')).not.toBeNull();
    expect(screen.getByRole('status')).toHaveTextContent('tonight, errou');
    expect(visibleText()).not.toMatch(/acertou|errou/i);
    expect(fake.calls.slice(before)).toEqual(['seek:0', 'play']);
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
    expect(hint).toBeDisabled();
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
      const before = fake.calls.length;

      fireEvent.click(tile('tonight'));

      // The clip plays on: it does not go back to the start of the line.
      expect(fake.calls.slice(before)).toEqual(['play']);
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
  const TWO_BLANK_LINES: LyricLine[] = [{ ...LINES[0], text: "Please don't let me down, I'm begging you" }, LINES[1], LINES[2]];
  const A: Blank = { id: '0:2', lineIndex: 0, tokenIndex: 2, answer: 'let' };
  const B: Blank = { id: '0:6', lineIndex: 0, tokenIndex: 6, answer: 'begging' };

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

    expect(option('begging')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'late, errou' })).not.toBeInTheDocument();
    const [slotA, slotB] = slots();
    expect(slotA).toHaveClass('border-dashed');
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
    renderGame({ blanks: [LET, GAVE, STREET] });

    expect(screen.getByTestId('line-current')).toHaveTextContent("Please don't lacuna me down");
    expect(distractorsAskedFor()).toEqual(['let']);
    // The bar shows where the game is, not the stale reading.
    expect(screen.getByTestId('progress').style.width).toBe('0%');
  });
});

describe('GameScreen: the clock right after a seek (ruling R44)', () => {
  it('ignores the clock for 300 ms after Repetir verso, so a stale reading does not pause the line again', () => {
    renderGame();
    playTo(3850);
    expect(count('pause')).toBe(1);

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
    expect(count('pause')).toBe(1);

    // From 300 ms on, the clock counts again.
    act(() => {
      fake.advance(10);
      vi.advanceTimersByTime(100);
    });
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
    const before = fake.calls.length;
    fireEvent.click(option('late'));
    expect(fake.calls.slice(before)).toEqual(['play']);
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
    expect(current).toHaveTextContent("Please don't lacuna me down");
    const next = screen.getByTestId('line-next');
    expect(next).toHaveClass('text-muted');
    expect(next).toHaveTextContent('I lacuna you everything I had');
    expect(screen.queryByTestId('line-previous')).not.toBeInTheDocument();
  });

  it('moves on with the clip, and shows a blank that is right with its word', () => {
    renderGame({ blanks: [LET, GAVE] });
    fireEvent.click(option('let'));

    playTo(4500);

    expect(screen.getByTestId('line-previous')).toHaveTextContent("Please don't let me down");
    expect(screen.getByTestId('line-previous')).toHaveClass('text-muted');
    expect(screen.getByTestId('line-current')).toHaveTextContent('I lacuna you everything I had');
    expect(screen.getByTestId('line-next')).toHaveTextContent('And every street looks the same to me');
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

      fireEvent.click(word('mind'));
      await settleHelp();

      expect(within(helpSheet()).getByText('Explicação de mind')).toBeInTheDocument();
      expect(requestHelp).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ lineIndex: 0, target: 'mind' }));
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

      for (let i = 0; i < 2; i++) {
        fireEvent.click(word('mind'));
        await settleHelp();
        fireEvent.click(screen.getByRole('button', { name: 'Valeu' }));
      }

      expect(requestHelp).toHaveBeenCalledOnce();
    });

    it('gives a calm line in place of the explanation when the member asked too much, and never a status', async () => {
      renderHelped({ requestHelp: vi.fn<HelpRequester>(() => Promise.reject(new HelpError(429))) });

      fireEvent.click(word('mind'));
      await settleHelp();

      expect(within(helpSheet()).getByRole('status')).toHaveTextContent('Pausa rapidinha! Volta daqui a pouco?');
      expect(helpSheet()).not.toHaveTextContent(/429/);
    });
  });

  describe('the clip while the sheet is open (ruling R70)', () => {
    it('closes on Escape too, playing the clip again and giving the focus back', async () => {
      renderHelped();
      playTo(1000);
      const before = fake.calls.length;

      fireEvent.click(word('mind'));
      await settleHelp();
      fireEvent.keyDown(helpSheet(), { key: 'Escape' });

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(fake.calls.slice(before)).toEqual(['pause', 'play']);
      expect(word('mind')).toHaveFocus();
    });

    it('pauses a clip that plays, and plays it again on "Valeu"', async () => {
      renderHelped();
      playTo(1000);
      const before = fake.calls.length;

      fireEvent.click(word('mind'));
      await settleHelp();
      expect(fake.calls.slice(before)).toEqual(['pause']);

      fireEvent.click(screen.getByRole('button', { name: 'Valeu' }));
      expect(fake.calls.slice(before)).toEqual(['pause', 'play']);
    });

    it('leaves a clip the game paused for an answer alone, and still paused after "Valeu"', async () => {
      renderHelped();
      playTo(3850);
      expect(fake.calls.at(-1)).toBe('pause');
      const before = fake.calls.length;

      fireEvent.click(word('mind'));
      await settleHelp();
      fireEvent.click(screen.getByRole('button', { name: 'Valeu' }));

      expect(fake.calls.slice(before)).toEqual([]);
      // The game still waits for the answer, which plays the clip on.
      fireEvent.click(option('get'));
      expect(fake.calls.slice(before)).toEqual(['play']);
    });

    it('does not play on after "Valeu" when the game began to wait for an answer while the sheet was open', async () => {
      fake = new SlowToReportPlayer(DURATION_MS);
      renderHelped();
      playTo(1000);

      fireEvent.click(word('mind'));
      await settleHelp();
      // YouTube had not said it paused, so the clock went on to the end of the line, and the game paused it there.
      playTo(3850);
      const before = fake.calls.length;
      fireEvent.click(screen.getByRole('button', { name: 'Valeu' }));

      expect(fake.calls.slice(before)).toEqual([]);
    });

    it('does not start a clip the player had paused', async () => {
      renderHelped();
      playTo(1000);
      act(() => fake.emitState('paused'));
      const before = fake.calls.length;

      fireEvent.click(word('mind'));
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

  it('lets the player tap a word of the line in play to have it explained, but never the open blank', () => {
    const { onExplain } = renderPanel();

    fireEvent.click(within(screen.getByTestId('line-current')).getByRole('button', { name: 'down' }));

    expect(onExplain).toHaveBeenCalledExactlyOnceWith('down', 0, expect.any(HTMLButtonElement));
    expect(within(screen.getByTestId('line-current')).queryByRole('button', { name: 'let' })).not.toBeInTheDocument();
    expect(within(screen.getByTestId('line-next')).queryAllByRole('button')).toHaveLength(0);
  });

  it('hands over the very button that was tapped, so the focus can go back to it even on Safari', () => {
    const { onExplain } = renderPanel({ status: { [LET.id]: 'wrong' } });

    const word = within(screen.getByTestId('line-current')).getByRole('button', { name: 'down' });
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
      blanks: [RADIO],
      status: { [RADIO.id]: 'wrong' },
    });

    fireEvent.click(within(screen.getByTestId('line-current')).getByRole('button', { name: 'plays' }));
    expect(onExplain).toHaveBeenLastCalledWith('plays', 1, expect.any(HTMLButtonElement));
    fireEvent.click(screen.getByRole('button', { name: 'Não entendi' }));
    expect(onExplain).toHaveBeenLastCalledWith('radio', 1, expect.any(HTMLButtonElement));
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
    const DOWN: Blank = { id: '0:4', lineIndex: 0, tokenIndex: 4, answer: 'down' };
    renderPanel({
      blanks: [LET, DOWN],
      status: { [LET.id]: 'correct', [DOWN.id]: 'correct' },
      corrected: { [LET.id]: [1, 2] },
    });

    const line = within(screen.getByTestId('line-current'));
    const fixedWord = line.getByRole('button', { name: 'let, corrigido automaticamente' });
    const plainWord = line.getByRole('button', { name: 'down, acertou' });
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

    expect(screen.getByTestId('line-previous')).toHaveTextContent("Please don't let me down");
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

    expect(screen.getByTestId('line-previous')).toHaveTextContent("Please don't let me down");
    expect(fixedLettersIn(screen.getByTestId('line-previous'))).toEqual([]);
  });

  it('keeps every button at least 44 px tall', () => {
    renderPanel({ status: { [LET.id]: 'wrong' } });
    for (const button of screen.getAllByRole('button')) expect(button).toHaveClass('min-h-11');
  });

  describe('a line that is a puzzle (Monte o verso, rulings R52, R55 and R59)', () => {
    const WHOLE_LINES = { lines: BUILD_LINES, blanks: [WHOLE_0, WHOLE_1] };
    const FIRST_LINE_WORDS = /please|come|back|home|tonight/i;
    const SECOND_LINE_WORDS = /keep|porch|light/i;

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

        expect(screen.getByTestId('line-current')).toHaveTextContent('I gave you everything I had');
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
          translation: { status: 'done', text: 'Deixe a luz da varanda acesa' },
        });

        expect(screen.getByTestId('translation')).toHaveTextContent('Deixe a luz da varanda acesa');
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

        expect(screen.getByTestId('line-current')).toHaveTextContent("Please don't lacuna me down");
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
    fireEvent.click(screen.getByRole('button', { name: 'Valeu' }));

    expect(fake.calls.slice(before)).toEqual(['pause', 'play']);
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

  it('a hint behind an ad shows the ad spot but gives nothing until ads exist', () => {
    const { onHint } = renderTools('ad');

    const hint = screen.getByRole('button', { name: 'Dica · anúncio' });
    // The ad spot keeps its lime dashed border (ruling R46), never the grey of a tool that is off.
    expect(hint).toHaveClass('border-dashed', 'border-lime');
    expect(hint.className).not.toMatch(/disabled:border-border/);
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
