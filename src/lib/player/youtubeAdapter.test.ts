import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PlayerAdapter, PlayerError, PlayerState } from './adapter';

const API_SRC = 'https://www.youtube.com/iframe_api';

describe('mapYouTubeError', () => {
  it('maps the embedding errors 101 and 150 to not_embeddable', async () => {
    const { mapYouTubeError } = await import('./youtubeAdapter');
    expect(mapYouTubeError(101)).toBe('not_embeddable');
    expect(mapYouTubeError(150)).toBe('not_embeddable');
  });

  it('maps 100 to not_found', async () => {
    const { mapYouTubeError } = await import('./youtubeAdapter');
    expect(mapYouTubeError(100)).toBe('not_found');
  });

  it('maps every other code to other', async () => {
    const { mapYouTubeError } = await import('./youtubeAdapter');
    expect(mapYouTubeError(2)).toBe('other');
    expect(mapYouTubeError(5)).toBe('other');
    expect(mapYouTubeError(0)).toBe('other');
    expect(mapYouTubeError(999)).toBe('other');
  });
});

// The part of the IFrame API that the adapter touches, replaced by a stand-in.
interface PlayerEvents {
  onReady: () => void;
  onStateChange: (e: { data: number }) => void;
  onError: (e: { data: number }) => void;
}

interface PlayerOptions {
  videoId: string;
  host: string;
  playerVars: Record<string, number>;
  events: PlayerEvents;
}

class FakeYTPlayer {
  static instances: FakeYTPlayer[] = [];
  getCurrentTime = vi.fn(() => 0);
  getDuration = vi.fn(() => 0);
  playVideo = vi.fn();
  pauseVideo = vi.fn();
  seekTo = vi.fn();
  setPlaybackRate = vi.fn();
  setVolume = vi.fn();
  getVolume = vi.fn(() => 100);
  getPlayerState = vi.fn(() => -1);
  destroy = vi.fn();
  el: HTMLElement;
  options: PlayerOptions;
  constructor(el: HTMLElement, options: PlayerOptions) {
    this.el = el;
    this.options = options;
    FakeYTPlayer.instances.push(this);
  }
}

type YTWindow = { YT?: unknown; onYouTubeIframeAPIReady?: () => void };
const ytWindow = window as unknown as YTWindow;

/** What the real iframe_api script does once it has loaded. */
function finishLoadingApi(): void {
  ytWindow.YT = { Player: FakeYTPlayer };
  ytWindow.onYouTubeIframeAPIReady?.();
}

function apiScripts(): HTMLScriptElement[] {
  return Array.from(document.querySelectorAll<HTMLScriptElement>(`script[src="${API_SRC}"]`));
}

