import { render, screen, within } from '@testing-library/react';
import gsap from 'gsap';
import { StrictMode } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import type { VideoRecord } from '@/lib/lyrics/resolveSong';
import { SongList } from './SongList';

// The real GSAP, in jsdom: nothing plays by itself here, but a tween can be taken to its end by hand.

function song(id: string, title: string): VideoRecord {
  return {
    youtubeId: id,
    title: `Invented Artist - ${title}`,
    channel: 'Invented Artist',
    durationS: 200,
    ytFetchedAt: '2026-10-20T10:00:00+00:00',
    status: 'ok',
    offsetMs: 0,
  };
}

const SONGS = [song('aaaaaaaaaaa', 'First Invented Song'), song('bbbbbbbbbbb', 'Second Invented Song')];

afterEach(() => {
  gsap.globalTimeline.clear();
});

function cards() {
  return within(screen.getByRole('list')).getAllByRole('listitem');
}

/** The entrance taken to its end, as the clock would in half a second. The cards share their tweens: found before any ends. */
function finishEntrance() {
  const tweens = new Set(cards().flatMap((card) => gsap.getTweensOf(card)));
  expect(tweens.size).toBeGreaterThan(0);
  for (const tween of tweens) tween.progress(1);
}

describe('SongList: the cards come in and nothing is left on them', () => {
  it('has the cards out of sight while they wait to come in, and in sight, with no style at all, once they are in', () => {
    render(<SongList songs={SONGS} />);
    expect(cards().map((card) => card.style.opacity)).toEqual(['0', '0']);

    finishEntrance();

    for (const card of cards()) expect(card.getAttribute('style') ?? '').toBe('');
  });

  it('comes in the same way under StrictMode, which sets the entrance up, takes it down and sets it up again', () => {
    render(
      <StrictMode>
        <SongList songs={SONGS} />
      </StrictMode>,
    );

    finishEntrance();

    for (const card of cards()) expect(card.getAttribute('style') ?? '').toBe('');
  });

  it('never leaves a card out of sight: a card the list gains is brought in too', () => {
    const { rerender } = render(<SongList songs={SONGS} />);
    finishEntrance();

    rerender(<SongList songs={[song('ccccccccccc', 'Third Invented Song'), ...SONGS]} />);
    finishEntrance();

    expect(cards()).toHaveLength(3);
    for (const card of cards()) expect(card.getAttribute('style') ?? '').toBe('');
  });

  it('leaves no tween behind when the list goes away mid-entrance', () => {
    const { unmount } = render(<SongList songs={SONGS} />);
    const before = cards();

    unmount();

    for (const card of before) expect(gsap.getTweensOf(card)).toHaveLength(0);
  });
});
