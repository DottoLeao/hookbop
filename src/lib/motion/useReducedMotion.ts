'use client';

import { useSyncExternalStore } from 'react';

const QUERY = '(prefers-reduced-motion: reduce)';

/** The phone's "reduzir movimento" setting, or nothing where the page has no way to ask (jsdom, some web views). */
function reducedMotionQuery(): MediaQueryList | null {
  return typeof window.matchMedia === 'function' ? window.matchMedia(QUERY) : null;
}

function subscribe(onChange: () => void): () => void {
  const query = reducedMotionQuery();
  query?.addEventListener('change', onChange);
  return () => query?.removeEventListener('change', onChange);
}

function readSetting(): boolean {
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
  return useSyncExternalStore(subscribe, readSetting, onServer);
}
