import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FakePlayerAdapter } from './fakeAdapter';
import { usePlayerTime } from './usePlayerTime';

function tick(ms: number): void {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

describe('usePlayerTime', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    cleanup(); // unmount while the fake timers are still installed
    vi.useRealTimers();
  });

  it('is 0 while there is no adapter, and starts no timer', () => {
    const { result } = renderHook(() => usePlayerTime(null));
    expect(result.current).toBe(0);
    tick(1000);
    expect(result.current).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('reads the adapter clock every 100 ms by default', () => {
    const p = new FakePlayerAdapter(180000);
    p.play();
    const { result } = renderHook(() => usePlayerTime(p));
    expect(result.current).toBe(0);

    p.advance(1000);
    tick(99);
    expect(result.current).toBe(0);
    tick(1);
    expect(result.current).toBe(1000);

    p.advance(250);
    tick(100);
    expect(result.current).toBe(1250);
  });

  it('picks up an adapter that is already past 0 right away', () => {
    const p = new FakePlayerAdapter(180000);
    p.seekTo(42000);
    const { result } = renderHook(() => usePlayerTime(p));
    expect(result.current).toBe(42000);
  });

  it('honors a custom interval', () => {
    const p = new FakePlayerAdapter(180000);
    p.play();
    const { result } = renderHook(() => usePlayerTime(p, 250));

    p.advance(700);
    tick(249);
    expect(result.current).toBe(0);
    tick(1);
    expect(result.current).toBe(700);
  });

  it('does not render again while the time has not changed', () => {
    const p = new FakePlayerAdapter(180000);
    let renders = 0;
    renderHook(() => {
      renders += 1;
      return usePlayerTime(p);
    });
    tick(100); // React may render once more before it settles on an unchanged value
    const settled = renders;

    tick(1000); // 10 more polls, the player is not moving

    expect(renders).toBe(settled);
  });

  it('goes on reading the clock while the page is hidden and after it comes back (spec section 6)', () => {
    const p = new FakePlayerAdapter(180000);
    p.play();
    const { result } = renderHook(() => usePlayerTime(p));
    const setVisibility = (state: DocumentVisibilityState) => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
      act(() => {
        document.dispatchEvent(new Event('visibilitychange'));
      });
    };

    setVisibility('hidden');
    p.advance(1000);
    tick(100);
    expect(result.current).toBe(1000);

    setVisibility('visible');
    p.advance(500);
    tick(100);
    expect(result.current).toBe(1500);
    expect(vi.getTimerCount()).toBe(1);
  });

  it('stops polling on unmount', () => {
    const p = new FakePlayerAdapter(180000);
    const spy = vi.spyOn(p, 'getCurrentTimeMs');
    const { unmount } = renderHook(() => usePlayerTime(p));
    expect(vi.getTimerCount()).toBe(1);

    unmount();
    spy.mockClear();
    tick(1000);

    expect(vi.getTimerCount()).toBe(0);
    expect(spy).not.toHaveBeenCalled();
  });

  it('switches to the new adapter and stops polling the old one', () => {
    const a = new FakePlayerAdapter(180000);
    const b = new FakePlayerAdapter(180000);
    a.play();
    a.advance(3000);
    b.play();
    b.advance(9000);
    const spyA = vi.spyOn(a, 'getCurrentTimeMs');

    const { result, rerender } = renderHook(({ adapter }) => usePlayerTime(adapter), {
      initialProps: { adapter: a as FakePlayerAdapter | null },
    });
    expect(result.current).toBe(3000);

    rerender({ adapter: b });
    expect(result.current).toBe(9000);
    expect(vi.getTimerCount()).toBe(1);

    spyA.mockClear();
    b.advance(500);
    tick(100);
    expect(result.current).toBe(9500);
    expect(spyA).not.toHaveBeenCalled();
  });

  it('goes back to 0 and stops polling when the adapter becomes null', () => {
    const p = new FakePlayerAdapter(180000);
    p.play();
    p.advance(3000);
    const { result, rerender } = renderHook(({ adapter }) => usePlayerTime(adapter), {
      initialProps: { adapter: p as FakePlayerAdapter | null },
    });
    expect(result.current).toBe(3000);

    rerender({ adapter: null });

    expect(result.current).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });
});
