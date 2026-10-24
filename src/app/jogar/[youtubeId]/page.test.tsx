import { render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { track } from '@/lib/metrics/track';
import JogarPage from './page';

// A song can be the first page of a session (a link shared to the app, a song opened from the home screen), so it tells
// the owner's panel the app was opened too (task 13). The song screen is a stand-in.
vi.mock('@/components/game/SongScreen', () => ({
  SongScreen: ({ youtubeId }: { youtubeId: string }) => <p>song {youtubeId}</p>,
}));
vi.mock('next/navigation', () => ({ redirect: vi.fn() }));

/** The page awaits the address behind Suspense, so the song it renders is an async component: run it here. */
async function songOf(youtubeId: string) {
  const suspense = JogarPage({ params: Promise.resolve({ youtubeId }) }) as ReactElement<{ children: ReactElement }>;
  const song = suspense.props.children as ReactElement<unknown, (props: unknown) => Promise<ReactElement>>;
  return song.type(song.props);
}

beforeEach(() => {
  sessionStorage.clear();
  vi.mocked(track).mockClear();
});

describe('JogarPage', () => {
  it('shows the song and tells the owner’s panel the app was opened', async () => {
    render(await songOf('dQw4w9WgXcQ'));

    expect(screen.getByText('song dQw4w9WgXcQ')).toBeInTheDocument();
    expect(track).toHaveBeenCalledWith('app_opened');
  });
});
