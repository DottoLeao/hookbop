import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Logo } from './Logo';

describe('Logo', () => {
  it('is one image named hookbop with a disc standing in for each "o"', () => {
    const { container } = render(<Logo size={56} />);

    expect(screen.getByRole('img', { name: 'hookbop' })).toHaveStyle({ fontSize: '56px' });
    expect(container.querySelectorAll('svg')).toHaveLength(2);
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
