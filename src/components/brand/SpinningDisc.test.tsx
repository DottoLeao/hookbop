import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SongThumb } from '@/components/home/SongThumb';
import { SpinningDisc } from './SpinningDisc';

/** What a circle of a disc is drawn with, for comparing two discs. */
function circles(root: Element) {
  return [...root.querySelectorAll('circle')].map((circle) =>
    ['cx', 'cy', 'r', 'fill', 'stroke', 'opacity'].map((name) => circle.getAttribute(name)),
  );
}

describe('SpinningDisc', () => {
  it('is only decoration: hidden from screen readers, with no name, no text and nothing to focus', () => {
    const { container } = render(<SpinningDisc />);

    const disc = screen.getByTestId('spinning-disc');
    expect(disc).toHaveAttribute('aria-hidden', 'true');
    expect(disc).not.toHaveAttribute('role');
    expect(disc).not.toHaveAttribute('aria-label');
    expect(disc).toHaveTextContent('');
    expect(container.querySelector('button, a, input, [tabindex]')).toBeNull();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('turns by the disc-spin class, which the stylesheet stops when motion is reduced', () => {
    render(<SpinningDisc />);

    expect(screen.getByTestId('spinning-disc')).toHaveClass('disc-spin');
  });

  it('is a square of the size asked for, 40 px when none is', () => {
    const { rerender } = render(<SpinningDisc />);
    const size = () => {
      const disc = screen.getByTestId('spinning-disc');
      const svg = disc.querySelector('svg')!;
      return [disc.style.width, disc.style.height, svg.getAttribute('width'), svg.getAttribute('height')];
    };
    expect(size()).toEqual(['40px', '40px', '40', '40']);

    rerender(<SpinningDisc size={64} />);

    expect(size()).toEqual(['64px', '64px', '64', '64']);
  });

  it('is the disc the cards show in place of a picture: the same disc, grooves and lime center', () => {
    render(
      <>
        <SpinningDisc />
        <SongThumb youtubeId="not a video id" title="Invented Song" />
      </>,
    );

    const mine = circles(screen.getByTestId('spinning-disc'));
    const placeholder = circles(screen.getByTestId('song-disc'));
    expect(placeholder).toHaveLength(3);
    // The first three circles are the disc, its groove and its center: the outline around the disc is the only addition.
    expect(mine.slice(0, 3).map(([cx, cy, r, fill, , opacity]) => [cx, cy, r, fill, opacity])).toEqual(
      placeholder.map(([cx, cy, r, fill, , opacity]) => [cx, cy, r, fill, opacity]),
    );
    expect(mine[1][4]).toBe(placeholder[1][4]);
  });

  it('has a mark that is not the same all the way round, or a turning disc would look still', () => {
    render(<SpinningDisc />);

    const marks = screen.getByTestId('spinning-disc').querySelectorAll('path');
    expect(marks.length).toBeGreaterThanOrEqual(1);
    for (const mark of marks) expect(mark.getAttribute('d')).toMatch(/^M[\d. ]+A/);
  });
});
