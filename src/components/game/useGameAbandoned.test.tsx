import { act, render } from '@testing-library/react';
import { StrictMode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { track } from '@/lib/metrics/track';
import type { Mode } from '@/lib/types';
import { useGameAbandoned } from './useGameAbandoned';

// A game left without finishing (ruling S44): the screen goes away (in-app navigation) or the page is left or put
// away (pagehide), once per game, and never because the page went to the background.

interface Options {
  youtubeId: string;
  mode: Mode;
  finished: () => boolean;
}

const OPTIONS: Options = { youtubeId: 'aaaaaaaaaaa', mode: 'escolha', finished: () => false };

/** A screen that uses the hook, and nothing else. */
function Probe(options: Options) {
  useGameAbandoned(options);
  return null;
}

function mount(options: Options = OPTIONS, strict = false) {
  const ui = (given: Options) =>
    strict ? (
      <StrictMode>
        <Probe {...given} />
      </StrictMode>
    ) : (
      <Probe {...given} />
    );
  const view = render(ui(options));
  return { unmount: view.unmount, rerender: (given: Options) => view.rerender(ui(given)) };
}

/** Lets what the screen put off to the end of the turn happen. */
async function settle() {
  await act(async () => {});
}

function pagehide() {
  act(() => {
    window.dispatchEvent(new Event('pagehide'));
  });
}

function setVisibility(state: DocumentVisibilityState) {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
  act(() => {
    document.dispatchEvent(new Event('visibilitychange'));
  });
}

beforeEach(() => {
  vi.mocked(track).mockClear();
  Reflect.deleteProperty(document, 'visibilityState');
});

describe('useGameAbandoned', () => {
  it('tracks nothing while the game is on screen', async () => {
    mount();
    await settle();

    expect(track).not.toHaveBeenCalled();
  });

  it('tracks game_abandoned, with the song and the mode, when the screen goes away without the game finishing', async () => {
    const { unmount } = mount({ youtubeId: 'bbbbbbbbbbb', mode: 'montar', finished: () => false });

    unmount();
    await settle();

    expect(track).toHaveBeenCalledExactlyOnceWith('game_abandoned', { youtubeId: 'bbbbbbbbbbb', mode: 'montar' });
  });

  it('tracks it when the page is left or put away (pagehide), at once', () => {
    mount();

    pagehide();

    expect(track).toHaveBeenCalledExactlyOnceWith('game_abandoned', { youtubeId: 'aaaaaaaaaaa', mode: 'escolha' });
  });

  it('tracks it once for a game: not again when the screen goes away after the page was left, nor on a second pagehide', async () => {
    const { unmount } = mount();

    pagehide();
    pagehide();
    unmount();
    await settle();

    expect(track).toHaveBeenCalledOnce();
  });

  it('never tracks it for the page going to the background (visibilitychange): the player is brought back', async () => {
    mount();

    setVisibility('hidden');
    setVisibility('visible');
    await settle();

    expect(track).not.toHaveBeenCalled();
  });

  it('tracks nothing for a game that finished, whether the screen goes away or the page is left', async () => {
    const { unmount } = mount({ ...OPTIONS, finished: () => true });

    pagehide();
    unmount();
    await settle();

    expect(track).not.toHaveBeenCalled();
  });

  it('asks whether the game finished when the screen goes away, not when it came up', async () => {
    let over = false;
    const { unmount } = mount({ ...OPTIONS, finished: () => over });
    over = true;

    unmount();
    await settle();

    expect(track).not.toHaveBeenCalled();
  });

  it('tracks the song and the mode the game has at the end', async () => {
    const { rerender, unmount } = mount();
    rerender({ youtubeId: 'ccccccccccc', mode: 'karaoke', finished: () => false });

    unmount();
    await settle();

    expect(track).toHaveBeenCalledExactlyOnceWith('game_abandoned', { youtubeId: 'ccccccccccc', mode: 'karaoke' });
  });

  it('does not take the screen being taken down and put back at once (StrictMode, in development) for a game left', async () => {
    const { unmount } = mount(OPTIONS, true);
    await settle();
    expect(track).not.toHaveBeenCalled();

    unmount();
    await settle();

    expect(track).toHaveBeenCalledExactlyOnceWith('game_abandoned', { youtubeId: 'aaaaaaaaaaa', mode: 'escolha' });
  });

  it('takes its pagehide listener off when the screen is gone', async () => {
    const add = vi.spyOn(window, 'addEventListener');
    const remove = vi.spyOn(window, 'removeEventListener');
    const { unmount } = mount();
    const listener = add.mock.calls.find(([type]) => type === 'pagehide')?.[1];
    expect(listener).toBeDefined();

    unmount();
    await settle();

    expect(remove).toHaveBeenCalledWith('pagehide', listener);
    add.mockRestore();
    remove.mockRestore();
  });
});
