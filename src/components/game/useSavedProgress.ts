import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import { canRestore, gameReducer, initGame, resumeStartMs, type GameState } from '@/lib/game/reducer';
import {
  clearProgress,
  progressOf,
  saveProgress,
  type ProgressStorage,
  type SavedProgress,
} from '@/lib/game/savedProgress';
import { usePauseWhenHidden } from '@/lib/player/usePauseWhenHidden';
import { DEFAULT_SETTINGS } from '@/lib/settings';
import type { Blank, Difficulty, LyricLine, Mode } from '@/lib/types';

/** How often the game in progress is kept on the device, besides after each answer and when the app goes away. */
export const SAVE_EVERY_MS = 5000;

/** The game a screen starts from, and where the clip starts playing. */
export interface StartingGame {
  game: GameState;
  /** Where the clip starts when the saved game was taken, null for a new game, which starts from the top. */
  resumeAtMs: number | null;
}

/**
 * The game the screen starts from. The saved game when it is this game (the same blanks): RESTORE, and the clock set to
 * the start of the line the clip will play from (ruling S21; see `resumeStartMs`), so the lyrics show that line from the
 * first frame. Otherwise a new game (ruling S22).
 */
export function startingGame(
  { mode, lines, blanks }: { mode: Mode; lines: LyricLine[]; blanks: Blank[] },
  saved: SavedProgress | undefined,
): StartingGame {
  const fresh = initGame({ mode, lines, blanks, autoRepeat: DEFAULT_SETTINGS.autoRepeatOnMiss });
  if (!saved || !canRestore(fresh, saved)) return { game: fresh, resumeAtMs: null };
  const restored = gameReducer(fresh, { type: 'RESTORE', saved });
  const resumeAtMs = resumeStartMs(restored);
  return { game: gameReducer(restored, { type: 'RESYNC', timeMs: resumeAtMs }), resumeAtMs };
}

interface SavedProgressOptions {
  /** The game as the last event left it, which is what is kept: the state of a render may be one event behind. */
  gameRef: { readonly current: GameState };
  /** Where the game is kept: `window.localStorage` in the app. Nothing is kept or forgotten without one. */
  storage: ProgressStorage | null | undefined;
  youtubeId: string;
  difficulty: Difficulty;
  /** The time of day in ms since 1970, which dates every save. The song screen judges its age by the same clock. */
  wallClock: () => number;
  /** The saved game the screen was given, and whether the game took it (`startingGame`). */
  resume: SavedProgress | undefined;
  resumed: boolean;
  /** The song is over. */
  ended: boolean;
}

/**
 * Keeping the game in progress on the device, so the player can come back to the song and go on (spec: "Continuar de onde
 * parou"). It gives back `persist`, which the screen calls after every answer and tile, and after a hint should it give
 * one (the `HINT` event stays in the game, with no button for now); the hook itself saves:
 * - every `SAVE_EVERY_MS`;
 * - when the page goes to the background or is put away (ruling S23), since the phone can close an app that is away and
 *   nothing more is heard of it;
 * - once when the screen goes away or Next hides it (ruling S54), before the player is closed.
 * It forgets the saved game when the song ends, and, once the screen comes up, a saved game it was given that the game
 * did not take (ruling S22: the lyrics changed, and it is of no use any more).
 *
 * `persist` keeps its identity for as long as the screen lives, whatever the options do between renders: it reads the
 * game, the storage and the clock when it is called. A finished game is never kept: its result is what counts then.
 */
export function useSavedProgress(options: SavedProgressOptions): () => void {
  // The latest options, for callbacks that must keep their identity (and effects that must run once).
  const latest = useRef(options);
  useEffect(() => {
    latest.current = options;
  });

  const persist = useCallback(() => {
    const { gameRef, storage, youtubeId, difficulty, wallClock } = latest.current;
    const game = gameRef.current;
    if (!storage || game.phase === 'ended') return;
    saveProgress(storage, progressOf(game, { youtubeId, difficulty, now: wallClock() }));
  }, []);

  useEffect(() => {
    const timer = setInterval(persist, SAVE_EVERY_MS);
    return () => clearInterval(timer);
  }, [persist]);

  usePauseWhenHidden(persist);

  // Kept once more as the screen goes away or is hidden (Next hides the page it leaves in an <Activity>), so the saved
  // game is where the clip was and not up to 5 s behind. A layout cleanup runs before the song screen closes the player
  // (in an effect cleanup), and the clock it keeps is the game's, which only a live player moved.
  useLayoutEffect(() => () => persist(), [persist]);

  // Once for the screen, even if Next shows it again: by then the game it keeps is this one.
  const sweptRef = useRef(false);
  useEffect(() => {
    if (sweptRef.current) return;
    sweptRef.current = true;
    const { storage, youtubeId, resume, resumed } = latest.current;
    if (storage && resume && !resumed) clearProgress(storage, youtubeId);
  }, []);

  const { ended } = options;
  useEffect(() => {
    const { storage, youtubeId } = latest.current;
    if (storage && ended) clearProgress(storage, youtubeId);
  }, [ended]);

  return persist;
}
