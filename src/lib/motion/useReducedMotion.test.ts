import { act, renderHook } from '@testing-library/react';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useReducedMotion } from './useReducedMotion';

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
