import { fireEvent, render, screen } from '@testing-library/react';
import gsap from 'gsap';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { VideoRecord } from '@/lib/lyrics/resolveSong';
import { ModePicker } from './ModePicker';

// jsdom has no animation, so GSAP is only watched: what the picker asks it to animate, and how.
vi.mock('gsap');
const fromTo = vi.mocked(gsap.fromTo);

type Props = Parameters<typeof ModePicker>[0];
type Vars = Record<string, unknown>;

// An invented song, not a real one.
const VIDEO: VideoRecord = {
  youtubeId: 'dQw4w9WgXcQ',
  title: 'Invented Artist - Invented Song (Official Video)',
  channel: 'InventedArtistVEVO',
  durationS: 213,
  ytFetchedAt: '2026-10-21T12:00:00.000Z',
  status: 'ok',
  offsetMs: 0,
};
const SAVED = { mode: 'escolha', difficulty: 'medio', savedAt: 1_800_000_000_000 - 60_000 } as const;

afterEach(() => {
  vi.unstubAllGlobals();
  fromTo.mockClear();
});

function renderPicker(over: Partial<Props> = {}) {
  const props: Props = {
    video: VIDEO,
    onPlay: vi.fn(),
    onCalibrate: vi.fn(),
    onResume: vi.fn(),
    onDiscard: vi.fn(),
    now: 1_800_000_000_000,
    ...over,
  };
  const view = render(<ModePicker {...props} />);
  return { props, ...view };
}

/** What the picker was asked to bring in: the elements, how they start and where they go. */
function cardsAsked() {
  const calls = fromTo.mock.calls as unknown as [HTMLElement[], Vars, Vars][];
  expect(calls).toHaveLength(1);
  const [targets, from, to] = calls[0];
  return { targets, from, to };
}

/** What names a card to a person: its first words. */
function nameOf(card: HTMLElement) {
  return (card.textContent ?? '').slice(0, 24);
}

describe('ModePicker: the cards come in one after another', () => {
  it('brings in the song, then the four modes, in the order they are on the page', () => {
    renderPicker();

    const { targets } = cardsAsked();
    expect(targets.map(nameOf)).toEqual([
      expect.stringContaining('Invented Song'),
      expect.stringContaining('Escolha'),
      expect.stringContaining('Digitação'),
      expect.stringContaining('Karaokê'),
      expect.stringContaining('Monte o verso'),
    ]);
  });

  it('puts the saved game in the sequence too, between the song and the modes', () => {
    renderPicker({ saved: SAVED });

    const { targets } = cardsAsked();
    expect(targets).toHaveLength(6);
    expect(targets[1]).toBe(screen.getByRole('button', { name: 'Continuar de onde parou' }).closest('section'));
    expect(targets.slice(2).map(nameOf)).toEqual([
      expect.stringContaining('Escolha'),
      expect.stringContaining('Digitação'),
      expect.stringContaining('Karaokê'),
      expect.stringContaining('Monte o verso'),
    ]);
  });

  it('rises and fades each one in, one step after the other, with only transform and opacity', () => {
    renderPicker({ saved: SAVED });

    const { from, to } = cardsAsked();
    expect(from.y).toBeGreaterThan(0);
    expect(from.opacity).toBe(0);
    expect(to).toEqual(expect.objectContaining({ y: 0, opacity: 1 }));
    expect(Object.keys(from).sort()).toEqual(['opacity', 'y']);
    expect(Object.keys(to).filter((name) => !['duration', 'ease', 'clearProps', 'stagger'].includes(name)).sort()).toEqual([
      'opacity',
      'y',
    ]);
    const stagger = to.stagger as (index: number) => number;
    expect(stagger(0)).toBe(0);
    expect(stagger(1)).toBeGreaterThan(0);
    expect(stagger(5)).toBeLessThanOrEqual(0.25);
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
    renderPicker({ saved: SAVED });

    const { from, to } = cardsAsked();
    expect(Object.keys(from)).toEqual(['opacity']);
    expect(Object.keys(to)).not.toContain('y');
    expect(Object.keys(to)).not.toContain('stagger');
  });

  it('does not bring the buttons in: “Ajustar o tempo”, the difficulty and “Jogar” are there from the start', () => {
    renderPicker();

    const { targets } = cardsAsked();
    expect(targets.some((card) => card.contains(screen.getByRole('button', { name: 'Jogar' })))).toBe(false);
    expect(targets.some((card) => card.contains(screen.getByRole('radio', { name: 'Fácil' })))).toBe(false);
    expect(targets.some((card) => card.contains(screen.getByRole('button', { name: 'Ajustar o tempo' })))).toBe(false);
  });

  it('does not bring them in again when a mode or a difficulty is picked, or the saved game is dropped', () => {
    const { rerender, props } = renderPicker({ saved: SAVED });

    fireEvent.click(screen.getByRole('radio', { name: /Digitação/ }));
    fireEvent.click(screen.getByRole('radio', { name: 'Difícil' }));
    rerender(<ModePicker {...props} saved={undefined} />);

    expect(screen.queryByRole('button', { name: 'Continuar de onde parou' })).not.toBeInTheDocument();
    expect(fromTo).toHaveBeenCalledOnce();
  });

  it('plays, resumes and starts over as before: a tap is answered at once', () => {
    const { props } = renderPicker({ saved: SAVED });

    fireEvent.click(screen.getByRole('button', { name: 'Continuar de onde parou' }));
    fireEvent.click(screen.getByRole('button', { name: 'Começar do zero' }));
    fireEvent.click(screen.getByRole('radio', { name: /Monte o verso/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Jogar' }));

    expect(props.onResume).toHaveBeenCalledOnce();
    expect(props.onDiscard).toHaveBeenCalledOnce();
    expect(props.onPlay).toHaveBeenCalledExactlyOnceWith('montar', 'facil');
  });

  it('keeps the names the cards have for a screen reader', () => {
    renderPicker({ saved: SAVED });

    expect(screen.getByRole('radio', { name: 'Escolha' })).toHaveAccessibleDescription(/\S/);
    expect(screen.getAllByRole('radio').map((radio) => radio.getAttribute('name'))).toEqual([
      'mode',
      'mode',
      'mode',
      'mode',
      'difficulty',
      'difficulty',
      'difficulty',
    ]);
    expect(screen.getByRole('region', { name: /Partida salva/ })).toBeInTheDocument();
  });
});
