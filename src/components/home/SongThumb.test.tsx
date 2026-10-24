import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SongThumb } from './SongThumb';

const ID = 'aaaaaaaaaaa';

describe('SongThumb', () => {
  it('shows the picture YouTube keeps for the video, with the song in its alternative text', () => {
    render(<SongThumb youtubeId={ID} title="Invented Song" />);

    const picture = screen.getByRole('img', { name: 'Capinha de Invented Song' });
    expect(picture).toHaveAttribute('src', 'https://i.ytimg.com/vi/aaaaaaaaaaa/mqdefault.jpg');
    expect(screen.queryByTestId('song-disc')).not.toBeInTheDocument();
  });

  it('loads it only when the card comes on screen, decoded off the main flow, in the 80 x 45 box of the disc', () => {
    render(<SongThumb youtubeId={ID} title="Invented Song" />);

    const picture = screen.getByRole('img');
    expect(picture).toHaveAttribute('loading', 'lazy');
    expect(picture).toHaveAttribute('decoding', 'async');
    expect(picture).toHaveAttribute('width', '80');
    expect(picture).toHaveAttribute('height', '45');
    expect(picture).toHaveClass('rounded-blank');
  });

  it('tells YouTube nothing about where the request comes from: no referrer is sent with it', () => {
    render(<SongThumb youtubeId={ID} title="Invented Song" />);

    expect(screen.getByRole('img')).toHaveAttribute('referrerpolicy', 'no-referrer');
  });

  it('is served by YouTube as it is: nothing is sent through the app to be resized', () => {
    render(<SongThumb youtubeId={ID} title="Invented Song" />);

    const src = screen.getByRole('img').getAttribute('src') ?? '';
    expect(src.startsWith('https://i.ytimg.com/')).toBe(true);
    expect(src).not.toContain('/_next/image');
  });

  it('takes the ids YouTube makes, with their dashes and underscores', () => {
    render(<SongThumb youtubeId="a-b_c-d_e-f" title="Invented Song" />);

    expect(screen.getByRole('img')).toHaveAttribute('src', 'https://i.ytimg.com/vi/a-b_c-d_e-f/mqdefault.jpg');
  });

  it('puts the disc in its place when the picture does not load', () => {
    render(<SongThumb youtubeId={ID} title="Invented Song" />);

    fireEvent.error(screen.getByRole('img'));

    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.getByTestId('song-disc')).toBeInTheDocument();
  });

  it('keeps the disc as the same box the picture was in, 80 x 45 with the same corners', () => {
    render(<SongThumb youtubeId={ID} title="Invented Song" />);
    fireEvent.error(screen.getByRole('img'));

    const disc = screen.getByTestId('song-disc');
    expect(disc).toHaveClass('h-[45px]', 'w-20', 'rounded-blank');
    expect(disc).toHaveAttribute('aria-hidden', 'true');
  });

  // The ids come from a table every member can write to, so one that is not a video id never reaches an address.
  it.each([
    ['too short', 'aaaaaaaaaa'],
    ['too long', 'aaaaaaaaaaaa'],
    ['empty', ''],
    ['a path out of the folder', '../admin?x=1'],
    ['11 characters with a slash in them', 'aaaaa/aaaaa'],
    ['11 characters with a space in them', 'aaaaa aaaaa'],
    ['11 characters with a question mark', 'aaaaa?aaaaa'],
    ['11 characters of another alphabet', 'ã'.repeat(11)],
  ])('shows the disc and asks for no picture when the id is %s', (_case, youtubeId) => {
    render(<SongThumb youtubeId={youtubeId} title="Invented Song" />);

    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(document.querySelector('img')).toBeNull();
    expect(screen.getByTestId('song-disc')).toBeInTheDocument();
  });
});
