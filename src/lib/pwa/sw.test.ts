// @vitest-environment node
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// public/sw.js is a plain script the browser runs on its own, so it cannot be imported. These tests run the real file
// in a sandbox that stands in for the service worker scope: a fake `self`, a fake Cache Storage and a fake `fetch`.
// Its decisions (swStrategy, isCacheableResponse) are top-level functions, so the tests reach them from the sandbox.

const ORIGIN = 'https://hookbop.test';
const SOURCE = readFileSync(new URL('../../../public/sw.js', import.meta.url), 'utf8');

interface FakeResponse {
  tag: string;
  status: number;
  type: string;
  redirected: boolean;
  clone: () => FakeResponse;
}

function response(tag: string, init: Partial<Omit<FakeResponse, 'tag' | 'clone'>> = {}): FakeResponse {
  const made: FakeResponse = {
    tag,
    status: 200,
    type: 'basic',
    redirected: false,
    ...init,
    clone: () => ({ ...made, clone: made.clone }),
  };
  return made;
}

interface FakeRequest {
  url: string;
  method: string;
  mode: string;
}

function request(target: string, { method = 'GET', mode = 'navigate' } = {}): FakeRequest {
  return { url: target.startsWith('http') ? target : `${ORIGIN}${target}`, method, mode };
}

const keyOf = (input: string | { url: string }) => new URL(typeof input === 'string' ? input : input.url, ORIGIN).href;

function loadServiceWorker(fetchImpl: (req: FakeRequest) => Promise<FakeResponse>) {
  const handlers: Record<string, (event: unknown) => void> = {};
  const storage = new Map<string, Map<string, FakeResponse>>();
  const putFails = { current: false };
  const caches = {
    async open(name: string) {
      if (!storage.has(name)) storage.set(name, new Map());
      const entries = storage.get(name)!;
      return {
        match: async (input: string | { url: string }) => entries.get(keyOf(input)),
        put: async (input: { url: string }, value: FakeResponse) => {
          if (putFails.current) throw new Error('QuotaExceededError');
          entries.set(keyOf(input), value);
        },
      };
    },
    keys: async () => [...storage.keys()],
    delete: async (name: string) => storage.delete(name),
  };
  const self = {
    location: { origin: ORIGIN },
    addEventListener: (type: string, listener: (event: unknown) => void) => {
      handlers[type] = listener;
    },
    skipWaiting: vi.fn(() => Promise.resolve()),
    clients: { claim: vi.fn(() => Promise.resolve()) },
  };
  const fetchSpy = vi.fn(fetchImpl);
  const context = createContext({ self, caches, fetch: fetchSpy, URL, Response });
  runInContext(SOURCE, context);

  return {
    self,
    storage,
    putFails,
    fetchSpy,
    cacheName: runInContext('CACHE_NAME', context) as string,
    swStrategy: runInContext('swStrategy', context) as (url: URL, req: Partial<FakeRequest>, origin: string) => string,
    isCacheableResponse: runInContext('isCacheableResponse', context) as (res: Partial<FakeResponse>) => boolean,
    /** Plays a fetch event. Gives back what the worker answered, or undefined when it stood aside. */
    async fetch(req: FakeRequest) {
      let answer: Promise<FakeResponse> | undefined;
      const extended: Promise<unknown>[] = [];
      handlers.fetch({
        request: req,
        respondWith: (value: Promise<FakeResponse>) => {
          answer = Promise.resolve(value);
        },
        waitUntil: (value: Promise<unknown>) => extended.push(Promise.resolve(value)),
      });
      const result = answer && (await answer);
      await Promise.all(extended);
      return result;
    },
    async lifecycle(type: 'install' | 'activate') {
      const extended: Promise<unknown>[] = [];
      handlers[type]({ waitUntil: (value: Promise<unknown>) => extended.push(Promise.resolve(value)) });
      await Promise.all(extended);
    },
  };
}

const online = (body = 'network') => async () => response(body);
const offline = async (): Promise<FakeResponse> => {
  throw new TypeError('Failed to fetch');
};

