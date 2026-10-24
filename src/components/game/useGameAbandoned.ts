import { useCallback, useEffect, useRef } from 'react';
import { track } from '@/lib/metrics/track';
import type { Mode } from '@/lib/types';

interface GameAbandonedOptions {
  youtubeId: string;
  mode: Mode;
  /** Whether the game finished and reported its end, which is no abandoning. Asked when the game is left. */
  finished: () => boolean;
}

/**
 * Tells the owner's panel (`game_abandoned`) that a game was left without finishing (ruling S44): the game screen goes
 * away with the song not over (the player followed a link inside the app), or the page is left or put away (`pagehide`).
 * At most once for a game, and never for a game that finished.
 *
 * Going to the background (`visibilitychange`) is not leaving the game: `useAwayAndBack` and the saved game bring the
 * player back to it.
 *
 * In development React takes a screen down and puts it back at once to shake out leftovers (StrictMode). That is not a
 * game left, so a screen taken down is only counted as left if it is still down at the end of the turn.
 */
export function useGameAbandoned(options: GameAbandonedOptions): void {
  const latest = useRef(options);
  useEffect(() => {
    latest.current = options;
  });
  const onScreenRef = useRef(false);
  const reportedRef = useRef(false);

  const abandon = useCallback(() => {
    const { youtubeId, mode, finished } = latest.current;
    if (reportedRef.current || finished()) return;
    reportedRef.current = true;
    track('game_abandoned', { youtubeId, mode });
  }, []);

  useEffect(() => {
    onScreenRef.current = true;
    window.addEventListener('pagehide', abandon);
    return () => {
      onScreenRef.current = false;
      window.removeEventListener('pagehide', abandon);
      queueMicrotask(() => {
        if (!onScreenRef.current) abandon();
      });
    };
  }, [abandon]);
}
