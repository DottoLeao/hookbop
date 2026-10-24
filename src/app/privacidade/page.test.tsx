import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import PrivacidadePage from './page';

describe('PrivacidadePage', () => {
  it('has one heading for the whole policy and says when it was updated', () => {
    render(<PrivacidadePage />);

    expect(screen.getByRole('heading', { level: 1, name: 'Política de privacidade' })).toBeInTheDocument();
    expect(screen.getByText('Atualizada em 24 de outubro de 2026.')).toBeInTheDocument();
  });

  it('gives each topic its own heading, in order', () => {
    render(<PrivacidadePage />);

    const headings = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
    expect(headings).toEqual([
      'Quem somos',
      'O que guardamos',
      'Para que usamos',
      'Quem mais recebe dados',
      'O que os outros membros veem',
      'Por quanto tempo',
      'Seus direitos',
      'Idade',
      'Mudanças nesta política',
    ]);
  });

  it('names every service that receives data, and says the AI gets only the verse', () => {
    render(<PrivacidadePage />);

    for (const service of ['Supabase', 'Vercel', 'Google', 'Anthropic', 'YouTube', 'LRCLIB']) {
      expect(screen.getAllByText(new RegExp(service)).length).toBeGreaterThan(0);
    }
    expect(screen.getByText(/só o verso da música e a palavra destacada/)).toBeInTheDocument();
  });

  it('says the player and the covers of the songs on the home screen both come from YouTube', () => {
    render(<PrivacidadePage />);

    const youtube = screen.getByText(/^YouTube:/);
    expect(youtube).toHaveTextContent('os clipes tocam no player oficial do YouTube');
    expect(youtube).toHaveTextContent('As capinhas das músicas na tela inicial também vêm do YouTube.');
  });

  it('says how to reach the person responsible, with a mail link', () => {
    render(<PrivacidadePage />);

    const contact = screen.getByRole('link', { name: 'dottodeveloper@gmail.com' });
    expect(contact).toHaveAttribute('href', 'mailto:dottodeveloper@gmail.com');
  });

  it('leads back to the app', () => {
    render(<PrivacidadePage />);

    expect(screen.getByRole('link', { name: 'Voltar para o Hookbop' })).toHaveAttribute('href', '/');
  });
});
