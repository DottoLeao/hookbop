import { render, screen, within } from '@testing-library/react';
import gsap from 'gsap';
import { renderToString } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { VideoRecord } from '@/lib/lyrics/resolveSong';
import { SongList, SongListUnavailable } from './SongList';

// jsdom has no animation, so GSAP is only watched: what the list asks it to animate, and how.
vi.mock('gsap');
const fromTo = vi.mocked(gsap.fromTo);

type Vars = Record<string, unknown>;

afterEach(() => {
  vi.unstubAllGlobals();
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

describe('SongList: the cards come in one after another', () => {
  const SONGS = [
    song('aaaaaaaaaaa', 'First Invented Song'),
    song('bbbbbbbbbbb', 'Second Invented Song'),
    song('ccccccccccc', 'Third Invented Song'),
  ];

  function asked() {
    const calls = fromTo.mock.calls as unknown as [HTMLElement[], Vars, Vars][];
    expect(calls).toHaveLength(1);
    const [targets, from, to] = calls[0];
    return { targets, from, to };
  }

  it('brings every card in, in the order of the list, with a rise and a fade one step after the other', () => {
    render(<SongList songs={SONGS} />);

    const { targets, from, to } = asked();
    expect(targets).toEqual(within(screen.getByRole('list')).getAllByRole('listitem'));
    expect(from.y).toBeGreaterThan(0);
    expect(from.opacity).toBe(0);
    expect(to).toEqual(expect.objectContaining({ y: 0, opacity: 1 }));
    const stagger = to.stagger as (index: number) => number;
    expect(stagger(0)).toBe(0);
    expect(stagger(2)).toBeGreaterThan(stagger(1));
  });

  it('changes nothing but transform and opacity, and leaves none of it on the cards when it is over', () => {
    render(<SongList songs={SONGS} />);

    const { from, to } = asked();
    expect(Object.keys(from).sort()).toEqual(['opacity', 'y']);
    expect(Object.keys(to).filter((name) => !['duration', 'ease', 'clearProps', 'stagger'].includes(name)).sort()).toEqual([
      'opacity',
      'y',
    ]);
    expect(to.clearProps).toEqual(expect.stringContaining('transform'));
    expect(to.clearProps).toEqual(expect.stringContaining('opacity'));
    expect(to.duration).toBeLessThanOrEqual(0.33);
  });

  it('only fades them, all together, when motion is reduced', () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn((query: string) => ({
        matches: query === '(prefers-reduced-motion: reduce)',
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    );
    render(<SongList songs={SONGS} />);

    const { from, to } = asked();
    expect(Object.keys(from)).toEqual(['opacity']);
    expect(Object.keys(to)).not.toContain('y');
    expect(Object.keys(to)).not.toContain('stagger');
  });

  it('is drawn out of sight on the server, so the cards never show for a moment before they come in', () => {
    const html = renderToString(<SongList songs={SONGS} />);

    expect(html.match(/<li style="opacity:0"/g)).toHaveLength(3);
  });

  it('brings the cards in again for a list with other songs in it, and not for the same list', () => {
    const { rerender } = render(<SongList songs={SONGS} />);
    expect(fromTo).toHaveBeenCalledTimes(1);

    rerender(<SongList songs={[...SONGS]} />);
    expect(fromTo).toHaveBeenCalledTimes(1);

    rerender(<SongList songs={[song('ddddddddddd', 'Fourth Invented Song'), ...SONGS]} />);
    expect(fromTo).toHaveBeenCalledTimes(2);
    expect((fromTo.mock.calls.at(-1)![0] as unknown as HTMLElement[]).length).toBe(4);
  });

  it('leaves the invitation and the quiet line as they are: nothing to bring in', () => {
    render(<SongList songs={[]} />);
    render(<SongListUnavailable />);

    expect(fromTo).not.toHaveBeenCalled();
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