describe('swStrategy', () => {
  const { swStrategy } = loadServiceWorker(online());
  const decide = (target: string, req: Partial<FakeRequest> = {}) =>
    swStrategy(new URL(target.startsWith('http') ? target : `${ORIGIN}${target}`), { method: 'GET', mode: 'navigate', ...req }, ORIGIN);

  it.each(['/', '/jogar/dQw4w9WgXcQ', '/licencas.txt', '/?erro=link'])(
    'asks the network first for the page %s',
    (path) => {
      expect(decide(path)).toBe('network-first');
    },
  );

  it.each(['/_next/static/chunks/app-1a2b3c.js', '/_next/static/media/inter-latin.woff2', '/icons/icon-192.png', '/icons/apple-touch-icon.png'])(
    'serves the static file %s from the cache first',
    (path) => {
      expect(decide(path, { mode: 'no-cors' })).toBe('cache-first');
    },
  );

  it.each([
    '/api/help',
    '/api/yt/video',
    '/auth/callback',
    '/compartilhar?text=oi',
    '/convite/ABC123',
    '/convite/ABC123/entrar',
    '/entrar',
    '/entrar?estado=sem-convite',
    '/admin',
    '/convidar',
  ])('never touches %s, even as a page', (path) => {
    expect(decide(path)).toBe('bypass');
  });

  it('is not fooled by the way a never-kept path is written', () => {
    expect(decide('/%61pi/help')).toBe('bypass');
    expect(decide('/API/help')).toBe('bypass');
    expect(decide('/Entrar')).toBe('bypass');
    expect(decide('/%E0%A4%A')).toBe('bypass');
  });

  it.each([
    'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ',
    'https://www.youtube.com/iframe_api',
    'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg',
    'https://lrclib.net/api/get?track_name=x',
    'https://abcdefgh.supabase.co/rest/v1/plays',
    'https://accounts.google.com/o/oauth2/v2/auth',
    'https://cdn.example.com/_next/static/chunks/a.js',
  ])('never touches %s, which is another site', (target) => {
    expect(decide(target)).toBe('bypass');
    expect(decide(target, { mode: 'no-cors' })).toBe('bypass');
  });

  it('only handles GET', () => {
    expect(decide('/', { method: 'POST' })).toBe('bypass');
    expect(decide('/_next/static/chunks/a.js', { method: 'POST', mode: 'cors' })).toBe('bypass');
    expect(decide('/', { method: 'HEAD' })).toBe('bypass');
  });

  it('leaves the other requests of the page to the browser: data, images, the manifest and the worker itself', () => {
    expect(decide('/manifest.webmanifest', { mode: 'cors' })).toBe('bypass');
    expect(decide('/sw.js', { mode: 'same-origin' })).toBe('bypass');
    expect(decide('/?_rsc=1a2b3', { mode: 'cors' })).toBe('bypass');
    expect(decide('/_next/image?url=%2Fx.png&w=64&q=75', { mode: 'no-cors' })).toBe('bypass');
  });

  it('does not take look-alikes of the static folders', () => {
    expect(decide('/_next/staticx/a.js', { mode: 'no-cors' })).toBe('bypass');
    expect(decide('/icons', { mode: 'no-cors' })).toBe('bypass');
    expect(decide('/iconsx/a.png', { mode: 'no-cors' })).toBe('bypass');
  });
});

describe('isCacheableResponse', () => {
  const { isCacheableResponse } = loadServiceWorker(online());

  it('keeps a plain 200 from this site', () => {
    expect(isCacheableResponse(response('ok'))).toBe(true);
  });

  it.each([
    ['a redirect that was followed', { redirected: true }],
    ['a redirect left for the browser', { status: 0, type: 'opaqueredirect' }],
    ['an opaque answer from another site', { status: 0, type: 'opaque' }],
    ['a CORS answer from another site', { type: 'cors' }],
    ['a network error', { status: 0, type: 'error' }],
    ['a 404', { status: 404 }],
    ['a 500', { status: 500 }],
    ['a 204', { status: 204 }],
    ['a partial 206', { status: 206 }],
  ])('does not keep %s', (_name, init) => {
    expect(isCacheableResponse(response('no', init))).toBe(false);
  });
});

describe('service worker lifecycle', () => {
  it('names its cache with a version', () => {
    expect(loadServiceWorker(online()).cacheName).toMatch(/^hookbop-v\d+$/);
  });

  it('takes over at once on install, which is safe because it keeps nothing that must match the page', async () => {
    const sw = loadServiceWorker(online());

    await sw.lifecycle('install');

    expect(sw.self.skipWaiting).toHaveBeenCalledTimes(1);
  });

  it('on activate deletes the caches of older versions only, and then claims the open pages', async () => {
    const sw = loadServiceWorker(online());
    sw.storage.set('hookbop-v0', new Map());
    sw.storage.set('hookbop-old', new Map());
    sw.storage.set(sw.cacheName, new Map());
    sw.storage.set('somebody-else', new Map());

    await sw.lifecycle('activate');

    expect([...sw.storage.keys()].sort()).toEqual([sw.cacheName, 'somebody-else'].sort());
    expect(sw.self.clients.claim).toHaveBeenCalledTimes(1);
  });
});

