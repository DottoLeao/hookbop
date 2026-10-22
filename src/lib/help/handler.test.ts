// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import type { HelpStore } from '@/lib/supabase/helpStore';
import { handleHelpRequest, type HelpHandlerDeps } from './handler';
import type { HelpRequest } from './helpService';
import { ModelError } from './modelError';
import type { StoredVideo } from './validate';

// Invented lines, not lyrics. Line 2 is line 0 sung again, written a little differently.
const VIDEO: StoredVideo = {
  status: 'ok',
  lyricsRef: '777',
  lyricsLrc: [
    '[00:02.00]Paper boats on a river of light',
    '[00:06.00]Hold the line till the morning comes',
    '[00:10.00]PAPER boats on a river of light',
  ].join('\n'),
  lyricsDurationS: 30,
};

const ASK: HelpRequest = {
  youtubeId: 'aaaaaaaaaaa',
  lyricsRef: '777',
  lineIndex: 0,
  lineText: 'Paper boats on a river of light',
  kind: 'explain',
  target: 'river',
};

function fakeDeps(over: Partial<HelpHandlerDeps> = {}) {
  const store = {
    getCached: vi.fn<HelpStore['getCached']>(async () => null),
    saveCached: vi.fn<HelpStore['saveCached']>(async () => {}),
    reserve: vi.fn<HelpStore['reserve']>(async () => 41),
    release: vi.fn<HelpStore['release']>(async () => {}),
    getVideo: vi.fn<HelpStore['getVideo']>(async () => VIDEO),
  };
  const deps = {
    userId: vi.fn(async () => 'user-1' as string | null),
    isMember: vi.fn(async () => true),
    store: vi.fn(() => store),
    callModel: vi.fn(async () => 'Rio, aqui, é o rio mesmo.'),
    ...over,
  };
  return { deps, store };
}

function post(body: unknown, headers: Record<string, string> = {}) {
  return new Request('http://localhost:3000/api/help', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

/** A body that comes in pieces, with no content-length, as a chunked upload does. */
function streamed(pieces: string[]) {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const piece of pieces) controller.enqueue(encoder.encode(piece));
      controller.close();
    },
  });
  return new Request('http://localhost:3000/api/help', { method: 'POST', body, duplex: 'half' } as RequestInit);
}

async function send(request: Request | unknown, deps: HelpHandlerDeps) {
  const response = await handleHelpRequest(request instanceof Request ? request : post(request), deps);
  return { response, status: response.status, body: await response.json() };
}

/** Quiets the server log of a failure the test causes on purpose. */
function quietWarnings() {
  return vi.spyOn(console, 'warn').mockImplementation(() => {});
}

