import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isRealWord } from '@/lib/game/realWords';
import type { Blank } from '@/lib/types';
import { animations, animationsOf, changedBy, preferReducedMotion } from './answerFeedbackTesting';
import { DigitacaoArea } from './DigitacaoArea';

// jsdom plays no animation, so GSAP is only watched: what the area asks it to animate, and how.
vi.mock('gsap');

// The word list is the real one, so "got" is a real word and "gte" is not. The spy only lets the tests see when it
// is first asked, which the area does on its own once it is idle.
vi.mock('@/lib/game/realWords', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/game/realWords')>();
  return { ...actual, isRealWord: vi.fn(actual.isRealWord) };
});

const BLANK: Blank = { id: '0:2', lineIndex: 0, tokenIndex: 2, answer: 'get' };

function renderArea(props: Partial<Parameters<typeof DigitacaoArea>[0]> = {}) {
  const onAnswer = vi.fn<(correct: boolean, correctedIndices: number[]) => void>();
  const view = render(<DigitacaoArea blank={BLANK} onAnswer={onAnswer} {...props} />);
  return { onAnswer, ...view };
}

function field() {
  return screen.getByLabelText<HTMLInputElement>('Digite a palavra que falta');
}

/** Types the text and sends it, as the keyboard's "done" key does: through the form, not through a key event. */
function submit(text: string) {
  fireEvent.change(field(), { target: { value: text } });
  return fireEvent.submit(field().form!);
}

/** The box around the field and its icon, which is what changes color. */
function box() {
  return field().parentElement!;
}

/** What a sighted player can read: the page's text without what is only there for screen readers. */
function visibleText() {
  const copy = document.body.cloneNode(true) as HTMLElement;
  copy.querySelectorAll('.sr-only').forEach((hidden) => hidden.remove());
  return copy.textContent;
}