describe('pages: network first', () => {
  let fetchImpl: (req: FakeRequest) => Promise<FakeResponse>;
  beforeEach(() => {
    fetchImpl = online('network');
  });

  it('answers with the network and keeps a copy of it', async () => {
    const sw = loadServiceWorker((req) => fetchImpl(req));

    const answer = await sw.fetch(request('/jogar/dQw4w9WgXcQ'));

    expect(answer?.tag).toBe('network');
    const kept = sw.storage.get(sw.cacheName)?.get(`${ORIGIN}/jogar/dQw4w9WgXcQ`);
    expect(kept?.tag).toBe('network');
  });

  it('shows the last copy of the page when there is no network', async () => {
    const sw = loadServiceWorker((req) => fetchImpl(req));
    await sw.fetch(request('/jogar/dQw4w9WgXcQ'));
    fetchImpl = offline;

    const answer = await sw.fetch(request('/jogar/dQw4w9WgXcQ'));

    expect(answer?.tag).toBe('network');
    expect(sw.fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('prefers the network when it is there, and the copy follows', async () => {
    const sw = loadServiceWorker((req) => fetchImpl(req));
    fetchImpl = online('first');
    await sw.fetch(request('/'));
    fetchImpl = online('second');

    expect((await sw.fetch(request('/')))?.tag).toBe('second');

    fetchImpl = offline;
    expect((await sw.fetch(request('/')))?.tag).toBe('second');
  });

  it('with no network and no copy of that page, shows the copy of the home page', async () => {
    const sw = loadServiceWorker((req) => fetchImpl(req));
    fetchImpl = online('home');
    await sw.fetch(request('/'));
    fetchImpl = offline;

    const answer = await sw.fetch(request('/jogar/aaaaaaaaaaa'));

    expect(answer?.tag).toBe('home');
  });

  it('with no network and nothing kept, answers a plain 503', async () => {
    const sw = loadServiceWorker(offline);

    const answer = await sw.fetch(request('/'));

    expect(answer?.status).toBe(503);
  });

  it('hands the page back as it came when the server answers with an error, and does not keep it', async () => {
    const sw = loadServiceWorker(async () => response('broken', { status: 500 }));

    const answer = await sw.fetch(request('/'));

    expect(answer?.status).toBe(500);
    expect(sw.storage.get(sw.cacheName)?.size ?? 0).toBe(0);
  });

  it.each([
    ['a redirect (to sign-in, for a session that ended)', { status: 0, type: 'opaqueredirect' }],
    ['a redirect that was followed', { redirected: true }],
  ])('does not keep %s', async (_name, init) => {
    const sw = loadServiceWorker(async () => response('moved', init));

    const answer = await sw.fetch(request('/'));

    expect(answer?.tag).toBe('moved');
    expect(sw.storage.get(sw.cacheName)?.size ?? 0).toBe(0);
  });

  it('still answers when the browser has no room to keep the copy', async () => {
    const sw = loadServiceWorker(online());
    sw.putFails.current = true;

    const answer = await sw.fetch(request('/'));

    expect(answer?.tag).toBe('network');
  });

  it.each(['/api/help', '/auth/callback', '/compartilhar?text=oi', '/convite/ABC', '/entrar', '/admin', '/convidar'])(
    'stands aside for %s: no answer from the worker, nothing kept',
    async (path) => {
      const sw = loadServiceWorker(online());

      const answer = await sw.fetch(request(path));

      expect(answer).toBeUndefined();
      expect(sw.fetchSpy).not.toHaveBeenCalled();
      expect(sw.storage.size).toBe(0);
    },
  );

  it.each([
    'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ',
    'https://lrclib.net/api/get?track_name=x',
    'https://abcdefgh.supabase.co/rest/v1/plays',
  ])('stands aside for %s, which is another site', async (target) => {
    const sw = loadServiceWorker(online());

    const answer = await sw.fetch(request(target, { mode: 'cors' }));

    expect(answer).toBeUndefined();
    expect(sw.storage.size).toBe(0);
  });
});

describe('static files: cache first', () => {
  it('fetches a file once and then serves it from the cache', async () => {
    const sw = loadServiceWorker(online('script'));
    const script = request('/_next/static/chunks/app-1a2b3c.js', { mode: 'no-cors' });

    const first = await sw.fetch(script);
    const second = await sw.fetch(script);

    expect(first?.tag).toBe('script');
    expect(second?.tag).toBe('script');
    expect(sw.fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('serves a kept icon with no network at all', async () => {
    let up = true;
    const sw = loadServiceWorker(async () => {
      if (!up) throw new TypeError('Failed to fetch');
      return response('icon');
    });
    const icon = request('/icons/icon-192.png', { mode: 'no-cors' });
    await sw.fetch(icon);
    up = false;

    expect((await sw.fetch(icon))?.tag).toBe('icon');
  });

  it('does not keep a file that failed to load', async () => {
    const sw = loadServiceWorker(async () => response('gone', { status: 404 }));

    const answer = await sw.fetch(request('/_next/static/chunks/missing.js', { mode: 'no-cors' }));

    expect(answer?.status).toBe(404);
    expect(sw.storage.get(sw.cacheName)?.size ?? 0).toBe(0);
  });
});
