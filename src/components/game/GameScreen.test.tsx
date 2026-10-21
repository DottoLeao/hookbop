import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { tokenize } from '@/lib/game/blanks';
import { makeDistractors } from '@/lib/game/distractors';
import { seededRng, shuffled } from '@/lib/game/rng';
import { playHit, playMiss } from '@/lib/game/sfx';
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

describe('LyricPanel', () => {
  function renderPanel(over: Partial<Parameters<typeof LyricPanel>[0]> = {}) {
    const onTranslate = vi.fn();
    const onExplain = vi.fn<(target: string) => void>();
    render(
      <LyricPanel
        lines={LINES}
        current={0}
        blanks={[LET]}
        status={{ [LET.id]: 'pending' }}
        showTranslation={false}
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

    expect(onExplain).toHaveBeenCalledExactlyOnceWith('down');
    expect(within(screen.getByTestId('line-current')).queryByRole('button', { name: 'let' })).not.toBeInTheDocument();
    expect(within(screen.getByTestId('line-next')).queryAllByRole('button')).toHaveLength(0);
  });

  it('"Traduzir verso" asks for the translation', () => {
    const { onTranslate } = renderPanel();

    fireEvent.click(screen.getByRole('button', { name: 'Traduzir verso' }));

    expect(onTranslate).toHaveBeenCalledOnce();
  });

  it('shows the translation in place of "Traduzir verso" when it is always shown and there is one', () => {
    renderPanel({ showTranslation: true, translation: 'Por favor, não me decepcione' });

    expect(screen.getByTestId('translation')).toHaveTextContent('Por favor, não me decepcione');
    expect(screen.queryByRole('button', { name: 'Traduzir verso' })).not.toBeInTheDocument();
  });

  it('keeps the translation hidden while it is not always shown', () => {
    renderPanel({ showTranslation: false, translation: 'Por favor, não me decepcione' });

    expect(screen.queryByText('Por favor, não me decepcione')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Traduzir verso' })).toBeInTheDocument();
  });

  it('after an answer, "Não entendi" explains the blank word, and a right blank can be tapped too', () => {
    const { onExplain } = renderPanel({ status: { [LET.id]: 'correct' } });

    fireEvent.click(screen.getByRole('button', { name: 'Não entendi' }));
    expect(onExplain).toHaveBeenLastCalledWith('let');

    fireEvent.click(within(screen.getByTestId('line-current')).getByRole('button', { name: 'let' }));
    expect(onExplain).toHaveBeenCalledTimes(2);
    expect(onExplain).toHaveBeenLastCalledWith('let');
  });

  it('keeps every button at least 44 px tall', () => {
    renderPanel({ status: { [LET.id]: 'wrong' } });
    for (const button of screen.getAllByRole('button')) expect(button).toHaveClass('min-h-11');
  });
});

describe('ToolsBar', () => {
  function renderTools(hintPerk: 'free' | 'ad' | 'off') {
    const handlers = { onSlow: vi.fn(), onRepeat: vi.fn(), onHint: vi.fn() };
    render(<ToolsBar {...handlers} hintPerk={hintPerk} slow={false} />);
    return handlers;
  }

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