describe('handleHelpRequest', () => {
  it('answers 200 with the help, which no cache may keep', async () => {
    const { deps } = fakeDeps();

    const { response, status, body } = await send(ASK, deps);

    expect(status).toBe(200);
    expect(body).toEqual({ content: 'Rio, aqui, é o rio mesmo.' });
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });

  it('asks the model about the stored text of the line, from the member’s budget for explanations', async () => {
    const { deps, store } = fakeDeps();

    await send({ ...ASK, lineText: '  Paper boats on a river of light ' }, deps);

    expect(deps.callModel).toHaveBeenCalledExactlyOnceWith(
      expect.any(String),
      'Verso: Paper boats on a river of light\nDestaque: river',
    );
    expect(store.getVideo).toHaveBeenCalledExactlyOnceWith('aaaaaaaaaaa');
    expect(store.reserve).toHaveBeenCalledExactlyOnceWith('user-1', 'explain');
    expect(store.saveCached).toHaveBeenCalledOnce();
    expect(store.release).not.toHaveBeenCalled();
  });

  it('answers 401 with no session, before reading anything else', async () => {
    const { deps } = fakeDeps({ userId: vi.fn(async () => null) });

    const { response, status } = await send(ASK, deps);

    expect(status).toBe(401);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(deps.isMember).not.toHaveBeenCalled();
    expect(deps.store).not.toHaveBeenCalled();
  });

  it('answers 403 to someone signed in who is not a member, without touching the service key', async () => {
    const { deps } = fakeDeps({ isMember: vi.fn(async () => false) });

    const { response, status } = await send(ASK, deps);

    expect(status).toBe(403);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(deps.store).not.toHaveBeenCalled();
    expect(deps.callModel).not.toHaveBeenCalled();
  });

  it('answers 503, with no-store, when the session cannot be read', async () => {
    const warn = quietWarnings();
    const { deps } = fakeDeps({ userId: vi.fn(async () => Promise.reject(new Error('cookies unavailable'))) });

    const { response, status } = await send(ASK, deps);

    expect(status).toBe(503);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    warn.mockRestore();
  });

  describe('the body', () => {
    it.each([
      ['a body that is not JSON', '{"youtubeId": '],
      ['a body that is not a request', { hello: 'world' }],
      ['an empty body', ''],
    ])('answers 400 for %s', async (_name, body) => {
      const { deps } = fakeDeps();

      const { response, status } = await send(body, deps);

      expect(status).toBe(400);
      expect(response.headers.get('Cache-Control')).toBe('no-store');
      expect(deps.callModel).not.toHaveBeenCalled();
    });

    it('answers 400 for a body that says it is too big, without reading it', async () => {
      const { deps, store } = fakeDeps();
      const request = post(ASK, { 'Content-Length': '999999' });

      const { status } = await send(request, deps);

      expect(status).toBe(400);
      expect(request.bodyUsed).toBe(false);
      expect(store.getVideo).not.toHaveBeenCalled();
    });

    it('stops reading a body that grows past 4 KB, whatever it said its length was', async () => {
      const { deps, store } = fakeDeps();
      const pull = vi.fn();
      const encoder = new TextEncoder();
      // A body that would never end: the handler has to stop on its own.
      const endless = new ReadableStream<Uint8Array>({
        pull(controller) {
          pull();
          controller.enqueue(encoder.encode('x'.repeat(1024)));
        },
      });
      const request = new Request('http://localhost:3000/api/help', {
        method: 'POST',
        body: endless,
        duplex: 'half',
      } as RequestInit);

      const { status } = await send(request, deps);

      expect(status).toBe(400);
      expect(pull.mock.calls.length).toBeLessThan(10);
      expect(store.getVideo).not.toHaveBeenCalled();
    });

    it('reads a body that comes in pieces', async () => {
      const { deps } = fakeDeps();
      const json = JSON.stringify(ASK);

      const { status } = await send(streamed([json.slice(0, 10), json.slice(10)]), deps);

      expect(status).toBe(200);
    });
  });

  it.each<[string, Partial<HelpRequest>]>([
    ['a target that is not on the line', { target: 'ocean' }],
    ['a line of more than 300 characters', { lineText: 'x'.repeat(301) }],
    ['an id that is not a video id', { youtubeId: 'not-an-id' }],
    ['a translation with a target', { kind: 'translate' }],
  ])('answers 400 for %s before reading the database', async (_name, over) => {
    const { deps, store } = fakeDeps();

    const { status } = await send({ ...ASK, ...over }, deps);

    expect(status).toBe(400);
    expect(store.getVideo).not.toHaveBeenCalled();
    expect(store.reserve).not.toHaveBeenCalled();
  });

  it.each<[string, Partial<HelpRequest>, StoredVideo | null]>([
    ['a line index past the lyrics', { lineIndex: 3 }, VIDEO],
    ['a line index that is not whole', { lineIndex: 0.5 }, VIDEO],
    ['lyrics other than the stored ones', { lyricsRef: '778' }, VIDEO],
    ['a line text that is not the stored one', { lineText: 'Paper boats on a sea of light' }, VIDEO],
    ['a video with no lyrics', {}, { ...VIDEO, status: 'no_lyrics' }],
    ['a video the app does not know', {}, null],
  ])('answers 400 for %s, so the route is no free model and no one can fill the shared cache', async (_name, over, video) => {
    const { deps, store } = fakeDeps();
    store.getVideo.mockResolvedValue(video);

    const { status } = await send({ ...ASK, ...over }, deps);

    expect(status).toBe(400);
    expect(store.getCached).not.toHaveBeenCalled();
    expect(store.reserve).not.toHaveBeenCalled();
    expect(deps.callModel).not.toHaveBeenCalled();
  });

  it('answers a line sung again with the help of its first time, without asking the model (ruling R72)', async () => {
    const { deps, store } = fakeDeps();
    store.getCached.mockImplementation(async (r) => (r.lineIndex === 0 ? 'Do refrão.' : null));

    const { status, body } = await send({ ...ASK, lineIndex: 2, lineText: 'PAPER boats on a river of light' }, deps);

    expect(status).toBe(200);
    expect(body).toEqual({ content: 'Do refrão.' });
    expect(store.saveCached).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ lineIndex: 2 }), 'Do refrão.');
    expect(store.reserve).not.toHaveBeenCalled();
    expect(deps.callModel).not.toHaveBeenCalled();
  });

  it('answers 429 when the budget has no request left', async () => {
    const { deps, store } = fakeDeps();
    store.reserve.mockResolvedValue(null);

    const { response, status, body } = await send(ASK, deps);

    expect(status).toBe(429);
    expect(body).toEqual({ error: 'rate_limited' });
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(deps.callModel).not.toHaveBeenCalled();
  });

  it('answers 503 when the model fails, and gives the reservation back', async () => {
    const warn = quietWarnings();
    const { deps, store } = fakeDeps({ callModel: vi.fn(async () => Promise.reject(new ModelError('model down'))) });

    const { response, status, body } = await send(ASK, deps);

    expect(status).toBe(503);
    expect(body).toEqual({ error: 'unavailable' });
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(store.release).toHaveBeenCalledExactlyOnceWith(41);
    expect(store.saveCached).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
  });

  it('answers 422 when the model refused or ran out of room, which asking again would not change (ruling R74)', async () => {
    const warn = quietWarnings();
    const { deps, store } = fakeDeps({
      callModel: vi.fn(async () => Promise.reject(new ModelError('refusal', { declined: true }))),
    });

    const { response, status, body } = await send(ASK, deps);

    expect(status).toBe(422);
    expect(body).toEqual({ error: 'declined' });
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(store.release).toHaveBeenCalledExactlyOnceWith(41);
    expect(store.saveCached).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('answers 503 when the database cannot be reached', async () => {
    const warn = quietWarnings();
    const { deps, store } = fakeDeps();
    store.getVideo.mockRejectedValue(new Error('connection refused'));

    expect((await send(ASK, deps)).status).toBe(503);
    warn.mockRestore();
  });

  it('never shows the reason for a failure to the browser', async () => {
    const warn = quietWarnings();
    const { deps } = fakeDeps({ callModel: vi.fn(async () => Promise.reject(new Error('secret stack detail'))) });

    const { body } = await send(ASK, deps);

    expect(JSON.stringify(body)).not.toMatch(/secret|stack/);
    warn.mockRestore();
  });
});
