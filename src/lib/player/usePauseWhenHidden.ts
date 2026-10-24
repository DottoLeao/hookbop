import { useEffect, useRef } from 'react';

/**
 * Calls `pause` whenever the page goes to the background: the tab or the app is hidden (`visibilitychange` to
 * 'hidden'), or the page is left or put in the back-forward cache (`pagehide`, which some phones send instead).
 * The clip never plays in the background (spec §4, ruling R84).
 *
 * `onVisible` is called once when the page is back after that: `visibilitychange` to 'visible', or `pageshow` for a
 * phone that said `pagehide`. The hook never plays anything itself; what happens on the way back is the caller's.
 *
 * `pause` and `onVisible` should keep their identity between renders (a `useCallback`), or the listeners are swapped on
 * every render. With `enabled` false it listens to nothing.
 */
export function usePauseWhenHidden(pause: () => void, enabled = true, onVisible?: () => void): void {
  // Kept across renders, so new callbacks in between still learn that the page is coming back.
  const awayRef = useRef(false);

  useEffect(() => {
    if (!enabled) return;
    const leave = () => {
      awayRef.current = true;
      pause();
    };
    const comeBack = () => {
      if (!awayRef.current) return;
      awayRef.current = false;
      onVisible?.();
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') leave();
      else comeBack();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('pagehide', leave);
    window.addEventListener('pageshow', comeBack);
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('pagehide', leave);
      window.removeEventListener('pageshow', comeBack);
    };
  }, [pause, enabled, onVisible]);
}
