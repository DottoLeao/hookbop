import { fireEvent, render, screen, within } from '@testing-library/react';
import gsap from 'gsap';
import { StrictMode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { applyDoubleXp, type PlaysDb } from '@/lib/supabase/plays';
import type { PlaySummary } from '@/lib/types';
import { EndScreen, type EndScreenProps, type SaveStatus } from './EndScreen';

// jsdom has no animation, so GSAP is only watched: what the end screen asks it to animate, and how.
vi.mock('gsap');
const fromTo = vi.mocked(gsap.fromTo);

afterEach(() => {
  vi.unstubAllGlobals();
  fromTo.mockClear();
});

const SUMMARY: PlaySummary = { pct: 92, totalBlanks: 12, firstTryCorrect: 11, maxCombo: 8, xp: 240 };
const SAVED: SaveStatus = { status: 'saved', playId: 'play-1', xp: 120 };

/** The part of the database the end screen reaches: one saved play and the once-only rule of apply_double_xp. */
function fakeDb(xp = 120) {
  const play = { xp, double_xp_used: false };
  const doubleXpOnce = vi.fn<PlaysDb['doubleXpOnce']>(async () => {
    if (!play.double_xp_used) {
      play.xp *= 2;
      play.double_xp_used = true;
    }
    return { xp: play.xp };
  });
  return { play, db: { doubleXpOnce } as unknown as PlaysDb, doubleXpOnce };
}

function setup(over: Partial<EndScreenProps> = {}) {
  const { play, db, doubleXpOnce } = fakeDb();
  const props: EndScreenProps = {
    mode: 'escolha',
    summary: SUMMARY,
    helped: 0,
    save: SAVED,
    doubleXp: 'free',
    onDoubleXp: vi.fn((playId: string) => applyDoubleXp(db, playId)),
    onRetrySave: vi.fn(),
    onPlayAgain: vi.fn(),
    onOtherMode: vi.fn(),
    onFinished: vi.fn(),
    ...over,
  };
  const view = render(<EndScreen {...props} />);
  return { props, play, doubleXpOnce, ...view };
}

const DOUBLE = 'Dobrar o XP · anúncio';

describe('EndScreen: the result', () => {
  it('shows the ring, the blanks and DJ Bop at 92%', () => {
    setup();

    expect(screen.getByRole('img', { name: '92% de acerto' })).toBeInTheDocument();
    expect(screen.getByText('11 de 12 lacunas certas')).toBeInTheDocument();
    expect(screen.getByText('Mandou bem!')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'DJ Bop' })).toBeInTheDocument();
  });

  it('says how many blanks were answered with a hint, which count for nothing (spec §8)', () => {
    setup({ helped: 2 });

    expect(screen.getByText('2 com ajuda')).toBeInTheDocument();
  });

  it('says nothing about help when no hint was used', () => {
    setup({ helped: 0 });

    expect(screen.queryByText(/com ajuda/)).not.toBeInTheDocument();
  });

  it('writes the percentage in the middle of the ring', () => {
    setup();

    expect(within(screen.getByRole('img', { name: '92% de acerto' })).getByText('92%')).toBeInTheDocument();
  });

  it('fills the ring as far as the percentage', () => {
    setup();

    const ring = screen.getByRole('img', { name: '92% de acerto' });
    const [track, arc] = Array.from(ring.querySelectorAll('circle'));
    expect(track).not.toHaveAttribute('stroke-dasharray');
    const [filled, whole] = (arc.getAttribute('stroke-dasharray') ?? '').split(' ').map(Number);
    expect(whole).toBeCloseTo(2 * Math.PI * 60, 0);
    expect(filled / whole).toBeCloseTo(0.92, 2);
  });

  it.each([
    [100, 'Mandou bem!'],
    [92, 'Mandou bem!'],
    [85, 'Mandou bem!'],
    [84, 'Boa! Bora de novo?'],
    [70, 'Boa! Bora de novo?'],
    [60, 'Boa! Bora de novo?'],
    [59, 'Quase! Solta o replay que você pega.'],
    [40, 'Quase! Solta o replay que você pega.'],
    [0, 'Quase! Solta o replay que você pega.'],
  ])('at %i%% DJ Bop says "%s"', (pct, line) => {
    setup({ summary: { ...SUMMARY, pct } });

    expect(screen.getByText(line)).toBeInTheDocument();
    expect(screen.getByRole('img', { name: `${pct}% de acerto` })).toBeInTheDocument();
  });

  it('shows the best combo and the XP the play was saved with', () => {
    setup();

    expect(screen.getByText('x8')).toBeInTheDocument();
    expect(screen.getByText('combo máximo')).toBeInTheDocument();
    // The XP of the summary is before the repeat decay; the saved one is what counts.
    expect(screen.getByText('+120')).toBeInTheDocument();
    expect(screen.getByText('XP')).toBeInTheDocument();
    expect(screen.queryByText('+240')).not.toBeInTheDocument();
  });

  it('leaves out what belongs to parts B and C: challenges, streaks and stickers', () => {
    setup();

    expect(screen.queryByText(/desafi/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/ofensiva/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/figurinha/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/acertou|errou/i)).not.toBeInTheDocument();
  });

  it('shows only DJ Bop and the buttons after Karaokê: no ring, no score, no XP', () => {
    setup({ mode: 'karaoke', summary: { pct: 0, totalBlanks: 0, firstTryCorrect: 0, maxCombo: 0, xp: 0 }, save: { status: 'saved', playId: 'p', xp: 0 } });

    expect(screen.getByText('Mandou bem!')).toBeInTheDocument();
    expect(screen.queryByRole('img', { name: /de acerto/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/%/)).not.toBeInTheDocument();
    expect(screen.queryByText(/lacunas/)).not.toBeInTheDocument();
    expect(screen.queryByText('combo máximo')).not.toBeInTheDocument();
    expect(screen.queryByText('XP')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: DOUBLE })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Jogar de novo' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Outro modo' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Outra música' })).toBeInTheDocument();
  });

  it('shows the buttons without a percentage when a game in another mode had no blanks', () => {
    setup({ summary: { pct: 0, totalBlanks: 0, firstTryCorrect: 0, maxCombo: 0, xp: 0 }, save: { status: 'saved', playId: 'p', xp: 0 } });

    expect(screen.queryByRole('img', { name: /de acerto/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/%/)).not.toBeInTheDocument();
    expect(screen.queryByText(/lacunas/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: DOUBLE })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Jogar de novo' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Outro modo' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Outra música' })).toBeInTheDocument();
  });
});

