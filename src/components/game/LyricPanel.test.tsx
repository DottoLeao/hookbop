import { fireEvent, render, screen } from '@testing-library/react';
import gsap from 'gsap';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Blank, LyricLine } from '@/lib/types';
import { LyricPanel } from './LyricPanel';

// jsdom has no animation, so GSAP is only watched: what the panel asks it to animate, and how.
vi.mock('gsap');

// Invented lines, not lyrics.
const LINES: LyricLine[] = [
  { index: 0, startMs: 0, endMs: 4000, text: 'Paper boats on a river of light' },
  { index: 1, startMs: 4000, endMs: 8000, text: 'Counting the stars from the roof' },
  { index: 2, startMs: 8000, endMs: 12000, text: 'Hold the line till the morning comes' },
  { index: 3, startMs: 12000, endMs: 16000, text: 'Dancing slow in the kitchen glow' },
  { index: 4, startMs: 16000, endMs: 20000, text: 'Sing it back to me once more' },
  { index: 5, startMs: 20000, endMs: 24000, text: 'Lanterns drifting over the bay' },
];
const STARS: Blank = { id: '1:2', lineIndex: 1, tokenIndex: 2, answer: 'stars' };
const LINE: Blank = { id: '2:2', lineIndex: 2, tokenIndex: 2, answer: 'line' };

type Props = Parameters<typeof LyricPanel>[0];

let props: Props;
let view: ReturnType<typeof render>;

function renderPanel(over: Partial<Props> = {}) {
  props = {
    lines: LINES,
    current: 1,
    blanks: [STARS, LINE],
    status: { [STARS.id]: 'pending', [LINE.id]: 'pending' },
    onTranslate: vi.fn(),
    onExplain: vi.fn(),
    ...over,
  };
  view = render(<LyricPanel {...props} />);
}

/** The same panel with other props, so it is the same component kept on screen. */
function update(over: Partial<Props>) {
  props = { ...props, ...over };
  view.rerender(<LyricPanel {...props} />);
}

type Vars = Record<string, unknown>;
interface Tween {
  targets: Element[];
  from: Vars;
  to: Vars;
}

/** Every animation the panel asked GSAP for, each with the elements it moves. */
function tweens(): Tween[] {
  // fromTo(targets, fromVars, toVars), the one form the code uses (the types read the calls as its last overload).
  const calls = vi.mocked(gsap.fromTo).mock.calls as unknown as [gsap.TweenTarget, Vars, Vars][];
  return calls.map(([targets, from, to]) => ({ targets: [targets].flat() as Element[], from, to }));
}

/** The animations that move `element`. */
function tweensOf(element: Element): Tween[] {
  return tweens().filter((tween) => tween.targets.includes(element));
}

function properties(tween: Tween): string[] {
  return [...Object.keys(tween.from), ...Object.keys(tween.to)];
}

/** Reduced motion is the phone's setting, read through matchMedia. */
function preferReducedMotion(reduce: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: reduce && query === '(prefers-reduced-motion: reduce)',
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
}

