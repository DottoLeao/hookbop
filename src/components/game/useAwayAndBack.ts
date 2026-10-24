import { useCallback, useEffect, useRef, useState } from 'react';
import { lineMissedWhileAway, type GameEvent, type GameState } from '@/lib/game/reducer';
import type { PlayerAdapter, PlayerState } from '@/lib/player/adapter';
import { usePauseWhenHidden } from '@/lib/player/usePauseWhenHidden';
import type { Command } from '@/lib/types';

interface AwayAndBackOptions {
  adapter: PlayerAdapter;
  /** The game as the last event left it. */
  gameRef: { readonly current: GameState };
  /** Sends commands to the player at once: the plain pause of leaving, the seek back. */
  run: (commands: readonly Command[]) => void;
  /** Sends commands that can let the music go, the way the game's own do. */
  send: (commands: readonly Command[]) => void;
  /** One event through the game, its commands to the player. */
  dispatch: (event: GameEvent) => GameState;
  /** Where the focus goes once "Continuar" is gone: the answer due during a wait, "Repetir verso" otherwise. */
  nextFocus: () => HTMLElement | null;
  /**
   * Where the clip is as the page goes away. The player's own clock, except for a moment after a seek, when the player
   * can still report the position it had (ruling R44): then the seek's target, so the time away is counted from where the
   * clip is about to be and not from where it was. Should keep its identity between renders.
   */
  clipPositionMs: () => number;
  /** The player tapped "Continuar", the way back to the music: called first, before the music comes back. */
  onContinue?: () => void;
}

/** Gives `el` the focus and brings it into view only if it is not already: the page stays where the player left it. */
export function focusInView(el: HTMLElement): void {
  el.focus({ preventScroll: true });
  el.scrollIntoView?.({ block: 'nearest' });
}

/**
 * Leaving the app and coming back to it (spec §6), for the game screen.
 *
 * Away: from the moment the page is hidden until the game itself lets the music go again ("Continuar", an answer,
 * "Repetir verso", DJ Bop's sheet closing...), which the game screen reports with `end`, before the play goes out.
 * - Hiding the page pauses the clip at once, and the music stays silent (ruling R84).
 * - A clip that starts meanwhile was started by the phone, not by the player: Android plays a video again by itself
 *   when the page comes back. `stopsPhonePlay` pauses it at once and keeps it from the game, which would read it as the
 *   player's own play and skip the blank it waits for.
 * - The clock reaches the game as RESYNC (`isAway`), which moves the lyrics and never starts a wait or skips a blank.
 *
 * Back: the player itself is asked where the clip is, since its reports may be late or lost by now. A clip the phone
 * played through the pause point of a blank still to answer goes back to the start of that blank's line (ruling S18),
 * the clip is paused, the game is told it is stopped, and `backFromAway` puts up "Continuar", which takes the focus.
 */
export function useAwayAndBack({
  adapter,
  gameRef,
  run,
  send,
  dispatch,
  nextFocus,
  clipPositionMs,
  onContinue,
}: AwayAndBackOptions) {
  const awayRef = useRef(false);
  // Where the clip was when the page went away, to see what the phone played meanwhile.
  const leftAtMsRef = useRef(0);
  // "Continuar" is up: the state draws it, the ref answers right away in the handlers.
  const [backFromAway, setBackFromAway] = useState(false);
  const backRef = useRef(false);
  const continueRef = useRef<HTMLButtonElement>(null);

  const showContinue = useCallback((shown: boolean) => {
    backRef.current = shown;
    setBackFromAway(shown);
  }, []);

  const end = useCallback(() => {
    awayRef.current = false;
    showContinue(false);
  }, [showContinue]);

  const isAway = useCallback(() => awayRef.current, []);

  /**
   * Puts the focus on "Continuar" while it is up and on screen (not hidden with the game area, under a sheet). Says
   * whether it did.
   */
  const focusContinue = useCallback((): boolean => {
    const button = continueRef.current;
    if (!backRef.current || !button || button.closest('[hidden]')) return false;
    focusInView(button);
    return true;
  }, []);

  // "Continuar" takes the focus when it appears, as the way back to the music.
  useEffect(() => {
    if (backFromAway) focusContinue();
  }, [backFromAway, focusContinue]);

  const leave = useCallback(() => {
    awayRef.current = true;
    leftAtMsRef.current = clipPositionMs();
    run([{ type: 'pause' }]);
  }, [run, clipPositionMs]);

  const comeBack = useCallback(() => {
    const state = adapter.getPlayerState();
    const nowMs = adapter.getCurrentTimeMs();
    if (state === 'ended') {
      dispatch({ type: 'RESYNC', timeMs: nowMs });
      dispatch({ type: 'PLAYER_STATE', state });
      end();
      return;
    }
    // The pause goes out even when the player says it is paused: on Android that word can lag behind a play the
    // phone started.
    run([{ type: 'pause' }]);
    // A blank the phone played through, silently, is waited for in its own line (ruling S18). The seek goes through
    // `run`, so its R44 settle window keeps a stale reading of the old position away from the lyrics.
    const replay = lineMissedWhileAway(gameRef.current, leftAtMsRef.current, nowMs);
    if (replay) run([{ type: 'seek', ms: replay.startMs }]);
    dispatch({ type: 'RESYNC', timeMs: replay ? replay.startMs : nowMs });
    const next = dispatch({ type: 'PLAYER_STATE', state: 'paused' });
    if (next.phase === 'ended') end();
    else showContinue(true);
  }, [adapter, dispatch, end, gameRef, run, showContinue]);

  usePauseWhenHidden(leave, true, comeBack);

  /** For the player's reports: true when the report was a play the phone started while away, now stopped. */
  const stopsPhonePlay = useCallback(
    (state: PlayerState): boolean => {
      if (!awayRef.current || (state !== 'playing' && state !== 'buffering')) return false;
      run([{ type: 'pause' }]);
      focusContinue();
      return true;
    },
    [run, focusContinue],
  );

  /**
   * "Continuar": the lyrics go to where the clip is now (the player may have dragged the paused clip), and the music
   * comes back with its volume rising. Then the focus goes on to what comes next.
   *
   * During a wait it only goes away: the answer is what lets the music go, and a play now would read to the game as
   * the player skipping the blank. The time away still ends with the tap: the player is back, so a play from here on
   * is theirs (YouTube's own button), read as any other. That leaves a phone that plays the clip again after the tap
   * unguarded, but a phone only does that as the page comes back, which is over by then.
   */
  function continueAfterAway() {
    onContinue?.();
    end();
    const next = dispatch({ type: 'RESYNC', timeMs: adapter.getCurrentTimeMs() });
    if (next.phase === 'playing') send([{ type: 'play', fade: true }]);
    const target = nextFocus();
    if (target) focusInView(target);
  }

  return { backFromAway, continueRef, isAway, end, stopsPhonePlay, focusContinue, continueAfterAway };
}