function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe('createYouTubeAdapter', () => {
  beforeEach(() => {
    // The loader keeps its shared promise at module level, so each test gets a fresh module.
    vi.resetModules();
    FakeYTPlayer.instances = [];
    delete ytWindow.YT;
    delete ytWindow.onYouTubeIframeAPIReady;
    document.head.innerHTML = '';
    document.body.innerHTML = '';
  });

  afterEach(() => {
    delete ytWindow.YT;
    delete ytWindow.onYouTubeIframeAPIReady;
  });

  async function setup() {
    // PlayerLoadError comes from the same fresh module as createYouTubeAdapter, so instanceof works.
    const { createYouTubeAdapter, PlayerLoadError } = await import('./youtubeAdapter');
    const el = document.createElement('div');
    document.body.appendChild(el);
    return { createYouTubeAdapter, PlayerLoadError, el };
  }

  /** Starts an adapter, finishes the API load and fires onReady, like a real page would. */
  async function readyAdapter() {
    const { createYouTubeAdapter, el } = await setup();
    const pending = createYouTubeAdapter(el, 'dQw4w9WgXcQ');
    finishLoadingApi();
    await flush();
    const player = FakeYTPlayer.instances[0];
    player.options.events.onReady();
    return { adapter: await pending, player, el };
  }

  it('loads the iframe API script once, even for several players at the same time', async () => {
    const { createYouTubeAdapter, el } = await setup();
    const second = document.createElement('div');
    document.body.appendChild(second);

    const first = createYouTubeAdapter(el, 'aaaaaaaaaaa');
    const other = createYouTubeAdapter(second, 'bbbbbbbbbbb');
    expect(apiScripts()).toHaveLength(1);

    finishLoadingApi();
    await flush();
    expect(FakeYTPlayer.instances).toHaveLength(2);
    FakeYTPlayer.instances.forEach((p) => p.options.events.onReady());
    await Promise.all([first, other]);
    expect(apiScripts()).toHaveLength(1);
  });

  it('does not load the script when YT.Player already exists', async () => {
    ytWindow.YT = { Player: FakeYTPlayer };
    const { createYouTubeAdapter, el } = await setup();

    const pending = createYouTubeAdapter(el, 'dQw4w9WgXcQ');
    await flush();
    FakeYTPlayer.instances[0].options.events.onReady();
    await pending;

    expect(apiScripts()).toHaveLength(0);
    expect(FakeYTPlayer.instances).toHaveLength(1);
  });

  it('keeps an onYouTubeIframeAPIReady that was already there working', async () => {
    const previous = vi.fn();
    ytWindow.onYouTubeIframeAPIReady = previous;
    const { createYouTubeAdapter, el } = await setup();

    const pending = createYouTubeAdapter(el, 'dQw4w9WgXcQ');
    finishLoadingApi();
    await flush();
    FakeYTPlayer.instances[0].options.events.onReady();
    await pending;

    expect(previous).toHaveBeenCalledTimes(1);
  });

  it('builds the player on the element, from the nocookie host, without autoplay', async () => {
    const { player, el } = await readyAdapter();
    expect(player.el).toBe(el);
    expect(player.options.videoId).toBe('dQw4w9WgXcQ');
    expect(player.options.host).toBe('https://www.youtube-nocookie.com');
    expect(player.options.playerVars).toEqual({ autoplay: 0, playsinline: 1, rel: 0, controls: 1 });
  });

  it('resolves only after the player fires onReady', async () => {
    const { createYouTubeAdapter, el } = await setup();
    let resolved = false;
    const pending = createYouTubeAdapter(el, 'dQw4w9WgXcQ').then((a) => {
      resolved = true;
      return a;
    });

    finishLoadingApi();
    await flush();
    expect(FakeYTPlayer.instances).toHaveLength(1);
    expect(resolved).toBe(false);

    FakeYTPlayer.instances[0].options.events.onReady();
    await pending;
    expect(resolved).toBe(true);
  });

  it('rejects, and lets a later call try again, when the script fails to load', async () => {
    const { createYouTubeAdapter, el } = await setup();

    const failed = createYouTubeAdapter(el, 'dQw4w9WgXcQ');
    const failure = expect(failed).rejects.toMatchObject({ reason: 'other' });
    apiScripts()[0].dispatchEvent(new Event('error'));
    await failure;
    expect(apiScripts()).toHaveLength(0);

    const retry = createYouTubeAdapter(el, 'dQw4w9WgXcQ');
    expect(apiScripts()).toHaveLength(1);
    finishLoadingApi();
    await flush();
    FakeYTPlayer.instances[0].options.events.onReady();
    await retry;
  });

  it('maps YouTube player states to PlayerState', async () => {
    const { adapter, player } = await readyAdapter();
    const seen: PlayerState[] = [];
    adapter.onState((s) => seen.push(s));

    for (const code of [-1, 0, 1, 2, 3, 5]) player.options.events.onStateChange({ data: code });

    expect(seen).toEqual(['unstarted', 'ended', 'playing', 'paused', 'buffering', 'unstarted']);
  });

  it('ignores state codes it does not know', async () => {
    const { adapter, player } = await readyAdapter();
    const seen: PlayerState[] = [];
    adapter.onState((s) => seen.push(s));

    player.options.events.onStateChange({ data: 42 });

    expect(seen).toEqual([]);
  });

  it('maps YouTube errors to PlayerError', async () => {
    const { adapter, player } = await readyAdapter();
    const seen: PlayerError[] = [];
    adapter.onError((e) => seen.push(e));

    for (const code of [101, 150, 100, 2]) player.options.events.onError({ data: code });

    expect(seen).toEqual(['not_embeddable', 'not_embeddable', 'not_found', 'other']);
  });

  it('reads the clock in milliseconds', async () => {
    const { adapter, player } = await readyAdapter();
    player.getCurrentTime.mockReturnValue(12.3456);
    player.getDuration.mockReturnValue(180.5);
    expect(adapter.getCurrentTimeMs()).toBe(12346);
    expect(adapter.getDurationMs()).toBe(180500);
  });

  it('forwards play, pause, seek and rate to the player', async () => {
    const { adapter, player } = await readyAdapter();

    adapter.play();
    adapter.pause();
    adapter.seekTo(2500);
    adapter.setRate(0.75);

    expect(player.playVideo).toHaveBeenCalledTimes(1);
    expect(player.pauseVideo).toHaveBeenCalledTimes(1);
    expect(player.seekTo).toHaveBeenCalledWith(2.5, true);
    expect(player.setPlaybackRate).toHaveBeenCalledWith(0.75);
  });

  it('sets the volume through the player, as a whole number from 0 to 100', async () => {
    const { adapter, player } = await readyAdapter();

    adapter.setVolume(70);
    adapter.setVolume(33.6);
    adapter.setVolume(-5);
    adapter.setVolume(250);

    expect(player.setVolume.mock.calls).toEqual([[70], [34], [0], [100]]);
  });

  it('reads the volume from the player', async () => {
    const { adapter, player } = await readyAdapter();
    player.getVolume.mockReturnValue(42);
    expect(adapter.getVolume()).toBe(42);
  });

  it('reads the real player state, without waiting for an event, with the same mapping as onState', async () => {
    const { adapter, player } = await readyAdapter();
    const expected: [number, PlayerState][] = [
      [-1, 'unstarted'],
      [0, 'ended'],
      [1, 'playing'],
      [2, 'paused'],
      [3, 'buffering'],
      [5, 'unstarted'],
    ];

    for (const [code, state] of expected) {
      player.getPlayerState.mockReturnValue(code);
      expect(adapter.getPlayerState()).toBe(state);
    }
  });

  it('reports a state code it does not know as unstarted', async () => {
    const { adapter, player } = await readyAdapter();
    player.getPlayerState.mockReturnValue(42);
    expect(adapter.getPlayerState()).toBe('unstarted');
  });

  it('stops a listener when the function onState or onError returned is called', async () => {
    const { adapter, player } = await readyAdapter();
    const onState = vi.fn();
    const onError = vi.fn();
    const offState = adapter.onState(onState);
    const offError = adapter.onError(onError);

    offState();
    offError();
    player.options.events.onStateChange({ data: 1 });
    player.options.events.onError({ data: 101 });

    expect(onState).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
  });

  describe('a video that cannot play', () => {
    it.each([
      [101, 'not_embeddable'],
      [150, 'not_embeddable'],
      [100, 'not_found'],
      [2, 'other'],
    ])('rejects, instead of hanging, when YouTube reports error %i before the player is ready', async (code, reason) => {
      const { createYouTubeAdapter, PlayerLoadError, el } = await setup();
      const outcome = createYouTubeAdapter(el, 'dQw4w9WgXcQ').then(
        () => null,
        (e: unknown) => e,
      );
      finishLoadingApi();
      await flush();
      const player = FakeYTPlayer.instances[0];

      player.options.events.onError({ data: code });

      const error = await outcome;
      expect(error).toBeInstanceOf(PlayerLoadError);
      expect(error).toMatchObject({ reason });
      expect(player.destroy).toHaveBeenCalledTimes(1);
    });

    it('hands the error to a subscriber that arrives after it fired', async () => {
      const { adapter, player } = await readyAdapter();
      player.options.events.onError({ data: 101 });

      const late = vi.fn();
      adapter.onError(late);

      expect(late).toHaveBeenCalledTimes(1);
      expect(late).toHaveBeenCalledWith('not_embeddable');
    });

    it('keeps only the last error for late subscribers, and still tells the ones already listening', async () => {
      const { adapter, player } = await readyAdapter();
      const early = vi.fn();
      adapter.onError(early);

      player.options.events.onError({ data: 101 });
      player.options.events.onError({ data: 100 });
      const late = vi.fn();
      adapter.onError(late);

      expect(early.mock.calls).toEqual([['not_embeddable'], ['not_found']]);
      expect(late.mock.calls).toEqual([['not_found']]);
    });

    it('does not call a late subscriber when nothing went wrong', async () => {
      const { adapter } = await readyAdapter();
      const late = vi.fn();
      adapter.onError(late);
      expect(late).not.toHaveBeenCalled();
    });
  });

  describe('the ready timeout', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    /** Starts the call and records how it ends, without leaving a rejection unhandled. */
    async function start(opts?: { readyTimeoutMs?: number }) {
      const { createYouTubeAdapter, PlayerLoadError, el } = await setup();
      const result = { settled: false, outcome: undefined as unknown };
      const done = createYouTubeAdapter(el, 'dQw4w9WgXcQ', opts).then(
        (value) => value,
        (error: unknown) => error,
      );
      void done.then((value) => {
        result.settled = true;
        result.outcome = value;
      });
      return { result, done, PlayerLoadError };
    }

    it('rejects with other after 15 s by default, and destroys the player', async () => {
      const { result, done, PlayerLoadError } = await start();
      finishLoadingApi();

      await vi.advanceTimersByTimeAsync(14999);
      const player = FakeYTPlayer.instances[0];
      expect(result.settled).toBe(false);
      expect(player.destroy).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(1);
      const error = await done;
      expect(error).toBeInstanceOf(PlayerLoadError);
      expect(error).toMatchObject({ reason: 'other' });
      expect(player.destroy).toHaveBeenCalledTimes(1);
    });

    it('takes the time from readyTimeoutMs', async () => {
      const { result, done, PlayerLoadError } = await start({ readyTimeoutMs: 2000 });
      finishLoadingApi();

      await vi.advanceTimersByTimeAsync(1999);
      expect(result.settled).toBe(false);

      await vi.advanceTimersByTimeAsync(1);
      expect(await done).toBeInstanceOf(PlayerLoadError);
      expect(result.outcome).toMatchObject({ reason: 'other' });
    });

    it('also covers a script that never finishes loading, and then builds no player', async () => {
      const { done, PlayerLoadError } = await start({ readyTimeoutMs: 1000 });

      await vi.advanceTimersByTimeAsync(1000);
      expect(await done).toBeInstanceOf(PlayerLoadError);

      finishLoadingApi(); // the script turns up too late
      await vi.advanceTimersByTimeAsync(0);
      expect(FakeYTPlayer.instances).toHaveLength(0);
    });

    it('clears the timer when YouTube reports an error before the player is ready', async () => {
      const { done, PlayerLoadError } = await start({ readyTimeoutMs: 1000 });
      finishLoadingApi();
      await vi.advanceTimersByTimeAsync(0);
      expect(vi.getTimerCount()).toBe(1);

      FakeYTPlayer.instances[0].options.events.onError({ data: 150 });

      expect(await done).toMatchObject({ reason: 'not_embeddable' });
      expect(await done).toBeInstanceOf(PlayerLoadError);
      expect(vi.getTimerCount()).toBe(0);
    });

    it('clears the timer once the player is ready, and keeps the player alive', async () => {
      const { done } = await start({ readyTimeoutMs: 1000 });
      finishLoadingApi();
      await vi.advanceTimersByTimeAsync(0);
      expect(vi.getTimerCount()).toBe(1);
      const player = FakeYTPlayer.instances[0];
      player.options.events.onReady();
      const adapter = (await done) as PlayerAdapter;
      expect(vi.getTimerCount()).toBe(0);

      await vi.advanceTimersByTimeAsync(60000);

      expect(player.destroy).not.toHaveBeenCalled();
      adapter.play();
      expect(player.playVideo).toHaveBeenCalledTimes(1);
    });
  });

  it('does nothing after destroy, and never calls into the destroyed player', async () => {
    const { adapter, player } = await readyAdapter();
    player.getCurrentTime.mockReturnValue(12);
    player.getDuration.mockReturnValue(180);
    player.options.events.onError({ data: 101 }); // latched, but must not reach anyone after destroy
    adapter.destroy();
    const listener = vi.fn();

    expect(() => {
      adapter.play();
      adapter.pause();
      adapter.seekTo(1000);
      adapter.setRate(0.75);
      adapter.setVolume(50);
      adapter.onState(listener)();
      adapter.onError(listener)();
      adapter.destroy();
    }).not.toThrow();

    expect(adapter.getCurrentTimeMs()).toBe(0);
    expect(adapter.getDurationMs()).toBe(0);
    expect(adapter.getVolume()).toBe(100);
    expect(adapter.getPlayerState()).toBe('unstarted');
    expect(player.getCurrentTime).not.toHaveBeenCalled();
    expect(player.getDuration).not.toHaveBeenCalled();
    expect(player.playVideo).not.toHaveBeenCalled();
    expect(player.pauseVideo).not.toHaveBeenCalled();
    expect(player.seekTo).not.toHaveBeenCalled();
    expect(player.setPlaybackRate).not.toHaveBeenCalled();
    expect(player.setVolume).not.toHaveBeenCalled();
    expect(player.getVolume).not.toHaveBeenCalled();
    expect(player.getPlayerState).not.toHaveBeenCalled();
    expect(player.destroy).toHaveBeenCalledTimes(1);
    expect(listener).not.toHaveBeenCalled();
  });

  it('destroys the YouTube player and drops the listeners', async () => {
    const { adapter, player } = await readyAdapter();
    const onState = vi.fn();
    const onError = vi.fn();
    adapter.onState(onState);
    adapter.onError(onError);

    adapter.destroy();
    adapter.destroy(); // a second call is harmless
    player.options.events.onStateChange({ data: 1 });
    player.options.events.onError({ data: 101 });

    expect(player.destroy).toHaveBeenCalledTimes(1);
    expect(onState).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
  });
});
