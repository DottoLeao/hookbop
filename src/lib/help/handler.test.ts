// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { handleHelpRequest, type HelpHandlerDeps } from './handler';
import type { HelpRequest } from './helpService';
import type { StoredVideo } from './validate';

const NOW = Date.parse('2026-10-22T12:00:00.000Z');

// Invented lines, not lyrics.
const VIDEO: StoredVideo = {
  status: 'ok',
  lyricsRef: '777',
  lyricsLrc: '[00:02.00]Paper boats on a river of light\n[00:06.00]Hold the line till the morning comes',
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
    getCached: vi.fn(async () => null as string | null),
    saveCached: vi.fn(async () => {}),
    countRecent: vi.fn(async () => 0),
    logRequest: vi.fn(async () => {}),
    getVideo: vi.fn(async () => VIDEO as StoredVideo | null),
  };
  const deps = {
    userId: vi.fn(async () => 'user-1' as string | null),
    isMember: vi.fn(async () => true),
    store: vi.fn(() => store),
    callModel: vi.fn(async () => 'Rio, aqui, é o rio mesmo.'),
    now: () => NOW,
    ...over,
  };
  return { deps, store };
}

function post(body: unknown) {
  return new Request('http://localhost:3000/api/help', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

async function send(body: unknown, deps: HelpHandlerDeps) {
  const response = await handleHelpRequest(post(body), deps);
  return { response, status: response.status, body: await response.json() };
}

describe('handleHelpRequest', () => {
  it('answers 200 with the help, which no cache may keep', async () => {
    const { deps } = fakeDeps();

    const { response, status, body } = await send(ASK, deps);

    expect(status).toBe(200);
    expect(body).toEqual({ content: 'Rio, aqui, é o rio mesmo.' });
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });

  it('asks the model about the stored text of the line, and saves and counts it for that member', async () => {
    const { deps, store } = fakeDeps();

    await send({ ...ASK, lineText: '  Paper boats on a river of light ' }, deps);

    expect(deps.callModel).toHaveBeenCalledExactlyOnceWith(
      expect.any(String),
      'Verso: Paper boats on a river of light\nDestaque: river',
    );
    expect(store.getVideo).toHaveBeenCalledExactlyOnceWith('aaaaaaaaaaa');
    expect(store.saveCached).toHaveBeenCalledOnce();
    expect(store.logRequest).toHaveBeenCalledExactlyOnceWith('user-1');
    expect(store.countRecent).toHaveBeenCalledExactlyOnceWith('user-1', NOW - 3_600_000);
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

  it.each([
    ['a body that is not JSON', '{"youtubeId": '],
    ['a body that is not a request', { hello: 'world' }],
    ['a body that is too big', JSON.stringify({ ...ASK, padding: 'x'.repeat(5000) })],
  ])('answers 400 for %s', async (_name, body) => {
    const { deps } = fakeDeps();

    const { response, status } = await send(body, deps);

    expect(status).toBe(400);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(deps.callModel).not.toHaveBeenCalled();
  });

  it.each<[string, Partial<HelpRequest>, StoredVideo | null]>([
    ['a line index past the lyrics', { lineIndex: 2 }, VIDEO],
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
    expect(deps.callModel).not.toHaveBeenCalled();
    expect(store.logRequest).not.toHaveBeenCalled();
  });

  it('answers 400 for a target that is not on the line', async () => {
    const { deps } = fakeDeps();

    expect((await send({ ...ASK, target: 'ocean' }, deps)).status).toBe(400);
  });

  it('answers 429 past the limit', async () => {
    const { deps, store } = fakeDeps();
    store.countRecent.mockResolvedValue(60);

    const { response, status } = await send(ASK, deps);

    expect(status).toBe(429);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(deps.callModel).not.toHaveBeenCalled();
  });

  it('answers 503 when the model fails, and counts nothing', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { deps, store } = fakeDeps({ callModel: vi.fn(async () => Promise.reject(new Error('model down'))) });

    const { response, status, body } = await send(ASK, deps);

    expect(status).toBe(503);
    expect(body).toEqual({ error: 'unavailable' });
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(store.saveCached).not.toHaveBeenCalled();
    expect(store.logRequest).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
  });

  it('answers 503 when the database cannot be reached', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { deps, store } = fakeDeps();
    store.getVideo.mockRejectedValue(new Error('connection refused'));

    expect((await send(ASK, deps)).status).toBe(503);
    warn.mockRestore();
  });

  it('never shows the reason for a failure to the browser', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { deps } = fakeDeps({ callModel: vi.fn(async () => Promise.reject(new Error('secret stack detail'))) });

    const { body } = await send(ASK, deps);

    expect(JSON.stringify(body)).not.toMatch(/secret|stack/);
    warn.mockRestore();
  });
});
