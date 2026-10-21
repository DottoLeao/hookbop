import { doubleMetaphone } from 'double-metaphone';
import { describe, expect, it } from 'vitest';
import { inflections, makeDistractors } from './distractors';
import { damerau } from './editDistance';
import { isRealWord } from './words';

const SEEDS = Array.from({ length: 8 }, (_, i) => `seed-${i}`);

/** A call takes up to ~100 ms, and the tests that make dozens of them can be slow when the whole suite runs at once. */
const SLOW = 30_000;

/** The primary Double Metaphone code: how the word sounds, roughly. */
function sound(word: string): string {
  return doubleMetaphone(word)[0];
}

describe('inflections', () => {
  it("adds s, 's, ed and ing", () => {
    const forms = inflections('walk');
    for (const form of ['walks', "walk's", 'walked', 'walking']) expect(forms.has(form)).toBe(true);
    expect(forms.has('walk')).toBe(false);
  });

  it('doubles a last consonant that follows a vowel (stop, stopped, stopping)', () => {
    const forms = inflections('stop');
    expect(forms.has('stopped')).toBe(true);
    expect(forms.has('stopping')).toBe(true);
    expect(inflections('let').has('letting')).toBe(true);
  });

  it('does not double w, x, y or a consonant after a consonant', () => {
    expect(inflections('show').has('showwed')).toBe(false);
    expect(inflections('fix').has('fixxing')).toBe(false);
    expect(inflections('play').has('playying')).toBe(false);
    expect(inflections('walk').has('walkking')).toBe(false);
  });

  it('drops a final e before ing (love, loving)', () => {
    expect(inflections('love').has('loving')).toBe(true);
    expect(inflections('love').has('loved')).toBe(true);
  });

  it('turns a final y after a consonant into i (try, tries, tried)', () => {
    const forms = inflections('try');
    expect(forms.has('tries')).toBe(true);
    expect(forms.has('tried')).toBe(true);
    expect(forms.has('trying')).toBe(true);
    expect(inflections('play').has('plaies')).toBe(false);
  });

  it('adds es for a word that ends in s (kiss, kisses)', () => {
    expect(inflections('kiss').has('kisses')).toBe(true);
    expect(inflections('kiss').has('kissed')).toBe(true);
  });
});

