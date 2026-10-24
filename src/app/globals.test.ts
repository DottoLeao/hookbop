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
