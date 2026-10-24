import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { track } from '@/lib/metrics/track';
import Home from './page';

// The home page is for members: opening it is opening the app (task 13). Its parts that read the database are
// stand-ins; the page itself and `AppOpened` are the real ones.
vi.mock('@/components/home/HomeSections', () => ({
  GangSongs: () => null,
  HomeShortcuts: () => null,
  PasteLinkWithShareError: () => <p>paste box</p>,
}));
vi.mock('@/components/home/HomeLinks', () => ({ HomeLinks: () => null }));
vi.mock('@/components/home/PasteLink', () => ({ PasteLink: () => <p>paste box</p> }));
vi.mock('@/components/pwa/InstallPromptGate', () => ({ InstallPromptGate: () => null }));

beforeEach(() => {
  sessionStorage.clear();
  vi.mocked(track).mockClear();
});

describe('Home', () => {
  it('tells the owner’s panel the app was opened', async () => {
    render(<Home searchParams={Promise.resolve({})} />);

    expect(await screen.findByText('paste box')).toBeInTheDocument();
    expect(track).toHaveBeenCalledWith('app_opened');
  });
});
