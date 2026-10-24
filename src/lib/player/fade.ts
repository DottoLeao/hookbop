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

/** Brings the music down before a pause and back up when it resumes. It never pauses or plays by itself. */
export interface Fader {
  /**
   * Lowers the volume from where it is to 0 in steps, over `ms`, then calls `onDone`. Without volume control it
   * only waits `ms` and calls `onDone`. The volume it started from is kept for the next `fadeIn`.
   */
  fadeOut(ms: number, onDone: () => void): void;
  /**
   * Raises the volume from where it is to the one kept by the last `fadeOut` (or 100), over `ms`. It cancels a
   * `fadeOut` that is still running, without calling its `onDone`. Without volume control it does nothing.
   */
  fadeIn(ms: number): void;
  /** Stops whatever is running, at the volume it reached. It does not call `onDone`. */
  cancel(): void;
  /** Which way the volume is moving now, or null when it is not. */
  fading(): 'out' | 'in' | null;
}

export interface FaderOptions {
  /** False where the device ignores the volume (see `supportsVolume`): `fadeOut` then only waits. */
  volume: boolean;
  /** Time between two volume steps. 50 ms by default. */
  stepMs?: number;
  /** Replaceable so tests can drive time. They default to `setTimeout` and `clearTimeout`. */
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
}

export function createFader(adapter: PlayerAdapter, opts: FaderOptions): Fader {
  const stepMs = Math.max(1, opts.stepMs ?? DEFAULT_STEP_MS);
  // The defaults look `setTimeout` up when they run, so fake timers installed later still apply.
  const setTimer = opts.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
  const clearTimer = opts.clearTimer ?? ((handle) => clearTimeout(handle as ReturnType<typeof setTimeout>));

  let direction: 'out' | 'in' | null = null;
  // Boxed, so a handle that is 0 or undefined still counts as a timer that is waiting.
  let timer: { handle: unknown } | null = null;
  // The volume this fader last set. Only trusted while a fade runs: YouTube can be slow to read a volume back.
  let level = FULL_VOLUME;
  // The volume the music should come back to, while it is below it. Null once it is all the way back.
  let restoreTo: number | null = null;

  function stopTimer(): void {
    if (timer) clearTimer(timer.handle);
    timer = null;
  }

  function currentVolume(): number {
    return direction ? level : adapter.getVolume();
  }

  /**
   * Moves from `from` to `to` in evenly spaced steps whose waits add up to exactly `ms`. The last step is `to`
   * itself, not a rounded neighbour. Each step is scheduled only after the previous one ran.
   */
  function fade(way: 'out' | 'in', ms: number, from: number, to: number, finish: () => void): void {
    stopTimer();
    direction = way;
    level = from;

    const total = Math.max(0, ms);
    const steps = opts.volume ? Math.max(1, Math.round(total / stepMs)) : 1;
    const waitFor = (n: number) => Math.round((total * n) / steps) - Math.round((total * (n - 1)) / steps);

    let n = 0;
    const schedule = () => {
      timer = {
        handle: setTimer(() => {
          timer = null;
          n += 1;
          const next = n === steps ? to : Math.round(from + ((to - from) * n) / steps);
          if (opts.volume && next !== level) {
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
      // No volume control: one wait of `ms`, and the player's volume is never read or set.
      if (!opts.volume) return fade('out', ms, 0, 0, onDone);

      const from = currentVolume();
      // Keep the volume to return to only once. A fadeOut that begins in the middle of a fade, or after one that left
      // the music low, must not take that lower volume as the one to come back to.
      restoreTo ??= from;
      fade('out', ms, from, 0, onDone);
    },

    fadeIn(ms) {
      if (!opts.volume) return;
      const target = restoreTo ?? FULL_VOLUME;
      const from = currentVolume();
      if (from >= target) {
        // Nothing to climb, but a descent that is still running has to stop.
        stopTimer();
        direction = null;
        restoreTo = null;
        return;
      }
      restoreTo = target;
      fade('in', ms, from, target, () => {
        restoreTo = null;
      });
    },

    cancel() {
      stopTimer();
      direction = null;
    },

    fading: () => direction,
  };
}
