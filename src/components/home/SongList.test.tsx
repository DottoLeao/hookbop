import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { VideoRecord } from '@/lib/lyrics/resolveSong';
import { SongList, SongListUnavailable } from './SongList';

function song(id: string, title: string): VideoRecord {
  return {
    youtubeId: id,
    title: `Invented Artist - ${title}`,
    channel: 'Invented Artist',
    durationS: 200,
    ytFetchedAt: '2026-10-20T10:00:00+00:00',
    status: 'ok',
    offsetMs: 0,
  };
}

describe('SongList', () => {
  it('lists the songs of the gang as cards, in the order it was given', () => {
    render(<SongList songs={[song('aaaaaaaaaaa', 'First Invented Song'), song('bbbbbbbbbbb', 'Second Invented Song')]} />);

    expect(screen.getByRole('heading', { name: 'Músicas da galera' })).toBeInTheDocument();
    const cards = within(screen.getByRole('list')).getAllByRole('link');
    expect(cards.map((card) => card.getAttribute('href'))).toEqual(['/jogar/aaaaaaaaaaa', '/jogar/bbbbbbbbbbb']);
    expect(screen.getByText('First Invented Song')).toBeInTheDocument();
    expect(screen.getByText('Second Invented Song')).toBeInTheDocument();
  });

  it('names the list after its heading', () => {
    render(<SongList songs={[song('aaaaaaaaaaa', 'First Invented Song')]} />);

    expect(screen.getByRole('list', { name: 'Músicas da galera' })).toBeInTheDocument();
  });

  it('has DJ Bop invite the first song when nobody played anything yet', () => {
    render(<SongList songs={[]} />);

    expect(screen.getByRole('heading', { name: 'Músicas da galera' })).toBeInTheDocument();
    expect(screen.getByText('Tá silêncio por aqui. Cola a primeira!')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'DJ Bop' })).toBeInTheDocument();
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });
});

describe('SongListUnavailable', () => {
  it('says quietly that the songs did not load, and keeps the heading', () => {
    render(<SongListUnavailable />);

    expect(screen.getByRole('heading', { name: 'Músicas da galera' })).toBeInTheDocument();
    expect(screen.getByText('Não deu pra carregar as músicas agora.')).toBeInTheDocument();
    expect(screen.queryByText('Tá silêncio por aqui. Cola a primeira!')).not.toBeInTheDocument();
  });
});
