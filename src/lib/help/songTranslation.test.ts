import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createSongTranslations,
  fetchSongTranslation,
  postTranslateSong,
  useSongTranslation,
  type SongTranslationFetcher,
} from './songTranslation';
import type { LineTranslation } from './songService';

// Invented translations, not lyrics.

/** A body that comes in these pieces, as a stream does. */
function streamedBody(pieces: string[]) {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const piece of pieces) controller.enqueue(encoder.encode(piece));
      controller.close();
    },
  });
}

function respondWith(body: BodyInit | null, init: ResponseInit = {}) {
  return vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(body, init));
}

/** A fetcher the test drives: it hands over lines when told, and ends or fails when told. */
function controlledFetcher() {
  let onLines!: (lines: LineTranslation[]) => void;
  let finish!: () => void;
  let fail!: (error: unknown) => void;
  const fetcher = vi.fn<SongTranslationFetcher>(
    (_youtubeId, _lyricsRef, give) =>
      new Promise<void>((resolve, reject) => {
        onLines = give;
        finish = resolve;
        fail = reject;
      }),
  );
  return {
    fetcher,
    give: (lines: LineTranslation[]) => onLines(lines),
    finish: () => finish(),
    fail: (error: unknown) => fail(error),
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('postTranslateSong', () => {
  it('asks the route about the video and its lyrics, keeping nothing and following no redirect', async () => {
    const fetch = respondWith('');

    await postTranslateSong('aaaaaaaaaaa', '777', () => {});

    expect(fetch).toHaveBeenCalledExactlyOnceWith('/api/translate-song', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ youtubeId: 'aaaaaaaaaaa', lyricsRef: '777' }),
      cache: 'no-store',
      redirect: 'manual',
    });
  });

  it('hands over the lines as they come, whatever pieces the stream is cut in', async () => {
    respondWith(
      streamedBody([
        '{"lineIndex":0,"text":"Barcos de papel"}\n{"lineIndex":2,"te',
        'xt":"Barcos de papel"}\n',
        '{"lineIndex":1,"text":"Aguenta firme"}',
      ]),
    );
    const batches: LineTranslation[][] = [];

    await postTranslateSong('aaaaaaaaaaa', '777', (lines) => batches.push(lines));

    expect(batches).toEqual([
      [{ lineIndex: 0, text: 'Barcos de papel' }],
      [{ lineIndex: 2, text: 'Barcos de papel' }],
      [{ lineIndex: 1, text: 'Aguenta firme' }],
    ]);
  });

  it('skips a line it cannot read, and keeps the others', async () => {
    respondWith(
      streamedBody([
        '{"lineIndex":0,"text":"Um"}\nnot json\n{"lineIndex":-1,"text":"x"}\n{"lineIndex":1.5,"text":"x"}\n',
        '{"lineIndex":2,"text":""}\n{"lineIndex":"3","text":"x"}\n{"lineIndex":4,"text":"Quatro"}\n',
      ]),
    );
    const lines: LineTranslation[] = [];

    await postTranslateSong('aaaaaaaaaaa', '777', (batch) => lines.push(...batch));

    expect(lines).toEqual([
      { lineIndex: 0, text: 'Um' },
      { lineIndex: 4, text: 'Quatro' },
    ]);
  });

  it.each([429, 400, 503])('fails on a %i', async (status) => {
    respondWith(JSON.stringify({ error: 'x' }), { status });

    await expect(postTranslateSong('aaaaaaaaaaa', '777', () => {})).rejects.toThrow();
  });

  it('fails on the redirect src/proxy.ts gives a request with no session', async () => {
    const redirect = new Response(null);
    Object.defineProperty(redirect, 'type', { value: 'opaqueredirect' });
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(redirect);

    await expect(postTranslateSong('aaaaaaaaaaa', '777', () => {})).rejects.toThrow();
  });
});

