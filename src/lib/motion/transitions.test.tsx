import { fireEvent, render, screen } from '@testing-library/react';
import gsap from 'gsap';
import { useRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useCardsIn, useRingFill, useScreenSwap, useSheetEnter } from './transitions';

// The real GSAP, in jsdom: nothing plays here, but the tweens are made, started, killed and reverted for real.

/** What a tween was asked to start from and to go to, as GSAP keeps it. */
function asked(tween: gsap.core.Tween) {
  const { startAt, ...to } = tween.vars as Record<string, unknown> & { startAt?: Record<string, unknown> };
  return { from: startAt ?? {}, to: to as Record<string, unknown> };
}

/** What tells GSAP how to run it, not what to change. */
const HOW = ['duration', 'ease', 'delay', 'clearProps', 'svgOrigin', 'transformOrigin', 'immediateRender', 'overwrite', 'parent', 'startAt'];

function changed(tween: gsap.core.Tween): string[] {
  const { from, to } = asked(tween);
  return [...new Set([...Object.keys(from), ...Object.keys(to)])].filter((name) => !HOW.includes(name));
}

/** The phone's "reduzir movimento" setting, read through matchMedia. */
function preferReducedMotion(reduce: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: reduce && query === '(prefers-reduced-motion: reduce)',
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
}

// The real thing, only watched: what the transitions ask of GSAP (`fromTo` is the one call they use).
const fromTo = vi.spyOn(gsap, 'fromTo');

afterEach(() => {
  gsap.globalTimeline.clear();
  vi.unstubAllGlobals();
  fromTo.mockClear();
});

function Sheet({ onTap }: { onTap?: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useSheetEnter(ref);
  return (
    <div ref={ref} role="dialog" aria-label="Folha" tabIndex={-1}>
      <button type="button" onClick={onTap}>
        Pronto
      </button>
    </div>
  );
}

describe('useSheetEnter', () => {
  it('rises the sheet from below its place, fading in, in no more than 0.3 s, as it opens', () => {
    render(<Sheet />);

    const [tween] = gsap.getTweensOf(screen.getByRole('dialog'));
    const { from, to } = asked(tween);
    expect(from.y).toBeGreaterThan(0);
    expect(from.opacity).toBe(0);
    expect(to).toEqual(expect.objectContaining({ y: 0, opacity: 1 }));
    expect(tween.duration()).toBeLessThanOrEqual(0.3);
    expect(tween.delay()).toBe(0);
  });

  it('changes nothing but transform and opacity', () => {
    render(<Sheet />);

    const [tween] = gsap.getTweensOf(screen.getByRole('dialog'));
    expect(changed(tween).sort()).toEqual(['opacity', 'y']);
  });

  it('only fades when motion is reduced, with no movement at all', () => {
    preferReducedMotion(true);
    render(<Sheet />);

    const sheet = screen.getByRole('dialog');
    const [tween] = gsap.getTweensOf(sheet);
    expect(changed(tween)).toEqual(['opacity']);
    expect(sheet.style.transform).toBe('');
    expect(Number(gsap.getProperty(sheet, 'y'))).toBe(0);
  });

  it('lets the sheet be tapped from its first frame: nothing waits for the rise to end', () => {
    const onTap = vi.fn();
    render(<Sheet onTap={onTap} />);
    const sheet = screen.getByRole('dialog');
    expect(gsap.getTweensOf(sheet)[0].isActive() || gsap.getTweensOf(sheet)[0].progress() === 0).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: 'Pronto' }));

    expect(onTap).toHaveBeenCalledOnce();
    expect(sheet.style.pointerEvents).toBe('');
    expect(sheet).not.toHaveAttribute('hidden');
    expect(sheet).not.toHaveAttribute('inert');
    expect(sheet).not.toHaveAttribute('aria-hidden');
  });

  it('leaves no tween and no style behind when the sheet goes away mid-rise', () => {
    const { unmount } = render(<Sheet />);
    const sheet = screen.getByRole('dialog');
    expect(sheet.style.opacity).toBe('0');

    unmount();

    expect(gsap.getTweensOf(sheet)).toHaveLength(0);
    expect(sheet.getAttribute('style') ?? '').toBe('');
  });

  it('leaves its attributes alone: only the style changes', () => {
    render(<Sheet />);

    const sheet = screen.getByRole('dialog');
    expect(sheet.getAttributeNames().filter((name) => name !== 'style').sort()).toEqual(['aria-label', 'role', 'tabindex']);
  });
});

