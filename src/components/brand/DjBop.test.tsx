import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DjBop } from './DjBop';

describe('DjBop', () => {
  it('renders an accessible image tagged with the expression', () => {
    render(<DjBop expression="combo" size={64} />);

    expect(screen.getByRole('img', { name: 'DJ Bop' })).toBeInTheDocument();
    expect(document.querySelector('[data-expression="combo"]')).not.toBeNull();
  });
});
