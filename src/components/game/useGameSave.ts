'use client';

import { useCallback, useRef, useState } from 'react';
import { AnswersNotSavedError, type PlayToSave, type SavedPlay } from '@/lib/supabase/plays';
import type { SaveStatus } from './EndScreen';

/** A finished game, as the song screen hands it over to be saved. Who is playing and when are added where it is saved. */
export type FinishedGame = Omit<PlayToSave, 'userId' | 'now'>;

/**
 * Saves a game and gives back its play and the XP it earned. With `resume` (the play of an earlier try that saved the
 * play but not its answers) it writes the answers only. `savePlay` of `plays.ts` is the real one.
 */
export type SavePlay = (game: FinishedGame, resume?: SavedPlay) => Promise<SavedPlay>;

/**
 * The saving of a finished game, for the end screen: where it stands, `begin` to start it, `retry` after it failed and
 * `reset` when the next game starts.
 *
 * `begin` saves one game once, however many times it is called, until `reset` says the next game began. The answer of a
 * save is dropped when its game is already over by the time it comes. Retrying after only the answers failed (see
 * `AnswersNotSavedError`) writes the answers alone, so the play is never saved, and counted against the repeat decay,
 * twice.
 */
export function useGameSave(savePlay: SavePlay) {
  const [save, setSave] = useState<SaveStatus>({ status: 'saving' });
  // Bumped by `reset`: an answer that comes for an older number belongs to a game that is over.
  const serialRef = useRef(0);
  const gameRef = useRef<FinishedGame | null>(null);
  const resumeRef = useRef<SavedPlay | undefined>(undefined);
  const runningRef = useRef(false);

  const run = useCallback(
    (game: FinishedGame, resume?: SavedPlay) => {
      const serial = serialRef.current;
      runningRef.current = true;
      setSave({ status: 'saving' });
      savePlay(game, resume).then(
        (saved) => {
          if (serial !== serialRef.current) return;
          runningRef.current = false;
          setSave({ status: 'saved', ...saved });
        },
        (error: unknown) => {
          if (serial !== serialRef.current) return;
          runningRef.current = false;
          console.warn('Could not save the play.', error);
          resumeRef.current = error instanceof AnswersNotSavedError ? error.saved : undefined;
          setSave({ status: 'failed' });
        },
      );
    },
    [savePlay],
  );

  const begin = useCallback(
    (game: FinishedGame) => {
      if (gameRef.current) return;
      gameRef.current = game;
      run(game);
    },
    [run],
  );

  const retry = useCallback(() => {
    if (!gameRef.current || runningRef.current) return;
    run(gameRef.current, resumeRef.current);
  }, [run]);

  const reset = useCallback(() => {
    serialRef.current += 1;
    gameRef.current = null;
    resumeRef.current = undefined;
    runningRef.current = false;
  }, []);

  return { save, begin, retry, reset };
}
