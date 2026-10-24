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
    const onVisible = vi.fn();
    renderHook(() => usePauseWhenHidden(pause, false, onVisible));

    setVisibility('hidden');
    window.dispatchEvent(new Event('pagehide'));
    setVisibility('visible');
    window.dispatchEvent(new Event('pageshow'));

    expect(pause).not.toHaveBeenCalled();
    expect(onVisible).not.toHaveBeenCalled();
  });

  describe('onVisible', () => {
    it('is called when the page is visible again after it was hidden, and only then', () => {
      const pause = vi.fn();
      const onVisible = vi.fn();
      renderHook(() => usePauseWhenHidden(pause, true, onVisible));

      setVisibility('visible');
      expect(onVisible).not.toHaveBeenCalled();

      setVisibility('hidden');
      expect(onVisible).not.toHaveBeenCalled();
      setVisibility('visible');
      expect(onVisible).toHaveBeenCalledOnce();
      expect(pause).toHaveBeenCalledOnce();
    });

    it('is called once per return, however many times the browser says the page is visible', () => {
      const onVisible = vi.fn();
      renderHook(() => usePauseWhenHidden(vi.fn(), true, onVisible));

      setVisibility('hidden');
      setVisibility('visible');
      setVisibility('visible');
      window.dispatchEvent(new Event('pageshow'));
      expect(onVisible).toHaveBeenCalledOnce();

      setVisibility('hidden');
      setVisibility('visible');
      expect(onVisible).toHaveBeenCalledTimes(2);
    });

    it('is called when the page comes back from pagehide (pageshow), as some phones say it', () => {
      const onVisible = vi.fn();
      renderHook(() => usePauseWhenHidden(vi.fn(), true, onVisible));

      window.dispatchEvent(new Event('pagehide'));
      window.dispatchEvent(new Event('pageshow'));

      expect(onVisible).toHaveBeenCalledOnce();
    });

    it('still knows the page was hidden when the callbacks change in between', () => {
      const first = vi.fn();
      const second = vi.fn();
      const { rerender } = renderHook(({ onVisible }) => usePauseWhenHidden(vi.fn(), true, onVisible), {
        initialProps: { onVisible: first },
      });

      setVisibility('hidden');
      rerender({ onVisible: second });
      setVisibility('visible');

      expect(first).not.toHaveBeenCalled();
      expect(second).toHaveBeenCalledOnce();
    });
  });

  it('stops listening when it goes away', () => {
    const pause = vi.fn();
    const onVisible = vi.fn();
    const { unmount } = renderHook(() => usePauseWhenHidden(pause, true, onVisible));
    setVisibility('hidden');
    unmount();

    setVisibility('visible');
    setVisibility('hidden');
    window.dispatchEvent(new Event('pagehide'));

    expect(pause).toHaveBeenCalledOnce();
    expect(onVisible).not.toHaveBeenCalled();
  });
});