function Screen({ screen: which }: { screen: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useScreenSwap(ref, which);
  return (
    <div ref={ref} data-testid="screen">
      {which}
    </div>
  );
}

describe('useScreenSwap', () => {
  it('does not animate the screen that is there when it first renders', () => {
    render(<Screen screen="loading" />);

    expect(gsap.getTweensOf(screen.getByTestId('screen'))).toHaveLength(0);
    expect(screen.getByTestId('screen').getAttribute('style') ?? '').toBe('');
  });

  it('brings the next screen in, down into place from a few px below, in no more than 0.3 s', () => {
    const { rerender } = render(<Screen screen="loading" />);

    rerender(<Screen screen="picker" />);

    const [tween] = gsap.getTweensOf(screen.getByTestId('screen'));
    const { from, to } = asked(tween);
    expect(from.y).toBeGreaterThan(0);
    expect(from.y).toBeLessThanOrEqual(12);
    expect(from.opacity).toBe(0);
    expect(to).toEqual(expect.objectContaining({ y: 0, opacity: 1 }));
    expect(tween.duration()).toBeLessThanOrEqual(0.3);
    expect(changed(tween).sort()).toEqual(['opacity', 'y']);
  });

  it('does not animate when the screen stays the same', () => {
    const { rerender } = render(<Screen screen="picker" />);

    rerender(<Screen screen="picker" />);

    expect(gsap.getTweensOf(screen.getByTestId('screen'))).toHaveLength(0);
  });

  it('kills a transition still running when the screen changes again, and starts over: they never queue', () => {
    const { rerender } = render(<Screen screen="loading" />);
    rerender(<Screen screen="picker" />);
    const [first] = gsap.getTweensOf(screen.getByTestId('screen'));

    rerender(<Screen screen="game" />);

    const now = gsap.getTweensOf(screen.getByTestId('screen'));
    expect(now).toHaveLength(1);
    expect(now[0]).not.toBe(first);
    expect(first.isActive()).toBe(false);
  });

  it('only fades when motion is reduced', () => {
    preferReducedMotion(true);
    const { rerender } = render(<Screen screen="loading" />);

    rerender(<Screen screen="end" />);

    const [tween] = gsap.getTweensOf(screen.getByTestId('screen'));
    expect(changed(tween)).toEqual(['opacity']);
    expect(screen.getByTestId('screen').style.transform).toBe('');
  });

  it('leaves no tween and no style behind when it goes away mid-transition', () => {
    const { rerender, unmount } = render(<Screen screen="loading" />);
    rerender(<Screen screen="picker" />);
    const element = screen.getByTestId('screen');

    unmount();

    expect(gsap.getTweensOf(element)).toHaveLength(0);
    expect(element.getAttribute('style') ?? '').toBe('');
  });
});

function Cards({ ids, selector = 'li' }: { ids: string[]; selector?: string }) {
  const ref = useRef<HTMLUListElement>(null);
  useCardsIn(ref, selector);
  return (
    <ul ref={ref}>
      {ids.map((id) => (
        <li key={id} data-testid={id}>
          Song {id}
        </li>
      ))}
    </ul>
  );
}

const IDS = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'];

describe('useCardsIn', () => {
  /** What the cards were asked to do: the one `fromTo` that took them all, as it was called. */
  function cardsAsked() {
    const call = fromTo.mock.calls.at(-1)!;
    const [targets, from, to] = call as unknown as [HTMLElement[], Record<string, unknown>, Record<string, unknown>];
    return { targets, from, to };
  }

  it('brings every card in with a rise and a fade, in the order of the page', () => {
    render(<Cards ids={['a', 'b', 'c']} />);

    const { targets, from, to } = cardsAsked();
    expect(targets.map((card) => card.dataset.testid)).toEqual(['a', 'b', 'c']);
    expect(from.y).toBeGreaterThan(0);
    expect(from.opacity).toBe(0);
    expect(to).toEqual(expect.objectContaining({ y: 0, opacity: 1 }));
    expect(Object.keys({ ...from, ...to }).filter((name) => ![...HOW, 'stagger'].includes(name)).sort()).toEqual([
      'opacity',
      'y',
    ]);
    for (const id of ['a', 'b', 'c']) expect(gsap.getTweensOf(screen.getByTestId(id)).length).toBeGreaterThan(0);
  });

  it('starts each card a little after the one before it: in sequence, each step the same', () => {
    render(<Cards ids={['a', 'b', 'c']} />);

    const stagger = cardsAsked().to.stagger as (index: number) => number;
    const [a, b, c] = [stagger(0), stagger(1), stagger(2)];
    expect(a).toBe(0);
    expect(b).toBeGreaterThan(a);
    expect(c - b).toBeCloseTo(b - a, 5);
  });

  it('never puts a card more than a quarter of a second behind, however long the list, so the last is not late', () => {
    render(<Cards ids={IDS} />);

    const { to } = cardsAsked();
    const stagger = to.stagger as (index: number) => number;
    const delays = IDS.map((_, index) => stagger(index));
    expect(Math.max(...delays)).toBeLessThanOrEqual(0.25);
    // The ones past the cap all start together.
    expect(new Set(delays.slice(-3)).size).toBe(1);
    // Each card is itself done in under a third of a second, so the whole list is in well under a second.
    expect(to.duration).toBeLessThanOrEqual(0.33);
  });

  it('fades all of them together when motion is reduced, with no movement and no sequence', () => {
    preferReducedMotion(true);
    render(<Cards ids={['a', 'b', 'c']} />);

    const { from, to } = cardsAsked();
    expect(Object.keys({ ...from, ...to }).filter((name) => !HOW.includes(name))).toEqual(['opacity']);
    expect(to.stagger).toBeUndefined();
    for (const id of ['a', 'b', 'c']) expect(screen.getByTestId(id).style.transform).toBe('');
  });

  it('only moves what the selector names', () => {
    function Part() {
      const ref = useRef<HTMLDivElement>(null);
      useCardsIn(ref, '[data-card]');
      return (
        <div ref={ref}>
          <p data-testid="header">Header</p>
          <p data-card data-testid="card">
            Card
          </p>
        </div>
      );
    }
    render(<Part />);

    expect(gsap.getTweensOf(screen.getByTestId('card'))).toHaveLength(1);
    expect(gsap.getTweensOf(screen.getByTestId('header'))).toHaveLength(0);
  });

  it('does not start again when the cards re-render with the same list', () => {
    const { rerender } = render(<Cards ids={['a', 'b']} />);
    const [first] = gsap.getTweensOf(screen.getByTestId('a'));

    rerender(<Cards ids={['a', 'b']} />);

    expect(gsap.getTweensOf(screen.getByTestId('a'))).toEqual([first]);
  });

  it('leaves no tween and no style behind when the cards go away mid-sequence', () => {
    const { unmount } = render(<Cards ids={['a', 'b', 'c']} />);
    const cards = ['a', 'b', 'c'].map((id) => screen.getByTestId(id));

    unmount();

    for (const card of cards) {
      expect(gsap.getTweensOf(card)).toHaveLength(0);
      expect(card.getAttribute('style') ?? '').toBe('');
    }
  });

  it('keeps the attributes and the text of the cards: only their style changes', () => {
    render(<Cards ids={['a', 'b']} />);

    const card = screen.getByTestId('a');
    expect(card.getAttributeNames().filter((name) => name !== 'style')).toEqual(['data-testid']);
    expect(card).toHaveTextContent('Song a');
  });
});

function Ring({ length = 331 }: { length?: number }) {
  const ref = useRef<SVGCircleElement>(null);
  useRingFill(ref, length);
  return (
    <svg viewBox="0 0 140 140" role="img" aria-label="Anel">
      <circle
        ref={ref}
        data-testid="arc"
        cx="70"
        cy="70"
        r="60"
        strokeDasharray={`${length} 377`}
        transform="rotate(-90 70 70)"
      />
    </svg>
  );
}

describe('useRingFill (ruling S34: the one animation that is not transform and opacity)', () => {
  it('draws the arc from nothing to its length by its dash offset, which is all it changes', () => {
    render(<Ring length={331} />);

    const [tween] = gsap.getTweensOf(screen.getByTestId('arc'));
    const { from, to } = asked(tween);
    // An offset as long as the arc leaves none of it drawn; none at all leaves all of it.
    expect(from.strokeDashoffset).toBe(331);
    expect(to).toEqual(expect.objectContaining({ strokeDashoffset: 0 }));
    expect(changed(tween)).toEqual(['strokeDashoffset']);
    expect(tween.duration()).toBeLessThanOrEqual(1);
  });

  it('fills as far as the arc is long: a short arc starts from its own length, not from a whole turn', () => {
    const offsetFrom = (length: number) => {
      const { unmount } = render(<Ring length={length} />);
      const [tween] = gsap.getTweensOf(screen.getAllByTestId('arc').at(-1)!);
      const from = asked(tween).from.strokeDashoffset;
      unmount();
      return from;
    };

    expect(offsetFrom(40)).toBe(40);
    expect(offsetFrom(377)).toBe(377);
  });

  it('leaves the arc as it was drawn: the dash and the turn that starts it from the top stay, and the offset is cleared', () => {
    render(<Ring length={331} />);

    const arc = screen.getByTestId('arc');
    expect(arc.getAttribute('stroke-dasharray')).toBe('331 377');
    expect(arc.getAttribute('transform')).toBe('rotate(-90 70 70)');
    const [tween] = gsap.getTweensOf(arc);
    expect(asked(tween).to.clearProps).toContain('strokeDashoffset');
  });

  it('draws the ring at its final value, and only fades it in, when motion is reduced', () => {
    preferReducedMotion(true);
    render(<Ring length={331} />);

    const arc = screen.getByTestId('arc');
    const [tween] = gsap.getTweensOf(arc);
    expect(changed(tween)).toEqual(['opacity']);
    // Nothing of the fill is set: the arc is its final length from the first frame.
    expect(arc.style.strokeDashoffset).toBe('');
    expect(arc.getAttribute('stroke-dasharray')).toBe('331 377');
  });

  it('leaves no tween and no style behind when the screen goes away mid-fill', () => {
    const { unmount } = render(<Ring />);
    const arc = screen.getByTestId('arc');
    expect(arc.style.strokeDashoffset).not.toBe('');

    unmount();

    expect(gsap.getTweensOf(arc)).toHaveLength(0);
    expect(arc.style.strokeDashoffset).toBe('');
  });
});
