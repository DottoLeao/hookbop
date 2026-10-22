import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { VideoRecord } from '@/lib/lyrics/resolveSong';
import { SongCard } from './SongCard';

const VIDEO: VideoRecord = {
  youtubeId: 'aaaaaaaaaaa',
  title: 'Invented Artist - Invented Song (Official Video)',
  channel: 'InventedArtistVEVO',
  durationS: 185,
  ytFetchedAt: '2026-10-20T10:00:00+00:00',
  status: 'ok',
  offsetMs: 0,
};

describe('SongCard', () => {
  it('shows the song, the artist and how long it is, with the tags of the video title cleaned off', () => {
    render(<SongCard video={VIDEO} />);

    expect(screen.getByText('Invented Song')).toBeInTheDocument();
    expect(screen.getByText('Invented Artist · 3:05')).toBeInTheDocument();
    expect(screen.queryByText(/Official/)).not.toBeInTheDocument();
  });

  it('opens the song screen of that video', () => {
    render(<SongCard video={VIDEO} />);

    const card = screen.getByRole('link', { name: /Invented Song/ });
    expect(card).toHaveAttribute('href', '/jogar/aaaaaaaaaaa');
    expect(card).toHaveTextContent('Jogar');
  });

  it('keeps an id from the database inside the path of the link', () => {
    render(<SongCard video={{ ...VIDEO, youtubeId: '../admin?x=1' }} />);

    expect(screen.getByRole('link', { name: /Invented Song/ })).toHaveAttribute('href', '/jogar/..%2Fadmin%3Fx%3D1');
  });

  it('is a big target to touch', () => {
    render(<SongCard video={VIDEO} />);

    expect(screen.getByRole('link', { name: /Invented Song/ }).className).toMatch(/\bmin-h-(14|15|16|17|18|19|20)\b/);
  });

  it('does not load anything from YouTube just to be listed', () => {
    const { container } = render(<SongCard video={VIDEO} />);

    expect(container.querySelector('img, iframe')).toBeNull();
  });
});