describe('EndScreen: the heading and the focus', () => {
  it("has DJ Bop's line as its heading, and names the result after it", () => {
    setup();

    expect(screen.getByRole('heading', { level: 1, name: 'Mandou bem!' })).toBeInTheDocument();
    const result = screen.getByRole('region', { name: 'Mandou bem!' });
    expect(result).toContainElement(screen.getByRole('button', { name: 'Jogar de novo' }));
  });

  it('has a heading after Karaokê too, where the line is all there is of a score', () => {
    setup({ mode: 'karaoke' });

    expect(screen.getByRole('heading', { level: 1, name: 'Mandou bem!' })).toBeInTheDocument();
  });

  it('moves the focus to the result when it appears, without scrolling, so a screen reader reads it', () => {
    const focus = vi.spyOn(HTMLElement.prototype, 'focus');
    setup();

    const result = screen.getByRole('region', { name: 'Mandou bem!' });
    expect(result).toHaveAttribute('tabindex', '-1');
    expect(result).toHaveFocus();
    expect(focus).toHaveBeenCalledWith({ preventScroll: true });
    focus.mockRestore();
  });

  it('does not take the focus back when the save comes in later', () => {
    const { props, rerender } = setup({ save: { status: 'saving' } });
    const playAgain = screen.getByRole('button', { name: 'Jogar de novo' });
    playAgain.focus();

    rerender(<EndScreen {...props} save={SAVED} />);

    expect(playAgain).toHaveFocus();
  });
});

