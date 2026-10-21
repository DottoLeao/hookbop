import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DiscIcon } from './DiscIcon';

describe('DiscIcon', () => {
  it('is a square decorative icon of the requested size', () => {
    const { container } = render(<DiscIcon size={40} />);
    const svg = container.querySelector('svg');

    expect(svg).toHaveAttribute('width', '40');
    expect(svg).toHaveAttribute('height', '40');
    expect(svg).toHaveAttribute('aria-hidden', 'true');
  });

  it('keeps the grooves only when the icon is big enough to show them', () => {
    const small = render(<DiscIcon size={40} />).container;
    const large = render(<DiscIcon size={160} />).container;

    expect(small.querySelectorAll('circle')).toHaveLength(3);
    expect(large.querySelectorAll('circle')).toHaveLength(5);
  });
});
