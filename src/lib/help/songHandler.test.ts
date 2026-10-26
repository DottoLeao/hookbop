// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { HelpStore, TranslationCache } from '@/lib/supabase/helpStore';
import { ModelError } from './modelError';
import { handleTranslateSongRequest, type TranslateSongHandlerDeps } from './songHandler';
import type { StreamModel } from './songService';
import type { StoredVideo } from './validate';

// Invented lines, not lyrics. Line 2 is line 0 sung again.
const VIDEO: StoredVideo = {
  status: 'ok',
  lyricsRef: '777',
  lyricsLrc: [
    '[00:02.00]Paper boats on a river of light',
    '[00:06.00]Hold the line till the morning comes',
    '[00:10.00]Paper boats on a river of light',
  ].join('\n'),
  lyricsDurationS: 30,
};

const ASK = { youtubeId: 'aaaaaaaaaaa', lyricsRef: '777' };

const ANSWER = JSON.stringify({
  lines: [
    { n: 1, translation: 'Barcos de papel num rio de luz' },
    { n: 2, translation: 'Aguenta firme até a manhã chegar' },
  ],
});

/** A model that streams `text` in small pieces and ends well. */
function streaming(text = ANSWER) {
  return vi.fn<StreamModel>(async (_request, onText) => {
    for (let at = 0; at < text.length; at += 9) onText(text.slice(at, at + 9));
    return { usage: { inputTokens: 200, outputTokens: 60 }, latencyMs: 1200 };
  });
}

function fakeDeps(over: Partial<TranslateSongHandlerDeps> = {}) {
  const store = {
    getCached: vi.fn<HelpStore['getCached']>(async () => null),
    saveCached: vi.fn<HelpStore['saveCached']>(async () => {}),
    reserve: vi.fn<HelpStore['reserve']>(async () => 41),
    release: vi.fn<HelpStore['release']>(async () => {}),
    recordUsage: vi.fn<HelpStore['recordUsage']>(async () => {}),
    getVideo: vi.fn<HelpStore['getVideo']>(async () => VIDEO),
    getCachedTranslations: vi.fn<TranslationCache['getCachedTranslations']>(async () => new Map()),
    saveTranslations: vi.fn<TranslationCache['saveTranslations']>(async () => {}),
  };
  const jobs: Promise<void>[] = [];
  const deps = {
    userId: vi.fn(async () => 'user-1' as string | null),
    isMember: vi.fn(async () => true),
    store: vi.fn(() => store),
    streamModel: streaming(),
    keepAlive: vi.fn<TranslateSongHandlerDeps['keepAlive']>((job) => {
      jobs.push(job);
    }),
  };
  // The fakes a test passes are mocks too.
  return { deps: { ...deps, ...over } as typeof deps, store, jobs };
}

function post(body: unknown) {
  return new Request('http://localhost:3000/api/translate-song', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

/** Every translation of a 200, as the browser reads it: one JSON object per line. */
async function linesOf(response: Response) {
  const text = await response.text();
  return text
    .split('\n')
    .filter((line) => line !== '')
    .map((line) => JSON.parse(line) as unknown);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('POST /api/translate-song: who may ask', () => {
  it('answers 401 with no session, and never makes the service client', async () => {
    const { deps } = fakeDeps({ userId: vi.fn(async () => null) });

    const response = await handleTranslateSongRequest(post(ASK), deps);

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'unauthenticated' });
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(deps.store).not.toHaveBeenCalled();
  });

  it('answers 403 to someone who is not a member, and asks the model nothing', async () => {
    const { deps } = fakeDeps({ isMember: vi.fn(async () => false) });

    const response = await handleTranslateSongRequest(post(ASK), deps);

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: 'not_member' });
    expect(deps.store).not.toHaveBeenCalled();
    expect(deps.streamModel).not.toHaveBeenCalled();
  });

  it('answers 503 when the session or the membership cannot be checked', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { deps } = fakeDeps({ isMember: vi.fn(async () => Promise.reject(new Error('timeout'))) });

    const response = await handleTranslateSongRequest(post(ASK), deps);

    expect(response.status).toBe(503);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });
});

