import type { PlayerAdapter } from './adapter';

const FULL_VOLUME = 100;
const DEFAULT_STEP_MS = 50;

/**
 * Whether a program can set the volume of the player on this device. iOS Safari ignores it, on an iPhone and on
 * an iPad alike. Since iPadOS 13 the iPad's Safari says it is a Mac, but a real Mac has no touch screen.
 */
export function supportsVolume(nav: { userAgent: string; maxTouchPoints: number }): boolean {
  if (/iPhone|iPad/.test(nav.userAgent)) return false;
  if (/Macintosh/.test(nav.userAgent) && nav.maxTouchPoints > 1) return false;
  return true;
}

/**
 * Brings the music down before a pause and back up when it resumes. It never pauses or plays by itself.
 *
 * The volume to come back to is kept by the first `fadeOut` of a sequence, and held until a `fadeIn` has brought the
 * music all the way back. So a `fadeOut` that begins in the middle of a fade, or after one that left the music low,
 * does not take that lower volume as the one to restore.
 */
export interface Fader {
  /**
   * Lowers the volume from where it is to 0 in steps, over `ms`, then calls `onDone`. Without volume control it
   * only waits `ms` and then calls `onDone`. It replaces a fade that is already running, and that fade's
   * `onDone` is dropped. A negative or non-finite `ms` counts as 0.
   */
  fadeOut(ms: number, onDone: () => void): void;
  /**
   * Raises the volume from where it is to the kept volume (100 when no `fadeOut` kept one), over `ms`.
   * On every platform it first cancels a `fadeOut` that is still pending, and that `onDone` is never called.
   * Without volume control there is no volume to raise, so that is all it does.
   */
  fadeIn(ms: number): void;
  /** Stops whatever is running, at the volume it reached. It does not call `onDone`. */
  cancel(): void;
  /** Which way the volume is moving now, or null when it is not. */
  fading(): 'out' | 'in' | null;
}

export interface FaderOptions {
  /**
   * False where the device ignores the volume (see `supportsVolume`). `fadeOut` then only waits, and `fadeIn`
   * only cancels that wait.
   */
  volume: boolean;
  /** Time between two volume steps. 50 ms by default. */
  stepMs?: number;
  /** Replaceable so tests can drive time. They default to `setTimeout` and `clearTimeout`. */
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
}

/** A time to wait. A negative or non-finite value (NaN, Infinity) counts as 0, so it can never hang a fade. */
function toWaitMs(ms: number): number {
  return Number.isFinite(ms) ? Math.max(0, ms) : 0;
}

export function createFader(adapter: PlayerAdapter, opts: FaderOptions): Fader {
  const stepMs = Math.max(1, opts.stepMs ?? DEFAULT_STEP_MS);
  // The defaults look `setTimeout` up when they run, so fake timers installed later still apply.
  const setTimer = opts.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
  const clearTimer = opts.clearTimer ?? ((handle) => clearTimeout(handle as ReturnType<typeof setTimeout>));

  let direction: 'out' | 'in' | null = null;
  // Boxed, so a handle that is 0 or undefined still counts as a timer that is waiting.
  let timer: { handle: unknown } | null = null;
  // The volume this fader last set.
  let level = FULL_VOLUME;
  // The volume the music should come back to, while it is below it. Null once it is all the way back.
  let restoreTo: number | null = null;

  function stopTimer(): void {
    if (timer) clearTimer(timer.handle);
    timer = null;
  }

  function cancel(): void {
    stopTimer();
    direction = null;
  }

  /**
   * While the music is below its volume (`restoreTo` is set) the fader set that volume last, so it trusts its own
   * `level`: YouTube can be slow to read a volume back, even after a fade was cancelled. Otherwise it asks the player.
   */
  function currentVolume(): number {
    return restoreTo !== null ? level : adapter.getVolume();
  }

  /** Without volume control: one wait of `ms`, then `onDone`. The player's volume is never read or set. */
  function wait(ms: number, onDone: () => void): void {
    stopTimer();
    direction = 'out';
    timer = {
      handle: setTimer(() => {
        timer = null;
        direction = null;
        onDone();
      }, toWaitMs(ms)),
    };
  }

  /**
   * Moves from `from` to `to` in evenly spaced steps whose waits add up to exactly `ms`. The last step is `to`
   * itself, not a rounded neighbour. Each step is scheduled only after the previous one ran.
   */
  function fade(way: 'out' | 'in', ms: number, from: number, to: number, finish: () => void): void {
    stopTimer();
    direction = way;
    level = from;

    const total = toWaitMs(ms);
    const steps = Math.max(1, Math.round(total / stepMs));
    const waitFor = (n: number) => Math.round((total * n) / steps) - Math.round((total * (n - 1)) / steps);

    let n = 0;
    const schedule = () => {
      timer = {
        handle: setTimer(() => {
          timer = null;
          n += 1;
          const next = n === steps ? to : Math.round(from + ((to - from) * n) / steps);
          if (next !== level) {
            level = next;
            adapter.setVolume(next);
          }
          if (n < steps) {
            schedule();
            return;
          }
          direction = null;
          finish();
        }, waitFor(n + 1)),
      };
    };
    schedule();
  }

  return {
    fadeOut(ms, onDone) {
      if (!opts.volume) {
        wait(ms, onDone);
        return;
      }
      const from = currentVolume();
      restoreTo ??= from; // kept only once, see the `Fader` docs
      fade('out', ms, from, 0, onDone);
    },

    fadeIn(ms) {
      // The same on every platform: a pending `fadeOut` is over, and its `onDone` never runs.
      cancel();
      if (!opts.volume) return;

      const target = restoreTo ?? FULL_VOLUME;
      const from = currentVolume();
      if (from >= target) {
        restoreTo = null; // nothing to climb
        return;
      }
      restoreTo = target;
      fade('in', ms, from, target, () => {
        restoreTo = null;
      });
    },

    cancel,

    fading: () => direction,
  };
}