beforeEach(() => {
  preferReducedMotion(false);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('LyricPanel: the lyrics slide from line to line', () => {
  it('does not animate the first line it shows, only a change of line', () => {
    renderPanel();

    expect(gsap.fromTo).not.toHaveBeenCalled();
  });

  it('slides the lyrics up when the song moves on to the next line, with y and opacity', () => {
    renderPanel();

    update({ current: 2 });

    const current = tweensOf(screen.getByTestId('line-current'));
    expect(current).toHaveLength(1);
    // The line in play rises into place from below, and grows and brightens as it does.
    expect(current[0].from).toEqual(expect.objectContaining({ y: expect.any(Number), opacity: expect.any(Number) }));
    expect(current[0].from.y).toBeGreaterThan(0);
    expect(current[0].from.scale).toBeLessThan(1);
    expect(current[0].from.opacity).toBeLessThan(1);
    expect(current[0].to).toEqual(expect.objectContaining({ y: 0, scale: 1, opacity: 1 }));
  });

  it('moves the line before up with it, and brings the next line in dim from below', () => {
    renderPanel();

    update({ current: 2 });

    const [previous] = tweensOf(screen.getByTestId('line-previous'));
    expect(previous.from.y).toBeGreaterThan(0);
    expect(previous.to).toEqual(expect.objectContaining({ y: 0, opacity: 1 }));
    const [next] = tweensOf(screen.getByTestId('line-next'));
    expect(next.from).toEqual(expect.objectContaining({ opacity: 0 }));
    expect(next.from.y).toBeGreaterThan(0);
    expect(next.to).toEqual(expect.objectContaining({ y: 0, opacity: 1 }));
  });

  it('rises from below only, so nothing moves up over the player above the panel', () => {
    renderPanel();

    update({ current: 2 });

    for (const tween of tweens()) {
      expect(Number(tween.from.y ?? 0)).toBeGreaterThanOrEqual(0);
    }
  });

  it('moves only lines of the lyrics, with transform and opacity, and nothing outside the panel', () => {
    renderPanel();

    update({ current: 2 });

    const panel = screen.getByTestId('line-current').parentElement!;
    expect(tweens().length).toBeGreaterThan(0);
    for (const tween of tweens()) {
      for (const target of tween.targets) {
        expect(panel.contains(target)).toBe(true);
        expect(target).toHaveAttribute('data-testid', expect.stringMatching(/^line-/));
      }
      for (const property of properties(tween)) {
        expect(['y', 'scale', 'opacity', 'transformOrigin', 'duration', 'delay', 'ease', 'clearProps']).toContain(
          property,
        );
      }
    }
  });

  it('is over in less than 450 ms', () => {
    renderPanel();

    update({ current: 2 });

    for (const tween of tweens()) {
      expect(Number(tween.to.delay ?? 0) + Number(tween.to.duration)).toBeLessThan(0.45);
    }
  });

  it('only fades, without y or scale, when the phone is set to reduce motion', () => {
    preferReducedMotion(true);
    renderPanel();

    update({ current: 2 });

    expect(tweens().length).toBeGreaterThan(0);
    expect(tweensOf(screen.getByTestId('line-current'))).toHaveLength(1);
    for (const tween of tweens()) {
      expect(properties(tween)).not.toContain('y');
      expect(properties(tween)).not.toContain('scale');
      expect(tween.from.opacity).toBeLessThan(1);
      expect(tween.to.opacity).toBe(1);
    }
  });

  it.each([
    ['goes back a line (Repetir verso, a seek back to a blank)', 1],
    ['goes back to the start (a resume)', 0],
    ['jumps several lines ahead (back from away)', 5],
  ])('only fades, without sliding the wrong way or the whole way, when the song %s', (_, to) => {
    renderPanel({ current: 2 });

    update({ current: to });

    expect(tweensOf(screen.getByTestId('line-current'))).toHaveLength(1);
    for (const tween of tweens()) {
      expect(properties(tween)).not.toContain('y');
      expect(properties(tween)).not.toContain('scale');
      expect(Number(tween.to.delay ?? 0) + Number(tween.to.duration)).toBeLessThan(0.45);
    }
  });

  it('asks for one transition per change of line, and none while the same line goes on', () => {
    renderPanel();
    update({ current: 2 });
    const once = tweens().length;

    update({ status: { [STARS.id]: 'correct', [LINE.id]: 'pending' } });
    update({ translation: { status: 'done', text: 'Segura a linha até a manhã chegar' } });

    expect(tweens()).toHaveLength(once);
  });

  it('keeps the text, the aria and the data-testid of the lines just as a panel drawn on that line has them', () => {
    renderPanel();
    update({ current: 2 });
    const slid = view.container.innerHTML;
    view.unmount();

    renderPanel({ current: 2 });

    expect(view.container.innerHTML).toBe(slid);
    // The blank still open on the line before stays hidden, as on any panel.
    expect(screen.getByTestId('line-previous')).toHaveTextContent('Counting the lacuna from the roof');
    expect(screen.getByTestId('line-current')).toHaveTextContent('Hold the lacuna till the morning comes');
    expect(screen.getByTestId('line-next')).toHaveTextContent('Dancing slow in the kitchen glow');
  });

  it('leaves the focus on the button that had it', () => {
    renderPanel();
    const translate = screen.getByRole('button', { name: 'Traduzir verso' });
    translate.focus();

    update({ current: 2 });

    expect(screen.getByRole('button', { name: 'Traduzir verso' })).toHaveFocus();
  });

  it('leaves "Continuar" with the focus it took, given once and without scrolling', () => {
    const focus = vi.spyOn(HTMLElement.prototype, 'focus');
    renderPanel({ onContinue: vi.fn() });

    update({ current: 2 });

    expect(screen.getByRole('button', { name: 'Continuar' })).toHaveFocus();
    expect(focus).toHaveBeenCalledExactlyOnceWith({ preventScroll: true });
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
    expect(props.onContinue).toHaveBeenCalledOnce();
    focus.mockRestore();
  });
});

describe('LyricPanel: the blank whose turn it is', () => {
  const ROOF: Blank = { id: '1:5', lineIndex: 1, tokenIndex: 5, answer: 'roof' };
  const WHOLE: Blank = { id: '2:-1', lineIndex: 2, tokenIndex: -1, answer: 'Hold the line till the morning comes' };

  /** The boxes of the blanks still open: each is drawn with the text "lacuna" for screen readers only. */
  const slots = () => screen.queryAllByText('lacuna').map((hidden) => hidden.parentElement!);
  const pulsing = () => slots().filter((slot) => slot.classList.contains('blank-pulse'));

  it('pulses the blank in play, and no other: not the other blanks of the line, nor those of the lines around it', () => {
    renderPanel({
      blanks: [STARS, ROOF, LINE],
      status: { [STARS.id]: 'pending', [ROOF.id]: 'pending', [LINE.id]: 'pending' },
      inPlayId: STARS.id,
    });

    expect(slots()).toHaveLength(3);
    expect(pulsing()).toHaveLength(1);
    const [turn] = pulsing();
    expect(turn).toHaveClass('border-[2.5px]', 'border-lime', 'bg-card');
    expect(turn.closest('[data-testid="line-current"]')).not.toBeNull();
  });

  it('moves the pulse to the next blank of the line when that one is the one in play', () => {
    renderPanel({
      blanks: [STARS, ROOF],
      status: { [STARS.id]: 'correct', [ROOF.id]: 'pending' },
      inPlayId: ROOF.id,
    });

    expect(pulsing()).toHaveLength(1);
    expect(slots()).toHaveLength(1);
  });

  it('stops pulsing when the blank is answered right, and when nothing is in play', () => {
    renderPanel({ inPlayId: STARS.id });
    expect(pulsing()).toHaveLength(1);

    update({ status: { [STARS.id]: 'correct', [LINE.id]: 'pending' }, inPlayId: undefined });

    expect(pulsing()).toHaveLength(0);
  });

  it('pulses nothing when no blank is in play', () => {
    renderPanel();

    expect(slots().length).toBeGreaterThan(0);
    expect(pulsing()).toHaveLength(0);
  });

  it('does not pulse a line that is a puzzle: the answer area holds it', () => {
    renderPanel({
      current: 2,
      blanks: [WHOLE],
      status: { [WHOLE.id]: 'pending' },
      inPlayId: WHOLE.id,
    });

    expect(pulsing()).toHaveLength(0);
  });

  it('keeps the slot as it was: its name for screen readers, and nothing else in it', () => {
    renderPanel({ inPlayId: STARS.id });

    const [turn] = pulsing();
    expect(turn).toHaveTextContent('lacuna');
    expect(turn.children).toHaveLength(1);
    expect(turn.querySelector('button, a, input, [tabindex]')).toBeNull();
    expect(turn).not.toHaveAttribute('style');
    expect(gsap.fromTo).not.toHaveBeenCalled();
  });
});

describe('LyricPanel: the translation on its way', () => {
  it('passes a shimmer where the translation will come, until it is there, and keeps saying it is translating', () => {
    renderPanel({ translation: { status: 'loading' } });

    const status = screen.getByRole('status');
    expect(status).toHaveTextContent('Traduzindo...');
    expect(status).toHaveClass('shimmer');
    expect(status.tagName).toBe('P');
  });

  it('keeps the pills as they are while it loads: no "Traduzir verso" until it fails, "Continuar" and "Não entendi" stay', () => {
    renderPanel({
      translation: { status: 'loading' },
      status: { [STARS.id]: 'correct', [LINE.id]: 'pending' },
      onContinue: vi.fn(),
    });

    expect(screen.queryByRole('button', { name: 'Traduzir verso' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Continuar' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Não entendi' })).toBeInTheDocument();
  });

  it('shows no shimmer once the translation is there', () => {
    renderPanel({ translation: { status: 'loading' } });

    update({ translation: { status: 'done', text: 'Segura a linha até a manhã chegar' } });

    expect(screen.getByTestId('translation')).toHaveTextContent('Segura a linha até a manhã chegar');
    expect(view.container.querySelector('.shimmer')).toBeNull();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('shows no shimmer when the translation failed: DJ Bop says so, and "Traduzir verso" asks again', () => {
    renderPanel({ translation: { status: 'error', message: 'Essa agora não deu. Fica pra próxima?' } });

    expect(screen.getByRole('status')).toHaveTextContent('Essa agora não deu. Fica pra próxima?');
    expect(view.container.querySelector('.shimmer')).toBeNull();
    expect(screen.getByRole('button', { name: 'Traduzir verso' })).toBeInTheDocument();
  });

  it('shows no shimmer, and no status, before a translation is asked for', () => {
    renderPanel();

    expect(view.container.querySelector('.shimmer')).toBeNull();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('shimmers again when a failed translation is asked for again', () => {
    renderPanel({ translation: { status: 'error', message: 'Essa agora não deu. Fica pra próxima?' } });

    update({ translation: { status: 'loading' } });

    expect(screen.getByRole('status')).toHaveClass('shimmer');
    expect(screen.getByRole('status')).toHaveTextContent('Traduzindo...');
  });
});
