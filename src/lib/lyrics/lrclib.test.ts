import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createLrclibSource } from './lrclib';

const CLIENT = 'hookbop-test';
const q = { artist: 'Artist', track: 'Song', durationS: 200 };
const lrc = '[00:01.00]x';

const candidate = (over: Record<string, unknown> = {}) => ({
  id: 1,
  trackName: 'Song',
  artistName: 'Artist',
  duration: 200,
  syncedLyrics: lrc,
  ...over,
});

type Route = (init: RequestInit | undefined) => Promise<Response>;

const answers = (body: unknown): Route => () => Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));
const status = (code: number): Route => () => Promise.resolve(new Response(null, { status: code }));
const fails: Route = () => Promise.reject(new TypeError('Failed to fetch'));

/** Like a real fetch that never gets an answer: it only ends when its signal aborts. */
const neverAnswers: Route = (init) =>
  new Promise((_, reject) => {
    init?.signal?.addEventListener('abort', () => reject(new DOMException('The operation was aborted.', 'AbortError')));
  });

function routed(routes: { get: Route; search: Route }) {
  return vi.fn<typeof fetch>((input, init) => {
    const { pathname } = new URL(String(input));
    if (pathname === '/api/get') return routes.get(init);
    if (pathname === '/api/search') return routes.search(init);
    throw new Error(`unexpected request to ${pathname}`);
  });
}

const sourceOver = (fetchFn: typeof fetch, extra: { timeoutMs?: number } = {}) =>
  createLrclibSource({ fetch: fetchFn, client: CLIENT, ...extra });

