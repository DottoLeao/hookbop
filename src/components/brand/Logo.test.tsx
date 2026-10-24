import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Logo } from './Logo';

describe('Logo', () => {
  it('is one image named hookbop with a disc standing in for each "o"', () => {
    const { container } = render(<Logo size={56} />);

    expect(screen.getByRole('img', { name: 'hookbop' })).toHaveStyle({ fontSize: '56px' });
    expect(container.querySelectorAll('svg')).toHaveLength(2);
  });

  it('draws each "o" as a lime disc with a dark groove and a dark center, sized and spaced in em', () => {
    const { container } = render(<Logo size={56} />);

    const discs = [...container.querySelectorAll('svg')];
    expect(discs).toHaveLength(2);
    for (const disc of discs) {
      expect(Object.fromEntries(disc.getAttributeNames().map((name) => [name, disc.getAttribute(name)]))).toEqual({
        viewBox: '0 0 44 44',
        'aria-hidden': 'true',
        focusable: 'false',
        style: 'width: 0.55em; height: 0.55em; margin: 0px 0.025em 0.2em;',
      });
      expect(
        [...disc.children].map((part) => [part.tagName, ...part.getAttributeNames().map((name) => `${name}=${part.getAttribute(name)}`)]),
      ).toEqual([
        ['circle', 'cx=22', 'cy=22', 'r=21', 'fill=#C8FF2E'],
        ['circle', 'cx=22', 'cy=22', 'r=14', 'fill=none', 'stroke=#0E0E10', 'stroke-width=1.5', 'opacity=0.45'],
        ['circle', 'cx=22', 'cy=22', 'r=5', 'fill=#0E0E10'],
      ]);
    }
  });

  it('can be only decoration, hidden from screen readers, where a heading next to it already says the name', () => {
    const { container } = render(<Logo size={48} decorative />);

    expect(screen.queryByRole('img', { name: 'hookbop' })).not.toBeInTheDocument();
    const mark = container.firstElementChild!;
    expect(mark).toHaveAttribute('aria-hidden', 'true');
    expect(mark).not.toHaveAttribute('role');
    expect(mark).not.toHaveAttribute('aria-label');
    expect(mark).toHaveStyle({ fontSize: '48px' });
  });
});
