import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The setup file stands a mock in for the client everywhere; the client's own tests want the real one.
vi.unmock('@/lib/metrics/track');

type Track = typeof import('./track').track;

const ENDPOINT = '/api/events';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const fetchMock = vi.fn();
const beaconMock = vi.fn();

/** What every listener the client added to the window and the document is, so a test can take them all off again. */
const added: { target: EventTarget; type: string; listener: EventListenerOrEventListenerObject }[] = [];

/** A fresh client: its queue, its timer and its session are the ones of a page that has just opened. */
async function freshTrack(): Promise<Track> {
  vi.resetModules();
  return (await import('./track')).track;
}

function setVisibility(state: DocumentVisibilityState) {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
}

function leavePage() {
  window.dispatchEvent(new Event('pagehide'));
}

/** The body of a request or a beacon, read back. */
async function bodyOf(sent: unknown): Promise<{ sessionId: string; events: Record<string, unknown>[] }> {
  const text = sent instanceof Blob ? await sent.text() : String(sent);
  return JSON.parse(text);
}

function fetchBody(call = 0) {
  return bodyOf((fetchMock.mock.calls[call][1] as RequestInit).body);
}

function beaconBody(call = 0) {
  return bodyOf(beaconMock.mock.calls[call][1]);
}

beforeEach(() => {
  vi.useFakeTimers();
  sessionStorage.clear();
  setVisibility('visible');
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
  vi.stubGlobal('fetch', fetchMock);
  beaconMock.mockReset();
  beaconMock.mockReturnValue(true);
  Object.defineProperty(navigator, 'sendBeacon', { configurable: true, writable: true, value: beaconMock });

  for (const target of [window, document]) {
    const original = target.addEventListener.bind(target);
    vi.spyOn(target, 'addEventListener').mockImplementation((type, listener, options) => {
      added.push({ target, type, listener: listener as EventListenerOrEventListenerObject });
      original(type, listener, options);
    });
  }
});

afterEach(() => {
  for (const { target, type, listener } of added.splice(0)) target.removeEventListener(type, listener);
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  Reflect.deleteProperty(navigator, 'sendBeacon');
  Reflect.deleteProperty(document, 'visibilityState');
});

describe('track: batching', () => {
  it('sends nothing until an event is tracked', async () => {
    await freshTrack();

    vi.advanceTimersByTime(60_000);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(beaconMock).not.toHaveBeenCalled();
  });

  it('joins the events of 5 seconds into one request', async () => {
    const track = await freshTrack();

    track('app_opened');
    vi.advanceTimersByTime(2000);
    track('song_opened', { youtubeId: 'aaaaaaaaaaa' });
    vi.advanceTimersByTime(2999);
    expect(fetchMock).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(ENDPOINT);
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({ 'Content-Type': 'application/json' });
    // Only a request sent as the page goes has to outlive it.
    expect(init.keepalive).toBe(false);
    const body = await fetchBody();
    expect(body.sessionId).toMatch(UUID);
    expect(body.events).toEqual([{ name: 'app_opened' }, { name: 'song_opened', youtubeId: 'aaaaaaaaaaa' }]);
  });

  it('sends the song, the mode and the props of an event, and nothing it was not given', async () => {
    const track = await freshTrack();

    track('game_finished', {
      youtubeId: 'aaaaaaaaaaa',
      mode: 'montar',
      props: { pct: 80, durationMs: 91000, totalBlanks: 10 },
    });
    vi.advanceTimersByTime(5000);

    expect((await fetchBody()).events).toEqual([
      { name: 'game_finished', youtubeId: 'aaaaaaaaaaa', mode: 'montar', props: { pct: 80, durationMs: 91000, totalBlanks: 10 } },
    ]);
  });

  it('starts a new 5 seconds with the next event, and does not send an empty request', async () => {
    const track = await freshTrack();

    track('app_opened');
    vi.advanceTimersByTime(5000);
    vi.advanceTimersByTime(60_000);
    expect(fetchMock).toHaveBeenCalledOnce();

    track('song_opened');
    vi.advanceTimersByTime(5000);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect((await fetchBody(1)).events).toEqual([{ name: 'song_opened' }]);
  });

  it('never puts more than 20 events in a request: the 20th sends at once, the rest go with the next 5 seconds', async () => {
    const track = await freshTrack();

    for (let i = 0; i < 25; i++) track('help_explain', { props: { lineIndex: i } });

    expect(fetchMock).toHaveBeenCalledOnce();
    expect((await fetchBody()).events).toHaveLength(20);

    vi.advanceTimersByTime(5000);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect((await fetchBody(1)).events).toEqual(
      [20, 21, 22, 23, 24].map((lineIndex) => ({ name: 'help_explain', props: { lineIndex } })),
    );
  });
});

