import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFader, supportsVolume } from './fade';
import { FakePlayerAdapter } from './fakeAdapter';

/** The volumes the fader asked for, in order, read from the fake's call log. */
function volumes(p: FakePlayerAdapter): number[] {
  return p.calls.filter((c) => c.startsWith('volume:')).map((c) => Number(c.slice('volume:'.length)));
}

function expectStrictlyDecreasing(values: number[]): void {
  values.forEach((v, i) => {
    if (i > 0) expect(v).toBeLessThan(values[i - 1]);
  });
}

function expectStrictlyIncreasing(values: number[]): void {
  values.forEach((v, i) => {
    if (i > 0) expect(v).toBeGreaterThan(values[i - 1]);
  });
}

describe('createFader', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('fadeOut', () => {
    it('steps the volume down to 0, calls done once after the time, and never pauses', () => {
      const p = new FakePlayerAdapter(180000);
      const done = vi.fn();
      const fader = createFader(p, { volume: true });

      fader.fadeOut(2000, done);
      vi.advanceTimersByTime(1999);
      expect(done).not.toHaveBeenCalled();
      expect(p.getVolume()).toBeGreaterThan(0);

      vi.advanceTimersByTime(1);
      expect(done).toHaveBeenCalledTimes(1);
      const seen = volumes(p);
      expect(seen.length).toBeGreaterThan(10);
      expect(seen.at(-1)).toBe(0);
      expectStrictlyDecreasing(seen);
      seen.forEach((v) => expect(Number.isInteger(v) && v >= 0 && v <= 100).toBe(true));
      expect(p.getVolume()).toBe(0);
      // Only the fader's own volume steps: it never pauses, plays or seeks by itself.
      expect(p.calls.every((c) => c.startsWith('volume:'))).toBe(true);

      vi.advanceTimersByTime(10000);
      expect(done).toHaveBeenCalledTimes(1);
    });

    it('starts from the volume the player has now', () => {
      const p = new FakePlayerAdapter(180000);
      p.setVolume(60);
      p.calls.length = 0;
      const fader = createFader(p, { volume: true });

      fader.fadeOut(1000, () => {});
      vi.advanceTimersByTime(1000);

      const seen = volumes(p);
      expect(seen[0]).toBeLessThan(60);
      expect(seen.at(-1)).toBe(0);
    });

    it('reports out while it runs, and nothing before and after', () => {
      const p = new FakePlayerAdapter(180000);
      const fader = createFader(p, { volume: true });
      expect(fader.fading()).toBeNull();

      fader.fadeOut(1000, () => {});
      expect(fader.fading()).toBe('out');
      vi.advanceTimersByTime(999);
      expect(fader.fading()).toBe('out');
      vi.advanceTimersByTime(1);
      expect(fader.fading()).toBeNull();
    });

    it('lets done start the next fade', () => {
      const p = new FakePlayerAdapter(180000);
      const fader = createFader(p, { volume: true });

      fader.fadeOut(500, () => fader.fadeIn(500));
      vi.advanceTimersByTime(500);
      expect(fader.fading()).toBe('in');
      vi.advanceTimersByTime(500);

      expect(p.getVolume()).toBe(100);
      expect(fader.fading()).toBeNull();
    });
  });

  describe('fadeIn', () => {
    it('goes back up to the volume it had when the last fadeOut began', () => {
      const p = new FakePlayerAdapter(180000);
      p.setVolume(70);
      p.calls.length = 0;
      const fader = createFader(p, { volume: true });

      fader.fadeOut(1000, () => {});
      vi.advanceTimersByTime(1000);
      expect(p.getVolume()).toBe(0);

      p.calls.length = 0;
      fader.fadeIn(800);
      expect(fader.fading()).toBe('in');
      vi.advanceTimersByTime(799);
      expect(p.getVolume()).toBeLessThan(70);
      vi.advanceTimersByTime(1);

      const seen = volumes(p);
      expect(seen.at(-1)).toBe(70);
      expectStrictlyIncreasing(seen);
      expect(Math.max(...seen)).toBe(70);
      expect(fader.fading()).toBeNull();
      vi.advanceTimersByTime(5000);
      expect(volumes(p)).toEqual(seen);
    });

    it('with no volume kept by a fadeOut, leaves a volume the player lowered itself alone', () => {
      const p = new FakePlayerAdapter(180000);
      p.setVolume(40);
      p.calls.length = 0;
      const fader = createFader(p, { volume: true });

      fader.fadeIn(500);
      vi.advanceTimersByTime(5000);

      expect(p.calls).toEqual([]);
      expect(p.getVolume()).toBe(40);
      expect(fader.fading()).toBeNull();
      expect(vi.getTimerCount()).toBe(0);
    });

    it('with no volume kept by a fadeOut, raises a silent player to 100: a fade left it that way', () => {
      const p = new FakePlayerAdapter(180000);
      p.setVolume(0);
      p.calls.length = 0;
      const fader = createFader(p, { volume: true });

      fader.fadeIn(500);
      expect(fader.fading()).toBe('in');
      vi.advanceTimersByTime(500);

      const seen = volumes(p);
      expect(seen.length).toBeGreaterThan(1);
      expect(seen.at(-1)).toBe(100);
      expectStrictlyIncreasing(seen);
      expect(p.getVolume()).toBe(100);
      expect(fader.fading()).toBeNull();
    });

    it('with a volume kept by a fadeOut, still comes back to it, whatever the player reads now', () => {
      const p = new FakePlayerAdapter(180000);
      p.setVolume(40);
      const fader = createFader(p, { volume: true });
      fader.fadeOut(500, () => {});
      vi.advanceTimersByTime(250);
      expect(p.getVolume()).toBeGreaterThan(0);

      fader.fadeIn(500);
      vi.advanceTimersByTime(500);

      expect(p.getVolume()).toBe(40);
    });

    it('does nothing when the volume is already there', () => {
      const p = new FakePlayerAdapter(180000);
      const fader = createFader(p, { volume: true });

      fader.fadeIn(500);

      expect(fader.fading()).toBeNull();
      expect(vi.getTimerCount()).toBe(0);
      expect(p.calls).toEqual([]);
    });

    it('still comes back to the original volume after a second fadeOut that began in the middle of the first', () => {
      const p = new FakePlayerAdapter(180000);
      p.setVolume(70);
      const fader = createFader(p, { volume: true });

      fader.fadeOut(1000, () => {});
      vi.advanceTimersByTime(500);
      expect(p.getVolume()).toBeGreaterThan(0);
      fader.fadeOut(1000, () => {});
      vi.advanceTimersByTime(1000);
      expect(p.getVolume()).toBe(0);

      fader.fadeIn(500);
      vi.advanceTimersByTime(500);

      expect(p.getVolume()).toBe(70);
    });

    it('still comes back to the original volume after a second fadeOut that began at silence', () => {
      const p = new FakePlayerAdapter(180000);
      p.setVolume(70);
      const fader = createFader(p, { volume: true });

      fader.fadeOut(500, () => {});
      vi.advanceTimersByTime(500);
      fader.fadeOut(500, () => {});
      vi.advanceTimersByTime(500);
      fader.fadeIn(500);
      vi.advanceTimersByTime(500);

      expect(p.getVolume()).toBe(70);
    });

    it('saves the volume again at the next fadeOut once the music is fully back', () => {
      const p = new FakePlayerAdapter(180000);
      p.setVolume(70);
      const fader = createFader(p, { volume: true });
      fader.fadeOut(500, () => {});
      vi.advanceTimersByTime(500);
      fader.fadeIn(500);
      vi.advanceTimersByTime(500);

      p.setVolume(40); // the player's own controls
      fader.fadeOut(500, () => {});
      vi.advanceTimersByTime(500);
      fader.fadeIn(500);
      vi.advanceTimersByTime(500);

      expect(p.getVolume()).toBe(40);
    });
  });

  describe('cancel', () => {
    it('stops a fadeOut in the middle without calling done', () => {
      const p = new FakePlayerAdapter(180000);
      const done = vi.fn();
      const fader = createFader(p, { volume: true });

      fader.fadeOut(2000, done);
      vi.advanceTimersByTime(1000);
      fader.cancel();
      const stoppedAt = p.getVolume();
      const callsSoFar = p.calls.length;
      vi.advanceTimersByTime(10000);

      expect(stoppedAt).toBeGreaterThan(0);
      expect(stoppedAt).toBeLessThan(100);
      expect(p.getVolume()).toBe(stoppedAt);
      expect(p.calls).toHaveLength(callsSoFar);
      expect(done).not.toHaveBeenCalled();
      expect(fader.fading()).toBeNull();
      expect(vi.getTimerCount()).toBe(0);
    });

    it('stops a fadeIn in the middle', () => {
      const p = new FakePlayerAdapter(180000);
      p.setVolume(0);
      const fader = createFader(p, { volume: true });

      fader.fadeIn(1000);
      vi.advanceTimersByTime(500);
      fader.cancel();
      const stoppedAt = p.getVolume();
      vi.advanceTimersByTime(5000);

      expect(stoppedAt).toBeGreaterThan(0);
      expect(stoppedAt).toBeLessThan(100);
      expect(p.getVolume()).toBe(stoppedAt);
      expect(fader.fading()).toBeNull();
    });

    it('is harmless when nothing is running', () => {
      const p = new FakePlayerAdapter(180000);
      const fader = createFader(p, { volume: true });
      expect(() => fader.cancel()).not.toThrow();
      expect(p.calls).toEqual([]);
    });

    it('leaves the fader sure of the volume it stopped at: a later fadeIn climbs from there, even if the player reads back late', () => {
      const p = new FakePlayerAdapter(180000);
      p.getVolume = () => 100; // like YouTube: the steps have been sent, but the read-back has not caught up
      const fader = createFader(p, { volume: true });

      fader.fadeOut(2000, () => {});
      vi.advanceTimersByTime(1000);
      fader.cancel();
      const stoppedAt = volumes(p).at(-1)!;
      expect(stoppedAt).toBeLessThan(100);

      p.calls.length = 0;
      fader.fadeIn(800);
      vi.advanceTimersByTime(800);

      const seen = volumes(p);
      expect(seen[0]).toBeGreaterThan(stoppedAt);
      expectStrictlyIncreasing(seen);
      expect(seen.at(-1)).toBe(100);
    });

    it('asks the player again for the volume once the music is all the way back', () => {
      const p = new FakePlayerAdapter(180000);
      const fader = createFader(p, { volume: true });
      fader.fadeOut(500, () => {});
      vi.advanceTimersByTime(250);
      fader.cancel();
      fader.fadeIn(500);
      vi.advanceTimersByTime(500);
      expect(p.getVolume()).toBe(100);

      p.setVolume(30); // changed in the player's own controls, which the fader cannot see
      p.calls.length = 0;
      fader.fadeOut(500, () => {});
      vi.advanceTimersByTime(500);

      const seen = volumes(p);
      expect(seen[0]).toBeLessThan(30);
      expectStrictlyDecreasing(seen);
    });
  });

  describe('a fadeIn that starts before the fadeOut ends', () => {
    it('cancels the descent and climbs from the volume it had reached', () => {
      const p = new FakePlayerAdapter(180000);
      const done = vi.fn();
      const fader = createFader(p, { volume: true });

      fader.fadeOut(2000, done);
      vi.advanceTimersByTime(1000);
      const reached = p.getVolume();
      expect(reached).toBeGreaterThan(0);
      expect(reached).toBeLessThan(100);

      p.calls.length = 0;
      fader.fadeIn(800);
      expect(fader.fading()).toBe('in');
      vi.advanceTimersByTime(800);

      const seen = volumes(p);
      expect(done).not.toHaveBeenCalled();
      expect(seen[0]).toBeGreaterThan(reached);
      expectStrictlyIncreasing(seen);
      expect(seen.at(-1)).toBe(100);
      expect(p.getVolume()).toBe(100);
      expect(p.calls.every((c) => c.startsWith('volume:'))).toBe(true);

      vi.advanceTimersByTime(5000);
      expect(done).not.toHaveBeenCalled();
    });

    it.each([true, false])(
      'drops the onDone of the fadeOut it interrupts, on every platform (volume: %s)',
      (volume) => {
        const p = new FakePlayerAdapter(180000);
        const done = vi.fn();
        const fader = createFader(p, { volume });

        fader.fadeOut(2000, done);
        vi.advanceTimersByTime(1000);
        fader.fadeIn(800);
        vi.advanceTimersByTime(10000);

        expect(done).not.toHaveBeenCalled();
        expect(fader.fading()).toBeNull();
        expect(vi.getTimerCount()).toBe(0);
      },
    );

    it('also stops a descent that has not lowered anything yet, because there is nothing to climb', () => {
      const p = new FakePlayerAdapter(180000);
      const done = vi.fn();
      const fader = createFader(p, { volume: true });

      fader.fadeOut(2000, done);
      fader.fadeIn(800);
      vi.advanceTimersByTime(10000);

      expect(done).not.toHaveBeenCalled();
      expect(fader.fading()).toBeNull();
      expect(p.getVolume()).toBe(100);
      expect(p.calls).toEqual([]);
    });

    it('takes the volume from its own steps, not from a player that is slow to report them', () => {
      const p = new FakePlayerAdapter(180000);
      const reported = 100;
      p.getVolume = () => reported; // like YouTube: setVolume has been sent, but the read-back lags
      const fader = createFader(p, { volume: true });

      fader.fadeOut(2000, () => {});
      vi.advanceTimersByTime(1000);
      const reached = volumes(p).at(-1)!;
      expect(reached).toBeLessThan(100);

      p.calls.length = 0;
      fader.fadeIn(800);
      vi.advanceTimersByTime(50);

      expect(volumes(p)[0]).toBeGreaterThan(reached);
      expect(volumes(p)[0]).toBeLessThan(100);
    });
  });

  describe('a fadeOut that starts while the music is coming back', () => {
    it('cancels the climb and goes down from where it was', () => {
      const p = new FakePlayerAdapter(180000);
      p.setVolume(0);
      const done = vi.fn();
      const fader = createFader(p, { volume: true });

      fader.fadeIn(1000);
      vi.advanceTimersByTime(500);
      const reached = p.getVolume();

      p.calls.length = 0;
      fader.fadeOut(1000, done);
      expect(fader.fading()).toBe('out');
      vi.advanceTimersByTime(1000);

      const seen = volumes(p);
      expect(seen[0]).toBeLessThan(reached);
      expectStrictlyDecreasing(seen);
      expect(seen.at(-1)).toBe(0);
      expect(done).toHaveBeenCalledTimes(1);

      // The half-way point was not the volume to come back to: the full one still is.
      fader.fadeIn(500);
      vi.advanceTimersByTime(500);
      expect(p.getVolume()).toBe(100);
    });
  });

  describe('steps and timing', () => {
    it.each([
      [2000, 50],
      [130, 50],
      [999, 333],
      [1, 50],
      [0, 50],
      [-20, 50],
      [Number.NaN, 50],
      [Number.POSITIVE_INFINITY, 50],
    ])('lands exactly on the target, at exactly the asked time (%f ms, %i ms steps)', (ms, stepMs) => {
      const p = new FakePlayerAdapter(180000);
      p.setVolume(33);
      const done = vi.fn();
      const fader = createFader(p, { volume: true, stepMs });
      const total = Number.isFinite(ms) ? Math.max(0, ms) : 0; // a negative or non-finite time counts as 0

      fader.fadeOut(ms, done);
      if (total > 0) {
        vi.advanceTimersByTime(total - 1);
        expect(done).not.toHaveBeenCalled();
      }
      vi.advanceTimersByTime(total > 0 ? 1 : 0);
      expect(done).toHaveBeenCalledTimes(1);
      expect(p.getVolume()).toBe(0);

      fader.fadeIn(ms);
      if (total > 0) {
        vi.advanceTimersByTime(total - 1);
        expect(fader.fading()).toBe('in');
      }
      vi.advanceTimersByTime(total > 0 ? 1 : 0);
      expect(fader.fading()).toBeNull();
      expect(p.getVolume()).toBe(33);
    });

    it('asks for the next step only after the last one ran, one timer at a time, using the injected timers', () => {
      const p = new FakePlayerAdapter(180000);
      const waits: number[] = [];
      const queue: Array<() => void> = [];
      const setTimer = vi.fn((fn: () => void, ms: number) => {
        waits.push(ms);
        queue.push(fn);
        return 0; // a handle that is falsy on purpose
      });
      const clearTimer = vi.fn(() => {
        queue.length = 0;
      });
      const done = vi.fn();
      const fader = createFader(p, { volume: true, stepMs: 250, setTimer, clearTimer });

      fader.fadeOut(1000, done);
      while (queue.length > 0) {
        expect(queue).toHaveLength(1);
        queue.shift()?.();
      }

      expect(waits).toEqual([250, 250, 250, 250]);
      expect(volumes(p)).toEqual([75, 50, 25, 0]);
      expect(done).toHaveBeenCalledTimes(1);
      expect(clearTimer).not.toHaveBeenCalled();
      expect(vi.getTimerCount()).toBe(0); // it never touched the global timers

      fader.fadeIn(500);
      fader.cancel();
      expect(clearTimer).toHaveBeenCalledTimes(1);
      expect(clearTimer).toHaveBeenCalledWith(0);
      expect(fader.fading()).toBeNull();
    });
  });

  describe('without volume control', () => {
    it('only waits, then calls done: no volume is ever set', () => {
      const p = new FakePlayerAdapter(180000);
      const done = vi.fn();
      const fader = createFader(p, { volume: false });

      fader.fadeOut(2000, done);
      expect(fader.fading()).toBe('out');
      vi.advanceTimersByTime(1999);
      expect(done).not.toHaveBeenCalled();
      vi.advanceTimersByTime(1);

      expect(done).toHaveBeenCalledTimes(1);
      expect(fader.fading()).toBeNull();
      expect(p.calls.some((c) => c.startsWith('volume:'))).toBe(false);
      expect(p.calls).toEqual([]);
      expect(p.getVolume()).toBe(100);
    });

    it('a fadeIn with no wait pending does nothing', () => {
      const p = new FakePlayerAdapter(180000);
      const fader = createFader(p, { volume: false });

      fader.fadeIn(800);

      expect(fader.fading()).toBeNull();
      expect(vi.getTimerCount()).toBe(0);
      expect(p.calls).toEqual([]);
    });

    it('a fadeIn during the wait stops it: done is never called, and no volume is set', () => {
      const p = new FakePlayerAdapter(180000);
      const done = vi.fn();
      const fader = createFader(p, { volume: false });

      fader.fadeOut(2000, done);
      vi.advanceTimersByTime(1000);
      fader.fadeIn(800);

      expect(fader.fading()).toBeNull();
      expect(vi.getTimerCount()).toBe(0);
      vi.advanceTimersByTime(10000);
      expect(done).not.toHaveBeenCalled();
      expect(p.calls).toEqual([]);
      expect(p.getVolume()).toBe(100);
    });

    it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, -50])(
      'a time of %f counts as 0: done is called at once, not never',
      (ms) => {
        const p = new FakePlayerAdapter(180000);
        const done = vi.fn();
        const fader = createFader(p, { volume: false });

        fader.fadeOut(ms, done);
        vi.advanceTimersByTime(0);

        expect(done).toHaveBeenCalledTimes(1);
        expect(fader.fading()).toBeNull();
      },
    );

    it('cancel stops the wait without calling done', () => {
      const p = new FakePlayerAdapter(180000);
      const done = vi.fn();
      const fader = createFader(p, { volume: false });

      fader.fadeOut(2000, done);
      vi.advanceTimersByTime(1000);
      fader.cancel();
      vi.advanceTimersByTime(10000);

      expect(done).not.toHaveBeenCalled();
      expect(fader.fading()).toBeNull();
      expect(vi.getTimerCount()).toBe(0);
    });

    it('a second fadeOut replaces the first wait', () => {
      const p = new FakePlayerAdapter(180000);
      const first = vi.fn();
      const second = vi.fn();
      const fader = createFader(p, { volume: false });

      fader.fadeOut(1000, first);
      vi.advanceTimersByTime(500);
      fader.fadeOut(1000, second);
      vi.advanceTimersByTime(1000);

      expect(first).not.toHaveBeenCalled();
      expect(second).toHaveBeenCalledTimes(1);
    });
  });
});