describe('fetchSongTranslation', () => {
  it('starts the request at once, and has nothing yet', () => {
    const { fetcher } = controlledFetcher();

    const song = fetchSongTranslation('aaaaaaaaaaa', '777', fetcher);

    expect(fetcher).toHaveBeenCalledExactlyOnceWith('aaaaaaaaaaa', '777', expect.any(Function));
    expect(song.getSnapshot()).toEqual({ lines: new Map(), settled: false });
  });

  it('keeps each line as it comes, and tells whoever listens', async () => {
    const { fetcher, give, finish } = controlledFetcher();
    const song = fetchSongTranslation('aaaaaaaaaaa', '777', fetcher);
    const listener = vi.fn();
    song.subscribe(listener);

    give([{ lineIndex: 0, text: 'Barcos' }]);
    give([
      { lineIndex: 2, text: 'Barcos' },
      { lineIndex: 0, text: 'Outra' },
    ]);

    expect(listener).toHaveBeenCalledTimes(2);
    expect([...song.getSnapshot().lines]).toEqual([
      [0, 'Barcos'],
      [2, 'Barcos'],
    ]);
    expect(song.getSnapshot().settled).toBe(false);

    finish();
    await vi.waitFor(() => expect(song.getSnapshot().settled).toBe(true));
    expect(listener).toHaveBeenCalledTimes(3);
  });

  it('gives the same snapshot until something changes, as useSyncExternalStore needs', () => {
    const { fetcher, give } = controlledFetcher();
    const song = fetchSongTranslation('aaaaaaaaaaa', '777', fetcher);
    const before = song.getSnapshot();

    expect(song.getSnapshot()).toBe(before);
    give([{ lineIndex: 0, text: 'Barcos' }]);
    expect(song.getSnapshot()).not.toBe(before);
  });

  it('is over, with what came, when the request fails: a failure only means no translation ready', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { fetcher, give, fail } = controlledFetcher();
    const song = fetchSongTranslation('aaaaaaaaaaa', '777', fetcher);
    give([{ lineIndex: 0, text: 'Barcos' }]);

    fail(new Error('offline'));

    await vi.waitFor(() => expect(song.getSnapshot().settled).toBe(true));
    expect([...song.getSnapshot().lines]).toEqual([[0, 'Barcos']]);
  });

  it('stops telling a listener that left', () => {
    const { fetcher, give } = controlledFetcher();
    const song = fetchSongTranslation('aaaaaaaaaaa', '777', fetcher);
    const listener = vi.fn();
    const stop = song.subscribe(listener);

    stop();
    give([{ lineIndex: 0, text: 'Barcos' }]);

    expect(listener).not.toHaveBeenCalled();
  });

  describe('line', () => {
    it('gives a line that is there already', async () => {
      const { fetcher, give } = controlledFetcher();
      const song = fetchSongTranslation('aaaaaaaaaaa', '777', fetcher);
      give([{ lineIndex: 1, text: 'Aguenta' }]);

      await expect(song.line(1)).resolves.toBe('Aguenta');
    });

    it('waits for a line on its way', async () => {
      const { fetcher, give } = controlledFetcher();
      const song = fetchSongTranslation('aaaaaaaaaaa', '777', fetcher);
      const waiting = song.line(3);

      give([{ lineIndex: 3, text: 'Lanternas' }]);

      await expect(waiting).resolves.toBe('Lanternas');
    });

    it('gives nothing for a line the request ended without', async () => {
      const { fetcher, finish } = controlledFetcher();
      const song = fetchSongTranslation('aaaaaaaaaaa', '777', fetcher);
      const waiting = song.line(3);

      finish();

      await expect(waiting).resolves.toBeUndefined();
    });
  });
});

describe('createSongTranslations', () => {
  it('asks once per song and lyrics for as long as the app is open, whoever asks again', () => {
    const fetcher = vi.fn<SongTranslationFetcher>(() => new Promise(() => {}));
    const translateSong = createSongTranslations(fetcher);

    const first = translateSong('aaaaaaaaaaa', '777');
    const again = translateSong('aaaaaaaaaaa', '777');
    translateSong('bbbbbbbbbbb', '777');
    translateSong('aaaaaaaaaaa', '778');

    expect(again).toBe(first);
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it('does not ask again for a song whose request failed: the translation by line covers it', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const fetcher = vi.fn<SongTranslationFetcher>(async () => Promise.reject(new Error('offline')));
    const translateSong = createSongTranslations(fetcher);
    const song = translateSong('aaaaaaaaaaa', '777');
    await vi.waitFor(() => expect(song.getSnapshot().settled).toBe(true));

    translateSong('aaaaaaaaaaa', '777');

    expect(fetcher).toHaveBeenCalledOnce();
  });
});

describe('useSongTranslation', () => {
  it('follows the translation as it comes', () => {
    const { fetcher, give } = controlledFetcher();
    const song = fetchSongTranslation('aaaaaaaaaaa', '777', fetcher);

    const { result } = renderHook(() => useSongTranslation(song));
    expect(result.current.lines.size).toBe(0);

    act(() => give([{ lineIndex: 0, text: 'Barcos' }]));

    expect(result.current.lines.get(0)).toBe('Barcos');
  });

  it('is over and empty when there is no translation of the song at all', () => {
    const { result } = renderHook(() => useSongTranslation(null));

    expect(result.current).toEqual({ lines: new Map(), settled: true });
  });
});