describe('track: leaving the page', () => {
  it('sends what is waiting with sendBeacon when the page is left (pagehide), as a JSON blob, and nothing again later', async () => {
    const track = await freshTrack();
    track('game_abandoned', { youtubeId: 'aaaaaaaaaaa', mode: 'escolha' });

    leavePage();

    expect(beaconMock).toHaveBeenCalledOnce();
    const [url, blob] = beaconMock.mock.calls[0] as [string, Blob];
    expect(url).toBe(ENDPOINT);
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe('application/json');
    expect((await beaconBody()).events).toEqual([{ name: 'game_abandoned', youtubeId: 'aaaaaaaaaaa', mode: 'escolha' }]);

    vi.advanceTimersByTime(60_000);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(beaconMock).toHaveBeenCalledOnce();
  });

  it('the 20th event, which sends at once while the page stays, is not made to outlive the page either', async () => {
    const track = await freshTrack();

    for (let i = 0; i < 20; i++) track('app_opened');

    expect(fetchMock).toHaveBeenCalledOnce();
    expect((fetchMock.mock.calls[0][1] as RequestInit).keepalive).toBe(false);
  });

  it('sends nothing on pagehide when nothing is waiting', async () => {
    const track = await freshTrack();
    track('app_opened');
    vi.advanceTimersByTime(5000);
    fetchMock.mockClear();

    leavePage();

    expect(beaconMock).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends an event tracked while the page is being left at once, whichever listener ran first', async () => {
    const track = await freshTrack();
    track('app_opened');
    // Another listener, added after the client's own, tracks as the page goes (the game that was left).
    window.addEventListener('pagehide', () => track('game_abandoned'));

    leavePage();

    expect(beaconMock).toHaveBeenCalledTimes(2);
    expect((await beaconBody(0)).events).toEqual([{ name: 'app_opened' }]);
    expect((await beaconBody(1)).events).toEqual([{ name: 'game_abandoned' }]);
    vi.advanceTimersByTime(60_000);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends an event tracked while the page is being left even if the client had not heard of the page yet', async () => {
    const track = await freshTrack();
    // The first event of the page is the one tracked as it goes: the client's own listeners are not there yet, but the
    // page is hidden by then.
    setVisibility('hidden');

    track('game_abandoned');

    expect(beaconMock).toHaveBeenCalledOnce();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('goes back to the 5 seconds when the page comes back from the back-forward cache (pageshow)', async () => {
    const track = await freshTrack();
    track('app_opened');
    leavePage();
    window.dispatchEvent(new Event('pageshow'));

    track('song_opened');
    vi.advanceTimersByTime(5000);

    expect(beaconMock).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledOnce();
    expect((await fetchBody()).events).toEqual([{ name: 'song_opened' }]);
  });

  it('also sends what is waiting when the page goes to the background (visibilitychange), but not when it comes back', async () => {
    const track = await freshTrack();
    track('help_translate', { props: { lineIndex: 1 } });

    setVisibility('hidden');
    document.dispatchEvent(new Event('visibilitychange'));
    expect(beaconMock).toHaveBeenCalledOnce();
    expect((await beaconBody()).events).toEqual([{ name: 'help_translate', props: { lineIndex: 1 } }]);

    setVisibility('visible');
    track('song_opened');
    document.dispatchEvent(new Event('visibilitychange'));
    expect(beaconMock).toHaveBeenCalledOnce();
    vi.advanceTimersByTime(5000);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('falls back to a request that outlives the page when sendBeacon is missing or says no', async () => {
    const track = await freshTrack();

    track('app_opened');
    beaconMock.mockReturnValue(false);
    leavePage();
    expect(fetchMock).toHaveBeenCalledOnce();
    expect((fetchMock.mock.calls[0][1] as RequestInit).keepalive).toBe(true);

    Object.defineProperty(navigator, 'sendBeacon', { configurable: true, writable: true, value: undefined });
    track('song_opened');
    leavePage();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe('track: the session', () => {
  it('is a uuid kept in sessionStorage, the same for every request and for a page opened again in the same tab', async () => {
    const track = await freshTrack();
    track('app_opened');
    vi.advanceTimersByTime(5000);
    track('song_opened');
    vi.advanceTimersByTime(5000);

    const first = (await fetchBody(0)).sessionId;
    expect(first).toMatch(UUID);
    expect((await fetchBody(1)).sessionId).toBe(first);
    expect(sessionStorage.length).toBe(1);

    const again = await freshTrack();
    again('app_opened');
    vi.advanceTimersByTime(5000);
    expect((await fetchBody(2)).sessionId).toBe(first);
  });

  it('is another one in another tab (another sessionStorage)', async () => {
    const track = await freshTrack();
    track('app_opened');
    vi.advanceTimersByTime(5000);
    const first = (await fetchBody(0)).sessionId;

    sessionStorage.clear();
    const other = await freshTrack();
    other('app_opened');
    vi.advanceTimersByTime(5000);

    expect((await fetchBody(1)).sessionId).not.toBe(first);
  });

  it('makes a new one when what is stored is not a uuid', async () => {
    sessionStorage.setItem('hb_session', 'not-a-uuid');
    const track = await freshTrack();

    track('app_opened');
    vi.advanceTimersByTime(5000);

    const { sessionId } = await fetchBody();
    expect(sessionId).toMatch(UUID);
    expect(sessionStorage.getItem('hb_session')).toBe(sessionId);
  });

  it('is kept in memory for the page when the storage is blocked, and the events go out all the same', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError');
    });
    const track = await freshTrack();

    track('app_opened');
    vi.advanceTimersByTime(5000);
    track('song_opened');
    vi.advanceTimersByTime(5000);

    const first = (await fetchBody(0)).sessionId;
    expect(first).toMatch(UUID);
    expect((await fetchBody(1)).sessionId).toBe(first);
  });
});

describe('track: it never gets in the way', () => {
  it('does not throw when the storage, the network or the beacon fail', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError');
    });
    fetchMock.mockImplementation(() => {
      throw new TypeError('fetch failed');
    });
    beaconMock.mockImplementation(() => {
      throw new Error('beacon failed');
    });
    const track = await freshTrack();

    expect(() => track('app_opened')).not.toThrow();
    expect(() => vi.advanceTimersByTime(5000)).not.toThrow();
    expect(() => track('song_opened')).not.toThrow();
    expect(() => leavePage()).not.toThrow();
  });

  it('leaves no unhandled rejection when the request fails (Vitest fails the run on one)', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    const track = await freshTrack();

    track('app_opened');
    await vi.advanceTimersByTimeAsync(5000);
    await vi.advanceTimersByTimeAsync(10);

    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('does not throw when there is no fetch at all', async () => {
    vi.stubGlobal('fetch', undefined);
    const track = await freshTrack();

    track('app_opened');

    expect(() => vi.advanceTimersByTime(5000)).not.toThrow();
  });

  it('does nothing on the server, where there is no window', async () => {
    const track = await freshTrack();
    vi.stubGlobal('window', undefined);

    expect(() => track('app_opened')).not.toThrow();

    vi.advanceTimersByTime(60_000);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(beaconMock).not.toHaveBeenCalled();
  });
});
