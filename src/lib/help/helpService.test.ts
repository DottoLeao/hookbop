import { describe, expect, it, vi } from 'vitest';
import {
  type AiUsageEntry,
  getHelp,
  HELP_BUDGET_PER_HOUR,
  type HelpDeps,
  type HelpRequest,
  type ModelAnswer,
} from './helpService';
import { ModelError } from './modelError';
import { EXPLAIN_SYSTEM, TRANSLATE_SYSTEM } from './prompts';

const USER = 'user-1';
const RESERVATION = 41;

// An invented line, not a lyric.
const LINE = "Please don't let the candle fade";

const ASK: HelpRequest = {
  youtubeId: 'aaaaaaaaaaa',
  lyricsRef: '777',
  lineIndex: 0,
  lineText: LINE,
  kind: 'explain',
  target: 'let',
};

/** What the model gave back: its text, the tokens it took and how long it took. */
const MODEL_ANSWER: ModelAnswer = {
  text: '"Let" aqui é deixar.',
  usage: { inputTokens: 2_000, outputTokens: 300 },
  latencyMs: 1_234,
};

/** Fake dependencies: an empty cache, a budget with room left, a model that answers and a usage log that takes it. */
function fakeDeps(over: Partial<HelpDeps> = {}) {
  return {
    getCached: vi.fn<HelpDeps['getCached']>(async () => null),
    saveCached: vi.fn<HelpDeps['saveCached']>(async () => {}),
    reserve: vi.fn<HelpDeps['reserve']>(async () => RESERVATION),
    release: vi.fn<HelpDeps['release']>(async () => {}),
    callModel: vi.fn<HelpDeps['callModel']>(async () => MODEL_ANSWER),
    recordUsage: vi.fn<HelpDeps['recordUsage']>(async () => {}),
    ...over,
  };
}

/** The row of a request the model was never asked about: a cache hit or a chorus line. */
function freeRow(source: 'cache' | 'reuse'): AiUsageEntry {
  return {
    userId: USER,
    youtubeId: 'aaaaaaaaaaa',
    lineIndex: 0,
    kind: 'explain',
    source,
    model: null,
    inputTokens: 0,
    outputTokens: 0,
    costUsd: 0,
    latencyMs: null,
    outcome: 'ok',
  };
}

/** The row of a request that went to the model, with what the model answered. */
function modelRow(over: Partial<AiUsageEntry> = {}): AiUsageEntry {
  return {
    userId: USER,
    youtubeId: 'aaaaaaaaaaa',
    lineIndex: 0,
    kind: 'explain',
    source: 'model',
    model: 'claude-haiku-5-5',
    inputTokens: 2_000,
    outputTokens: 300,
    // 2,000 in at $0.10 per million and 300 out at $0.50 per million.
    costUsd: 0.00035,
    latencyMs: 1_234,
    outcome: 'ok',
    ...over,
  };
}

/** The order the fakes were first called in. */
function callOrder(...fns: unknown[]) {
  return fns.map((fn) => vi.mocked(fn as () => void).mock.invocationCallOrder[0]);
}

