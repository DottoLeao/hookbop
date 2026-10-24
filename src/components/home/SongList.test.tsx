import { render, screen, within } from '@testing-library/react';
import gsap from 'gsap';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderToString } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { VideoRecord } from '@/lib/lyrics/resolveSong';
import { SongList, SongListUnavailable } from './SongList';

// The list comes in by CSS, with no script: GSAP is mocked only to see that the list never asks it for anything.
vi.mock('gsap');
const fromTo = vi.mocked(gsap.fromTo);

afterEach(() => {
  fromTo.mockClear();
});

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

describe('SongList: the cards come in one after another, by CSS alone (ruling S35)', () => {
  const SONGS = [
    song('aaaaaaaaaaa', 'First Invented Song'),
    song('bbbbbbbbbbb', 'Second Invented Song'),
    song('ccccccccccc', 'Third Invented Song'),
  ];

  const cards = () => within(screen.getByRole('list')).getAllByRole('listitem');
  const place = (card: HTMLElement) => Number(card.style.getPropertyValue('--i'));

  it('marks every card for the entrance, and says where it is in the sequence through --i, in the order of the list', () => {
    render(<SongList songs={SONGS} />);

    expect(cards()).toHaveLength(3);
    for (const card of cards()) expect(card).toHaveClass('card-in');
    expect(cards().map(place)).toEqual([0, 1, 2]);
  });

  it('keeps the sequence short: past the sixth card they all start together', () => {
    const many = Array.from({ length: 12 }, (_, i) => song(`${String.fromCharCode(97 + i).repeat(11)}`, `Invented Song ${i}`));
    render(<SongList songs={many} />);

    const places = cards().map(place);
    expect(places.slice(0, 6)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(Math.max(...places)).toBe(5);
    expect(places.slice(5)).toEqual(Array(7).fill(5));
  });

  it('puts the place in the page the server sends, in the style of each card, for the CSS to play before any script', () => {
    const html = renderToString(<SongList songs={SONGS} />);

    expect(html.match(/<li class="card-in" style="--i:\d"/g)).toEqual([
      '<li class="card-in" style="--i:0"',
      '<li class="card-in" style="--i:1"',
      '<li class="card-in" style="--i:2"',
    ]);
  });

  it('draws no card out of sight itself: nothing inline hides it, so no card is blank until a script runs', () => {
    const html = renderToString(<SongList songs={SONGS} />);

    expect(html).not.toMatch(/opacity|visibility|display:none/);
  });

  it('uses no script to do it: GSAP is not asked for anything, and the list is a server component', () => {
    render(<SongList songs={SONGS} />);

    expect(fromTo).not.toHaveBeenCalled();
    const source = readFileSync(join(process.cwd(), 'src/components/home/SongList.tsx'), 'utf8');
    expect(source).not.toMatch(/^\s*['"]use client['"]/m);
    expect(source).not.toMatch(/motion\/transitions|from 'gsap'|useGSAP/);
  });

  it('leaves the invitation and the quiet line as they are: nothing to bring in', () => {
    render(<SongList songs={[]} />);
    render(<SongListUnavailable />);

    expect(document.querySelector('.card-in')).toBeNull();
  });

  it('keeps the links, the heading and the names of the list', () => {
    render(<SongList songs={SONGS} />);

    expect(screen.getByRole('list', { name: 'Músicas da galera' })).toBeInTheDocument();
    expect(within(screen.getByRole('list')).getAllByRole('link').map((card) => card.getAttribute('href'))).toEqual([
      '/jogar/aaaaaaaaaaa',
      '/jogar/bbbbbbbbbbb',
      '/jogar/ccccccccccc',
    ]);
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