describe('makeDistractors', () => {
  it('gives two different real words that are not the answer or in the line', () => {
    const d = makeDistractors('let', ['please', "don't", 'let', 'me', 'down'], 's1');
    expect(new Set(d).size).toBe(2);
    for (const w of d) {
      expect(w).not.toBe('let');
      expect(isRealWord(w)).toBe(true);
      expect(['lets', "let's", 'letting', 'me', 'down']).not.toContain(w);
    }
  });

  it('gives the same words for the same seed', () => {
    expect(makeDistractors('let', [], 's1')).toEqual(makeDistractors('let', [], 's1'));
  });

  it('still gives two words for an answer that is not in the word list', () => {
    expect(makeDistractors('gonna', [], 's2')).toHaveLength(2);
  });

  it('uses the seed to choose among equally good words', () => {
    const results = new Set(SEEDS.map((seed) => makeDistractors('let', [], seed).join(',')));
    expect(results.size).toBeGreaterThan(1);
  });

  it('puts the words that sound like the answer first', () => {
    for (const seed of SEEDS) {
      for (const answer of ['let', 'night', 'love', 'baby']) {
        for (const w of makeDistractors(answer, [], seed)) {
          expect(sound(w)).toBe(sound(answer));
        }
      }
    }
  }, SLOW);

  it('takes the nearest spellings when nothing sounds like the answer', () => {
    // No word in the list has the sound of "thump", but "thumb", "hump" and "trump" are one edit away.
    expect(sound('thump')).not.toBe(sound('thumb'));
    for (const seed of SEEDS) {
      for (const w of makeDistractors('thump', [], seed)) expect(damerau(w, 'thump')).toBe(1);
    }
  }, SLOW);

  it('prefers a word that sounds like the answer over one that is spelled closer', () => {
    // "might" is 1 edit from "night", but it does not sound like it, so it loses to words that are 1 or 2 edits away.
    expect(damerau('might', 'night')).toBe(1);
    expect(sound('might')).not.toBe(sound('night'));
    for (const seed of SEEDS) {
      const d = makeDistractors('night', [], seed);
      expect(d).not.toContain('might');
      expect(d.map(sound)).toEqual(['NT', 'NT']);
    }
  }, SLOW);

  it('keeps every word within 2 letters of the length of the answer', () => {
    for (const seed of SEEDS) {
      for (const answer of ['let', 'night', 'through', 'remember']) {
        for (const w of makeDistractors(answer, [], seed)) {
          expect(Math.abs(w.length - answer.length)).toBeLessThanOrEqual(2);
        }
      }
    }
  }, SLOW);

  it('leaves out every word in the line, capitals ignored', () => {
    const first = makeDistractors('let', [], 's1');
    for (const seed of SEEDS) {
      const line = first.map((w) => w.toUpperCase());
      const d = makeDistractors('let', line, seed);
      for (const w of d) expect(first).not.toContain(w);
    }
  });

  it('leaves out the answer with s, ed or ing, even when that is the nearest word', () => {
    // Without the rule these are the first pick for these answers: they are 1 edit away and nothing sounds like them.
    const cases: Array<[string, string[]]> = [
      ['thunder', ['thunders']],
      ['mirror', ['mirrors', 'mirrored']],
      ['highway', ['highways']],
      ['tremble', ['trembled']],
      ['angel', ['angels']],
      ['let', ['lets', "let's", 'letting']],
    ];
    for (const [answer, forbidden] of cases) {
      for (const seed of SEEDS) {
        const d = makeDistractors(answer, [], seed);
        expect(d).toHaveLength(2);
        for (const w of d) expect(forbidden).not.toContain(w);
      }
    }
  }, SLOW);

  it('works for an answer with an apostrophe, straight or curly', () => {
    for (const answer of ["don't", 'don’t']) {
      const d = makeDistractors(answer, [], 's3');
      expect(new Set(d).size).toBe(2);
      for (const w of d) {
        expect(w).not.toBe('dont');
        expect(Math.abs(w.length - "don't".length)).toBeLessThanOrEqual(2);
        expect(isRealWord(w)).toBe(true);
      }
    }
  });

  it('keeps the capitals of the answer, so they do not give it away', () => {
    const capitalised = makeDistractors('Let', [], 's1');
    expect(capitalised).toEqual(makeDistractors('let', [], 's1').map((w) => w[0].toUpperCase() + w.slice(1)));
    const shouted = makeDistractors('LET', [], 's1');
    expect(shouted).toEqual(makeDistractors('let', [], 's1').map((w) => w.toUpperCase()));
  });

  it('does not repeat the answer when it comes in capitals', () => {
    for (const seed of SEEDS) {
      for (const w of makeDistractors('LET', [], seed)) expect(w.toLowerCase()).not.toBe('let');
    }
  });

  it('falls back to words of the same length when too few words are close', () => {
    // Nothing in the word list is within 3 edits of this, and nothing sounds like it.
    const answer = 'zzzzzzzzzz';
    for (const seed of SEEDS) {
      const d = makeDistractors(answer, [], seed);
      expect(new Set(d).size).toBe(2);
      for (const w of d) {
        expect(w).toHaveLength(answer.length);
        expect(isRealWord(w)).toBe(true);
      }
    }
  }, SLOW);

  it('chooses the same fallback words for the same seed, and others for another', () => {
    expect(makeDistractors('zzzzzzzzzz', [], 'a')).toEqual(makeDistractors('zzzzzzzzzz', [], 'a'));
    const results = new Set(SEEDS.map((seed) => makeDistractors('zzzzzzzzzz', [], seed).join(',')));
    expect(results.size).toBeGreaterThan(1);
  }, SLOW);

  it('still gives two real words when no word of the same length exists', () => {
    const answer = 'supercalifragilisticexpialidocious';
    const d = makeDistractors(answer, [], 's4');
    expect(new Set(d).size).toBe(2);
    for (const w of d) {
      expect(w).not.toBe(answer);
      expect(isRealWord(w)).toBe(true);
    }
  });

  it('does not change the line it is given', () => {
    const line = ['please', 'let', 'me'];
    makeDistractors('let', line, 's1');
    expect(line).toEqual(['please', 'let', 'me']);
  });
});
