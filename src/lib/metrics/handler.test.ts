// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { handleEventsRequest, type EventsHandlerDeps } from './handler';

const SESSION = '4f0c2a9e-7b1d-4c35-9a6e-0d2b8f5e1c77';

function fakeDeps(over: Partial<EventsHandlerDeps> = {}) {
  const base = {
    userId: vi.fn(async () => 'user-1' as string | null),
    isMember: vi.fn(async () => true),
    record: vi.fn<EventsHandlerDeps['record']>(async () => {}),
  };
  // What `over` replaces is a mock too, in every test that does it.
  return { ...base, ...over } as typeof base;
}

function post(body: unknown, init: { raw?: string; headers?: Record<string, string> } = {}) {
  return new Request('http://localhost:3000/api/events', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...init.headers },
    body: init.raw ?? JSON.stringify(body),
  });
}

const VALID = { sessionId: SESSION, events: [{ name: 'app_opened' }] };

describe('handleEventsRequest', () => {
  it('records the events of a member with the member’s own id and answers 204 with nothing in the body', async () => {
    const deps = fakeDeps();

    const response = await handleEventsRequest(
      post({
        sessionId: SESSION,
        events: [
          { name: 'song_opened', youtubeId: 'aaaaaaaaaaa' },
          { name: 'game_finished', youtubeId: 'aaaaaaaaaaa', mode: 'escolha', props: { pct: 75, durationMs: 90000, totalBlanks: 8 } },
        ],
      }),
      deps,
    );

    expect(response.status).toBe(204);
    expect(await response.text()).toBe('');
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(deps.record).toHaveBeenCalledExactlyOnceWith([
      { user_id: 'user-1', session_id: SESSION, name: 'song_opened', youtube_id: 'aaaaaaaaaaa', mode: null, props: {} },
      {
        user_id: 'user-1',
        session_id: SESSION,
        name: 'game_finished',
        youtube_id: 'aaaaaaaaaaa',
        mode: 'escolha',
        props: { pct: 75, durationMs: 90000, totalBlanks: 8 },
      },
    ]);
  });

  it('ignores a user_id sent in the body, at the top or in an event: the id is the session’s', async () => {
    const deps = fakeDeps();

    const response = await handleEventsRequest(
      post({ sessionId: SESSION, user_id: 'attacker', userId: 'attacker', events: [{ name: 'app_opened', user_id: 'attacker', userId: 'attacker' }] }),
      deps,
    );

    expect(response.status).toBe(204);
    const rows = deps.record.mock.calls[0][0];
    expect(rows).toHaveLength(1);
    expect(rows[0].user_id).toBe('user-1');
    expect(JSON.stringify(rows)).not.toContain('attacker');
  });

  it('answers 401 with no session, and neither checks the membership, reads the body nor records anything', async () => {
    const deps = fakeDeps({ userId: vi.fn(async () => null) });

    const response = await handleEventsRequest(post(VALID), deps);

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'unauthenticated' });
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(deps.isMember).not.toHaveBeenCalled();
    expect(deps.record).not.toHaveBeenCalled();
  });

  it('answers 403 for someone who is not a member, and records nothing', async () => {
    const deps = fakeDeps({ isMember: vi.fn(async () => false) });

    const response = await handleEventsRequest(post(VALID), deps);

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: 'not_member' });
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(deps.record).not.toHaveBeenCalled();
  });

  it('checks who is asking before it reads a bad body: a visitor with junk gets 401, not 400', async () => {
    const deps = fakeDeps({ userId: vi.fn(async () => null) });

    expect((await handleEventsRequest(post(null, { raw: '{not json' }), deps)).status).toBe(401);
  });

  it.each([
    ['a name outside the list', { sessionId: SESSION, events: [{ name: 'page_view' }] }],
    ['more than 20 events', { sessionId: SESSION, events: Array.from({ length: 21 }, () => ({ name: 'app_opened' })) }],
    ['no events', { sessionId: SESSION, events: [] }],
    ['a session that is not a uuid', { sessionId: 'abc', events: [{ name: 'app_opened' }] }],
    ['a body that is not an object', ['app_opened']],
  ])('answers 400 for %s, and records nothing', async (_what, body) => {
    const deps = fakeDeps();

    const response = await handleEventsRequest(post(body), deps);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'invalid' });
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(deps.record).not.toHaveBeenCalled();
  });

  it('answers 400 for a body that is not JSON, and for one with no body at all', async () => {
    const deps = fakeDeps();

    expect((await handleEventsRequest(post(null, { raw: '{not json' }), deps)).status).toBe(400);
    expect(
      (await handleEventsRequest(new Request('http://localhost:3000/api/events', { method: 'POST' }), deps)).status,
    ).toBe(400);
    expect(deps.record).not.toHaveBeenCalled();
  });

  it('answers 400 for a body of more than 8 KB, and takes one just under it', async () => {
    const deps = fakeDeps();
    const padding = (bytes: number) => ({ sessionId: SESSION, events: [{ name: 'app_opened' }], pad: 'x'.repeat(bytes) });
    const base = JSON.stringify(padding(0)).length;

    const big = await handleEventsRequest(post(padding(8 * 1024 - base + 1)), deps);
    const fits = await handleEventsRequest(post(padding(8 * 1024 - base)), deps);

    expect(big.status).toBe(400);
    expect(fits.status).toBe(204);
    expect(deps.record).toHaveBeenCalledOnce();
  });

  it('turns away a body that says it is big without reading it', async () => {
    const deps = fakeDeps();

    const response = await handleEventsRequest(post(VALID, { headers: { 'Content-Length': '9000' } }), deps);

    expect(response.status).toBe(400);
    expect(deps.record).not.toHaveBeenCalled();
  });

  it('answers 503 with no-store when the events cannot be written, and says why in the log only', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const failure = new Error('db down');
    const deps = fakeDeps({ record: vi.fn(async () => Promise.reject(failure)) });

    const response = await handleEventsRequest(post(VALID), deps);

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: 'unavailable' });
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(warn).toHaveBeenCalledExactlyOnceWith('The events could not be recorded.', failure);
    warn.mockRestore();
  });

  it('answers 503 when the session or the membership cannot be read', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const noSession = fakeDeps({ userId: vi.fn(async () => Promise.reject(new Error('cookies() outside a request'))) });
    expect((await handleEventsRequest(post(VALID), noSession)).status).toBe(503);

    const noMembership = fakeDeps({ isMember: vi.fn(async () => Promise.reject(new Error('timeout'))) });
    expect((await handleEventsRequest(post(VALID), noMembership)).status).toBe(503);
    expect(noMembership.record).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});
