// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AiUsageEntry } from './helpService';
import { ModelError } from './modelError';
import { SONG_TRANSLATE_SYSTEM } from './prompts';
import {
  createItemScanner,
  MAX_SONG_TEXTS,
  MAX_TRANSLATION_CHARS,
  parseSongAsk,
  planSongTranslation,
  SONG_TRANSLATION_SCHEMA,
  songMaxTokens,
  startSongTranslation,
  type LineTranslation,
  type SongDeps,
  type StreamModel,
} from './songService';
import type { StoredVideo } from './validate';

// Invented lines, not lyrics. Line 2 is line 0 sung again, written a little differently.
const LRC = [
  '[00:02.00]Paper boats on a river of light',
  '[00:06.00]Hold the line till the morning comes',
  '[00:10.00]PAPER  boats on a river of light',
  '[00:14.00]Lanterns hum above the quiet square',
].join('\n');

const VIDEO: StoredVideo = { status: 'ok', lyricsRef: '777', lyricsLrc: LRC, lyricsDurationS: 30 };
const ASK = { youtubeId: 'aaaaaaaaaaa', lyricsRef: '777' };

/** The lines of LRC, as `linesOfVideo` reads them. */
const LINES = [
  { index: 0, startMs: 2000, endMs: 6000, text: 'Paper boats on a river of light' },
  { index: 1, startMs: 6000, endMs: 10000, text: 'Hold the line till the morning comes' },
  { index: 2, startMs: 10000, endMs: 14000, text: 'PAPER  boats on a river of light' },
  { index: 3, startMs: 14000, endMs: 30000, text: 'Lanterns hum above the quiet square' },
];

/** What the model answers, as the structured output it streams. */
function answerJson(items: { n: unknown; translation: unknown }[]): string {
  return JSON.stringify({ lines: items });
}

/** `text` cut into pieces of `size` characters, as a stream may hand it over. */
function pieces(text: string, size = 7): string[] {
  const out: string[] = [];
  for (let at = 0; at < text.length; at += size) out.push(text.slice(at, at + size));
  return out;
}

const FULL_ANSWER = answerJson([
  { n: 1, translation: 'Barcos de papel num rio de luz' },
  { n: 2, translation: 'Aguenta firme até a manhã chegar' },
  { n: 3, translation: 'Lanternas zumbem sobre a praça quieta' },
]);

/** A model that streams `text` in pieces and then ends well. */
function streaming(text: string, usage = { inputTokens: 300, outputTokens: 90 }, latencyMs = 1500) {
  return vi.fn<StreamModel>(async (_request, onText) => {
    for (const piece of pieces(text)) onText(piece);
    return { usage, latencyMs };
  });
}

function fakeDeps(over: Partial<SongDeps> = {}) {
  const deps = {
    getVideo: vi.fn<SongDeps['getVideo']>(async () => VIDEO),
    getCachedTranslations: vi.fn<SongDeps['getCachedTranslations']>(async () => new Map()),
    saveTranslations: vi.fn<SongDeps['saveTranslations']>(async () => {}),
    reserve: vi.fn<SongDeps['reserve']>(async () => 41),
    release: vi.fn<SongDeps['release']>(async () => {}),
    recordUsage: vi.fn<SongDeps['recordUsage']>(async () => {}),
    streamModel: streaming(FULL_ANSWER),
  };
  // The fakes a test passes are mocks too.
  return { ...deps, ...over } as typeof deps;
}

