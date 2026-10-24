import { render, screen } from '@testing-library/react';
import gsap from 'gsap';
import { useRef } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { useLineHighlight, useLineTransition } from './useLineTransition';

// The real GSAP, in jsdom: nothing plays here, but the tweens are made, started, killed and reverted for real.

/** Three lines around `line`, marked the way LyricPanel marks its lines. */
function Panel({ line, reduced = false }: { line: number; reduced?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useLineTransition(ref, line, reduced);
  return (
    <div ref={ref} data-testid="panel">
      <p data-line="previous" data-testid="previous" aria-label={`line ${line - 1}`}>
        Line {line - 1}
      </p>
      <p data-line="current" data-testid="current">
        Line {line}
      </p>
      <p data-line="next" data-testid="next">
        Line {line + 1}
      </p>
    </div>
  );
}

/** A list with the current line marked as Karaokê marks it. */
function List({ line }: { line: number }) {
  const ref = useRef<HTMLOListElement>(null);
  useLineHighlight(ref, line, false);
  return (
    <ol ref={ref}>
      {[0, 1, 2, 3].map((i) => (
        <li key={i} data-testid={`row-${i}`} aria-current={i === line ? 'true' : undefined}>
          Line {i}
        </li>
      ))}
    </ol>
  );
}

const lines = () => ['previous', 'current', 'next'].map((id) => screen.getByTestId(id));

afterEach(() => {
  gsap.globalTimeline.clear();
});

describe('useLineTransition', () => {
  it('starts one tween per line when the line changes', () => {
    const { rerender } = render(<Panel line={1} />);
    for (const line of lines()) expect(gsap.getTweensOf(line)).toHaveLength(0);

    rerender(<Panel line={2} />);

    for (const line of lines()) expect(gsap.getTweensOf(line)).toHaveLength(1);
  });

  it('kills a slide still running when the line changes again, and starts over: transitions never queue', () => {
    const { rerender } = render(<Panel line={1} />);
    rerender(<Panel line={2} />);
    const [first] = gsap.getTweensOf(screen.getByTestId('current'));

    rerender(<Panel line={3} />);

    const now = gsap.getTweensOf(screen.getByTestId('current'));
    expect(now).toHaveLength(1);
    expect(now[0]).not.toBe(first);
    expect(first.isActive()).toBe(false);
    // The new one starts from its own start, not from wherever the killed one had got to.
    expect(Number(gsap.getProperty(screen.getByTestId('current'), 'y'))).toBeGreaterThan(0);
    expect(Number(gsap.getProperty(screen.getByTestId('current'), 'opacity'))).toBeLessThan(1);
  });

  it('kills a slide still running when the song jumps back, and only fades', () => {
    const { rerender } = render(<Panel line={1} />);
    rerender(<Panel line={2} />);

    rerender(<Panel line={1} />);

    const current = screen.getByTestId('current');
    expect(gsap.getTweensOf(current)).toHaveLength(1);
    // Put back where it rests: none of the slide's rise or growth is left on it.
    expect(Number(gsap.getProperty(current, 'y'))).toBe(0);
    expect(Number(gsap.getProperty(current, 'scale'))).toBe(1);
    expect(Number(gsap.getProperty(current, 'opacity'))).toBeLessThan(1);
  });

  it('leaves no tween and no style behind when the lyrics go away mid-slide', () => {
    const { rerender, unmount } = render(<Panel line={1} />);
    rerender(<Panel line={2} />);
    const moved = lines();
    expect(moved.some((line) => line.style.transform !== '' || line.style.opacity !== '')).toBe(true);

    unmount();

    for (const line of moved) {
      expect(gsap.getTweensOf(line)).toHaveLength(0);
      expect(line.getAttribute('style') ?? '').toBe('');
    }
  });

  it('changes only the style of the lines: their text, aria and data attributes stay', () => {
    const { rerender } = render(<Panel line={1} />);
    rerender(<Panel line={2} />);
    const attributes = (line: HTMLElement) =>
      line.getAttributeNames().filter((name) => name !== 'style').map((name) => [name, line.getAttribute(name)]);

    expect(lines().map(attributes)).toEqual([
      [
        ['data-line', 'previous'],
        ['data-testid', 'previous'],
        ['aria-label', 'line 1'],
      ],
      [
        ['data-line', 'current'],
        ['data-testid', 'current'],
      ],
      [
        ['data-line', 'next'],
        ['data-testid', 'next'],
      ],
    ]);
    expect(lines().map((line) => line.textContent)).toEqual(['Line 1', 'Line 2', 'Line 3']);
  });

  it('touches only opacity when motion is reduced', () => {
    const { rerender } = render(<Panel line={1} reduced />);

    rerender(<Panel line={2} reduced />);

    for (const line of lines()) {
      expect(line.style.transform).toBe('');
      expect(Number(gsap.getProperty(line, 'opacity'))).toBeLessThan(1);
    }
  });
});

describe('useLineHighlight', () => {
  it('animates the row marked current, and kills the last one when the line changes again', () => {
    const { rerender } = render(<List line={0} />);

    rerender(<List line={1} />);
    expect(gsap.getTweensOf(screen.getByTestId('row-1'))).toHaveLength(1);

    rerender(<List line={2} />);
    expect(gsap.getTweensOf(screen.getByTestId('row-1'))).toHaveLength(0);
    expect(screen.getByTestId('row-1').getAttribute('style') ?? '').toBe('');
    expect(gsap.getTweensOf(screen.getByTestId('row-2'))).toHaveLength(1);
  });
});