describe('EndScreen: the ring fills and the result comes in', () => {
  type Vars = Record<string, unknown>;

  /** Every animation the screen asked GSAP for: what it moves, how it starts and where it goes. */
  function animations() {
    const calls = fromTo.mock.calls as unknown as [Element | Element[], Vars, Vars][];
    return calls.map(([target, from, to]) => ({ targets: [target].flat(), from, to }));
  }

  function ringOf(pct: number) {
    return screen.getByRole('img', { name: `${pct}% de acerto` });
  }

  function reduceMotion() {
    vi.stubGlobal(
      'matchMedia',
      vi.fn((query: string) => ({
        matches: query === '(prefers-reduced-motion: reduce)',
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    );
  }

  /** The circle that draws the arc of the ring, the one after the track. */
  function arcOf(pct: number) {
    return Array.from(ringOf(pct).querySelectorAll('circle'))[1];
  }

  it('fills the ring: the arc is drawn by its dash offset, from none of it to all of it, as far as the result (ruling S34)', () => {
    setup();

    const arc = arcOf(92);
    const [fill, ...more] = animations().filter(({ targets }) => targets.includes(arc));
    expect(more).toHaveLength(0);
    // The arc is as long as the result, and it is that long that the offset starts from, so none of it shows at first.
    const [filled] = (arc.getAttribute('stroke-dasharray') ?? '').split(' ').map(Number);
    expect(filled).toBeGreaterThan(0);
    expect(fill.from.strokeDashoffset).toBeCloseTo(filled, 5);
    expect(fill.to).toEqual(expect.objectContaining({ strokeDashoffset: 0 }));
    expect(Object.keys(fill.from)).toEqual(['strokeDashoffset']);
    expect(fill.to.clearProps).toBe('strokeDashoffset');
    expect(fill.to.duration).toBeLessThanOrEqual(1);
  });

  it('fills a ring as far as its own result: a short arc starts its offset from a short length', () => {
    setup({ summary: { ...SUMMARY, pct: 20, firstTryCorrect: 2 } });

    const arc = arcOf(20);
    const [filled] = (arc.getAttribute('stroke-dasharray') ?? '').split(' ').map(Number);
    const fill = animations().find(({ targets }) => targets.includes(arc))!;
    expect(fill.from.strokeDashoffset).toBeCloseTo(filled, 5);
    expect(filled / (2 * Math.PI * 60)).toBeCloseTo(0.2, 2);
  });

  it('leaves the arc itself as it was: the same circle, with the same dash and the same turn to start from the top', () => {
    setup();

    const [track, arc] = Array.from(ringOf(92).querySelectorAll('circle'));
    expect(track.getAttribute('transform')).toBeNull();
    expect(arc.getAttribute('transform')).toBe('rotate(-90 70 70)');
    expect(arc.getAttribute('stroke-linecap')).toBe('round');
    expect(arc.getAttribute('stroke-dasharray')).toMatch(/^\d/);
    expect(arc).toHaveClass('stroke-lime');
    expect(arc.parentElement).toBe(ringOf(92));
    expect(ringOf(92)).toHaveAttribute('aria-label', '92% de acerto');
  });

  it('has no arc to fill at 0%, where the ring is only its track', () => {
    setup({ summary: { ...SUMMARY, pct: 0, firstTryCorrect: 0 } });

    expect(ringOf(0).querySelectorAll('circle')).toHaveLength(1);
    expect(animations().some(({ from }) => 'strokeDashoffset' in from)).toBe(false);
  });

  it('draws the ring at its final value from the first frame, and only fades it in, when motion is reduced', () => {
    reduceMotion();
    setup();

    const arc = arcOf(92);
    const fill = animations().find(({ targets }) => targets.includes(arc))!;
    expect(Object.keys(fill.from)).toEqual(['opacity']);
    expect(Object.keys(fill.to)).not.toContain('strokeDashoffset');
    // The dash is the final one and nothing sets an offset: all of the arc is there.
    const [filled, whole] = (arc.getAttribute('stroke-dasharray') ?? '').split(' ').map(Number);
    expect(filled / whole).toBeCloseTo(0.92, 2);
    expect(arc.style.strokeDashoffset).toBe('');
  });

  it('brings the ring, DJ Bop’s line, the numbers and the Dobrar o XP spot in one after another, in the order of the page', () => {
    setup();

    const blocks = animations().find(({ targets }) => targets.length > 1)!;
    expect(blocks.targets).toHaveLength(4);
    const [ring, dj, numbers, double] = blocks.targets as HTMLElement[];
    expect(ring).toContainElement(ringOf(92) as unknown as HTMLElement);
    expect(dj).toContainElement(screen.getByRole('heading', { name: 'Mandou bem!' }));
    expect(numbers).toHaveTextContent('combo máximo');
    expect(double).toContainElement(screen.getByRole('button', { name: DOUBLE }));
    expect(blocks.from.y).toBeGreaterThan(0);
    expect(blocks.from.opacity).toBe(0);
    expect(blocks.to).toEqual(expect.objectContaining({ y: 0, opacity: 1 }));
    const stagger = blocks.to.stagger as (index: number) => number;
    expect(stagger(0)).toBe(0);
    expect(stagger(3)).toBeGreaterThan(stagger(1));
  });

  it('brings only DJ Bop’s line in after Karaokê, where there is no ring and no number', () => {
    setup({ mode: 'karaoke', summary: { pct: 0, totalBlanks: 0, firstTryCorrect: 0, maxCombo: 0, xp: 0 } });

    expect(animations()).toHaveLength(1);
    const [blocks] = animations();
    expect(blocks.targets).toHaveLength(1);
    expect(blocks.targets[0]).toContainElement(screen.getByRole('heading', { name: 'Mandou bem!' }));
  });

  it('does not bring the buttons in: they answer a tap from the first frame', () => {
    const { props } = setup();

    for (const control of [
      screen.getByRole('button', { name: 'Jogar de novo' }),
      screen.getByRole('button', { name: 'Outro modo' }),
      screen.getByRole('link', { name: 'Outra música' }),
    ]) {
      expect(animations().some(({ targets }) => targets.some((target) => target.contains(control)))).toBe(false);
    }
    fireEvent.click(screen.getByRole('button', { name: 'Jogar de novo' }));
    expect(props.onPlayAgain).toHaveBeenCalledOnce();
  });

  it('changes nothing but transform and opacity, the ring’s fill apart, and leaves none of it on the page once it is over', () => {
    setup();

    expect(animations().length).toBeGreaterThan(0);
    for (const { targets, from, to } of animations()) {
      const named = [...Object.keys(from), ...Object.keys(to)].filter(
        (name) => !['duration', 'ease', 'clearProps', 'stagger'].includes(name),
      );
      if (targets.includes(arcOf(92))) {
        // Ruling S34: the one exception, paint only, on the one small SVG.
        expect([...new Set(named)]).toEqual(['strokeDashoffset']);
        continue;
      }
      expect([...new Set(named)].every((name) => ['opacity', 'y'].includes(name))).toBe(true);
      expect(to.clearProps).toEqual(expect.stringContaining('transform'));
      expect(to.clearProps).toEqual(expect.stringContaining('opacity'));
    }
  });

  it('only fades, the ring and the rest, when motion is reduced', () => {
    reduceMotion();
    setup();

    expect(animations()).toHaveLength(2);
    for (const { from, to } of animations()) {
      expect(Object.keys(from)).toEqual(['opacity']);
      expect(Object.keys(to)).not.toContain('y');
      expect(Object.keys(to)).not.toContain('strokeDashoffset');
      expect(Object.keys(to)).not.toContain('stagger');
    }
  });

  it('does not start again when the save comes in or the XP is doubled', async () => {
    const { props, rerender } = setup({ save: { status: 'saving' } });
    const before = fromTo.mock.calls.length;

    rerender(<EndScreen {...props} save={SAVED} />);
    fireEvent.click(await screen.findByRole('button', { name: DOUBLE }));
    await screen.findByRole('button', { name: 'XP dobrado' });

    expect(fromTo.mock.calls).toHaveLength(before);
  });

  it('keeps the focus on the result when it comes in: a transition does not take it, nor hold it back', () => {
    setup();

    expect(screen.getByRole('region', { name: 'Mandou bem!' })).toHaveFocus();
  });
});

describe('EndScreen: the buttons', () => {
  it('plays again, picks another mode, or goes back to the home page', () => {
    const { props } = setup();

    fireEvent.click(screen.getByRole('button', { name: 'Jogar de novo' }));
    expect(props.onPlayAgain).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Outro modo' }));
    expect(props.onOtherMode).toHaveBeenCalledTimes(1);

    expect(screen.getByRole('link', { name: 'Outra música' })).toHaveAttribute('href', '/');
  });

  it('keeps every control at least 44 px tall', () => {
    setup({ save: { status: 'failed' } });

    const controls = [...screen.getAllByRole('button'), ...screen.getAllByRole('link')];
    expect(controls.length).toBeGreaterThanOrEqual(5);
    for (const control of controls) {
      expect(control.className).toMatch(/\bmin-h-(11|12|13|14)\b/);
    }
  });
});

describe('EndScreen: Dobrar o XP', () => {
  it('is a dashed lime spot, as every ad spot is', () => {
    setup();

    expect(screen.getByRole('button', { name: DOUBLE })).toHaveClass('border-dashed', 'border-lime');
  });

  it('with the free entitlement doubles the XP shown, once, and writes double_xp_used', async () => {
    const { play, doubleXpOnce } = setup({ doubleXp: 'free' });
    expect(screen.getByText('+120')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: DOUBLE }));

    expect(await screen.findByText('+240')).toBeInTheDocument();
    expect(screen.queryByText('+120')).not.toBeInTheDocument();
    expect(play).toEqual({ xp: 240, double_xp_used: true });
    expect(doubleXpOnce).toHaveBeenCalledTimes(1);
    expect(doubleXpOnce).toHaveBeenCalledWith('play-1');
  });

  it('shows as used afterwards, and another tap does nothing', async () => {
    const { play, doubleXpOnce } = setup();

    fireEvent.click(screen.getByRole('button', { name: DOUBLE }));
    await screen.findByText('+240');

    expect(screen.queryByRole('button', { name: DOUBLE })).not.toBeInTheDocument();
    const used = screen.getByRole('button', { name: 'XP dobrado' });
    expect(used).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(used);

    expect(doubleXpOnce).toHaveBeenCalledTimes(1);
    expect(play.xp).toBe(240);
    expect(screen.getByText('+240')).toBeInTheDocument();
  });

  it('takes two quick taps as one', async () => {
    const { doubleXpOnce } = setup();
    const button = screen.getByRole('button', { name: DOUBLE });

    fireEvent.click(button);
    fireEvent.click(button);
    await screen.findByText('+240');

    expect(doubleXpOnce).toHaveBeenCalledTimes(1);
  });

  it('shows what the database gives back, even when the XP had been doubled before', async () => {
    // Another tab (or an earlier try whose answer got lost) doubled it already: the database gives 240 back, not 480.
    const onDoubleXp = vi.fn(async () => ({ xp: 240 }));
    setup({ onDoubleXp });

    fireEvent.click(screen.getByRole('button', { name: DOUBLE }));

    expect(await screen.findByText('+240')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'XP dobrado' })).toBeInTheDocument();
  });

  it('says so quietly and can be tried again when the doubling fails', async () => {
    const onDoubleXp = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({ xp: 240 });
    setup({ onDoubleXp });

    fireEvent.click(screen.getByRole('button', { name: DOUBLE }));

    expect(await screen.findByText('Não rolou dobrar. Tenta de novo?')).toBeInTheDocument();
    expect(screen.getByText('+120')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: DOUBLE }));

    expect(await screen.findByText('+240')).toBeInTheDocument();
    expect(screen.queryByText('Não rolou dobrar. Tenta de novo?')).not.toBeInTheDocument();
    expect(onDoubleXp).toHaveBeenCalledTimes(2);
  });

  it('is off, but still on screen with its lime dashed border, behind an ad (there is no ad SDK in part A)', () => {
    const { props } = setup({ doubleXp: 'ad' });

    const button = screen.getByRole('button', { name: DOUBLE });
    expect(button).toHaveAttribute('aria-disabled', 'true');
    expect(button).toHaveClass('border-dashed', 'border-lime');
    fireEvent.click(button);

    expect(screen.getByText('+120')).toBeInTheDocument();
    expect(props.onDoubleXp).not.toHaveBeenCalled();
  });

  it('is not there when nobody gets it', () => {
    setup({ doubleXp: 'off' });

    expect(screen.queryByRole('button', { name: DOUBLE })).not.toBeInTheDocument();
  });

  it('is not offered for a play that earned no XP', () => {
    setup({ save: { status: 'saved', playId: 'play-1', xp: 0 } });

    expect(screen.getByText('+0')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: DOUBLE })).not.toBeInTheDocument();
  });
});

