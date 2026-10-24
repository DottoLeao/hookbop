'use client';

import { useRef, type RefObject } from 'react';
import { gsap, useGSAP } from './gsap';
import { prefersReducedMotion } from './useReducedMotion';

// How things come in: a sheet rises from below, a screen takes the place of another, cards come one after another, a
// ring sweeps into place. All of it is `transform` and `opacity`, and none of it ever waits for anything: a thing that
// is coming in is already there to be tapped, only drawn a little lower and a little fainter for a moment.
//
// With "reduzir movimento" on, every one of them is the same short fade and nothing moves. The setting is read as the
// transition starts (`prefersReducedMotion`) and not followed while it runs: a transition lasts a third of a second.

type ElementRef = RefObject<HTMLElement | SVGElement | null>;

/** Nothing a transition set is left on an element once it is over: it is drawn by its classes alone. */
const CLEAR = 'transform,transformOrigin,opacity';

/** The fade of every transition when motion is reduced, in seconds. */
const FADE = 0.2;

/** A sheet rises this far, in px, from under its place, in 0.3 s. It starts below its place, never over what is above. */
const SHEET_RISE = 28;
const SHEET = 0.3;

/** A screen takes the place of another with a rise of this many px, in 0.25 s. */
const SWAP_RISE = 10;
const SWAP = 0.25;

/** A card rises this far, in 0.32 s, and the next one starts a step later: five steps at most, so the last card of a long list is not late. */
const CARD_RISE = 14;
const CARD = 0.32;
const CARD_STEP = 0.05;
const CARD_MAX_STEPS = 5;

/** A ring sweeps into place in 0.9 s, from a place at least 120° and at most 270° behind. */
const SWEEP = 0.9;
const SWEEP_MIN_DEG = 120;
const SWEEP_MAX_DEG = 270;

/** Comes in from `rise` px below, or only fades in when motion is reduced. */
function comeIn(targets: gsap.TweenTarget, rise: number, duration: number, extra: gsap.TweenVars = {}) {
  if (prefersReducedMotion()) {
    gsap.fromTo(targets, { opacity: 0 }, { opacity: 1, duration: FADE, ease: 'power1.out', clearProps: CLEAR });
    return;
  }
  gsap.fromTo(
    targets,
    { y: rise, opacity: 0 },
    { y: 0, opacity: 1, duration, ease: 'power3.out', clearProps: CLEAR, ...extra },
  );
}

/**
 * A sheet (the explanation of DJ Bop, the settings) rises from below as it opens, in 0.3 s. It is on screen and in the
 * tab order from its first frame: the rise changes how it is drawn and nothing else, so its focus, which it takes as it
 * opens, is not late.
 *
 * Only the way in is animated. A sheet closes as it always did, at once, in the same render that takes it away: the
 * state of the screen under it, the focus that goes back to what opened it and the music that comes back must not wait
 * on a transition.
 */
export function useSheetEnter(sheetRef: ElementRef): void {
  useGSAP(
    () => {
      if (sheetRef.current) comeIn(sheetRef.current, SHEET_RISE, SHEET);
    },
    { scope: sheetRef },
  );
}

/**
 * Whatever `screenRef` holds comes in again, in 0.25 s, whenever `screen` (which screen it is) changes, never for the
 * screen that is there when it first renders. A transition still running when the screen changes again is reverted on
 * the spot, so they never queue and none leaves a screen halfway; leaving reverts it too.
 *
 * It moves down into place from just below, never up from over anything above it. What the song screen keeps above
 * this box, the YouTube player, is outside of it and is not touched.
 */
export function useScreenSwap(screenRef: ElementRef, screen: string): void {
  const shown = useRef<string | null>(null);
  useGSAP(
    () => {
      const before = shown.current;
      shown.current = screen;
      if (before === null || before === screen || !screenRef.current) return;
      comeIn(screenRef.current, SWAP_RISE, SWAP);
    },
    { dependencies: [screen], scope: screenRef, revertOnUpdate: true },
  );
}

/**
 * The elements of `listRef` that match `selector` (cards, blocks of a result) come in one after another, each 0.05 s
 * after the one before, for the first five and together after those. With reduced motion they fade in all at once.
 * `key` is what the elements are: when it changes (a list with other songs in it) they come in again, and an
 * element new in the page never stays out of sight.
 */
export function useCardsIn(listRef: ElementRef, selector: string, key = ''): void {
  useGSAP(
    () => {
      const cards = Array.from(listRef.current?.querySelectorAll<HTMLElement>(selector) ?? []);
      if (cards.length === 0) return;
      comeIn(cards, CARD_RISE, CARD, { stagger: (index: number) => Math.min(index, CARD_MAX_STEPS) * CARD_STEP });
    },
    { dependencies: [key], scope: listRef, revertOnUpdate: true },
  );
}

/**
 * A ring's arc (the element `arcRef`, holding the arc drawn from the top, clockwise, for `degrees`) sweeps into place
 * as the ring fills: it comes round the ring from behind, slowing as it lands, and fades in as it starts. `center` is the
 * ring's center in the drawing's own units (`svgOrigin`), what it turns about.
 *
 * A fill that grows the arc (its dash, its length) would change the shape of the arc and not only where it is drawn, so
 * the arc keeps its shape and turns: only `transform` and `opacity`. With reduced motion it just fades in.
 *
 * In a browser, GSAP turns an SVG element through its `transform` attribute, which it takes off at the end; it also
 * leaves two markers on the element (`data-svg-origin` and a `transform-origin` style), which do nothing without a
 * transform to turn about.
 */
export function useRingSweep(arcRef: ElementRef, degrees: number, center: string): void {
  useGSAP(
    () => {
      const arc = arcRef.current;
      if (!arc) return;
      if (prefersReducedMotion()) {
        gsap.fromTo(arc, { opacity: 0 }, { opacity: 1, duration: FADE, ease: 'power1.out', clearProps: CLEAR });
        return;
      }
      const behind = Math.min(Math.max(degrees, SWEEP_MIN_DEG), SWEEP_MAX_DEG);
      gsap.fromTo(
        arc,
        { rotation: -behind, svgOrigin: center, opacity: 0 },
        { rotation: 0, svgOrigin: center, opacity: 1, duration: SWEEP, ease: 'power3.out', clearProps: CLEAR },
      );
    },
    { scope: arcRef },
  );
}
