import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SpinningDisc } from './SpinningDisc';

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

  it('is a 40 px square', () => {
    render(<SpinningDisc />);

    const disc = screen.getByTestId('spinning-disc');
    expect(disc).toHaveClass('h-10', 'w-10');
    const svg = disc.querySelector('svg')!;
    expect([svg.getAttribute('width'), svg.getAttribute('height')]).toEqual(['40', '40']);
  });

  it('is the disc of the logo: a lime body with a dark groove and a dark center', () => {
    render(<SpinningDisc />);

    const circles = [...screen.getByTestId('spinning-disc').querySelectorAll('circle')];
    expect(circles.map((circle) => circle.getAttribute('fill'))).toEqual(['#C8FF2E', 'none', '#0E0E10']);
    expect(circles[1]).toHaveAttribute('stroke', '#0E0E10');
  });

  it('has marks that are not the same all the way round, dark so they show on the lime, or a turning disc would look still', () => {
    render(<SpinningDisc />);

    const marks = [...screen.getByTestId('spinning-disc').querySelectorAll('path')];
    expect(marks.length).toBeGreaterThanOrEqual(1);
    for (const mark of marks) {
      expect(mark.getAttribute('d')).toMatch(/^M[\d. ]+A/);
      expect(mark).toHaveAttribute('stroke', '#0E0E10');
    }
  });
});
