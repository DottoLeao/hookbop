import { useCallback, useEffect, useRef, type RefObject } from 'react';
import type { PlayerAdapter } from './adapter';
import { usePauseWhenHidden } from './usePauseWhenHidden';

/** For this long after the page comes back, a play the player reports is taken for the phone's (ruling S54). */
export const RETURN_GUARD_MS = 2000;

/** Whether the focus is on something inside `box`: the YouTube player's iframe, once a tap on the clip put it there. */
function focusIn(box: HTMLElement | null): boolean {
  const focused = document.activeElement;
  return box !== null && focused !== null && box.contains(focused);
}

/**
 * Outside the game (the calibration, the mode picker, the end screen), the clip stays paused while the page is away and
 * as it comes back (spec §4, ruling R84): nothing plays it again by itself.
 * - The page hidden or put away: the clip is paused.
 * - The page back: the clip is paused once more, since Android plays a video again by itself as the page comes back
 *   (ruling S19).
 * - That play can also be reported a moment later. So from the hide until `RETURN_GUARD_MS` after the return, any
 *   `playing` or `buffering` the player reports is paused (ruling S54), unless the player tapped the clip for it.
 *
 * A tap on the YouTube player cannot be seen from the page, which only sees the focus go into the player's iframe (the
 * page loses the focus: `blur` on the window). So as the page comes back the focus is taken out of the player, where an
 * earlier tap may have left it, and a play counts as the player's when the page lost the focus to the player after the
 * return. A play the app starts ("Jogar", "Continuar de onde parou") leaves these screens, which turns this off
 * (`enabled`); the game guards the way back itself (`useAwayAndBack`).
 *
 * `playerBoxRef` is the element the player's iframe is in.
 */
export function useStayPaused(
  adapter: PlayerAdapter | null,
  enabled: boolean,
  playerBoxRef: RefObject<HTMLElement | null>,
): void {
  // 'away' from the hide to the return, 'back' for the 2 s after it, 'off' otherwise.
  const guardRef = useRef<'off' | 'away' | 'back'>('off');
  // The page lost the focus since it came back: a tap on the clip, if the focus is in the player now.
  const blurredRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const stopGuarding = useCallback(() => {
    guardRef.current = 'off';
    clearTimeout(timerRef.current);
  }, []);

  const leave = useCallback(() => {
    clearTimeout(timerRef.current);
    guardRef.current = 'away';
    adapter?.pause();
  }, [adapter]);

  const comeBack = useCallback(() => {
    adapter?.pause();
    const focused = document.activeElement;
    if (focusIn(playerBoxRef.current) && focused instanceof HTMLElement) focused.blur();
    blurredRef.current = false;
    guardRef.current = 'back';
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(stopGuarding, RETURN_GUARD_MS);
  }, [adapter, playerBoxRef, stopGuarding]);

  const on = adapter !== null && enabled;
  usePauseWhenHidden(leave, on, comeBack);

  useEffect(() => {
    if (!adapter || !enabled) return;
    const onBlur = () => {
      if (guardRef.current === 'back') blurredRef.current = true;
    };
    window.addEventListener('blur', onBlur);
    const stopListening = adapter.onState((state) => {
      if (guardRef.current === 'off' || (state !== 'playing' && state !== 'buffering')) return;
      if (guardRef.current === 'back' && blurredRef.current && focusIn(playerBoxRef.current)) {
        // The player tapped the clip: a play from here on is theirs.
        stopGuarding();
        return;
      }
      adapter.pause();
    });
    return () => {
      window.removeEventListener('blur', onBlur);
      stopListening();
      stopGuarding();
    };
  }, [adapter, enabled, playerBoxRef, stopGuarding]);
}
