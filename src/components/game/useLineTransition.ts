'use client';

import { useRef, type RefObject } from 'react';
import { gsap, useGSAP } from '@/lib/motion/gsap';

/** How the line changed: the song moved on to the very next line, or it got there any other way. */
type Change = 'next' | 'jump';

/** Seconds. A slide is over in 0.4 s, under the 450 ms the design allows. */
const SLIDE = 0.4;
/** The next line comes in a little after the others, and is done when they are. */
const NEXT_DELAY = 0.08;
const SLIDE_EASE = 'power3.out';
/** A fade, for reduced motion and for any change of line that is not the next one, in seconds. */
const FADE = 0.25;
const FADE_FROM = 0.35;

/** How far the lines rise when the panel cannot measure it (while hidden): about one line of lyrics and the gap. */
const FALLBACK_RISE = 32;
/** A line before that wraps a lot would bring the line in play up from below the panel: never further than this. */
const MAX_RISE = 48;
/** The next line comes up from less than the gap under the panel, so it never reaches over what is below. */
const NEXT_RISE = 12;
/** The line in play grows from the size it had as the line after: text-lyric (15 px) of text-verse (22 px). */
const GROW_FROM = 15 / 22;
/** White text at this opacity on the page (#0E0E10) is about the muted gray (#A9A9B2) the line had before. */
const BRIGHTEN_FROM = 0.6;
/** The line before comes in dim, so its change from the large white line in play to a small muted one won't flash. */
const DIM_FROM = 0.5;
/** The Karaokê highlight grows into place from just under its size, around its middle. */
const HIGHLIGHT_FROM = 0.94;

/** Nothing the animation set is left on a line once it is over: the line is drawn by its classes alone. */
const CLEAR = 'transform,transformOrigin,opacity';

/**
 * Runs `animate` when `key` (the index of the line in play) changes, never for the first line drawn. A transition
 * still running when the line changes again is reverted on the spot (`revertOnUpdate`), so transitions never queue
 * and none leaves a line halfway; leaving the screen reverts it too.
 */
function useLineChange(
  containerRef: RefObject<HTMLElement | null>,
  key: number,
  animate: (container: HTMLElement, change: Change) => void,
) {
  const shown = useRef<number | null>(null);
  useGSAP(
    () => {
      const before = shown.current;
      shown.current = key;
      const container = containerRef.current;
      if (before === null || before === key || !container) return;
      animate(container, key === before + 1 ? 'next' : 'jump');
    },
    { dependencies: [key], scope: containerRef, revertOnUpdate: true },
  );
}

function fade(targets: HTMLElement[]) {
  if (targets.length === 0) return;
  gsap.fromTo(targets, { opacity: FADE_FROM }, { opacity: 1, duration: FADE, ease: 'power1.out', clearProps: CLEAR });
}

/** How far the lines rise: from the line before to the line in play, which is where the line before just was. */
function riseOf(previous: HTMLElement | null, current: HTMLElement | null): number {
  const measured = previous && current ? current.offsetTop - previous.offsetTop : 0;
  return measured > 0 ? Math.min(measured, MAX_RISE) : FALLBACK_RISE;
}

/**
 * The lyrics slide from line to line, as in the lyrics of Spotify or Apple Music: the lines rise together into
 * place, the line in play grows and brightens from the size and gray it had as the line after, the line before comes
 * up dim from where the line in play was, and the next line comes in faded from just below. All of it in 0.4 s.
 *
 * The lines are the elements of the container marked `data-line="previous" | "current" | "next"`; any of them may be
 * missing. Only they move, and only from below, so nothing ever rises over the player above the lyrics, and the
 * buttons between them stay where the finger is. Only `transform` and `opacity` change, so nothing around moves.
 *
 * Any other change of line, back (Repetir verso, a seek back to a blank, a resume) or more than one line ahead (back
 * from away), is a short fade with no movement: sliding there would go the wrong way or the whole way. With `reduced`
 * (reduced motion), every change is that fade.
 */
export function useLineTransition(containerRef: RefObject<HTMLElement | null>, key: number, reduced: boolean): void {
  useLineChange(containerRef, key, (container, change) => {
    const line = (role: string) => container.querySelector<HTMLElement>(`[data-line="${role}"]`);
    const previous = line('previous');
    const current = line('current');
    const next = line('next');
    if (reduced || change === 'jump') {
      fade([previous, current, next].filter((target) => target !== null));
      return;
    }
    const rise = riseOf(previous, current);
    const to = { duration: SLIDE, ease: SLIDE_EASE, clearProps: CLEAR };
    if (previous) gsap.fromTo(previous, { y: rise, opacity: DIM_FROM }, { y: 0, opacity: 1, ...to });
    if (current) {
      gsap.fromTo(
        current,
        { y: rise, scale: GROW_FROM, opacity: BRIGHTEN_FROM, transformOrigin: '0% 0%' },
        { y: 0, scale: 1, opacity: 1, ...to },
      );
    }
    if (next) {
      gsap.fromTo(
        next,
        { y: NEXT_RISE, opacity: 0 },
        { y: 0, opacity: 1, ...to, duration: SLIDE - NEXT_DELAY, delay: NEXT_DELAY },
      );
    }
  });
}

/**
 * Karaokê: the list's own scroll is what rises (it sweeps to the next line), so this only lights the new current
 * line up: it grows into place from just under its size and brightens, in 0.4 s, without moving up or down, so the
 * place the list scrolls to is the same. The current line is the row of the list marked `aria-current="true"`.
 * Any other change of line, and every change with `reduced`, only fades it in, as the list then jumps there at once.
 */
export function useLineHighlight(listRef: RefObject<HTMLElement | null>, key: number, reduced: boolean): void {
  useLineChange(listRef, key, (list, change) => {
    const current = list.querySelector<HTMLElement>('[aria-current="true"]');
    if (!current) return;
    if (reduced || change === 'jump') {
      fade([current]);
      return;
    }
    gsap.fromTo(
      current,
      { scale: HIGHLIGHT_FROM, opacity: BRIGHTEN_FROM },
      { scale: 1, opacity: 1, duration: SLIDE, ease: SLIDE_EASE, clearProps: CLEAR },
    );
  });
}
