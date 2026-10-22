import { useEffect } from 'react';

/**
 * Calls `pause` whenever the page goes to the background: the tab or the app is hidden (`visibilitychange` to
 * 'hidden'), or the page is left or put in the back-forward cache (`pagehide`, which some phones send instead).
 * The clip never plays in the background (spec §4, ruling R84). Nothing happens when the page comes back: the clip
 * never plays again by itself, the player presses play.
 *
 * `pause` should keep its identity between renders (a `useCallback`), or the listeners are swapped on every render.
 * With `enabled` false it listens to nothing.
 */
export function usePauseWhenHidden(pause: () => void, enabled = true): void {
  useEffect(() => {
    if (!enabled) return;
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') pause();
    };
    const onPageHide = () => pause();
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('pagehide', onPageHide);
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('pagehide', onPageHide);
    };
  }, [pause, enabled]);
}
