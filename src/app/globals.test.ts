import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// The home page's cards come in by CSS, so they play from the page the server sends and not from a script that may run
// late (ruling S35). jsdom plays no CSS, so what is checked is the stylesheet itself.
const css = readFileSync(join(process.cwd(), 'src/app/globals.css'), 'utf8').replace(/\r\n/g, '\n');

/** The text between the braces of the first block that starts with `header`, or null. */
function blockOf(source: string, header: string): string | null {
  const start = source.indexOf(header);
  if (start < 0) return null;
  const open = source.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    if (source[i] === '}') depth -= 1;
    if (depth === 0) return source.slice(open + 1, i);
  }
  return null;
}

/** The properties a block of declarations sets, with their values. */
function declarations(block: string): Record<string, string> {
  return Object.fromEntries(
    block
      .split(';')
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const colon = part.indexOf(':');
        return [part.slice(0, colon).trim(), part.slice(colon + 1).trim()];
      }),
  );
}

/** The declarations of a keyframe step (`from` or `to`) of a `@keyframes` block. */
function step(keyframes: string, name: 'from' | 'to') {
  return declarations(blockOf(keyframes, name) ?? '');
}

const cardIn = blockOf(css, '@keyframes card-in') ?? '';
const cardFade = blockOf(css, '@keyframes card-fade') ?? '';
const reduced = blockOf(css, '@media (prefers-reduced-motion: reduce)') ?? '';
const rule = declarations(blockOf(css, '.card-in') ?? '');
const reducedRule = declarations(blockOf(reduced, '.card-in') ?? '');

const ms = (value: string) => Number(/([\d.]+)ms/.exec(value)?.[1]);

describe('globals.css: the cards of the home list come in', () => {
  it('has the keyframes and the class for it', () => {
    expect(cardIn).not.toBe('');
    expect(cardFade).not.toBe('');
    expect(rule.animation).toBeDefined();
  });

  it('fades in with a small rise, with only opacity and transform', () => {
    const from = step(cardIn, 'from');
    const to = step(cardIn, 'to');

    expect(Object.keys(from).sort()).toEqual(['opacity', 'transform']);
    expect(Object.keys(to).sort()).toEqual(['opacity', 'transform']);
    expect(from.opacity).toBe('0');
    expect(Number(/translateY\((\d+)px\)/.exec(from.transform)?.[1])).toBeGreaterThan(0);
    expect(Number(/translateY\((\d+)px\)/.exec(from.transform)?.[1])).toBeLessThanOrEqual(16);
    // The cards end visible, and in their place: no transform is left to make them a box of their own.
    expect(to.opacity).toBe('1');
    expect(to.transform).toBe('none');
  });

  it('holds the first frame during the delay and the last one after it, so a card is never seen out of order', () => {
    expect(rule.animation).toMatch(/\bcard-in\b/);
    expect(rule.animation).toMatch(/\bboth\b/);
  });

  it('is done in about a third of a second, and each card starts a step after the one before it, through --i', () => {
    expect(ms(rule.animation)).toBeLessThanOrEqual(350);
    expect(rule['animation-delay']).toMatch(/^calc\(var\(--i(, ?0)?\) \* \d+ms\)$/);
    const stepMs = ms(rule['animation-delay']);
    expect(stepMs).toBeGreaterThan(0);
    // The list gives `--i` at most 5: the last card starts within 300 ms of the first, and is in a fade after that.
    expect(5 * stepMs).toBeLessThanOrEqual(300);
  });

  it('only fades, all cards together, when motion is reduced: no rise, no sequence', () => {
    expect(reducedRule['animation-name']).toBe('card-fade');
    expect(reducedRule['animation-delay']).toMatch(/^0(ms|s)$/);
    expect(Object.keys(step(cardFade, 'from'))).toEqual(['opacity']);
    expect(Object.keys(step(cardFade, 'to'))).toEqual(['opacity']);
    expect(step(cardFade, 'from').opacity).toBe('0');
    expect(step(cardFade, 'to').opacity).toBe('1');
    expect(reduced).not.toMatch(/translate|transform/);
    expect(ms(reducedRule['animation-duration'])).toBeLessThanOrEqual(300);
  });
});

// The loops (the blank whose turn it is, the disc while a song loads, the shimmer where a translation will come) are CSS
// too (ruling S37): they have no end to start from, they play from the first paint, and "reduzir movimento" is met by
// the stylesheet itself, which follows the phone's setting as it changes.

/** The text between the braces of every block that starts with `header`. */
function blocksOf(source: string, header: string): string[] {
  const found: string[] = [];
  for (let from = source.indexOf(header); from >= 0; from = source.indexOf(header, from + header.length)) {
    const block = blockOf(source.slice(from), header);
    if (block !== null) found.push(block);
  }
  return found;
}