describe('getHelp', () => {
  it('answers from the cache when the line already has that help, without reserving or calling the model', async () => {
    const deps = fakeDeps({ getCached: vi.fn(async () => 'Do cache.') });

    expect(await getHelp(USER, ASK, deps)).toEqual({ status: 200, content: 'Do cache.' });
    expect(deps.callModel).not.toHaveBeenCalled();
    expect(deps.reserve).not.toHaveBeenCalled();
    expect(deps.saveCached).not.toHaveBeenCalled();
  });

  it('reserves a request, asks the model with the line and the highlight, then saves the answer, in that order', async () => {
    const deps = fakeDeps();

    expect(await getHelp(USER, ASK, deps)).toEqual({ status: 200, content: '"Let" aqui é deixar.' });
    expect(deps.reserve).toHaveBeenCalledExactlyOnceWith(USER, 'explain');
    expect(deps.callModel).toHaveBeenCalledExactlyOnceWith(EXPLAIN_SYSTEM, `Verso: ${LINE}\nDestaque: let`);
    expect(deps.saveCached).toHaveBeenCalledExactlyOnceWith(ASK, '"Let" aqui é deixar.');
    expect(deps.release).not.toHaveBeenCalled();
    const order = callOrder(deps.getCached, deps.reserve, deps.callModel, deps.saveCached);
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  it('asks for a translation with only the line, from the budget of translations', async () => {
    const deps = fakeDeps();

    await getHelp(USER, { ...ASK, kind: 'translate', target: '' }, deps);

    expect(deps.reserve).toHaveBeenCalledExactlyOnceWith(USER, 'translate');
    expect(deps.callModel).toHaveBeenCalledExactlyOnceWith(TRANSLATE_SYSTEM, `Verso: ${LINE}`);
  });

  it('gives explanations 60 requests an hour and translations 240, so Karaokê cannot use up "Não entendi"', () => {
    expect(HELP_BUDGET_PER_HOUR).toEqual({ explain: 60, translate: 240 });
  });

  it('asks about the whole line when there is no highlight', async () => {
    const deps = fakeDeps();

    await getHelp(USER, { ...ASK, target: '' }, deps);

    expect(deps.callModel).toHaveBeenCalledExactlyOnceWith(EXPLAIN_SYSTEM, `Verso: ${LINE}\nDestaque: (o verso inteiro)`);
  });

  it('keys the cache on the target folded to lowercase, and shows the model the line’s own spelling', async () => {
    const deps = fakeDeps();

    await getHelp(USER, { ...ASK, target: ' PLEASE ' }, deps);

    expect(deps.getCached).toHaveBeenCalledExactlyOnceWith({ ...ASK, target: 'please' });
    expect(deps.callModel).toHaveBeenCalledExactlyOnceWith(EXPLAIN_SYSTEM, `Verso: ${LINE}\nDestaque: Please`);
    expect(deps.saveCached).toHaveBeenCalledWith({ ...ASK, target: 'please' }, expect.any(String));
  });

  it('answers 429 when the member’s budget has no request left, and calls nothing more', async () => {
    const deps = fakeDeps({ reserve: vi.fn(async () => null) });

    expect(await getHelp(USER, ASK, deps)).toEqual({ status: 429 });
    expect(deps.callModel).not.toHaveBeenCalled();
    expect(deps.saveCached).not.toHaveBeenCalled();
    expect(deps.release).not.toHaveBeenCalled();
  });

  it('answers from the cache even with no budget left: a cached answer costs nothing', async () => {
    const deps = fakeDeps({ getCached: vi.fn(async () => 'Do cache.'), reserve: vi.fn(async () => null) });

    expect(await getHelp(USER, ASK, deps)).toEqual({ status: 200, content: 'Do cache.' });
  });

  it('answers 400 for a line of more than 300 characters, before touching the cache or the model', async () => {
    const deps = fakeDeps();
    const long = `let ${'a'.repeat(297)}`;

    expect(await getHelp(USER, { ...ASK, lineText: long }, deps)).toEqual({ status: 400 });
    expect(deps.getCached).not.toHaveBeenCalled();
    expect(deps.reserve).not.toHaveBeenCalled();
    expect(deps.callModel).not.toHaveBeenCalled();
  });

  it.each<[string, Partial<HelpRequest>]>([
    ['a target that is not on the line', { target: 'ocean' }],
    ['a target of more than 40 characters', { target: 'x'.repeat(41) }],
    ['a translation with a target', { kind: 'translate' }],
  ])('answers 400 for %s', async (_name, over) => {
    const deps = fakeDeps();

    expect(await getHelp(USER, { ...ASK, ...over }, deps)).toEqual({ status: 400 });
    expect(deps.callModel).not.toHaveBeenCalled();
  });

  it.each([
    ['the model could not be reached, timed out or was aborted', new ModelError('The model service could not be reached')],
    ['the call failed in some other way', new Error('model down')],
  ])('gives the reservation back when %s, saves nothing, and lets the failure through (ruling R75)', async (_name, failure) => {
    const deps = fakeDeps({ callModel: vi.fn(async () => Promise.reject(failure)) });

    await expect(getHelp(USER, ASK, deps)).rejects.toBe(failure);
    expect(deps.release).toHaveBeenCalledExactlyOnceWith(RESERVATION);
    expect(deps.saveCached).not.toHaveBeenCalled();
  });

  it.each([
    ['refused', new ModelError('The model stopped with refusal', { declined: true })],
    ['ran out of room', new ModelError('The model stopped with max_tokens', { declined: true })],
    ['came back with no text', new ModelError('The model answered with no text', { answered: true })],
  ])('keeps the reservation when the model answered but %s, so a line that never works cannot be asked forever (ruling R75)', async (_name, failure) => {
    const deps = fakeDeps({ callModel: vi.fn(async () => Promise.reject(failure)) });

    await expect(getHelp(USER, ASK, deps)).rejects.toBe(failure);
    expect(deps.release).not.toHaveBeenCalled();
    expect(deps.saveCached).not.toHaveBeenCalled();
  });

  it('still lets the model failure through when the reservation cannot be given back', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const failure = new Error('model down');
    const deps = fakeDeps({
      callModel: vi.fn(async () => Promise.reject(failure)),
      release: vi.fn(async () => Promise.reject(new Error('db down'))),
    });

    await expect(getHelp(USER, ASK, deps)).rejects.toBe(failure);
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
  });

  it('still answers when the answer cannot be saved, and keeps the reservation, since the model was asked', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const deps = fakeDeps({ saveCached: vi.fn(async () => Promise.reject(new Error('save failed'))) });

    expect(await getHelp(USER, ASK, deps)).toEqual({ status: 200, content: '"Let" aqui é deixar.' });
    expect(deps.release).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
  });

  describe('a line sung again (ruling R72)', () => {
    /** The cache has this help for line 3 only. */
    const cachedOnLine3 = () => vi.fn<HelpDeps['getCached']>(async (r) => (r.lineIndex === 3 ? 'Do refrão.' : null));

    it('takes the help of another line with the same text, saves it for this line, and asks nothing', async () => {
      const deps = fakeDeps({ getCached: cachedOnLine3() });

      expect(await getHelp(USER, ASK, deps, [0, 3, 7])).toEqual({ status: 200, content: 'Do refrão.' });
      expect(deps.getCached).toHaveBeenCalledWith({ ...ASK, lineIndex: 3 });
      expect(deps.getCached).toHaveBeenCalledWith({ ...ASK, lineIndex: 7 });
      expect(deps.saveCached).toHaveBeenCalledExactlyOnceWith(ASK, 'Do refrão.');
      expect(deps.reserve).not.toHaveBeenCalled();
      expect(deps.callModel).not.toHaveBeenCalled();
    });

    it('looks for the same kind and the same folded target on the other lines', async () => {
      const deps = fakeDeps();

      await getHelp(USER, { ...ASK, kind: 'translate', target: '' }, deps, [5]);
      await getHelp(USER, { ...ASK, target: 'LET' }, deps, [5]);

      expect(deps.getCached).toHaveBeenCalledWith({ ...ASK, kind: 'translate', target: '', lineIndex: 5 });
      expect(deps.getCached).toHaveBeenCalledWith({ ...ASK, target: 'let', lineIndex: 5 });
    });

    it('reserves and asks the model when no line with the same text has the help yet', async () => {
      const deps = fakeDeps();

      await getHelp(USER, ASK, deps, [3, 7]);

      expect(deps.reserve).toHaveBeenCalledOnce();
      expect(deps.callModel).toHaveBeenCalledOnce();
    });

    it('answers from the line’s own cache first, without looking at the others', async () => {
      const deps = fakeDeps({ getCached: vi.fn(async () => 'Da própria linha.') });

      expect(await getHelp(USER, ASK, deps, [3])).toEqual({ status: 200, content: 'Da própria linha.' });
      expect(deps.getCached).toHaveBeenCalledOnce();
      expect(deps.saveCached).not.toHaveBeenCalled();
    });

    it('does not reserve when the copy cannot be saved: the answer is still good', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const deps = fakeDeps({
        getCached: cachedOnLine3(),
        saveCached: vi.fn(async () => Promise.reject(new Error('save failed'))),
      });

      expect(await getHelp(USER, ASK, deps, [3])).toEqual({ status: 200, content: 'Do refrão.' });
      expect(deps.reserve).not.toHaveBeenCalled();
      warn.mockRestore();
    });
  });
});

