import type { PlayerAdapter, PlayerError, PlayerState } from './adapter';

const IFRAME_API_SRC = 'https://www.youtube.com/iframe_api';
const PLAYER_HOST = 'https://www.youtube-nocookie.com';
const DEFAULT_READY_TIMEOUT_MS = 15000;

/** Why `createYouTubeAdapter` gave up: a video that cannot play, or a player that never got ready. */
export class PlayerLoadError extends Error {
  constructor(public readonly reason: PlayerError) {
    super(`The YouTube player could not start (${reason}).`);
    this.name = 'PlayerLoadError';
  }
}

/*
 * The small part of the official IFrame API that this file uses.
 * https://developers.google.com/youtube/iframe_api_reference
 */
interface YTPlayer {
  getCurrentTime(): number;
  getDuration(): number;
  playVideo(): void;
  pauseVideo(): void;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  setPlaybackRate(rate: number): void;
  destroy(): void;
}

interface YTPlayerOptions {
  videoId: string;
  host: string;
  playerVars: { autoplay: 0 | 1; playsinline: 0 | 1; rel: 0 | 1; controls: 0 | 1 };
  events: {
    onReady: () => void;
    onStateChange: (e: { data: number }) => void;
    onError: (e: { data: number }) => void;
  };
}

interface YTNamespace {
  Player: new (el: HTMLElement, options: YTPlayerOptions) => YTPlayer;
}

interface YTWindow {
  /** The script sets `YT` early, but `YT.Player` only exists once the API has finished loading. */
  YT?: Partial<YTNamespace>;
  onYouTubeIframeAPIReady?: () => void;
}

/** YouTube's onError codes. 101 and 150 both mean the owner does not allow embedding. */
export function mapYouTubeError(code: number): PlayerError {
  if (code === 101 || code === 150) return 'not_embeddable';
  if (code === 100) return 'not_found';
  return 'other';
}

/** YouTube's onStateChange codes. 5 (cued) is a video that is loaded but not started. */
const STATE_BY_CODE: Record<number, PlayerState> = {
  [-1]: 'unstarted',
  0: 'ended',
  1: 'playing',
  2: 'paused',
  3: 'buffering',
  5: 'unstarted',
};

let apiReady: Promise<YTNamespace> | null = null;

/** Loads the IFrame API script once per page. Everyone shares the same promise. */
function loadIframeApi(): Promise<YTNamespace> {
  const w = window as unknown as YTWindow;
  if (w.YT?.Player) return Promise.resolve(w.YT as YTNamespace);
  if (apiReady) return apiReady;

  apiReady = new Promise<YTNamespace>((resolve, reject) => {
    const previous = w.onYouTubeIframeAPIReady;
    w.onYouTubeIframeAPIReady = () => {
      previous?.();
      resolve(w.YT as YTNamespace);
    };

    const script = document.createElement('script');
    script.src = IFRAME_API_SRC;
    script.async = true;
    script.onerror = () => {
      // Offline or blocked: drop the dead tag and the promise so a later call can try again.
      script.remove();
      w.onYouTubeIframeAPIReady = previous;
      apiReady = null;
      reject(new Error('Could not load the YouTube player script.'));
    };
    document.head.appendChild(script);
  });
  return apiReady;
}

/**
 * Puts the official YouTube player (from youtube-nocookie.com, no autoplay) behind a PlayerAdapter.
 *
 * Resolves once the player is ready. It rejects with a PlayerLoadError, and destroys the player, when
 * YouTube reports an error before that (for example a video that cannot be embedded), or when nothing
 * happens within `readyTimeoutMs` (15 s by default, reason 'other'). The timer also covers the script load.
 * An error that arrives after the adapter is ready goes to the `onError` listeners; the last one is kept,
 * so a listener added later still gets it, right away.
 *
 * YouTube replaces `el` with its iframe, so pass an element that React does not manage. Call `destroy()`
 * when done; after that every method is a harmless no-op.
 */
export function createYouTubeAdapter(
  el: HTMLElement,
  videoId: string,
  opts?: { readyTimeoutMs?: number },
): Promise<PlayerAdapter> {
  const readyTimeoutMs = opts?.readyTimeoutMs ?? DEFAULT_READY_TIMEOUT_MS;

  return new Promise<PlayerAdapter>((resolve, reject) => {
    const stateListeners = new Set<(s: PlayerState) => void>();
    const errorListeners = new Set<(e: PlayerError) => void>();
    let player: YTPlayer | null = null;
    let phase: 'loading' | 'ready' | 'failed' = 'loading';
    let lastError: PlayerError | null = null;
    let destroyed = false;

    const fail = (reason: PlayerError) => {
      if (phase !== 'loading') return;
      phase = 'failed';
      clearTimeout(timer);
      reject(new PlayerLoadError(reason));
      player?.destroy();
    };
    const timer = setTimeout(() => fail('other'), readyTimeoutMs);

    /** The YouTube player while the adapter is alive, so nothing ever calls into a destroyed one. */
    const live = (): YTPlayer | null => (destroyed ? null : player);

    const adapter: PlayerAdapter = {
      getCurrentTimeMs: () => {
        const p = live();
        return p ? Math.round(p.getCurrentTime() * 1000) : 0;
      },
      getDurationMs: () => {
        const p = live();
        return p ? Math.round(p.getDuration() * 1000) : 0;
      },
      play: () => live()?.playVideo(),
      pause: () => live()?.pauseVideo(),
      seekTo: (ms) => live()?.seekTo(ms / 1000, true),
      setRate: (rate) => live()?.setPlaybackRate(rate),
      onState(cb) {
        if (destroyed) return () => {};
        stateListeners.add(cb);
        return () => {
          stateListeners.delete(cb);
        };
      },
      onError(cb) {
        if (destroyed) return () => {};
        errorListeners.add(cb);
        if (lastError !== null) cb(lastError);
        return () => {
          errorListeners.delete(cb);
        };
      },
      destroy() {
        if (destroyed) return;
        destroyed = true;
        stateListeners.clear();
        errorListeners.clear();
        player?.destroy();
      },
    };

    loadIframeApi()
      .then((YT) => {
        if (phase !== 'loading') return; // gave up while the script was still loading
        player = new YT.Player(el, {
          videoId,
          host: PLAYER_HOST,
          playerVars: { autoplay: 0, playsinline: 1, rel: 0, controls: 1 },
          events: {
            onReady: () => {
              if (phase !== 'loading') return;
              phase = 'ready';
              clearTimeout(timer);
              resolve(adapter);
            },
            onStateChange: (e) => {
              const state = STATE_BY_CODE[e.data];
              if (state) for (const cb of [...stateListeners]) cb(state);
            },
            onError: (e) => {
              const error = mapYouTubeError(e.data);
              if (phase === 'loading') return fail(error);
              lastError = error;
              for (const cb of [...errorListeners]) cb(error);
            },
          },
        });
      })
      .catch(() => fail('other'));
  });
}
