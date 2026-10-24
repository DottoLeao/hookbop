import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FakePlayerAdapter } from './fakeAdapter';
import { RETURN_GUARD_MS, useStayPaused } from './useStayPaused';

let fake: FakePlayerAdapter;
let box: HTMLDivElement;
// Stands in for the YouTube player's iframe, inside the player's box.
let clip: HTMLIFrameElement;

/** The page goes to the background or comes back, as the browser reports it. */
function setVisibility(state: DocumentVisibilityState) {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
  act(() => {
    document.dispatchEvent(new Event('visibilitychange'));
  });
}

/** The page goes away and comes back. */
function leaveAndComeBack() {
  setVisibility('hidden');
  setVisibility('visible');
}

/** A tap on the YouTube player: the focus goes into its iframe, and the page itself loses it. */
function tapClip() {
  clip.focus();
  window.dispatchEvent(new Event('blur'));
}

/** The player reports a state, as YouTube does. */
function report(state: 'playing' | 'buffering') {
  act(() => fake.emitState(state));
}

function stayPaused(enabled = true) {
  const boxRef = { current: box };
  return renderHook(({ on }) => useStayPaused(fake, on, boxRef), { initialProps: { on: enabled } });
}

beforeEach(() => {
  vi.useFakeTimers();
  fake = new FakePlayerAdapter(213000);
  box = document.createElement('div');
  clip = document.createElement('iframe');
  box.append(clip);
  document.body.append(box);
});

afterEach(() => {
  setVisibility('visible');
  box.remove();
  vi.useRealTimers();
});

describe('useStayPaused', () => {
  it('pauses the clip when the page is hidden, and once more as it comes back (ruling S19)', () => {
    stayPaused();
    report('playing');
    const before = fake.calls.length;

    leaveAndComeBack();

    expect(fake.calls.slice(before)).toEqual(['pause', 'pause']);
  });

  it.each(['playing', 'buffering'] as const)(
    'pauses a play the phone reports (%s) a moment after the page is back (ruling S54)',
    (state) => {
      stayPaused();
      leaveAndComeBack();
      act(() => vi.advanceTimersByTime(200));

      report(state);

      expect(fake.getPlayerState()).toBe('paused');
      expect(fake.calls.at(-1)).toBe('pause');
    },
  );

  it('pauses every such play until the 2 s are over, and leaves a play after that alone', () => {
    stayPaused();
    leaveAndComeBack();

    act(() => vi.advanceTimersByTime(RETURN_GUARD_MS - 1));
    report('playing');
    expect(fake.getPlayerState()).toBe('paused');

    act(() => vi.advanceTimersByTime(1));
    const before = fake.calls.length;
    report('playing');
    expect(fake.getPlayerState()).toBe('playing');
    expect(fake.calls.slice(before)).toEqual([]);
  });

  it('leaves alone a play the player starts with a tap on the clip in those 2 s', () => {
    stayPaused();
    leaveAndComeBack();
    act(() => vi.advanceTimersByTime(300));
    const before = fake.calls.length;

    tapClip();
    report('buffering');
    report('playing');

    expect(fake.getPlayerState()).toBe('playing');
    expect(fake.calls.slice(before)).toEqual([]);
  });

  it('takes the focus out of the clip as the page comes back, so a focus left there from before is no tap', () => {
    stayPaused();
    // The player tapped the clip to hear it, then left the app.
    tapClip();
    report('playing');
    leaveAndComeBack();
    expect(document.activeElement).not.toBe(clip);

    report('playing');

    expect(fake.getPlayerState()).toBe('paused');
  });

  it('does not take the page losing the focus to anything but the clip for a tap on it', () => {
    stayPaused();
    leaveAndComeBack();

    window.dispatchEvent(new Event('blur'));
    report('playing');

    expect(fake.getPlayerState()).toBe('paused');
  });

  it('pauses a play the phone reports while the page is still away', () => {
    stayPaused();
    setVisibility('hidden');

    report('playing');

    expect(fake.getPlayerState()).toBe('paused');
  });

  it('guards the same way after the page comes back from pagehide (pageshow)', () => {
    stayPaused();
    report('playing');
    const before = fake.calls.length;
    act(() => {
      window.dispatchEvent(new Event('pagehide'));
      window.dispatchEvent(new Event('pageshow'));
    });
    expect(fake.calls.slice(before)).toEqual(['pause', 'pause']);

    report('playing');

    expect(fake.getPlayerState()).toBe('paused');
  });

  it('pauses nothing that is not a play, and nothing at all while the page was never away', () => {
    stayPaused();

    report('playing');
    act(() => fake.emitState('paused'));
    act(() => fake.emitState('ended'));
    report('playing');

    expect(fake.calls).toEqual([]);
  });

  it('does nothing while it is off: the game guards the way back itself', () => {
    stayPaused(false);
    report('playing');

    leaveAndComeBack();
    report('playing');

    expect(fake.calls).toEqual([]);
    expect(fake.getPlayerState()).toBe('playing');
  });

  it('stops guarding when it is turned off in those 2 s, so the game that starts there plays', () => {
    const { rerender } = stayPaused();
    leaveAndComeBack();

    rerender({ on: false });
    report('playing');

    expect(fake.getPlayerState()).toBe('playing');
  });

  it('stops guarding when it goes away', () => {
    const { unmount } = stayPaused();
    leaveAndComeBack();

    unmount();
    report('playing');

    expect(fake.getPlayerState()).toBe('playing');
  });
});