describe('EndScreen: saving the play', () => {
  it('shows no XP number until the play is saved, and cannot double yet (it needs the play)', () => {
    const { props } = setup({ save: { status: 'saving' } });

    expect(screen.getByRole('img', { name: '92% de acerto' })).toBeInTheDocument();
    expect(screen.getByText('…')).toBeInTheDocument();
    expect(screen.queryByText(/^\+/)).not.toBeInTheDocument();
    const button = screen.getByRole('button', { name: DOUBLE });
    expect(button).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(button);
    expect(props.onDoubleXp).not.toHaveBeenCalled();
  });

  it('shows the XP and the button as soon as the save comes back', () => {
    const { rerender, props } = setup({ save: { status: 'saving' } });

    rerender(<EndScreen {...props} save={SAVED} />);

    expect(screen.getByText('+120')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: DOUBLE })).not.toHaveAttribute('aria-disabled', 'true');
  });

  it('still shows the result when the save failed, with a quiet line and a way to try again', () => {
    const { props } = setup({ save: { status: 'failed' } });

    expect(screen.getByRole('img', { name: '92% de acerto' })).toBeInTheDocument();
    expect(screen.getByText('11 de 12 lacunas certas')).toBeInTheDocument();
    expect(screen.getByText('Mandou bem!')).toBeInTheDocument();
    expect(screen.getByText('x8')).toBeInTheDocument();
    expect(screen.getByText('–')).toBeInTheDocument();
    expect(screen.getByText('Essa partida ainda não foi salva.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Tentar salvar de novo' }));
    expect(props.onRetrySave).toHaveBeenCalledTimes(1);
  });

  it('cannot double the XP of a play that is not saved', () => {
    const { props } = setup({ save: { status: 'failed' } });

    const button = screen.getByRole('button', { name: DOUBLE });
    expect(button).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(button);

    expect(props.onDoubleXp).not.toHaveBeenCalled();
  });

  it('says nothing about saving when it went well', () => {
    setup();

    expect(screen.queryByRole('button', { name: 'Tentar salvar de novo' })).not.toBeInTheDocument();
    expect(screen.queryByText('Essa partida ainda não foi salva.')).not.toBeInTheDocument();
  });

  it('offers the retry after Karaokê too, since a Karaokê game is saved (with 0 XP) like any other', () => {
    setup({ mode: 'karaoke', save: { status: 'failed' } });

    expect(screen.getByRole('button', { name: 'Tentar salvar de novo' })).toBeInTheDocument();
  });
});

describe('EndScreen: the first finish', () => {
  it('tells the song screen once when it appears', () => {
    const { props, rerender } = setup();

    expect(props.onFinished).toHaveBeenCalledTimes(1);
    rerender(<EndScreen {...props} save={{ status: 'saved', playId: 'play-1', xp: 5 }} />);
    expect(props.onFinished).toHaveBeenCalledTimes(1);
  });

  it('is still once under StrictMode', () => {
    const onFinished = vi.fn();
    render(
      <StrictMode>
        <EndScreen
          mode="escolha"
          summary={SUMMARY}
          helped={0}
          save={SAVED}
          doubleXp="free"
          onDoubleXp={async () => ({ xp: 0 })}
          onRetrySave={() => {}}
          onPlayAgain={() => {}}
          onOtherMode={() => {}}
          onFinished={onFinished}
        />
      </StrictMode>,
    );

    expect(onFinished).toHaveBeenCalledTimes(1);
  });

  it('tells it after a Karaokê game too', () => {
    const { props } = setup({ mode: 'karaoke' });

    expect(props.onFinished).toHaveBeenCalledTimes(1);
  });
});
