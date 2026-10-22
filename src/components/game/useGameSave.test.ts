import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AnswersNotSavedError } from '@/lib/supabase/plays';
import { useGameSave, type FinishedGame, type SavePlay } from './useGameSave';

const GAME: FinishedGame = {
  youtubeId: 'dQw4w9WgXcQ',
  mode: 'escolha',
  difficulty: 'facil',
  summary: { totalBlanks: 12, firstTryCorrect: 11, pct: 92, maxCombo: 8, xp: 120 },
  records: [{ blankId: 'b1', kind: 'first', correct: true, beforeLineEnd: true }],
  timeToReadyMs: 2500,
};

const SAVED = { playId: 'play-1', xp: 120 };

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function setup(savePlay: SavePlay) {
  return renderHook(() => useGameSave(savePlay));
}

describe('useGameSave', () => {
  it('is saving from the first moment, so the end screen never shows an XP that is not there yet', () => {
    const { result } = setup(vi.fn<SavePlay>());

    expect(result.current.save).toEqual({ status: 'saving' });
  });

  it('saves the game and then says which play holds the XP', async () => {
    const savePlay = vi.fn<SavePlay>().mockResolvedValue(SAVED);
    const { result } = setup(savePlay);

    act(() => result.current.begin(GAME));

    expect(savePlay).toHaveBeenCalledWith(GAME, undefined);
    await waitFor(() => expect(result.current.save).toEqual({ status: 'saved', playId: 'play-1', xp: 120 }));
  });

  it('saves a game once, however many times it is told it ended', async () => {
    const savePlay = vi.fn<SavePlay>().mockResolvedValue(SAVED);
    const { result } = setup(savePlay);

    act(() => {
      result.current.begin(GAME);
      result.current.begin(GAME);
    });
    act(() => result.current.begin(GAME));
    await waitFor(() => expect(result.current.save.status).toBe('saved'));

    expect(savePlay).toHaveBeenCalledTimes(1);
  });

  it('saves the next game once it is told that one began', async () => {
    const savePlay = vi.fn<SavePlay>().mockResolvedValueOnce(SAVED).mockResolvedValueOnce({ playId: 'play-2', xp: 60 });
    const { result } = setup(savePlay);
    act(() => result.current.begin(GAME));
    await waitFor(() => expect(result.current.save.status).toBe('saved'));

    act(() => result.current.reset());
    act(() => result.current.begin({ ...GAME, timeToReadyMs: null }));

    expect(savePlay).toHaveBeenCalledTimes(2);
    expect(savePlay).toHaveBeenLastCalledWith({ ...GAME, timeToReadyMs: null }, undefined);
    expect(result.current.save).toEqual({ status: 'saving' });
    await waitFor(() => expect(result.current.save).toEqual({ status: 'saved', playId: 'play-2', xp: 60 }));
  });

  it('forgets the answer of a game that is over by the time it comes', async () => {
    const first = deferred<typeof SAVED>();
    const savePlay = vi.fn<SavePlay>().mockReturnValueOnce(first.promise).mockResolvedValueOnce({ playId: 'play-2', xp: 60 });
    const { result } = setup(savePlay);
    act(() => result.current.begin(GAME));

    act(() => result.current.reset());
    act(() => result.current.begin(GAME));
    await waitFor(() => expect(result.current.save).toEqual({ status: 'saved', playId: 'play-2', xp: 60 }));
    await act(async () => first.resolve(SAVED));

    expect(result.current.save).toEqual({ status: 'saved', playId: 'play-2', xp: 60 });
  });

  it('says the save failed, and tries the whole thing again on retry', async () => {
    const savePlay = vi.fn<SavePlay>().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(SAVED);
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { result } = setup(savePlay);
    act(() => result.current.begin(GAME));
    await waitFor(() => expect(result.current.save).toEqual({ status: 'failed' }));

    act(() => result.current.retry());

    expect(result.current.save).toEqual({ status: 'saving' });
    await waitFor(() => expect(result.current.save).toEqual({ status: 'saved', playId: 'play-1', xp: 120 }));
    expect(savePlay).toHaveBeenCalledTimes(2);
    expect(savePlay).toHaveBeenLastCalledWith(GAME, undefined);
  });

  it('finishes only the answers on retry when the play itself was saved, so it is not counted twice', async () => {
    const savePlay = vi
      .fn<SavePlay>()
      .mockRejectedValueOnce(new AnswersNotSavedError(SAVED))
      .mockResolvedValueOnce(SAVED);
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { result } = setup(savePlay);
    act(() => result.current.begin(GAME));
    await waitFor(() => expect(result.current.save).toEqual({ status: 'failed' }));

    act(() => result.current.retry());

    await waitFor(() => expect(result.current.save.status).toBe('saved'));
    expect(savePlay).toHaveBeenLastCalledWith(GAME, SAVED);
  });

  it('does nothing on retry when there is no game to retry', () => {
    const savePlay = vi.fn<SavePlay>();
    const { result } = setup(savePlay);

    act(() => result.current.retry());

    expect(savePlay).not.toHaveBeenCalled();
    expect(result.current.save).toEqual({ status: 'saving' });
  });

  it('does not save again on a retry that comes while the save is still going', async () => {
    const pending = deferred<typeof SAVED>();
    const savePlay = vi.fn<SavePlay>().mockReturnValue(pending.promise);
    const { result } = setup(savePlay);
    act(() => result.current.begin(GAME));

    act(() => result.current.retry());

    expect(savePlay).toHaveBeenCalledTimes(1);
    await act(async () => pending.resolve(SAVED));
    expect(result.current.save.status).toBe('saved');
  });
});