describe('supportsVolume', () => {
  const IPHONE =
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
  const IPAD =
    'Mozilla/5.0 (iPad; CPU OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1';
  const ANDROID =
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36';
  const MAC =
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15';
  const WINDOWS =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

  it('is false on an iPhone', () => {
    expect(supportsVolume({ userAgent: IPHONE, maxTouchPoints: 5 })).toBe(false);
  });

  it('is false on an iPad', () => {
    expect(supportsVolume({ userAgent: IPAD, maxTouchPoints: 5 })).toBe(false);
  });

  it('is true on Android', () => {
    expect(supportsVolume({ userAgent: ANDROID, maxTouchPoints: 5 })).toBe(true);
  });

  it('is false on an iPad that says it is a Mac, because it has a touch screen', () => {
    expect(supportsVolume({ userAgent: MAC, maxTouchPoints: 5 })).toBe(false);
  });

  it('is true on a real Mac', () => {
    expect(supportsVolume({ userAgent: MAC, maxTouchPoints: 0 })).toBe(true);
  });

  it('is true on a Windows PC, with or without a touch screen', () => {
    expect(supportsVolume({ userAgent: WINDOWS, maxTouchPoints: 0 })).toBe(true);
    expect(supportsVolume({ userAgent: WINDOWS, maxTouchPoints: 10 })).toBe(true);
  });
});
