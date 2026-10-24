'use client';

import { useSyncExternalStore } from 'react';

const QUERY = '(prefers-reduced-motion: reduce)';

/** The query made by a `matchMedia`, kept for as long as the page keeps that `matchMedia`. */
let kept: { ask: typeof window.matchMedia; query: MediaQueryList } | null = null;

/**
 * The phone's "reduzir movimento" setting, or nothing where the page has no way to ask (jsdom, some web views).
 *
 * The query is made once and kept: a `MediaQueryList` is live (`matches` follows the phone, and "change" fires on it),
 * and the components that read it render often (the Karaokê view on every tick of the clock, and each render reads the
 * setting), so a new list per read would be a new object each time for nothing. A page that has another `matchMedia`
 * (a test, say) is another page, and asks again.
 */
function reducedMotionQuery(): MediaQueryList | null {
  const ask = window.matchMedia;
  if (typeof ask !== 'function') return null;
  if (kept?.ask !== ask) kept = { ask, query: window.matchMedia(QUERY) };
  return kept.query;
}

function subscribe(onChange: () => void): () => void {
  const query = reducedMotionQuery();
  query?.addEventListener('change', onChange);
  return () => query?.removeEventListener('change', onChange);
}

/**
 * The phone's setting right now, for code that runs at a moment of its own (an animation as it starts) and so reads it
 * then, instead of following it. That also makes it right for a page that is still being taken over from the server,
 * where the hook below still answers for the server. False where the page cannot be asked.
 */
export function prefersReducedMotion(): boolean {
  return reducedMotionQuery()?.matches ?? false;
}

/** The server cannot know the phone's setting: it draws the page for full motion, as the first client render does. */
function onServer(): boolean {
  return false;
}

/**
 * Whether the player asked the phone for less motion (`prefers-reduced-motion: reduce`). It follows the setting when
 * it changes while the app is open. On the server, and where there is no `matchMedia`, it is false.
 */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, prefersReducedMotion, onServer);
}