describe('getHelp records its own usage', () => {
  it('records an answer from the cache as source cache, with 0 tokens, a cost of 0 and outcome ok', async () => {
    const deps = fakeDeps({ getCached: vi.fn(async () => 'Do cache.') });

    await getHelp(USER, ASK, deps);

    expect(deps.recordUsage).toHaveBeenCalledExactlyOnceWith(freeRow('cache'));
  });

  it('records a chorus line as source reuse, against the line asked about and not the one the help came from', async () => {
    const deps = fakeDeps({ getCached: vi.fn(async (r) => (r.lineIndex === 3 ? 'Do refrão.' : null)) });

    await getHelp(USER, ASK, deps, [3]);

    expect(deps.recordUsage).toHaveBeenCalledExactlyOnceWith(freeRow('reuse'));
  });

  it('records a new call as source model, with the model, the tokens, the cost, the time and outcome ok', async () => {
    const deps = fakeDeps();

    await getHelp(USER, ASK, deps);

    expect(deps.recordUsage).toHaveBeenCalledExactlyOnceWith(modelRow());
  });

  it('records a translation under its own kind', async () => {
    const deps = fakeDeps();

    await getHelp(USER, { ...ASK, kind: 'translate', target: '' }, deps);

    expect(deps.recordUsage).toHaveBeenCalledExactlyOnceWith(modelRow({ kind: 'translate' }));
  });

  it('records the call even when its answer cannot be saved', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const deps = fakeDeps({ saveCached: vi.fn(async () => Promise.reject(new Error('save failed'))) });

    await getHelp(USER, ASK, deps);

    expect(deps.recordUsage).toHaveBeenCalledExactlyOnceWith(modelRow());
    warn.mockRestore();
  });

  it.each([
    ['refused', 'The model stopped with refusal'],
    ['ran out of room', 'The model stopped with max_tokens'],
  ])('records an answer the model %s as declined, with the tokens it took', async (_name, message) => {
    const failure = new ModelError(message, {
      declined: true,
      usage: { inputTokens: 180, outputTokens: 300 },
      latencyMs: 900,
    });
    const deps = fakeDeps({ callModel: vi.fn(async () => Promise.reject(failure)) });

    await expect(getHelp(USER, ASK, deps)).rejects.toBe(failure);

    // 180 in at $0.10 per million and 300 out at $0.50 per million.
    expect(deps.recordUsage).toHaveBeenCalledExactlyOnceWith(
      modelRow({ inputTokens: 180, outputTokens: 300, costUsd: 0.000168, latencyMs: 900, outcome: 'declined' }),
    );
  });

  it('records an answer with nothing usable as an error that still has its tokens, since it was billed', async () => {
    const failure = new ModelError('The model answered with no text', {
      answered: true,
      usage: { inputTokens: 120, outputTokens: 4 },
      latencyMs: 650,
    });
    const deps = fakeDeps({ callModel: vi.fn(async () => Promise.reject(failure)) });

    await expect(getHelp(USER, ASK, deps)).rejects.toBe(failure);

    // 120 in at $0.10 per million and 4 out at $0.50 per million.
    expect(deps.recordUsage).toHaveBeenCalledExactlyOnceWith(
      modelRow({ inputTokens: 120, outputTokens: 4, costUsd: 0.000014, latencyMs: 650, outcome: 'error' }),
    );
    expect(deps.release).not.toHaveBeenCalled();
  });

  it('records a call that got no answer as an error with no tokens, and still gives the reservation back', async () => {
    const failure = new ModelError('The model service could not be reached', { latencyMs: 20_000 });
    const deps = fakeDeps({ callModel: vi.fn(async () => Promise.reject(failure)) });

    await expect(getHelp(USER, ASK, deps)).rejects.toBe(failure);

    expect(deps.recordUsage).toHaveBeenCalledExactlyOnceWith(
      modelRow({ inputTokens: 0, outputTokens: 0, costUsd: 0, latencyMs: 20_000, outcome: 'error' }),
    );
    expect(deps.release).toHaveBeenCalledExactlyOnceWith(RESERVATION);
  });

  it('records a failure that is not a ModelError as an error with no tokens and no time', async () => {
    const failure = new Error('model down');
    const deps = fakeDeps({ callModel: vi.fn(async () => Promise.reject(failure)) });

    await expect(getHelp(USER, ASK, deps)).rejects.toBe(failure);

    expect(deps.recordUsage).toHaveBeenCalledExactlyOnceWith(
      modelRow({ inputTokens: 0, outputTokens: 0, costUsd: 0, latencyMs: null, outcome: 'error' }),
    );
  });

  it('records nothing for a request turned away: no model was asked and no cache answered', async () => {
    const budget = fakeDeps({ reserve: vi.fn(async () => null) });
    const invalid = fakeDeps();

    await getHelp(USER, ASK, budget);
    await getHelp(USER, { ...ASK, target: 'ocean' }, invalid);

    expect(budget.recordUsage).not.toHaveBeenCalled();
    expect(invalid.recordUsage).not.toHaveBeenCalled();
  });

  describe('when the usage cannot be recorded', () => {
    it.each<[string, Partial<HelpDeps>, string]>([
      ['a cache hit', { getCached: vi.fn(async () => 'Do cache.') }, 'Do cache.'],
      ['a chorus line', { getCached: vi.fn(async (r) => (r.lineIndex === 3 ? 'Do refrão.' : null)) }, 'Do refrão.'],
      ['a new call', {}, MODEL_ANSWER.text],
    ])('gives the player the same answer for %s, and says so in the log', async (_name, over, content) => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const deps = fakeDeps({ ...over, recordUsage: vi.fn(async () => Promise.reject(new Error('db down'))) });

      expect(await getHelp(USER, ASK, deps, [3])).toEqual({ status: 200, content });
      expect(deps.recordUsage).toHaveBeenCalledOnce();
      expect(warn).toHaveBeenCalledExactlyOnceWith('Could not record the AI usage.', expect.any(Error));
      warn.mockRestore();
    });

    it('still saves the answer of a new call', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const deps = fakeDeps({ recordUsage: vi.fn(async () => Promise.reject(new Error('db down'))) });

      await getHelp(USER, ASK, deps);

      expect(deps.saveCached).toHaveBeenCalledExactlyOnceWith(ASK, MODEL_ANSWER.text);
      warn.mockRestore();
    });

    it.each([
      ['the call got no answer', new ModelError('The model service could not be reached'), true],
      ['the model refused', new ModelError('The model stopped with refusal', { declined: true }), false],
    ])('lets the failure through as it was when %s, and does the reservation as before', async (_name, failure, released) => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const deps = fakeDeps({
        callModel: vi.fn(async () => Promise.reject(failure)),
        recordUsage: vi.fn(async () => Promise.reject(new Error('db down'))),
      });

      await expect(getHelp(USER, ASK, deps)).rejects.toBe(failure);
      expect(deps.release).toHaveBeenCalledTimes(released ? 1 : 0);
      expect(warn).toHaveBeenCalledOnce();
      warn.mockRestore();
    });
  });
});