describe('POST /api/translate-song: what is asked', () => {
  it.each([
    ['a body that is not JSON', '{nope'],
    ['a body with no lyrics', { youtubeId: 'aaaaaaaaaaa' }],
    ['a video id that is not one', { youtubeId: 'nope', lyricsRef: '777' }],
    ['a body far bigger than a request', { ...ASK, padding: 'x'.repeat(5000) }],
  ])('answers 400 to %s, before reading the database', async (_name, body) => {
    const { deps } = fakeDeps();

    const response = await handleTranslateSongRequest(post(body), deps);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'invalid' });
    expect(deps.store).not.toHaveBeenCalled();
  });

  it('answers 400 when the lyrics are not the ones stored for the video', async () => {
    const { deps, store } = fakeDeps();

    const response = await handleTranslateSongRequest(post({ ...ASK, lyricsRef: '778' }), deps);

    expect(response.status).toBe(400);
    expect(store.reserve).not.toHaveBeenCalled();
    expect(deps.streamModel).not.toHaveBeenCalled();
  });

  it('answers 503 when the database fails before anything is sent', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { deps, store } = fakeDeps();
    store.getCachedTranslations.mockRejectedValue(new Error('db down'));

    const response = await handleTranslateSongRequest(post(ASK), deps);

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: 'unavailable' });
  });
});