function fixedLetters() {
  return [...document.querySelectorAll('[data-corrected]')].map((span) => span.textContent);
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  // Unmount before timers and globals go back, so the area cancels what it scheduled on the stand-ins.
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('DigitacaoArea: the field', () => {
  it('has the label "Digite a palavra que falta" and keeps the phone keyboard from changing the word', () => {
    renderArea();

    const input = field();
    expect(input.tagName).toBe('INPUT');
    expect(input).toHaveAttribute('type', 'text');
    expect(input).toHaveAttribute('autocapitalize', 'none');
    expect(input).toHaveAttribute('autocorrect', 'off');
    expect(input).toHaveAttribute('spellcheck', 'false');
    expect(input).toHaveAttribute('autocomplete', 'off');
    expect(input).toHaveAttribute('enterkeyhint', 'done');
    // 16 px: a smaller field makes iOS zoom the page in when it takes the focus.
    expect(input).toHaveClass('text-button');
    expect(input).toBeEnabled();
    expect(input).not.toHaveAttribute('readonly');
  });

  it('is at least 44 px tall', () => {
    renderArea();
    expect(box()).toHaveClass('h-12');
  });

  it('shows no hint in the field until there is one', () => {
    renderArea();
    expect(field()).not.toHaveAttribute('placeholder');
  });

  it('with a hint, shows the first letter of the answer as the example text, and keeps the label', () => {
    renderArea({ hinted: true });

    expect(field()).toHaveAttribute('placeholder', 'g');
    expect(screen.getByText('Digite a palavra que falta')).toBeVisible();
  });

  it('draws the hint in the muted color, which has the contrast the hint needs on the field', () => {
    renderArea({ hinted: true });

    expect(field()).toHaveClass('placeholder:text-muted');
    expect(field()).not.toHaveClass('placeholder:text-faint');
  });

  describe('a hint asked for while the field is on the screen', () => {
    /** The hint button, which took the focus when it was tapped. */
    function tapHintButton() {
      const button = document.createElement('button');
      document.body.append(button);
      button.focus();
      return button;
    }

    it('after a miss, clears the wrong word so the first letter shows, and gives the field its focus back', () => {
      const focus = vi.spyOn(HTMLElement.prototype, 'focus');
      const { onAnswer, rerender } = renderArea();
      submit('got');
      expect(box()).toHaveClass('bg-error');
      const button = tapHintButton();
      focus.mockClear();

      rerender(<DigitacaoArea blank={BLANK} hinted onAnswer={onAnswer} />);

      expect(field()).toHaveValue('');
      expect(field()).toHaveAttribute('placeholder', 'g');
      // Back to a field waiting for a new try: no red, no cross, nothing said.
      expect(box()).not.toHaveClass('bg-error');
      expect(box().querySelector('[data-icon]')).toBeNull();
      expect(field()).not.toHaveAttribute('aria-invalid');
      expect(screen.getByRole('status')).toBeEmptyDOMElement();
      expect(field()).toHaveFocus();
      expect(focus).toHaveBeenCalledWith({ preventScroll: true });
      // The hint is not an answer.
      expect(onAnswer).toHaveBeenCalledOnce();
      button.remove();
      focus.mockRestore();
    });

    it('takes the next try after that, and it counts', () => {
      const { onAnswer, rerender } = renderArea();
      submit('got');
      rerender(<DigitacaoArea blank={BLANK} hinted onAnswer={onAnswer} />);

      submit('get');

      expect(onAnswer).toHaveBeenCalledTimes(2);
      expect(onAnswer).toHaveBeenLastCalledWith(true, []);
      expect(box()).toHaveClass('bg-lime');
    });

    it('while the player is typing, keeps what was typed and gives the focus back', () => {
      const { onAnswer, rerender } = renderArea();
      fireEvent.change(field(), { target: { value: 'ge' } });
      const button = tapHintButton();

      rerender(<DigitacaoArea blank={BLANK} hinted onAnswer={onAnswer} />);

      expect(field()).toHaveValue('ge');
      expect(field()).toHaveFocus();
      button.remove();
    });

    it('does not take the focus when the area appears already hinted and something else has it', () => {
      const button = tapHintButton();

      renderArea({ hinted: true });

      expect(button).toHaveFocus();
      button.remove();
    });

    it('does not take the focus for a blank that is already right', () => {
      const { onAnswer, rerender } = renderArea({ solved: true });
      const button = tapHintButton();

      rerender(<DigitacaoArea blank={BLANK} solved hinted onAnswer={onAnswer} />);

      expect(button).toHaveFocus();
      button.remove();
    });
  });

  it('with a hint, gives the first letter of an answer that starts with an apostrophe', () => {
    renderArea({ blank: { ...BLANK, answer: "'cause" }, hinted: true });

    expect(field()).toHaveAttribute('placeholder', 'c');
  });
});

describe('DigitacaoArea: a right answer', () => {
  it('forgives a typo: "Gte" is right, the answer shows with the fixed letters marked, lime with a check', () => {
    const { onAnswer } = renderArea();

    submit('Gte');

    expect(onAnswer).toHaveBeenCalledExactlyOnceWith(true, [1, 2]);
    expect(fixedLetters()).toEqual(['e', 't']);
    expect(box()).toHaveTextContent('get');
    expect(box()).toHaveClass('bg-lime', 'text-bg');
    expect(box().querySelector('[data-icon="check"]')).not.toBeNull();
    expect(box().querySelector('[data-icon="cross"]')).toBeNull();
    // Nothing more to type: the field is read-only, and it still holds the answer.
    expect(field()).toHaveAttribute('readonly');
    expect(field()).toHaveValue('get');
  });

  it('says the result for screen readers only, never as text on screen', () => {
    renderArea();

    submit('Gte');

    const status = screen.getByRole('status');
    expect(status).toHaveTextContent('get, corrigido automaticamente');
    expect(status).toHaveClass('sr-only');
    expect(field()).toHaveAccessibleDescription('get, corrigido automaticamente');
    expect(visibleText()).not.toMatch(/acertou|errou|corrigido/i);
  });

  it('takes the exact word, whatever the capitals and the spaces around it, with nothing marked', () => {
    const { onAnswer } = renderArea();

    submit(' GET ');

    expect(onAnswer).toHaveBeenCalledExactlyOnceWith(true, []);
    expect(fixedLetters()).toEqual([]);
    expect(box()).toHaveTextContent('get');
    expect(box()).toHaveClass('bg-lime');
    expect(screen.getByRole('status')).toHaveTextContent('get, acertou');
    expect(visibleText()).not.toMatch(/acertou|errou/i);
  });

  it('takes no more answers once it is right', () => {
    const { onAnswer } = renderArea();
    submit('get');

    fireEvent.submit(field().form!);
    fireEvent.change(field(), { target: { value: 'got' } });
    fireEvent.submit(field().form!);

    expect(onAnswer).toHaveBeenCalledOnce();
    expect(field()).toHaveValue('get');
  });
});

describe('DigitacaoArea: a wrong answer', () => {
  it('turns the field red with a cross, selects what was typed, and says nothing on screen', () => {
    const { onAnswer } = renderArea();

    submit('got');

    expect(onAnswer).toHaveBeenCalledExactlyOnceWith(false, []);
    expect(box()).toHaveClass('bg-error', 'text-bg');
    expect(box().querySelector('[data-icon="cross"]')).not.toBeNull();
    expect(box().querySelector('[data-icon="check"]')).toBeNull();
    expect(field()).toHaveAttribute('aria-invalid', 'true');
    // Selected, so a new try replaces it without erasing it first.
    expect(field().selectionStart).toBe(0);
    expect(field().selectionEnd).toBe(3);
    expect(screen.getByRole('status')).toHaveTextContent('got, errou');
    expect(screen.getByRole('status')).toHaveClass('sr-only');
    expect(visibleText()).not.toMatch(/acertou|errou/i);
  });

  it('is open for another try: typing clears the red, and the next answer counts', () => {
    const { onAnswer } = renderArea();
    submit('got');

    fireEvent.change(field(), { target: { value: 'get' } });

    expect(box()).not.toHaveClass('bg-error');
    expect(box().querySelector('[data-icon]')).toBeNull();
    expect(field()).not.toHaveAttribute('aria-invalid');
    expect(screen.getByRole('status')).toBeEmptyDOMElement();

    fireEvent.submit(field().form!);
    expect(onAnswer).toHaveBeenCalledTimes(2);
    expect(onAnswer).toHaveBeenLastCalledWith(true, []);
    expect(box()).toHaveClass('bg-lime');
  });

  it('does not count the same wrong word twice when it is sent again unchanged', () => {
    const { onAnswer } = renderArea();
    submit('got');

    fireEvent.submit(field().form!);

    expect(onAnswer).toHaveBeenCalledOnce();
    expect(box()).toHaveClass('bg-error');
    expect(field().selectionEnd).toBe(3);
  });

  it('judges a repeat by the word, not by the keys: other capitals or spaces are the same wrong word', () => {
    const { onAnswer } = renderArea();
    submit('got');

    submit('got ');
    submit(' GOT');
    submit('got.');

    expect(onAnswer).toHaveBeenCalledOnce();
    // The field shows it is still wrong, and the text is ready to be replaced.
    expect(box()).toHaveClass('bg-error');
    expect(box().querySelector('[data-icon="cross"]')).not.toBeNull();
    expect(field().selectionStart).toBe(0);
    expect(field().selectionEnd).toBe(field().value.length);
  });

  it('counts a different wrong word, and the first one again once it is not the last', () => {
    const { onAnswer } = renderArea();
    submit('got');

    submit('gut');
    expect(onAnswer).toHaveBeenCalledTimes(2);
    expect(onAnswer).toHaveBeenLastCalledWith(false, []);

    submit('got');
    expect(onAnswer).toHaveBeenCalledTimes(3);
  });

  it('does not forgive a word that is only a different real word', () => {
    const { onAnswer } = renderArea({ blank: { ...BLANK, answer: 'let' } });

    submit('lit');

    expect(onAnswer).toHaveBeenCalledExactlyOnceWith(false, []);
  });
});

describe('DigitacaoArea: what is not an answer', () => {
  it('ignores an empty value, spaces, and characters nobody can see', () => {
    const { onAnswer } = renderArea();

    submit('');
    submit('   ');
    submit(' \t');
    submit('​');

    expect(onAnswer).not.toHaveBeenCalled();
    expect(box().querySelector('[data-icon]')).toBeNull();
    expect(box()).not.toHaveClass('bg-error');
  });

  it('ignores a submit while an input method is still composing, and takes it once the composition ends', () => {
    const { onAnswer } = renderArea();

    fireEvent.compositionStart(field());
    submit('get');
    expect(onAnswer).not.toHaveBeenCalled();

    fireEvent.compositionEnd(field());
    fireEvent.submit(field().form!);
    expect(onAnswer).toHaveBeenCalledExactlyOnceWith(true, []);
  });

  it('keeps the form from reloading the page', () => {
    renderArea();
    fireEvent.change(field(), { target: { value: 'get' } });

    // fireEvent gives back false when the handler called preventDefault.
    expect(fireEvent.submit(field().form!)).toBe(false);
    expect(fireEvent.submit(field().form!)).toBe(false);
  });
});

describe('DigitacaoArea: the feedback of an answer', () => {
  it('pops the field, changing only its scale, as it turns lime with its check', () => {
    renderArea();
    expect(animations()).toHaveLength(0);

    submit('get');

    const [pop, ...more] = animationsOf(box());
    expect(more).toHaveLength(0);
    expect(changedBy(pop)).toEqual(['scale']);
    expect(pop.to.scale).toBeGreaterThan(1);
    expect(pop.to.duration).toBeLessThanOrEqual(0.3);
    expect(animations()).toHaveLength(1);
  });

  it('pops for a word that was only a slip away, too', () => {
    renderArea();

    submit('Gte');

    expect(changedBy(animationsOf(box())[0])).toEqual(['scale']);
  });

  it('shakes the field, changing only its x, as it turns red with its cross', () => {
    renderArea();

    submit('got');

    const [shake, ...more] = animationsOf(box());
    expect(more).toHaveLength(0);
    expect(changedBy(shake)).toEqual(['x']);
    expect(shake.to.duration).toBeLessThanOrEqual(0.3);
    expect(animations()).toHaveLength(1);
  });

  it('shakes again for every wrong try: another wrong word, and the same one sent again', () => {
    const { onAnswer } = renderArea();
    submit('got');

    fireEvent.submit(field().form!);
    submit('gut');

    expect(onAnswer).toHaveBeenCalledTimes(2);
    expect(animationsOf(box()).map(changedBy)).toEqual([['x'], ['x'], ['x']]);
  });

  it('is not held back: the next try is taken at once, and pops when it is right', () => {
    const { onAnswer } = renderArea();
    submit('got');

    submit('get');

    expect(onAnswer.mock.calls).toEqual([[false, []], [true, []]]);
    expect(animationsOf(box()).map(changedBy)).toEqual([['x'], ['scale']]);
  });

  it('animates nothing for a field that is empty, a send with no word, or one that is already right', () => {
    renderArea();
    submit('');
    submit('   ');
    expect(animations()).toHaveLength(0);

    submit('get');
    submit('got');

    expect(animations()).toHaveLength(1);
  });

  it('animates nothing for a blank that is already right when the area is drawn', () => {
    renderArea({ solved: true, corrected: [1, 2] });

    expect(animations()).toHaveLength(0);
  });

  it('does not shake again when a hint clears the wrong word', () => {
    const { onAnswer, rerender } = renderArea();
    submit('got');

    rerender(<DigitacaoArea blank={BLANK} hinted onAnswer={onAnswer} />);

    expect(animations()).toHaveLength(1);
  });

  it('only fades, for a right word and for a wrong one, when motion is reduced', () => {
    preferReducedMotion(true);
    renderArea();

    submit('got');
    submit('get');

    expect(animations()).toHaveLength(2);
    for (const animation of animations()) expect(changedBy(animation)).toEqual(['opacity']);
  });

  it('keeps the focus in the field, and its label, aria and the status for screen readers as they were', () => {
    renderArea();
    field().focus();

    submit('got');

    expect(field()).toHaveFocus();
    expect(field()).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText('Digite a palavra que falta')).toBe(field());
    expect(screen.getByRole('status')).toHaveTextContent('got, errou');
    expect(screen.getByRole('status')).toHaveClass('sr-only');
    expect(visibleText()).not.toMatch(/acertou|errou/i);
  });
});

