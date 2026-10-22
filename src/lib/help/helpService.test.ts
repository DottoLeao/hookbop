import { describe, expect, it, vi } from 'vitest';
import { getHelp, HELP_BUDGET_PER_HOUR, type HelpDeps, type HelpRequest } from './helpService';
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

/** Fake dependencies: an empty cache, a budget with room left, and a model that answers. */
function fakeDeps(over: Partial<HelpDeps> = {}) {
  return {
    getCached: vi.fn<HelpDeps['getCached']>(async () => null),
    saveCached: vi.fn<HelpDeps['saveCached']>(async () => {}),
    reserve: vi.fn<HelpDeps['reserve']>(async () => RESERVATION),
    release: vi.fn<HelpDeps['release']>(async () => {}),
    callModel: vi.fn<HelpDeps['callModel']>(async () => '"Let" aqui é deixar.'),
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

  it('gives the reservation back when the model fails, saves nothing, and lets the failure through', async () => {
    const failure = new Error('model down');
    const deps = fakeDeps({ callModel: vi.fn(async () => Promise.reject(failure)) });

    await expect(getHelp(USER, ASK, deps)).rejects.toBe(failure);
    expect(deps.release).toHaveBeenCalledExactlyOnceWith(RESERVATION);
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