describe('POST /api/translate-song: the translations', () => {
  it('streams one JSON line per line of the song, with no-store, all of them in one model call', async () => {
    const { deps } = fakeDeps();

    const response = await handleTranslateSongRequest(post(ASK), deps);

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('application/x-ndjson; charset=utf-8');
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(await linesOf(response)).toEqual([
      { lineIndex: 0, text: 'Barcos de papel num rio de luz' },
      { lineIndex: 2, text: 'Barcos de papel num rio de luz' },
      { lineIndex: 1, text: 'Aguenta firme até a manhã chegar' },
    ]);
    expect(deps.streamModel).toHaveBeenCalledOnce();
  });

  it('sends the repeated text once to the model and its translation back to every line that has it', async () => {
    const { deps } = fakeDeps();

    await linesOf(await handleTranslateSongRequest(post(ASK), deps));

    expect(deps.streamModel.mock.calls[0][0].user).toBe(
      'Versos:\n1. Paper boats on a river of light\n2. Hold the line till the morning comes',
    );
  });

  it('answers from the cache at once when it has every line, with no model and no budget', async () => {
    const { deps, store } = fakeDeps();
    store.getCachedTranslations.mockResolvedValue(
      new Map([
        [0, 'Do cache 0'],
        [1, 'Do cache 1'],
        [2, 'Do cache 2'],
      ]),
    );

    const response = await handleTranslateSongRequest(post(ASK), deps);

    expect(await linesOf(response)).toEqual([
      { lineIndex: 0, text: 'Do cache 0' },
      { lineIndex: 1, text: 'Do cache 1' },
      { lineIndex: 2, text: 'Do cache 2' },
    ]);
    expect(deps.streamModel).not.toHaveBeenCalled();
    expect(store.reserve).not.toHaveBeenCalled();
  });

  it('asks the model only about the lines the cache does not have', async () => {
    const { deps, store } = fakeDeps({
      streamModel: streaming(JSON.stringify({ lines: [{ n: 1, translation: 'Aguenta firme' }] })),
    });
    store.getCachedTranslations.mockResolvedValue(new Map([[0, 'Do cache 0']]));

    const lines = await linesOf(await handleTranslateSongRequest(post(ASK), deps));

    expect(deps.streamModel.mock.calls[0][0].user).toBe('Versos:\n1. Hold the line till the morning comes');
    expect(lines).toEqual([
      { lineIndex: 0, text: 'Do cache 0' },
      { lineIndex: 2, text: 'Do cache 0' },
      { lineIndex: 1, text: 'Aguenta firme' },
    ]);
  });

  it('counts the song as one request of the hourly translation budget', async () => {
    const { deps, store } = fakeDeps();

    await linesOf(await handleTranslateSongRequest(post(ASK), deps));

    expect(store.reserve).toHaveBeenCalledExactlyOnceWith('user-1', 'translate');
    expect(store.release).not.toHaveBeenCalled();
  });

  it('answers 429 when the budget is used up and the cache has nothing for the song', async () => {
    const { deps, store } = fakeDeps();
    store.reserve.mockResolvedValue(null);

    const response = await handleTranslateSongRequest(post(ASK), deps);

    expect(response.status).toBe(429);
    expect(await response.json()).toEqual({ error: 'rate_limited' });
    expect(deps.streamModel).not.toHaveBeenCalled();
  });

  it('lets the first lines out while the model is still on the rest', async () => {
    let finish!: () => void;
    const { deps } = fakeDeps({
      streamModel: vi.fn<StreamModel>(async (_request, onText) => {
        onText('{"lines":[{"n":1,"translation":"Barcos de papel"},');
        await new Promise<void>((done) => {
          finish = done;
        });
        onText('{"n":2,"translation":"Aguenta firme"}]}');
        return { usage: { inputTokens: 1, outputTokens: 1 }, latencyMs: 1 };
      }),
    });

    const response = await handleTranslateSongRequest(post(ASK), deps);
    const reader = response.body!.getReader();
    const first = new TextDecoder().decode((await reader.read()).value);

    expect(first.split('\n').filter(Boolean).map((line) => JSON.parse(line) as unknown)).toEqual([
      { lineIndex: 0, text: 'Barcos de papel' },
      { lineIndex: 2, text: 'Barcos de papel' },
    ]);
    finish();
    const rest = new TextDecoder().decode((await reader.read()).value);
    expect(JSON.parse(rest.trim())).toEqual({ lineIndex: 1, text: 'Aguenta firme' });
    expect((await reader.read()).done).toBe(true);
  });

  it('ends the stream with what came, and gives the budget back, when the model gave no answer', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { deps, store, jobs } = fakeDeps({
      streamModel: vi.fn<StreamModel>(async () => {
        throw new ModelError('The model service could not be reached');
      }),
    });

    const response = await handleTranslateSongRequest(post(ASK), deps);

    expect(response.status).toBe(200);
    expect(await linesOf(response)).toEqual([]);
    await Promise.all(jobs);
    expect(store.release).toHaveBeenCalledExactlyOnceWith(41);
  });

  it('ends the stream well when the answer is not the shape asked for', async () => {
    const { deps } = fakeDeps({ streamModel: streaming('{"lines": "Barcos de papel" }') });

    const response = await handleTranslateSongRequest(post(ASK), deps);

    expect(response.status).toBe(200);
    expect(await linesOf(response)).toEqual([]);
  });

  it('saves the lines in line_help and logs the call with line_index -1, after the stream is over', async () => {
    const { deps, store, jobs } = fakeDeps();

    const response = await handleTranslateSongRequest(post(ASK), deps);
    await linesOf(response);
    await Promise.all(jobs);

    expect(deps.keepAlive).toHaveBeenCalledOnce();
    expect(store.saveTranslations).toHaveBeenCalledExactlyOnceWith('aaaaaaaaaaa', '777', [
      { lineIndex: 0, text: 'Barcos de papel num rio de luz' },
      { lineIndex: 2, text: 'Barcos de papel num rio de luz' },
      { lineIndex: 1, text: 'Aguenta firme até a manhã chegar' },
    ]);
    expect(store.recordUsage).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ lineIndex: -1, kind: 'translate', source: 'model', outcome: 'ok' }),
    );
  });

  it('goes on to the end, saving everything, when the player leaves before the stream is over', async () => {
    let finish!: () => void;
    const { deps, store, jobs } = fakeDeps({
      streamModel: vi.fn<StreamModel>(async (_request, onText) => {
        onText('{"lines":[{"n":1,"translation":"Barcos"},');
        await new Promise<void>((done) => {
          finish = done;
        });
        onText('{"n":2,"translation":"Aguenta"}]}');
        return { usage: { inputTokens: 1, outputTokens: 1 }, latencyMs: 1 };
      }),
    });

    const response = await handleTranslateSongRequest(post(ASK), deps);
    const reader = response.body!.getReader();
    await reader.read();
    await reader.cancel();
    finish();
    await Promise.all(jobs);

    expect(store.saveTranslations).toHaveBeenCalledExactlyOnceWith('aaaaaaaaaaa', '777', [
      { lineIndex: 0, text: 'Barcos' },
      { lineIndex: 2, text: 'Barcos' },
      { lineIndex: 1, text: 'Aguenta' },
    ]);
    expect(store.recordUsage).toHaveBeenCalledOnce();
  });

  it('still streams when the work cannot be kept going after the response', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { deps } = fakeDeps({
      keepAlive: vi.fn(() => {
        throw new Error('after was called outside a request scope');
      }),
    });

    const response = await handleTranslateSongRequest(post(ASK), deps);

    expect(await linesOf(response)).toHaveLength(3);
    expect(warn).toHaveBeenCalledWith('Could not keep the song translation going after the response.', expect.any(Error));
  });
});