/** Every step of a `@keyframes` block, by name (`from`, `to`, `0%`, `70%, 100%`), with what it sets. */
function steps(keyframes: string): Record<string, Record<string, string>> {
  const found: Record<string, Record<string, string>> = {};
  for (const [, name, body] of keyframes.matchAll(/([^{}]+)\{([^{}]*)\}/g)) found[name.trim()] = declarations(body);
  return found;
}

/** The names of the properties every step of a `@keyframes` block sets. */
function animated(name: string): string[] {
  const keyframes = blockOf(css, `@keyframes ${name}`);
  expect(keyframes, `@keyframes ${name}`).not.toBeNull();
  return [...new Set(Object.values(steps(keyframes!)).flatMap((set) => Object.keys(set)))].sort();
}

const LOOPS = ['blank-pulse', 'disc-spin', 'shimmer-sweep', 'shimmer-breathe'];
const reducedLoops = blocksOf(css, '@media (prefers-reduced-motion: reduce)').find((block) => block.includes('.disc-spin')) ?? '';
const pulseRing = declarations(blockOf(css, '.blank-pulse::after {') ?? '');
const spin = declarations(blockOf(css, '.disc-spin {') ?? '');
const shimmer = declarations(blockOf(css, '.shimmer {') ?? '');
const shimmerSheen = declarations(blockOf(css, '.shimmer::after {') ?? '');

describe('globals.css: the loops', () => {
  it('animates only transform and opacity, in every loop', () => {
    for (const loop of LOOPS) {
      expect(animated(loop).filter((property) => !['opacity', 'transform'].includes(property)), loop).toEqual([]);
    }
  });

  describe('the blank whose turn it is', () => {
    it('pulses a lime ring around it, without ever moving the blank itself', () => {
      expect(pulseRing.animation).toMatch(/^blank-pulse\b.*\binfinite\b/);
      expect(pulseRing.border).toMatch(/var\(--color-lime\)/);
      expect(pulseRing['pointer-events']).toBe('none');
      expect(declarations(blockOf(css, '.blank-pulse {') ?? '').position).toBe('relative');
    });

    it('grows the ring and fades it out, so the blank is lit at each beat and rests between them', () => {
      const pulse = steps(blockOf(css, '@keyframes blank-pulse') ?? '');
      const first = pulse['0%'] ?? pulse.from;
      const last = pulse['70%, 100%'] ?? pulse.to;
      expect(Number(first.opacity)).toBeGreaterThan(0);
      expect(Number(last.opacity)).toBe(0);
      expect(first.transform).toBe('scale(1)');
      expect(Number(/scale\(([\d.]+)/.exec(last.transform)?.[1])).toBeGreaterThan(1);
    });
  });

  describe('the disc while a song loads', () => {
    it('turns once in about a second, steadily and for as long as it loads', () => {
      const turn = steps(blockOf(css, '@keyframes disc-spin') ?? '');
      expect(JSON.stringify(Object.values(turn))).toMatch(/rotate\(360deg\)/);
      expect(spin.animation).toMatch(/^disc-spin\b.*\blinear\b.*\binfinite\b/);
      expect(Number(/([\d.]+)s/.exec(spin.animation)?.[1])).toBeGreaterThanOrEqual(0.8);
      expect(Number(/([\d.]+)s/.exec(spin.animation)?.[1])).toBeLessThanOrEqual(2);
    });
  });

  describe('the shimmer where a translation, or the explanation, will come', () => {
    it('passes a sheen across a box that clips it, all the time it is waited for', () => {
      expect(shimmer.position).toBe('relative');
      expect(shimmer.overflow).toBe('hidden');
      expect(shimmerSheen.animation).toMatch(/^shimmer-sweep\b.*\binfinite\b/);
      expect(shimmerSheen['pointer-events']).toBe('none');
      const sweep = steps(blockOf(css, '@keyframes shimmer-sweep') ?? '');
      expect(JSON.stringify(Object.values(sweep))).toMatch(/translateX\(-100%\).*translateX\(100%\)/);
    });
  });

  describe('when motion is reduced', () => {
    it('has a rule for it', () => {
      expect(reducedLoops).not.toBe('');
    });

    it('has no pulse and no turn', () => {
      expect(declarations(blockOf(reducedLoops, '.blank-pulse::after') ?? '').display).toBe('none');
      expect(declarations(blockOf(reducedLoops, '.disc-spin') ?? '').animation).toBe('none');
    });

    it('has no sweep: the shimmer only changes opacity, slowly', () => {
      const sheen = declarations(blockOf(reducedLoops, '.shimmer::after') ?? '');
      expect(sheen.animation).toMatch(/^shimmer-breathe\b.*\binfinite\b/);
      expect(Number(/([\d.]+)s/.exec(sheen.animation)?.[1])).toBeGreaterThanOrEqual(1.5);
      expect(animated('shimmer-breathe')).toEqual(['opacity']);
      expect(reducedLoops).not.toMatch(/translate|rotate|scale|transform/);
    });
  });
});