describe('DigitacaoArea: a blank that is already right', () => {
  it('starts right, with the answer and a check, and takes no answer', () => {
    const { onAnswer } = renderArea({ solved: true });

    expect(box()).toHaveClass('bg-lime', 'text-bg');
    expect(box()).toHaveTextContent('get');
    expect(box().querySelector('[data-icon="check"]')).not.toBeNull();
    expect(field()).toHaveAttribute('readonly');
    expect(field()).toHaveValue('get');
    expect(screen.getByRole('status')).toHaveTextContent('get, acertou');
    expect(visibleText()).not.toMatch(/acertou|errou/i);

    fireEvent.change(field(), { target: { value: 'got' } });
    fireEvent.submit(field().form!);
    expect(onAnswer).not.toHaveBeenCalled();
  });

  it('shows the letters that were fixed when it was answered', () => {
    renderArea({ solved: true, corrected: [1, 2] });

    expect(fixedLetters()).toEqual(['e', 't']);
    expect(screen.getByRole('status')).toHaveTextContent('get, corrigido automaticamente');
  });
});

describe('DigitacaoArea: the focus', () => {
  it('takes the focus when it appears and nothing else has it, without scrolling the page', () => {
    const focus = vi.spyOn(HTMLElement.prototype, 'focus');

    renderArea();

    expect(field()).toHaveFocus();
    expect(focus).toHaveBeenCalledWith({ preventScroll: true });
    focus.mockRestore();
  });

  it('leaves the focus where it is when something else has it', () => {
    const other = document.createElement('button');
    document.body.append(other);
    other.focus();

    renderArea();

    expect(other).toHaveFocus();
    expect(field()).not.toHaveFocus();
    other.remove();
  });

  it('moves on to the next blank: the area of a right blank gives way to a new one that takes the focus', () => {
    const next: Blank = { id: '1:1', lineIndex: 1, tokenIndex: 1, answer: 'gave' };
    const { rerender } = renderArea();
    submit('get');
    expect(field()).toHaveFocus();

    rerender(<DigitacaoArea key={next.id} blank={next} onAnswer={vi.fn()} />);

    expect(field()).toHaveValue('');
    expect(field()).toHaveFocus();
  });

  it('does not take the focus for a blank that is already right', () => {
    renderArea({ solved: true });
    expect(field()).not.toHaveFocus();
  });
});

