import { describe, expect, it } from 'vitest';
import { hitFrequency, playHit, playMiss } from './sfx';

describe('hitFrequency', () => {
  it('starts at 440 Hz and climbs one semitone per hit in a row', () => {
    expect(hitFrequency(0)).toBe(440);
    expect(hitFrequency(1)).toBeCloseTo(440 * 2 ** (1 / 12), 10);
    expect(hitFrequency(7)).toBeCloseTo(440 * 2 ** (7 / 12), 10);
  });

  it('reaches an octave up at 12 and stays there', () => {
    expect(Math.round(hitFrequency(12))).toBe(880);
    expect(Math.round(hitFrequency(30))).toBe(880);
  });
});

describe('without an AudioContext (server side, tests)', () => {
  it('lets playHit and playMiss do nothing instead of throwing', () => {
    expect(typeof AudioContext).toBe('undefined');
    expect(() => playHit(0)).not.toThrow();
    expect(() => playHit(30)).not.toThrow();
    expect(() => playMiss()).not.toThrow();
  });
});
