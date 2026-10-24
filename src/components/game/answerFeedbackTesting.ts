import gsap from 'gsap';
import { vi } from 'vitest';

// What the tests of the answer areas share to watch the feedback of an answer. The test file mocks GSAP itself
// (`vi.mock('gsap')`, which has to be in the file it applies to): jsdom plays no animation, so what is checked is
// what the area asked GSAP to animate, and how. `useAnswerFeedback` is checked with the real GSAP in its own test.

type Vars = Record<string, unknown>;

export interface Animation {
  target: Element;
  from: Vars;
  to: Vars;
}

/** Every animation asked of the mocked GSAP, with the element it moves (`fromTo`, the one call the feedback uses). */
export function animations(): Animation[] {
  const calls = vi.mocked(gsap.fromTo).mock.calls as unknown as [Element, Vars, Vars][];
  return calls.map(([target, from, to]) => ({ target, from, to }));
}

/** The animations that move `element`. */
export function animationsOf(element: Element): Animation[] {
  return animations().filter((animation) => animation.target === element);
}

/** What tells GSAP how to run an animation, not what to change. */
const HOW = ['duration', 'ease', 'delay', 'clearProps', 'overwrite'];

/** The properties an animation changes: the ones it starts from and goes to, without how it runs. */
export function changedBy(animation: Animation): string[] {
  return [...new Set([...Object.keys(animation.from), ...Object.keys(animation.to)])]
    .filter((name) => !HOW.includes(name))
    .sort();
}

/** The phone's "reduzir movimento" setting, read through matchMedia. */
export function preferReducedMotion(reduce: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: reduce && query === '(prefers-reduced-motion: reduce)',
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
}