describe('DigitacaoArea: the word list', () => {
  it('has the word list ready once the page is idle, so the first answer does not stall', () => {
    vi.useFakeTimers();
    renderArea();
    expect(isRealWord).not.toHaveBeenCalled();

    act(() => vi.advanceTimersByTime(1000));

    expect(isRealWord).toHaveBeenCalledExactlyOnceWith('a');
  });

  it('asks the browser for an idle moment when it can, and gives it back if the area goes away first', () => {
    let idle: () => void = () => {};
    const request = vi.fn((callback: () => void) => {
      idle = callback;
      return 7;
    });
    const cancel = vi.fn();
    vi.stubGlobal('requestIdleCallback', request);
    vi.stubGlobal('cancelIdleCallback', cancel);

    const { unmount } = renderArea();
    expect(request).toHaveBeenCalledOnce();
    expect(isRealWord).not.toHaveBeenCalled();

    idle();
    expect(isRealWord).toHaveBeenCalledExactlyOnceWith('a');

    unmount();
    expect(cancel).toHaveBeenCalledExactlyOnceWith(7);
  });

  it('never warms it up once the area has gone', () => {
    vi.useFakeTimers();
    const { unmount } = renderArea();

    unmount();
    act(() => vi.advanceTimersByTime(5000));

    expect(isRealWord).not.toHaveBeenCalled();
  });
});
