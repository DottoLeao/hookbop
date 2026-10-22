import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useGameSave, type FinishedGame, type SavePlay } from './useGameSave';

const GAME: FinishedGame = {
  youtubeId: 'dQw4w9WgXcQ',
  mode: 'escolha',
  difficulty: 'facil',
  summary: { totalBlanks: 12, firstTryCorrect: 11, pct: 92, maxCombo: 8, xp: 120 },
  records: [{ blankId: 'b1', kind: 'first', correct: true, beforeLineEnd: true }],
  timeToReadyMs: 2500,
};

const UUID = expect.stringMatching(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
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

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useGameSave', () => {
  it('is saving from the first moment, so the end screen never shows an XP that is not there yet', () => {
    const { result } = setup(vi.fn<SavePlay>());

    expect(result.current.save).toEqual({ status: 'saving' });
  });

  it('saves the game under an id of its own and then says which play holds the XP', async () => {
    const savePlay = vi.fn<SavePlay>().mockResolvedValue(SAVED);
    const { result } = setup(savePlay);

    act(() => result.current.begin(GAME));

    expect(savePlay).toHaveBeenCalledWith({ ...GAME, playId: UUID }, false);
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

  it('saves the next game, under another id, once it is told that one began', async () => {
    const savePlay = vi.fn<SavePlay>().mockResolvedValueOnce(SAVED).mockResolvedValueOnce({ playId: 'play-2', xp: 60 });
    const { result } = setup(savePlay);
    act(() => result.current.begin(GAME));
    await waitFor(() => expect(result.current.save.status).toBe('saved'));

    act(() => result.current.reset());
    act(() => result.current.begin({ ...GAME, timeToReadyMs: null }));

    expect(savePlay).toHaveBeenCalledTimes(2);
    expect(savePlay).toHaveBeenLastCalledWith({ ...GAME, timeToReadyMs: null, playId: UUID }, false);
    const [first, second] = savePlay.mock.calls.map(([game]) => game.playId);
    expect(second).not.toBe(first);
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

  it('says the save failed, and on retry saves the same play again, marked as a retry', async () => {
    const savePlay = vi.fn<SavePlay>().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(SAVED);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { result } = setup(savePlay);
    act(() => result.current.begin(GAME));
    await waitFor(() => expect(result.current.save).toEqual({ status: 'failed' }));
    expect(warn).toHaveBeenCalledTimes(1);

    act(() => result.current.retry());

    expect(result.current.save).toEqual({ status: 'saving' });
    await waitFor(() => expect(result.current.save).toEqual({ status: 'saved', playId: 'play-1', xp: 120 }));
    expect(savePlay).toHaveBeenCalledTimes(2);
    expect(savePlay).toHaveBeenLastCalledWith({ ...GAME, playId: UUID }, true);
    // The same play: what makes a retry safe is that both tries carry the same id.
    expect(savePlay.mock.calls[1][0].playId).toBe(savePlay.mock.calls[0][0].playId);
  });

  it('keeps retrying the same play, however many times it fails', async () => {
    const savePlay = vi
      .fn<SavePlay>()
      .mockRejectedValueOnce(new Error('offline'))
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(SAVED);
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { result } = setup(savePlay);
    act(() => result.current.begin(GAME));
    await waitFor(() => expect(result.current.save).toEqual({ status: 'failed' }));
    act(() => result.current.retry());
    await waitFor(() => expect(savePlay).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(result.current.save).toEqual({ status: 'failed' }));

    act(() => result.current.retry());

    await waitFor(() => expect(result.current.save.status).toBe('saved'));
    const ids = savePlay.mock.calls.map(([game]) => game.playId);
    expect(new Set(ids).size).toBe(1);
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
