import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { HomeLinks } from './HomeLinks';

describe('HomeLinks', () => {
  it('lets every member invite friends', () => {
    render(<HomeLinks showAdmin={false} />);

    expect(screen.getByRole('link', { name: 'Convidar' })).toHaveAttribute('href', '/convidar');
  });

  it('shows "Admin" to the owner only', () => {
    const { rerender } = render(<HomeLinks showAdmin={false} />);
    expect(screen.queryByRole('link', { name: 'Admin' })).not.toBeInTheDocument();

    rerender(<HomeLinks showAdmin />);

    expect(screen.getByRole('link', { name: 'Admin' })).toHaveAttribute('href', '/admin');
    expect(screen.getByRole('link', { name: 'Convidar' })).toBeInTheDocument();
  });

  it('shows "Métricas" to the owner only, next to "Admin"', () => {
    const { rerender } = render(<HomeLinks showAdmin={false} />);
    expect(screen.queryByRole('link', { name: 'Métricas' })).not.toBeInTheDocument();
    // Nothing else on the page names the panel or points at it either.
    expect(document.body).not.toHaveTextContent(/m[ée]tricas/i);
    expect(document.querySelector('a[href^="/admin"]')).toBeNull();

    rerender(<HomeLinks showAdmin />);

    expect(screen.getByRole('link', { name: 'Métricas' })).toHaveAttribute('href', '/admin/metricas');
    expect(screen.getAllByRole('link').map((link) => link.textContent)).toEqual([
      'Convidar',
      'Admin',
      'Métricas',
      'Privacidade',
      'Licenças de terceiros',
    ]);
  });

  it('links the third-party licences, in a new tab so an installed app does not lose its way back', () => {
    render(<HomeLinks showAdmin={false} />);

    const licences = screen.getByRole('link', { name: 'Licenças de terceiros' });
    expect(licences).toHaveAttribute('href', '/licencas.txt');
    expect(licences).toHaveAttribute('target', '_blank');
    expect(licences).toHaveAttribute('rel', expect.stringContaining('noopener'));
  });

  it('links the privacy policy', () => {
    render(<HomeLinks showAdmin={false} />);

    expect(screen.getByRole('link', { name: 'Privacidade' })).toHaveAttribute('href', '/privacidade');
  });

  it('keeps every link at least 44 px tall', () => {
    render(<HomeLinks showAdmin />);

    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(5);
    for (const link of links) expect(link.className).toMatch(/\bmin-h-11\b/);
  });
});
