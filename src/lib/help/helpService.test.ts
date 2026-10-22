import { describe, expect, it, vi } from 'vitest';
import { getHelp, HELP_LIMIT_PER_HOUR, type HelpDeps, type HelpRequest } from './helpService';
import { EXPLAIN_SYSTEM, TRANSLATE_SYSTEM } from './prompts';

const USER = 'user-1';
const NOW = Date.parse('2026-10-22T12:00:00.000Z');
const HOUR_MS = 3_600_000;

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

/** Fake dependencies: an empty cache, no request in the last hour, and a model that answers. */
function fakeDeps(over: Partial<HelpDeps> = {}) {
  const deps = {
    getCached: vi.fn<HelpDeps['getCached']>(async () => null),
    saveCached: vi.fn<HelpDeps['saveCached']>(async () => {}),
    countRecent: vi.fn<HelpDeps['countRecent']>(async () => 0),
    logRequest: vi.fn<HelpDeps['logRequest']>(async () => {}),
    callModel: vi.fn<HelpDeps['callModel']>(async () => '"Let" aqui é deixar.'),
    ...over,
  };
  return deps;
}

describe('getHelp', () => {
  it('answers from the cache when the line already has that help, without calling the model or counting it', async () => {
    const deps = fakeDeps({ getCached: vi.fn(async () => 'Do cache.') });

    expect(await getHelp(USER, ASK, deps, NOW)).toEqual({ status: 200, content: 'Do cache.' });
    expect(deps.callModel).not.toHaveBeenCalled();
    expect(deps.countRecent).not.toHaveBeenCalled();
    expect(deps.saveCached).not.toHaveBeenCalled();
    expect(deps.logRequest).not.toHaveBeenCalled();
  });

  it('asks the model with the line and the highlight when nothing is cached, then saves the answer and counts the request', async () => {
    const deps = fakeDeps();

    expect(await getHelp(USER, ASK, deps, NOW)).toEqual({ status: 200, content: '"Let" aqui é deixar.' });
    expect(deps.callModel).toHaveBeenCalledExactlyOnceWith(EXPLAIN_SYSTEM, `Verso: ${LINE}\nDestaque: let`);
    expect(deps.saveCached).toHaveBeenCalledExactlyOnceWith(ASK, '"Let" aqui é deixar.');
    expect(deps.logRequest).toHaveBeenCalledExactlyOnceWith(USER);
    // The cache first, then the limit, then the model, then the save, then the count.
    const order = [deps.getCached, deps.countRecent, deps.callModel, deps.saveCached, deps.logRequest].map(
      (fn) => vi.mocked(fn).mock.invocationCallOrder[0],
    );
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  it('asks for a translation with only the line', async () => {
    const deps = fakeDeps();

    await getHelp(USER, { ...ASK, kind: 'translate', target: '' }, deps, NOW);

    expect(deps.callModel).toHaveBeenCalledExactlyOnceWith(TRANSLATE_SYSTEM, `Verso: ${LINE}`);
  });

  it('asks about the whole line when there is no highlight', async () => {
    const deps = fakeDeps();

    await getHelp(USER, { ...ASK, target: '' }, deps, NOW);

    expect(deps.callModel).toHaveBeenCalledExactlyOnceWith(EXPLAIN_SYSTEM, `Verso: ${LINE}\nDestaque: (o verso inteiro)`);
  });

  it('keys the cache on the target folded to lowercase, and shows the model the line’s own spelling', async () => {
    const deps = fakeDeps();

    await getHelp(USER, { ...ASK, target: ' PLEASE ' }, deps, NOW);

    expect(deps.getCached).toHaveBeenCalledExactlyOnceWith({ ...ASK, target: 'please' });
    expect(deps.callModel).toHaveBeenCalledExactlyOnceWith(EXPLAIN_SYSTEM, `Verso: ${LINE}\nDestaque: Please`);
    expect(deps.saveCached).toHaveBeenCalledWith({ ...ASK, target: 'please' }, expect.any(String));
  });

  it(`answers 429 once the member made ${HELP_LIMIT_PER_HOUR} requests in the last hour, and calls nothing more`, async () => {
    const deps = fakeDeps({ countRecent: vi.fn(async () => 60) });

    expect(await getHelp(USER, ASK, deps, NOW)).toEqual({ status: 429 });
    expect(deps.countRecent).toHaveBeenCalledExactlyOnceWith(USER, NOW - HOUR_MS);
    expect(deps.callModel).not.toHaveBeenCalled();
    expect(deps.saveCached).not.toHaveBeenCalled();
    expect(deps.logRequest).not.toHaveBeenCalled();
  });

  it('still answers at 59 requests in the last hour', async () => {
    const deps = fakeDeps({ countRecent: vi.fn(async () => 59) });

    expect((await getHelp(USER, ASK, deps, NOW)).status).toBe(200);
  });

  it('answers from the cache even past the limit: a cached answer costs nothing', async () => {
    const deps = fakeDeps({ getCached: vi.fn(async () => 'Do cache.'), countRecent: vi.fn(async () => 500) });

    expect(await getHelp(USER, ASK, deps, NOW)).toEqual({ status: 200, content: 'Do cache.' });
  });

  it('answers 400 for a line of more than 300 characters, before touching the cache or the model', async () => {
    const deps = fakeDeps();
    const long = `let ${'a'.repeat(297)}`;

    expect(await getHelp(USER, { ...ASK, lineText: long }, deps, NOW)).toEqual({ status: 400 });
    expect(deps.getCached).not.toHaveBeenCalled();
    expect(deps.countRecent).not.toHaveBeenCalled();
    expect(deps.callModel).not.toHaveBeenCalled();
  });

  it.each<[string, Partial<HelpRequest>]>([
    ['a target that is not on the line', { target: 'ocean' }],
    ['a target of more than 40 characters', { target: 'x'.repeat(41) }],
    ['a translation with a target', { kind: 'translate' }],
  ])('answers 400 for %s', async (_name, over) => {
    const deps = fakeDeps();

    expect(await getHelp(USER, { ...ASK, ...over }, deps, NOW)).toEqual({ status: 400 });
    expect(deps.callModel).not.toHaveBeenCalled();
  });

  it('lets a model failure through, and neither saves nor counts anything', async () => {
    const deps = fakeDeps({ callModel: vi.fn(async () => Promise.reject(new Error('model down'))) });

    await expect(getHelp(USER, ASK, deps, NOW)).rejects.toThrow('model down');
    expect(deps.saveCached).not.toHaveBeenCalled();
    expect(deps.logRequest).not.toHaveBeenCalled();
  });

  it('still answers and counts the request when the answer cannot be saved', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const deps = fakeDeps({ saveCached: vi.fn(async () => Promise.reject(new Error('save failed'))) });

    expect(await getHelp(USER, ASK, deps, NOW)).toEqual({ status: 200, content: '"Let" aqui é deixar.' });
    expect(deps.logRequest).toHaveBeenCalledExactlyOnceWith(USER);
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
  });
});
