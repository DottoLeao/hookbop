'use client';

import { useRef, type RefObject } from 'react';
import { gsap, useGSAP } from '@/lib/motion/gsap';
import { prefersReducedMotion } from '@/lib/motion/useReducedMotion';

/** What an answer came to: right, wrong, or none yet (or taken back, by a new try). */
export type AnswerResult = 'hit' | 'miss' | null;

// The feedback of an answer, as a one-shot: a right one pops, a wrong one shakes. Both are over in 0.3 s, change only
// `transform`, and are drawn on top of what is already there: nothing waits for them, the answer is in at the moment
// of the tap, and a new try is never held back by a shake still running.
//
// It is GSAP and not CSS (ruling S37 leaves the one-shots to choose) because it has to start again when the same
// state happens again (the same wrong tile tapped twice, the same wrong word sent twice) and because it has to be put
// back to rest at once when the answer is taken back: `useGSAP` reverts a running tween as it starts the next one and
// when the box goes away, and that leaves the box exactly as it was drawn.

/** The pop grows the box to this size and back. Wide boxes (the field, the row) grow ~10 px a side at most. */
const POP = 1.06;
const POP_TIME = 0.3;

/** The shake swings this many px to each side, two and a half times, dying away. */
const SHAKE = 8;
const SHAKE_TIME = 0.3;

/** With reduced motion nothing moves: the box comes in from this opacity in 0.2 s. */
const FADE_FROM = 0.5;
const FADE = 0.2;

/** What GSAP clears at the end of a tween that moved the box: its transform, and nothing else. */
const CLEAR_MOTION = 'transform,transformOrigin';

/**
 * Up fast and down slow, from 0 at the start through 1 (the top of the pop) back to 0 at the end, so the box lands
 * exactly where it began. It peaks a third of the way in.
 */
const bump: gsap.EaseFunction = (progress) => Math.sin(Math.PI * progress ** 0.6);

/** Two and a half swings, each smaller than the one before, from 0 to 0: a shake that stops where it started. */
const swing: gsap.EaseFunction = (progress) => Math.sin(5 * Math.PI * progress) * (1 - progress);

function pop(element: HTMLElement) {
  gsap.fromTo(element, { scale: 1 }, { scale: POP, duration: POP_TIME, ease: bump, clearProps: CLEAR_MOTION });
}

function shake(element: HTMLElement) {
  gsap.fromTo(element, { x: 0 }, { x: SHAKE, duration: SHAKE_TIME, ease: swing, clearProps: CLEAR_MOTION });
}

function fade(element: HTMLElement) {
  gsap.fromTo(element, { opacity: FADE_FROM }, { opacity: 1, duration: FADE, ease: 'power1.out', clearProps: 'opacity' });
}

/**
 * The element of `ref` pops when `result` becomes 'hit' and shakes when it becomes 'miss', in 0.3 s; with reduced
 * motion either one is only a short fade, as everywhere else. `attempt` is for a miss that happens again while the
 * result stays 'miss': a new `attempt` shakes it again. The first state it is drawn in plays nothing (a saved game
 * that comes back with a blank already right), and neither does `null`.
 *
 * A running animation is reverted as the next one starts, never queued, and when the result is taken back or the element
 * goes away, so the element is always left as it was drawn: no transform, no opacity. Only the style of the element
 * changes: its text, its focus and its `aria-*` stay (the result is said to screen readers by the area, never by this).
 */
export function useAnswerFeedback(ref: RefObject<HTMLElement | null>, result: AnswerResult, attempt = 0): void {
  const shown = useRef<{ result: AnswerResult; attempt: number } | null>(null);
  useGSAP(
    () => {
      const before = shown.current;
      shown.current = { result, attempt };
      const element = ref.current;
      if (before === null || (before.result === result && before.attempt === attempt)) return;
      if (result === null || !element) return;
      if (prefersReducedMotion()) fade(element);
      else if (result === 'hit') pop(element);
      else shake(element);
    },
    { dependencies: [result, attempt], scope: ref, revertOnUpdate: true },
  );
}
