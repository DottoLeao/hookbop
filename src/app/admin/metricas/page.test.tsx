import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import MetricsPage from './page';

// The owner check and everything after it are in MetricsScreen (its own test). Here it stands for a check that has
// not answered yet: what the page sends before it is only the empty frame.
vi.mock('./MetricsScreen', () => ({ MetricsScreen: () => null }));

describe('/admin/metricas', () => {
  it('sends nothing that names the panel before the owner check has answered', () => {
    const { container } = render(<MetricsPage searchParams={Promise.resolve({})} />);

    expect(container).toHaveTextContent(/^$/);
    expect(screen.getByRole('main')).toBeEmptyDOMElement();
    expect(container.querySelector('a, h1, form')).toBeNull();
  });
});