describe('createLrclibSource', () => {
  it('finds lyrics in the search results when /api/get answers 404', async () => {
    const fetchFn = routed({
      get: status(404),
      search: answers([
        candidate({ id: 1, duration: 175 }),
        candidate({ id: 2, duration: 201 }),
        candidate({ id: 3, trackName: 'Completely Other' }),
      ]),
    });

    expect(await sourceOver(fetchFn).find(q)).toEqual({
      status: 'found',
      result: { source: 'lrclib', ref: '2', syncedLrc: lrc, durationS: 201, artist: 'Artist', track: 'Song' },
    });
  });

  it('uses the exact match from /api/get when the search finds nothing', async () => {
    const fetchFn = routed({ get: answers(candidate({ id: 42 })), search: answers([]) });

    const lookup = await sourceOver(fetchFn).find(q);

    expect(lookup).toMatchObject({ status: 'found', result: { ref: '42' } });
  });

  it('maps the names and the duration of the chosen candidate', async () => {
    const fetchFn = routed({
      get: status(404),
      search: answers([candidate({ id: 7, trackName: 'SONG', artistName: 'The Artist', duration: 199.6 })]),
    });

    expect(await sourceOver(fetchFn).find(q)).toEqual({
      status: 'found',
      result: { source: 'lrclib', ref: '7', syncedLrc: lrc, durationS: 199.6, artist: 'The Artist', track: 'SONG' },
    });
  });

  it.each([
    ['both answer 404', status(404), status(404)],
    ['/api/get answers 404 and the search is empty', status(404), answers([])],
    ['both are empty', answers([]), answers([])],
  ])('is not_found when %s', async (_name, get, search) => {
    expect(await sourceOver(routed({ get, search })).find(q)).toEqual({ status: 'not_found' });
  });

  it('is not_found when the candidates have no synced lyrics or the wrong title', async () => {
    const fetchFn = routed({
      get: status(404),
      search: answers([candidate({ id: 1, syncedLyrics: null }), candidate({ id: 2, trackName: 'Completely Other' })]),
    });

    expect(await sourceOver(fetchFn).find(q)).toEqual({ status: 'not_found' });
  });

  it('skips malformed entries and still finds a valid one', async () => {
    const fetchFn = routed({
      get: status(404),
      search: answers([null, 5, 'x', {}, candidate({ id: 'nope' }), candidate({ duration: null }), candidate({ id: 9 })]),
    });

    expect(await sourceOver(fetchFn).find(q)).toMatchObject({ status: 'found', result: { ref: '9' } });
  });

  describe('is unavailable, never not_found, when the service is degraded', () => {
    it('on a 503 from the search', async () => {
      const fetchFn = routed({ get: status(404), search: status(503) });
      expect(await sourceOver(fetchFn).find(q)).toEqual({ status: 'unavailable' });
    });

    it('on a 5xx from /api/get with an empty search', async () => {
      const fetchFn = routed({ get: status(500), search: answers([]) });
      expect(await sourceOver(fetchFn).find(q)).toEqual({ status: 'unavailable' });
    });

    it('on a 429 (rate limited)', async () => {
      const fetchFn = routed({ get: status(429), search: status(404) });
      expect(await sourceOver(fetchFn).find(q)).toEqual({ status: 'unavailable' });
    });

    it('when both calls fail on the network', async () => {
      const fetchFn = routed({ get: fails, search: fails });
      expect(await sourceOver(fetchFn).find(q)).toEqual({ status: 'unavailable' });
    });

    it('when one call fails on the network and the other is 404', async () => {
      const fetchFn = routed({ get: status(404), search: fails });
      expect(await sourceOver(fetchFn).find(q)).toEqual({ status: 'unavailable' });
    });

    it('when an answer is not JSON', async () => {
      const notJson: Route = () => Promise.resolve(new Response('<html>oops</html>', { status: 200 }));
      const fetchFn = routed({ get: status(404), search: notJson });
      expect(await sourceOver(fetchFn).find(q)).toEqual({ status: 'unavailable' });
    });

    it('but still finds lyrics when the other call answered with a good candidate', async () => {
      const fetchFn = routed({ get: status(503), search: answers([candidate({ id: 5 })]) });
      expect(await sourceOver(fetchFn).find(q)).toMatchObject({ status: 'found', result: { ref: '5' } });
    });
  });

  describe('requests', () => {
    it('sends both calls at once, to lrclib.net, with the client header on each', async () => {
      const fetchFn = routed({ get: neverAnswers, search: neverAnswers });
      const pending = sourceOver(fetchFn, { timeoutMs: 1 }).find(q);

      expect(fetchFn).toHaveBeenCalledTimes(2);
      const urls = fetchFn.mock.calls.map(([input]) => new URL(String(input)));
      expect(urls.map((u) => `${u.origin}${u.pathname}`).sort()).toEqual([
        'https://lrclib.net/api/get',
        'https://lrclib.net/api/search',
      ]);
      for (const [, init] of fetchFn.mock.calls) {
        expect(new Headers(init?.headers).get('Lrclib-Client')).toBe(CLIENT);
      }
      await pending;
    });

    it('asks /api/get for the exact song, with the duration in whole seconds', async () => {
      const fetchFn = routed({ get: status(404), search: status(404) });

      await sourceOver(fetchFn).find({ artist: 'Artist', track: 'Song', durationS: 200.6 });

      const url = fetchFn.mock.calls.map(([input]) => new URL(String(input))).find((u) => u.pathname === '/api/get');
      expect(Object.fromEntries(url!.searchParams)).toEqual({ artist_name: 'Artist', track_name: 'Song', duration: '201' });
    });

    it('asks /api/search by track and artist only', async () => {
      const fetchFn = routed({ get: status(404), search: status(404) });

      await sourceOver(fetchFn).find(q);

      const url = fetchFn.mock.calls.map(([input]) => new URL(String(input))).find((u) => u.pathname === '/api/search');
      expect(Object.fromEntries(url!.searchParams)).toEqual({ track_name: 'Song', artist_name: 'Artist' });
    });

    it('encodes names with characters that matter in a URL', async () => {
      const fetchFn = routed({ get: status(404), search: status(404) });

      await sourceOver(fetchFn).find({ artist: 'AC/DC & Co', track: 'Rock n Roll?=#%', durationS: 200 });

      for (const [input] of fetchFn.mock.calls) {
        const url = new URL(String(input));
        expect(url.searchParams.get('artist_name')).toBe('AC/DC & Co');
        expect(url.searchParams.get('track_name')).toBe('Rock n Roll?=#%');
      }
    });

    it('calls fetch as a plain function, so the browser fetch does not throw "Illegal invocation"', async () => {
      const strictFetch = vi.fn(function (this: unknown) {
        if (this !== undefined) return Promise.reject(new TypeError('Illegal invocation'));
        return Promise.resolve(new Response(null, { status: 404 }));
      });

      expect(await sourceOver(strictFetch as unknown as typeof fetch).find(q)).toEqual({ status: 'not_found' });
    });
  });

  describe('timeout', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('gives up after 6 s, aborts both requests and is unavailable', async () => {
      const fetchFn = routed({ get: neverAnswers, search: neverAnswers });
      const pending = sourceOver(fetchFn).find(q);
      const signals = fetchFn.mock.calls.map(([, init]) => init?.signal as AbortSignal);
      expect(signals).toHaveLength(2);

      vi.advanceTimersByTime(5999);
      expect(signals.map((s) => s.aborted)).toEqual([false, false]);

      vi.advanceTimersByTime(1);
      expect(signals.map((s) => s.aborted)).toEqual([true, true]);
      await expect(pending).resolves.toEqual({ status: 'unavailable' });
      expect(vi.getTimerCount()).toBe(0);
    });

    it('also gives up when only one of the calls hangs and the other said 404', async () => {
      const fetchFn = routed({ get: status(404), search: neverAnswers });
      const pending = sourceOver(fetchFn).find(q);

      vi.advanceTimersByTime(6000);

      await expect(pending).resolves.toEqual({ status: 'unavailable' });
    });

    it('still returns a good candidate it already has when the other call times out', async () => {
      const fetchFn = routed({ get: neverAnswers, search: answers([candidate({ id: 8 })]) });
      const pending = sourceOver(fetchFn).find(q);

      vi.advanceTimersByTime(6000);

      await expect(pending).resolves.toMatchObject({ status: 'found', result: { ref: '8' } });
    });

    it('uses the timeoutMs it was given', async () => {
      const fetchFn = routed({ get: neverAnswers, search: neverAnswers });
      const pending = sourceOver(fetchFn, { timeoutMs: 1000 }).find(q);

      vi.advanceTimersByTime(1000);

      await expect(pending).resolves.toEqual({ status: 'unavailable' });
    });

    it('leaves no timer behind when the answers come back in time', async () => {
      const fetchFn = routed({ get: status(404), search: answers([candidate()]) });

      await sourceOver(fetchFn).find(q);

      expect(vi.getTimerCount()).toBe(0);
    });
  });
});
