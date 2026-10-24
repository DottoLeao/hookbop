import { act, renderHook } from '@testing-library/react';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { prefersReducedMotion, useReducedMotion } from './useReducedMotion';

const QUERY = '(prefers-reduced-motion: reduce)';

/** A `matchMedia` whose answer for the reduced-motion query can be changed, firing "change" as a phone does. */
function stubMatchMedia(initially: boolean) {
  const listeners = new Set<() => void>();
  const list = {
    matches: initially,
    addEventListener: vi.fn((type: string, listener: () => void) => {
      if (type === 'change') listeners.add(listener);
    }),
    removeEventListener: vi.fn((type: string, listener: () => void) => {
      if (type === 'change') listeners.delete(listener);
    }),
  };
  const matchMedia = vi.fn((query: string) => (query === QUERY ? list : { ...list, matches: false }));
  vi.stubGlobal('matchMedia', matchMedia);
  return {
    list,
    matchMedia,
    /** The player switches "reduzir movimento" on or off in the phone's settings. */
    change(to: boolean) {
      list.matches = to;
      for (const listener of listeners) listener();
    },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useReducedMotion', () => {
  it('is false when the player has not asked for less motion', () => {
    stubMatchMedia(false);

    const { result } = renderHook(() => useReducedMotion());

    expect(result.current).toBe(false);
  });

  it('is true when the phone is set to reduce motion, read from prefers-reduced-motion', () => {
    const { matchMedia } = stubMatchMedia(true);

    const { result } = renderHook(() => useReducedMotion());

    expect(result.current).toBe(true);
    expect(matchMedia).toHaveBeenCalledWith(QUERY);
  });

  it('follows the setting when it changes while the app is open, both ways', () => {
    const media = stubMatchMedia(false);
    const { result } = renderHook(() => useReducedMotion());

    act(() => media.change(true));
    expect(result.current).toBe(true);

    act(() => media.change(false));
    expect(result.current).toBe(false);
  });

  it('asks the phone for the setting once, however often the component renders: the query is kept', () => {
    // The Karaokê view renders on every tick of the clock, and each render reads the setting.
    const { matchMedia } = stubMatchMedia(false);
    const first = renderHook(() => useReducedMotion());

    for (let i = 0; i < 20; i += 1) first.rerender();
    const second = renderHook(() => useReducedMotion());
    second.rerender();

    expect(matchMedia).toHaveBeenCalledTimes(1);
  });

  it('keeps reading the live answer of the kept query, and asks again of a matchMedia that changed', () => {
    const media = stubMatchMedia(false);
    const { result } = renderHook(() => useReducedMotion());
    act(() => media.change(true));
    expect(result.current).toBe(true);

    // Another page environment (another matchMedia) is another query: it is asked again.
    const other = stubMatchMedia(false);
    const { result: again } = renderHook(() => useReducedMotion());

    expect(again.current).toBe(false);
    expect(other.matchMedia).toHaveBeenCalledTimes(1);
  });

  it('stops listening once nothing uses it', () => {
    const { list } = stubMatchMedia(false);
    const { unmount } = renderHook(() => useReducedMotion());
    const [[, listener]] = list.addEventListener.mock.calls;

    unmount();

    expect(list.removeEventListener).toHaveBeenCalledWith('change', listener);
  });

  it('is false where there is no matchMedia at all, as in a page without it', () => {
    // jsdom has none, as some embedded browsers.
    expect(window.matchMedia).toBeUndefined();

    const { result } = renderHook(() => useReducedMotion());

    expect(result.current).toBe(false);
  });

  it('is false on the server, whatever the phone will say, so the page renders the same there', () => {
    stubMatchMedia(true);
    function Probe() {
      return String(useReducedMotion());
    }

    expect(renderToString(createElement(Probe))).toBe('false');
  });
});

describe('prefersReducedMotion', () => {
  it('answers with the phone’s setting as it is right now, from the query the hook keeps', () => {
    const media = stubMatchMedia(false);
    expect(prefersReducedMotion()).toBe(false);

    media.change(true);
    expect(prefersReducedMotion()).toBe(true);
    media.change(false);
    expect(prefersReducedMotion()).toBe(false);
    expect(media.matchMedia).toHaveBeenCalledTimes(1);
  });

  it('is false where there is no matchMedia', () => {
    expect(window.matchMedia).toBeUndefined();

    expect(prefersReducedMotion()).toBe(false);
  });
});
