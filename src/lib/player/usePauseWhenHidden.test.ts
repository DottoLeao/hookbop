import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { usePauseWhenHidden } from './usePauseWhenHidden';

/** The page goes to the background or comes back, as the browser reports it. */
function setVisibility(state: DocumentVisibilityState) {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
  document.dispatchEvent(new Event('visibilitychange'));
}

afterEach(() => {
  setVisibility('visible');
});

describe('usePauseWhenHidden', () => {
  it('pauses when the page is hidden', () => {
    const pause = vi.fn();
    renderHook(() => usePauseWhenHidden(pause));

    setVisibility('hidden');

    expect(pause).toHaveBeenCalledOnce();
  });

  it('pauses when the page is left or put away (pagehide)', () => {
    const pause = vi.fn();
    renderHook(() => usePauseWhenHidden(pause));

    window.dispatchEvent(new Event('pagehide'));

    expect(pause).toHaveBeenCalledOnce();
  });

  it('does nothing when the page becomes visible again: nothing ever plays by itself', () => {
    const pause = vi.fn();
    renderHook(() => usePauseWhenHidden(pause));
    setVisibility('hidden');

    setVisibility('visible');

    expect(pause).toHaveBeenCalledOnce();
  });

  it('listens to nothing while it is off', () => {
    const pause = vi.fn();
    renderHook(() => usePauseWhenHidden(pause, false));

    setVisibility('hidden');
    window.dispatchEvent(new Event('pagehide'));

    expect(pause).not.toHaveBeenCalled();
  });

  it('stops listening when it goes away', () => {
    const pause = vi.fn();
    const { unmount } = renderHook(() => usePauseWhenHidden(pause));
    unmount();

    setVisibility('hidden');
    window.dispatchEvent(new Event('pagehide'));

    expect(pause).not.toHaveBeenCalled();
  });
});
