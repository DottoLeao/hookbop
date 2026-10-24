import { render, screen, within } from '@testing-library/react';
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

  it('keeps an id from the database inside the path of the link, and asks YouTube for no picture of it', () => {
    const { container } = render(<SongCard video={{ ...VIDEO, youtubeId: '../admin?x=1' }} />);

    expect(screen.getByRole('link', { name: /Invented Song/ })).toHaveAttribute('href', '/jogar/..%2Fadmin%3Fx%3D1');
    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByTestId('song-disc')).toBeInTheDocument();
  });

  it('is a big target to touch', () => {
    render(<SongCard video={VIDEO} />);

    expect(screen.getByRole('link', { name: /Invented Song/ }).className).toMatch(/\bmin-h-(14|15|16|17|18|19|20)\b/);
  });

  it('shows the cover of its video, named after the song with the tags of the title cleaned off', () => {
    render(<SongCard video={VIDEO} />);

    const link = screen.getByRole('link', { name: /Invented Song/ });
    const picture = within(link).getByRole('img', { name: 'Capinha de Invented Song' });
    expect(picture).toHaveAttribute('src', 'https://i.ytimg.com/vi/aaaaaaaaaaa/mqdefault.jpg');
  });

  it('loads the cover only when the card comes on screen, and never a player just to be listed', () => {
    const { container } = render(<SongCard video={VIDEO} />);

    expect(screen.getByRole('img')).toHaveAttribute('loading', 'lazy');
    expect(container.querySelector('iframe, video')).toBeNull();
  });
});
