'use client';

import { useCallback, useRef, useState } from 'react';
import type { PlayToSave, SavedPlay } from '@/lib/supabase/plays';
import type { SaveStatus } from './EndScreen';

/** A finished game, as the song screen hands it over to be saved. Who is playing, when, and the play's id are added later. */
export type FinishedGame = Omit<PlayToSave, 'playId' | 'userId' | 'now'>;

/** A finished game and the id its play is saved under. The id is made once, so every try saves the same play. */
export type GameToSave = Omit<PlayToSave, 'userId' | 'now'>;

/**
 * Saves a game and gives back its play and the XP it earned. `retrying` is true for every try after the first: the
 * play may already be saved by then, and is not saved twice. `savePlay` of `plays.ts` is the real one.
 */
export type SavePlay = (game: GameToSave, retrying: boolean) => Promise<SavedPlay>;

/**
 * The saving of a finished game, for the end screen: where it stands, `begin` to start it, `retry` after it failed and
 * `reset` when the next game starts.
 *
 * `begin` makes the id of the game's play and saves it once, however many times it is called, until `reset` says the
 * next game began. The answer of a save is dropped when its game is already over by the time it comes. A retry saves
 * the same play, under the same id, and says so, so the play and its answers are never saved twice, even when the
 * answer to a try that did write them got lost.
 */
export function useGameSave(savePlay: SavePlay) {
  const [save, setSave] = useState<SaveStatus>({ status: 'saving' });
  // Bumped by `reset`: an answer that comes for an older number belongs to a game that is over.
  const serialRef = useRef(0);
  const gameRef = useRef<GameToSave | null>(null);
  const runningRef = useRef(false);

  const run = useCallback(
    (game: GameToSave, retrying: boolean) => {
      const serial = serialRef.current;
      runningRef.current = true;
      setSave({ status: 'saving' });
      savePlay(game, retrying).then(
        (saved) => {
          if (serial !== serialRef.current) return;
          runningRef.current = false;
          setSave({ status: 'saved', ...saved });
        },
        (error: unknown) => {
          if (serial !== serialRef.current) return;
          runningRef.current = false;
          console.warn('Could not save the play.', error);
          setSave({ status: 'failed' });
        },
      );
    },
    [savePlay],
  );

  const begin = useCallback(
    (game: FinishedGame) => {
      if (gameRef.current) return;
      gameRef.current = { ...game, playId: crypto.randomUUID() };
      run(gameRef.current, false);
    },
    [run],
  );

  const retry = useCallback(() => {
    if (!gameRef.current || runningRef.current) return;
    run(gameRef.current, true);
  }, [run]);

  const reset = useCallback(() => {
    serialRef.current += 1;
    gameRef.current = null;
    runningRef.current = false;
  }, []);

  return { save, begin, retry, reset };
}