/** Runs a started translation to its end: every batch it sent, and the order of what it did. */
async function runToEnd(start: Awaited<ReturnType<typeof startSongTranslation>>, deps?: ReturnType<typeof fakeDeps>) {
  if (start.status !== 200) throw new Error(`Expected 200, got ${start.status}`);
  const batches: LineTranslation[][] = [];
  const order: string[] = [];
  deps?.saveTranslations.mockImplementation(async () => {
    order.push('save');
  });
  deps?.recordUsage.mockImplementation(async () => {
    order.push('usage');
  });
  await start.run(
    (lines) => {
      batches.push([...lines]);
      order.push('send');
    },
    () => order.push('end'),
  );
  return { batches, sent: batches.flat(), order };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('parseSongAsk', () => {
  it('takes a video id and the lyrics it has', () => {
    expect(parseSongAsk({ youtubeId: 'aaaaaaaaaaa', lyricsRef: '777' })).toEqual(ASK);
  });

  it.each([
    ['not an object', 'aaaaaaaaaaa'],
    ['null', null],
    ['an array', [ASK]],
    ['no lyrics', { youtubeId: 'aaaaaaaaaaa' }],
    ['a number for the lyrics', { youtubeId: 'aaaaaaaaaaa', lyricsRef: 777 }],
    ['empty lyrics', { youtubeId: 'aaaaaaaaaaa', lyricsRef: '' }],
    ['lyrics longer than any ref', { youtubeId: 'aaaaaaaaaaa', lyricsRef: '7'.repeat(201) }],
    ['a video id that is not one', { youtubeId: 'not a video', lyricsRef: '777' }],
    ['a link in place of the id', { youtubeId: 'https://youtu.be/aaaaaaaaaaa', lyricsRef: '777' }],
  ])('turns down %s', (_name, body) => {
    expect(parseSongAsk(body)).toBeNull();
  });
});

describe('planSongTranslation', () => {
  it('with nothing cached, asks for each text once, in the order it is first sung, for every line that has it', () => {
    const plan = planSongTranslation(LINES, new Map());

    expect(plan.known).toEqual([]);
    expect(plan.reused).toEqual([]);
    expect(plan.missing).toEqual([
      { text: 'Paper boats on a river of light', lineIndexes: [0, 2] },
      { text: 'Hold the line till the morning comes', lineIndexes: [1] },
      { text: 'Lanterns hum above the quiet square', lineIndexes: [3] },
    ]);
  });

  it('with every line cached, asks for nothing and knows them all, in song order', () => {
    const cached = new Map([
      [3, 'T3'],
      [0, 'T0'],
      [2, 'T2'],
      [1, 'T1'],
    ]);

    const plan = planSongTranslation(LINES, cached);

    expect(plan.missing).toEqual([]);
    expect(plan.reused).toEqual([]);
    expect(plan.known).toEqual([
      { lineIndex: 0, text: 'T0' },
      { lineIndex: 1, text: 'T1' },
      { lineIndex: 2, text: 'T2' },
      { lineIndex: 3, text: 'T3' },
    ]);
  });

  it('gives a line with no translation the one of a line with the same text, to be saved for it too', () => {
    const plan = planSongTranslation(LINES, new Map([[0, 'T0']]));

    expect(plan.known).toEqual([
      { lineIndex: 0, text: 'T0' },
      { lineIndex: 2, text: 'T0' },
    ]);
    expect(plan.reused).toEqual([{ lineIndex: 2, text: 'T0' }]);
    expect(plan.missing.map((group) => group.lineIndexes)).toEqual([[1], [3]]);
  });

  it('leaves out a line too long to be a song line, which no help is given for', () => {
    const lines = [LINES[0], { ...LINES[1], text: 'la '.repeat(120) }];

    expect(planSongTranslation(lines, new Map()).missing).toEqual([
      { text: 'Paper boats on a river of light', lineIndexes: [0] },
    ]);
  });

  it(`asks for at most ${MAX_SONG_TEXTS} texts in one go: the first ones sung`, () => {
    const lines = Array.from({ length: MAX_SONG_TEXTS + 5 }, (_, index) => ({
      index,
      startMs: index * 1000,
      endMs: (index + 1) * 1000,
      text: `Invented line number ${index}`,
    }));

    const plan = planSongTranslation(lines, new Map());

    expect(plan.missing).toHaveLength(MAX_SONG_TEXTS);
    expect(plan.missing.at(-1)?.lineIndexes).toEqual([MAX_SONG_TEXTS - 1]);
  });
});

describe('createItemScanner', () => {
  function scan(chunks: string[]): unknown[] {
    const items: unknown[] = [];
    const feed = createItemScanner((item) => items.push(item));
    for (const chunk of chunks) feed(chunk);
    return items;
  }

  it('hands over each line of the answer as soon as it is whole, whatever pieces the text comes in', () => {
    for (const size of [1, 2, 5, 13, 1000]) {
      expect(scan(pieces(FULL_ANSWER, size))).toEqual([
        { n: 1, translation: 'Barcos de papel num rio de luz' },
        { n: 2, translation: 'Aguenta firme até a manhã chegar' },
        { n: 3, translation: 'Lanternas zumbem sobre a praça quieta' },
      ]);
    }
  });

  it('hands over the first line before the rest of the answer has come', () => {
    const items: unknown[] = [];
    const feed = createItemScanner((item) => items.push(item));

    feed('{"lines": [ {"n": 1, "translation": "Um"} , {"n": 2, "tr');

    expect(items).toEqual([{ n: 1, translation: 'Um' }]);
  });

  it('is not fooled by braces, brackets, quotes or backslashes inside the text', () => {
    const text = answerJson([
      { n: 1, translation: 'Diz "oi" {pra} [ela] \\ e } vai' },
      { n: 2, translation: 'Segue' },
    ]);

    expect(scan(pieces(text, 3))).toEqual([
      { n: 1, translation: 'Diz "oi" {pra} [ela] \\ e } vai' },
      { n: 2, translation: 'Segue' },
    ]);
  });

  it('skips a line that is not JSON and goes on with the next one', () => {
    expect(scan(['{"lines":[{"n":1,"translation":"Um"}, {n:2}, {"n":3,"translation":"Três"}]}'])).toEqual([
      { n: 1, translation: 'Um' },
      { n: 3, translation: 'Três' },
    ]);
  });

  it('finds nothing in an answer that is not the shape asked for, and does not throw', () => {
    expect(scan(['Claro! Aqui está a tradução: Barcos de papel'])).toEqual([]);
    expect(scan(['[{"n":1,"translation":"Um"}]'])).toEqual([]);
  });
});

describe('songMaxTokens', () => {
  it('gives the model room in proportion to the texts it is asked about, up to a ceiling', () => {
    expect(songMaxTokens(1)).toBeGreaterThanOrEqual(200);
    expect(songMaxTokens(20)).toBeGreaterThan(songMaxTokens(10));
    expect(songMaxTokens(20) - songMaxTokens(10)).toBe(10 * (songMaxTokens(2) - songMaxTokens(1)));
    expect(songMaxTokens(MAX_SONG_TEXTS)).toBe(8000);
    expect(songMaxTokens(10_000)).toBe(8000);
  });
});

describe('startSongTranslation', () => {
  it.each([
    ['there is no such video', null],
    ['the video is not playable', { ...VIDEO, status: 'no_lyrics' }],
    ['the video has no lyrics', { ...VIDEO, lyricsLrc: null }],
    ['the lyrics are not the ones asked about', { ...VIDEO, lyricsRef: '778' }],
    ['the lyrics have no line to translate', { ...VIDEO, lyricsLrc: '[00:01.00]\n[00:02.00]  ' }],
  ])('answers 400, asking for nothing, when %s', async (_name, video) => {
    const deps = fakeDeps({ getVideo: vi.fn(async () => video as StoredVideo | null) });

    expect(await startSongTranslation('user-1', ASK, deps)).toEqual({ status: 400 });
    expect(deps.getCachedTranslations).not.toHaveBeenCalled();
    expect(deps.reserve).not.toHaveBeenCalled();
    expect(deps.streamModel).not.toHaveBeenCalled();
  });

  it('reads the cache of the lyrics asked about', async () => {
    const deps = fakeDeps();

    await startSongTranslation('user-1', ASK, deps);

    expect(deps.getVideo).toHaveBeenCalledExactlyOnceWith('aaaaaaaaaaa');
    expect(deps.getCachedTranslations).toHaveBeenCalledExactlyOnceWith('aaaaaaaaaaa', '777');
  });

  describe('every line already cached', () => {
    const ALL = new Map([
      [0, 'T0'],
      [1, 'T1'],
      [2, 'T2'],
      [3, 'T3'],
    ]);

    it('sends them all at once, in song order, with no model and no budget', async () => {
      const deps = fakeDeps({ getCachedTranslations: vi.fn(async () => ALL) });

      const { batches } = await runToEnd(await startSongTranslation('user-1', ASK, deps), deps);

      expect(batches).toEqual([
        [
          { lineIndex: 0, text: 'T0' },
          { lineIndex: 1, text: 'T1' },
          { lineIndex: 2, text: 'T2' },
          { lineIndex: 3, text: 'T3' },
        ],
      ]);
      expect(deps.reserve).not.toHaveBeenCalled();
      expect(deps.streamModel).not.toHaveBeenCalled();
      expect(deps.saveTranslations).not.toHaveBeenCalled();
    });

    it('logs one free row for the whole song, with line_index -1, after the lines are out', async () => {
      const deps = fakeDeps({ getCachedTranslations: vi.fn(async () => ALL) });

      const { order } = await runToEnd(await startSongTranslation('user-1', ASK, deps), deps);

      expect(deps.recordUsage).toHaveBeenCalledExactlyOnceWith({
        userId: 'user-1',
        youtubeId: 'aaaaaaaaaaa',
        lineIndex: -1,
        kind: 'translate',
        source: 'cache',
        model: null,
        inputTokens: 0,
        outputTokens: 0,
        costUsd: 0,
        latencyMs: null,
        outcome: 'ok',
      } satisfies AiUsageEntry);
      expect(order).toEqual(['send', 'end', 'usage']);
    });

    it('also covers a line whose only translation is the one of a line with the same text, and saves it for it', async () => {
      const deps = fakeDeps({
        getCachedTranslations: vi.fn(
          async () =>
            new Map([
              [0, 'T0'],
              [1, 'T1'],
              [3, 'T3'],
            ]),
        ),
      });

      const { sent } = await runToEnd(await startSongTranslation('user-1', ASK, deps), deps);

      expect(sent).toContainEqual({ lineIndex: 2, text: 'T0' });
      expect(deps.streamModel).not.toHaveBeenCalled();
      expect(deps.reserve).not.toHaveBeenCalled();
      expect(deps.saveTranslations).toHaveBeenCalledExactlyOnceWith('aaaaaaaaaaa', '777', [{ lineIndex: 2, text: 'T0' }]);
    });
  });

  describe('lines missing from the cache', () => {
    it('asks the model once, with each missing text once, numbered, in the order they are first sung', async () => {
      const deps = fakeDeps();

      await runToEnd(await startSongTranslation('user-1', ASK, deps), deps);

      expect(deps.streamModel).toHaveBeenCalledOnce();
      const [request] = deps.streamModel.mock.calls[0];
      expect(request).toEqual({
        system: SONG_TRANSLATE_SYSTEM,
        user: [
          'Versos:',
          '1. Paper boats on a river of light',
          '2. Hold the line till the morning comes',
          '3. Lanterns hum above the quiet square',
        ].join('\n'),
        maxTokens: songMaxTokens(3),
        schema: SONG_TRANSLATION_SCHEMA,
      });
    });

    it('asks only for the texts the cache does not have', async () => {
      const deps = fakeDeps({
        getCachedTranslations: vi.fn(async () => new Map([[1, 'T1']])),
        streamModel: streaming(
          answerJson([
            { n: 1, translation: 'Barcos' },
            { n: 2, translation: 'Lanternas' },
          ]),
        ),
      });

      const { sent } = await runToEnd(await startSongTranslation('user-1', ASK, deps), deps);

      expect(deps.streamModel.mock.calls[0][0].user).toBe(
        ['Versos:', '1. Paper boats on a river of light', '2. Lanterns hum above the quiet square'].join('\n'),
      );
      expect(deps.streamModel.mock.calls[0][0].maxTokens).toBe(songMaxTokens(2));
      expect(sent).toEqual([
        { lineIndex: 1, text: 'T1' },
        { lineIndex: 0, text: 'Barcos' },
        { lineIndex: 2, text: 'Barcos' },
        { lineIndex: 3, text: 'Lanternas' },
      ]);
    });

    it('gives the translation of a repeated text to every line that has it', async () => {
      const deps = fakeDeps();

      const { sent } = await runToEnd(await startSongTranslation('user-1', ASK, deps), deps);

      expect(sent).toEqual([
        { lineIndex: 0, text: 'Barcos de papel num rio de luz' },
        { lineIndex: 2, text: 'Barcos de papel num rio de luz' },
        { lineIndex: 1, text: 'Aguenta firme até a manhã chegar' },
        { lineIndex: 3, text: 'Lanternas zumbem sobre a praça quieta' },
      ]);
    });

    it('takes one request of the hourly translation budget for the whole song', async () => {
      const deps = fakeDeps();

      await runToEnd(await startSongTranslation('user-1', ASK, deps), deps);

      expect(deps.reserve).toHaveBeenCalledExactlyOnceWith('user-1', 'translate');
      expect(deps.release).not.toHaveBeenCalled();
    });

    it('answers 429, asking nothing, when the budget is used up and the cache has none of the lines', async () => {
      const deps = fakeDeps({ reserve: vi.fn(async () => null) });

      expect(await startSongTranslation('user-1', ASK, deps)).toEqual({ status: 429 });
      expect(deps.streamModel).not.toHaveBeenCalled();
      expect(deps.recordUsage).not.toHaveBeenCalled();
    });

    it('with the budget used up, still sends the lines the cache has, and asks the model nothing', async () => {
      const deps = fakeDeps({
        reserve: vi.fn(async () => null),
        getCachedTranslations: vi.fn(async () => new Map([[1, 'T1']])),
      });

      const { sent } = await runToEnd(await startSongTranslation('user-1', ASK, deps), deps);

      expect(sent).toEqual([{ lineIndex: 1, text: 'T1' }]);
      expect(deps.streamModel).not.toHaveBeenCalled();
      expect(deps.recordUsage).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ lineIndex: -1, source: 'cache' }));
    });

    it('sends each line as soon as the model has given it, before the model is done', async () => {
      let finish!: () => void;
      const seenBeforeTheEnd: LineTranslation[] = [];
      const sent: LineTranslation[] = [];
      const deps = fakeDeps({
        streamModel: vi.fn<StreamModel>(async (_request, onText) => {
          onText('{"lines":[{"n":1,"translation":"Barcos"},');
          seenBeforeTheEnd.push(...sent);
          onText('{"n":2,"translation":"Aguenta"},{"n":3,"translation":"Lanternas"}]}');
          await new Promise<void>((done) => {
            finish = done;
          });
          return { usage: { inputTokens: 1, outputTokens: 1 }, latencyMs: 1 };
        }),
      });
      const start = await startSongTranslation('user-1', ASK, deps);
      if (start.status !== 200) throw new Error('not started');

      const running = start.run(
        (lines) => sent.push(...lines),
        () => {},
      );
      await vi.waitFor(() => expect(sent).toHaveLength(4));
      finish();
      await running;

      expect(seenBeforeTheEnd).toEqual([
        { lineIndex: 0, text: 'Barcos' },
        { lineIndex: 2, text: 'Barcos' },
      ]);
    });

    it('saves every line it got for the next player, the repeated ones and the reused ones included, in one go', async () => {
      const deps = fakeDeps();

      await runToEnd(await startSongTranslation('user-1', ASK, deps), deps);

      expect(deps.saveTranslations).toHaveBeenCalledExactlyOnceWith('aaaaaaaaaaa', '777', [
        { lineIndex: 0, text: 'Barcos de papel num rio de luz' },
        { lineIndex: 2, text: 'Barcos de papel num rio de luz' },
        { lineIndex: 1, text: 'Aguenta firme até a manhã chegar' },
        { lineIndex: 3, text: 'Lanternas zumbem sobre a praça quieta' },
      ]);
    });

    it('ends the stream before it saves anything or logs the usage (ruling S42)', async () => {
      const deps = fakeDeps();

      const { order } = await runToEnd(await startSongTranslation('user-1', ASK, deps), deps);

      expect(order.slice(-3)).toEqual(['end', 'save', 'usage']);
    });

    it('logs one row for the call, with line_index -1, its tokens, estimated cost and time', async () => {
      const deps = fakeDeps({ streamModel: streaming(FULL_ANSWER, { inputTokens: 1_000, outputTokens: 400 }, 2_345) });

      await runToEnd(await startSongTranslation('user-1', ASK, deps), deps);

      expect(deps.recordUsage).toHaveBeenCalledExactlyOnceWith({
        userId: 'user-1',
        youtubeId: 'aaaaaaaaaaa',
        lineIndex: -1,
        kind: 'translate',
        source: 'model',
        model: 'claude-haiku-5-5',
        inputTokens: 1_000,
        outputTokens: 400,
        costUsd: 0.0003,
        latencyMs: 2_345,
        outcome: 'ok',
      } satisfies AiUsageEntry);
    });

    it('drops what it cannot use: an unknown number, an empty or overlong translation, a second one for a line', async () => {
      const deps = fakeDeps({
        streamModel: streaming(
          answerJson([
            { n: 1, translation: '  Barcos  ' },
            { n: 1, translation: 'Outra vez' },
            { n: 2, translation: '   ' },
            { n: 9, translation: 'Ninguém' },
            { n: 0, translation: 'Zero' },
            { n: 1.5, translation: 'Meio' },
            { n: '3', translation: 'Texto' },
            { n: 3, translation: 'x'.repeat(MAX_TRANSLATION_CHARS + 1) },
          ]),
        ),
      });

      const { sent } = await runToEnd(await startSongTranslation('user-1', ASK, deps), deps);

      expect(sent).toEqual([
        { lineIndex: 0, text: 'Barcos' },
        { lineIndex: 2, text: 'Barcos' },
      ]);
      expect(deps.saveTranslations).toHaveBeenCalledExactlyOnceWith('aaaaaaaaaaa', '777', sent);
    });

    it('ends well, with nothing to send, when the answer is not the shape asked for', async () => {
      const deps = fakeDeps({ streamModel: streaming('Barcos de papel num rio de luz') });

      const { sent, order } = await runToEnd(await startSongTranslation('user-1', ASK, deps), deps);

      expect(sent).toEqual([]);
      expect(order).toContain('end');
      expect(deps.saveTranslations).not.toHaveBeenCalled();
    });

    it('gives the budget back, and ends the stream, when the call gave no answer at all', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const deps = fakeDeps({
        streamModel: vi.fn<StreamModel>(async () => {
          throw new ModelError('The model service could not be reached', { latencyMs: 300 });
        }),
      });

      const { sent, order } = await runToEnd(await startSongTranslation('user-1', ASK, deps), deps);

      expect(sent).toEqual([]);
      expect(order).toContain('end');
      expect(deps.release).toHaveBeenCalledExactlyOnceWith(41);
      expect(deps.recordUsage).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({ lineIndex: -1, source: 'model', inputTokens: 0, costUsd: 0, latencyMs: 300, outcome: 'error' }),
      );
      expect(warn).toHaveBeenCalled();
    });

    it('keeps and saves the lines that came, and the budget, when the call broke off after the model answered', async () => {
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      const deps = fakeDeps({
        streamModel: vi.fn<StreamModel>(async (_request, onText) => {
          onText('{"lines":[{"n":2,"translation":"Aguenta"},{"n":1,"tra');
          throw new ModelError('The model service could not be reached', {
            answered: true,
            usage: { inputTokens: 300, outputTokens: 20 },
            latencyMs: 4_000,
          });
        }),
      });

      const { sent } = await runToEnd(await startSongTranslation('user-1', ASK, deps), deps);

      expect(sent).toEqual([{ lineIndex: 1, text: 'Aguenta' }]);
      expect(deps.release).not.toHaveBeenCalled();
      expect(deps.saveTranslations).toHaveBeenCalledExactlyOnceWith('aaaaaaaaaaa', '777', sent);
      expect(deps.recordUsage).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({ inputTokens: 300, outputTokens: 20, latencyMs: 4_000, outcome: 'error' }),
      );
    });

    it.each(['refusal', 'max_tokens'])('logs a call cut short by %s as declined, keeping the lines that came', async () => {
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      const deps = fakeDeps({
        streamModel: vi.fn<StreamModel>(async (_request, onText) => {
          onText('{"lines":[{"n":1,"translation":"Barcos"},{"n":2,"tran');
          throw new ModelError('The model stopped', { declined: true, usage: { inputTokens: 1, outputTokens: 2 }, latencyMs: 9 });
        }),
      });

      const { sent } = await runToEnd(await startSongTranslation('user-1', ASK, deps), deps);

      expect(sent).toHaveLength(2);
      expect(deps.release).not.toHaveBeenCalled();
      expect(deps.recordUsage).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ outcome: 'declined' }));
    });

    it('still ends well when the lines cannot be saved, the usage cannot be logged or the budget cannot be given back', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const deps = fakeDeps({
        streamModel: vi.fn<StreamModel>(async () => {
          throw new ModelError('down');
        }),
        release: vi.fn(async () => {
          throw new Error('db down');
        }),
      });
      const start = await startSongTranslation('user-1', ASK, deps);
      if (start.status !== 200) throw new Error('not started');
      deps.recordUsage.mockRejectedValue(new Error('db down'));
      const end = vi.fn();

      await expect(start.run(() => {}, end)).resolves.toBeUndefined();
      expect(end).toHaveBeenCalledOnce();

      const saving = fakeDeps({ saveTranslations: vi.fn(async () => Promise.reject(new Error('disk full'))) });
      const started = await startSongTranslation('user-1', ASK, saving);
      if (started.status !== 200) throw new Error('not started');
      await expect(started.run(() => {}, () => {})).resolves.toBeUndefined();
      expect(warn).toHaveBeenCalled();
    });

    it('treats a failure that is not the model’s like one with no answer: the budget goes back', async () => {
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      const deps = fakeDeps({
        streamModel: vi.fn<StreamModel>(async () => {
          throw new TypeError('boom');
        }),
      });

      await runToEnd(await startSongTranslation('user-1', ASK, deps), deps);

      expect(deps.release).toHaveBeenCalledExactlyOnceWith(41);
      expect(deps.recordUsage).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ outcome: 'error', latencyMs: null }));
    });
  });
});

describe('SONG_TRANSLATION_SCHEMA', () => {
  it('asks for a list of lines, each with its number and its translation, and nothing else', () => {
    expect(SONG_TRANSLATION_SCHEMA).toEqual({
      type: 'object',
      properties: {
        lines: {
          type: 'array',
          items: {
            type: 'object',
            properties: { n: { type: 'integer' }, translation: { type: 'string' } },
            required: ['n', 'translation'],
            additionalProperties: false,
          },
        },
      },
      required: ['lines'],
      additionalProperties: false,
    });
  });
});
