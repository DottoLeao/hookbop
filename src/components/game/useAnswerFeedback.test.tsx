import { render, screen } from '@testing-library/react';
import gsap from 'gsap';
import { StrictMode, useRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { layOutPage } from '@/lib/motion/laidOutPage';
import { useAnswerFeedback, type AnswerResult } from './useAnswerFeedback';

// The real GSAP, in jsdom: nothing plays here, but the tweens are made, sampled, killed and reverted for real.

/** The phone's "reduzir movimento" setting, read through matchMedia. */
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

function Box({ result, attempt }: { result: AnswerResult; attempt?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useAnswerFeedback(ref, result, attempt);
  return (
    <div ref={ref} data-testid="box" aria-label="Resposta" className="rounded">
      <input aria-label="Campo" />
    </div>
  );
}

const box = () => screen.getByTestId('box');
const tweensOfBox = () => gsap.getTweensOf(box());

/** What tells GSAP how to run a tween, not what to change. */
const HOW = ['duration', 'ease', 'delay', 'clearProps', 'overwrite', 'startAt', 'parent', 'immediateRender'];

/** Moves the tween on the box to a point (0 to 1) of its run. Events are not suppressed: GSAP clears what it set at the end. */
function seek(progress: number) {
  const [tween] = tweensOfBox();
  tween.progress(progress, false);
  return tween;
}

/** The box at a point of its run. Reading a value at the very end would draw the box again, so it is not read there. */
function sampled(progress: number) {
  const tween = seek(progress);
  return { tween, x: Number(gsap.getProperty(box(), 'x')), scale: Number(gsap.getProperty(box(), 'scale')) };
}

/** The `style` attribute of the box: nothing at all once nothing of the animation is left. */
const styleOf = () => box().getAttribute('style') ?? '';

afterEach(() => {
  gsap.globalTimeline.clear();
  vi.unstubAllGlobals();
});

describe('useAnswerFeedback', () => {
  it('animates nothing for the state it first renders in, whichever it is', () => {
    render(<Box result="hit" />);
    expect(tweensOfBox()).toHaveLength(0);
    expect(styleOf()).toBe('');
  });

  it('animates nothing while there is no result', () => {
    const { rerender } = render(<Box result={null} />);

    rerender(<Box result={null} attempt={3} />);

    expect(tweensOfBox()).toHaveLength(0);
  });

  describe('a hit', () => {
    it('pops: grows a little and comes back, in no more than 0.3 s, changing only scale', () => {
      const { rerender } = render(<Box result={null} />);

      rerender(<Box result="hit" />);

      const [tween] = tweensOfBox();
      expect(tween.duration()).toBeLessThanOrEqual(0.3);
      expect(tween.duration()).toBeGreaterThanOrEqual(0.2);
      expect(tween.delay()).toBe(0);
      const peak = Math.max(...[0.1, 0.2, 0.3, 0.4, 0.5].map((p) => sampled(p).scale));
      expect(peak).toBeGreaterThan(1.03);
      expect(peak).toBeLessThanOrEqual(1.1);
      expect(sampled(0).scale).toBe(1);
      expect(Object.keys(tween.vars).filter((name) => !HOW.includes(name))).toEqual(['scale']);
    });

    it('ends exactly where it started, with nothing of the pop left on the box', () => {
      const { rerender } = render(<Box result={null} />);
      rerender(<Box result="hit" />);
      expect(styleOf()).not.toBe('');

      seek(1);

      expect(styleOf()).toBe('');
    });
  });

  describe('a miss', () => {
    it('shakes: swings to both sides and dies away to where it was, in about 0.3 s, changing only x', () => {
      const { rerender } = render(<Box result={null} />);

      rerender(<Box result="miss" />);

      const [tween] = tweensOfBox();
      expect(tween.duration()).toBeLessThanOrEqual(0.3);
      expect(tween.duration()).toBeGreaterThanOrEqual(0.25);
      expect(tween.delay()).toBe(0);
      const path = [0.1, 0.3, 0.5, 0.7, 0.9].map((p) => sampled(p).x);
      expect(Math.max(...path)).toBeGreaterThan(3);
      expect(Math.min(...path)).toBeLessThan(-3);
      // A shake of a few px: never far enough to leave the gutter of the screen.
      expect(Math.max(...path.map(Math.abs))).toBeLessThanOrEqual(10);
      // It dies away, so the last swing is smaller than the first.
      expect(Math.abs(path[4])).toBeLessThan(Math.abs(path[0]));
      expect(sampled(0).x).toBe(0);
      expect(Math.abs(sampled(0.999).x)).toBeLessThan(0.05);
      expect(Object.keys(tween.vars).filter((name) => !HOW.includes(name))).toEqual(['x']);
    });

    it('ends exactly where it started, with no transform left on the box', () => {
      const { rerender } = render(<Box result={null} />);
      rerender(<Box result="miss" />);
      sampled(0.4);
      expect(box().style.transform).not.toBe('');

      seek(1);

      expect(styleOf()).toBe('');
    });

    it('shakes again for a new miss in the same state, and never queues the shakes', () => {
      const { rerender } = render(<Box result="miss" attempt={1} />);
      expect(tweensOfBox()).toHaveLength(0);
      rerender(<Box result="miss" attempt={2} />);
      const [first] = tweensOfBox();
      sampled(0.2);

      rerender(<Box result="miss" attempt={3} />);

      const now = tweensOfBox();
      expect(now).toHaveLength(1);
      expect(now[0]).not.toBe(first);
      expect(first.isActive()).toBe(false);
      // The new one starts from its own start, not from wherever the killed one had got to.
      expect(sampled(0).x).toBe(0);
    });
  });

  describe('when the answer goes away before the animation is over', () => {
    it('puts the box back at once when the result is taken back (a new try), with no tween left', () => {
      const { rerender } = render(<Box result={null} />);
      rerender(<Box result="miss" />);
      sampled(0.2);
      expect(box().style.transform).not.toBe('');

      rerender(<Box result={null} />);

      expect(tweensOfBox()).toHaveLength(0);
      expect(styleOf()).toBe('');
    });

    it('puts the box back when the result turns into the other one, and starts the new animation from rest', () => {
      const { rerender } = render(<Box result={null} />);
      rerender(<Box result="miss" />);
      sampled(0.2);

      rerender(<Box result="hit" />);

      expect(tweensOfBox()).toHaveLength(1);
      expect(sampled(0).x).toBe(0);
      expect(sampled(0).scale).toBe(1);
    });

    it('leaves no tween and no style behind when the box goes away mid-animation', () => {
      const { rerender, unmount } = render(<Box result={null} />);
      rerender(<Box result="miss" />);
      sampled(0.2);
      const element = box();
      expect(element.style.transform).not.toBe('');

      unmount();

      expect(gsap.getTweensOf(element)).toHaveLength(0);
      expect(element.getAttribute('style') ?? '').toBe('');
    });
  });

  it('only fades when motion is reduced: no x, no scale, and nothing left when it is over', () => {
    preferReducedMotion(true);
    const { rerender } = render(<Box result={null} />);

    for (const result of ['hit', 'miss'] as const) {
      rerender(<Box result={null} />);
      rerender(<Box result={result} />);
      const [tween] = tweensOfBox();
      const changed = Object.keys(tween.vars).filter(
        (name) => !HOW.includes(name),
      );
      expect(changed).toEqual(['opacity']);
      expect(tween.duration()).toBeLessThanOrEqual(0.3);
      expect(box().style.transform).toBe('');
      expect(Number(gsap.getProperty(box(), 'opacity'))).toBeLessThan(1);
      seek(1);
      expect(styleOf()).toBe('');
    }
  });

  it('never moves the focus: what had it keeps it, and the box is never made unreachable', () => {
    // jsdom lays nothing out, and GSAP would take the element out of the DOM and put it back to measure it, which loses
    // the focus. On a phone, where the page is laid out, it never does: so the page is made to look laid out.
    const unlayPage = layOutPage();
    try {
      const { rerender } = render(<Box result={null} />);
      const field = screen.getByLabelText('Campo');
      field.focus();

      rerender(<Box result="miss" />);
      expect(field).toHaveFocus();
      rerender(<Box result="hit" />);
      expect(field).toHaveFocus();
      expect(box()).not.toHaveAttribute('inert');
      expect(box().style.pointerEvents).toBe('');
      expect(box().style.visibility).toBe('');
    } finally {
      unlayPage();
    }
  });

  it('keeps the attributes of the box: only its style changes', () => {
    const { rerender } = render(<Box result={null} />);
    const attributes = () => box().getAttributeNames().filter((name) => name !== 'style').sort();
    const before = attributes();

    rerender(<Box result="miss" />);
    sampled(0.3);

    expect(attributes()).toEqual(before);
    expect(box()).toHaveAttribute('aria-label', 'Resposta');
    expect(box()).toHaveClass('rounded');
  });

  it('plays once under StrictMode too: nothing at the first render, one tween when the result comes', () => {
    const { rerender } = render(
      <StrictMode>
        <Box result={null} />
      </StrictMode>,
    );
    expect(tweensOfBox()).toHaveLength(0);

    rerender(
      <StrictMode>
        <Box result="hit" />
      </StrictMode>,
    );

    expect(tweensOfBox()).toHaveLength(1);
  });

  it('does not play for a result that was already there when it was first drawn, under StrictMode', () => {
    render(
      <StrictMode>
        <Box result="hit" />
      </StrictMode>,
    );

    expect(tweensOfBox()).toHaveLength(0);
    expect(styleOf()).toBe('');
  });
});
