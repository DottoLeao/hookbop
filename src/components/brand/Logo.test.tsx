import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Logo } from './Logo';

describe('Logo', () => {
  it('is one image named hookbop with a disc standing in for each "o"', () => {
    const { container } = render(<Logo size={56} />);

    expect(screen.getByRole('img', { name: 'hookbop' })).toHaveStyle({ fontSize: '56px' });
    expect(container.querySelectorAll('svg')).toHaveLength(2);
  });
});
