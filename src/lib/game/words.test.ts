import { describe, expect, it } from 'vitest';
import { distractorPool, isRealWord } from './words';

describe('isRealWord', () => {
  it('knows common English words', () => {
    expect(isRealWord('get')).toBe(true);
    expect(isRealWord('got')).toBe(true);
    expect(isRealWord('late')).toBe(true);
  });

  it('ignores capitals', () => {
    expect(isRealWord('GET')).toBe(true);
    expect(isRealWord('Get')).toBe(true);
    expect(isRealWord('I')).toBe(true);
  });

  it('knows the words in the contraction list, with a straight or a curly apostrophe', () => {
    expect(isRealWord('gonna')).toBe(true);
    expect(isRealWord("ain't")).toBe(true);
    expect(isRealWord("'cause")).toBe(true);
    expect(isRealWord('’cause')).toBe(true);
    expect(isRealWord('Y’ALL')).toBe(true);
  });

  it('knows the less common words up to level 50', () => {
    expect(isRealWord('abash')).toBe(true); // level 40
    expect(isRealWord('abalone')).toBe(true); // level 50
  });

  it('does not know typos, words from the rarer levels, or an empty text', () => {
    expect(isRealWord('gte')).toBe(false);
    expect(isRealWord('dont')).toBe(false);
    expect(isRealWord('xyzzyq')).toBe(false);
    expect(isRealWord('abseil')).toBe(false); // level 55
    expect(isRealWord('')).toBe(false);
  });
});

describe('distractorPool', () => {
  it('holds the plain lowercase words of levels 10 to 35', () => {
    const pool = distractorPool();
    expect(pool.length).toBeGreaterThan(30000);
    expect(pool).toContain('let');
    expect(pool).toContain('late');
    expect(pool.every((word) => /^[a-z]+$/.test(word))).toBe(true);
  });

  it('leaves out words with accents, capitals and the rarer levels', () => {
    const pool = distractorPool();
    expect(pool).not.toContain('café');
    expect(pool).not.toContain('OK');
    expect(pool).not.toContain('ok');
    expect(pool).not.toContain('abash'); // level 40
    expect(pool).not.toContain('abalone'); // level 50
  });

  it('has no word twice', () => {
    const pool = distractorPool();
    expect(new Set(pool).size).toBe(pool.length);
  });

  it('gives a copy each time, so changing it does not change the next one', () => {
    const first = distractorPool();
    first.length = 0;
    expect(distractorPool()).toContain('let');
  });

  it('only holds words that isRealWord knows', () => {
    expect(distractorPool().every((word) => isRealWord(word))).toBe(true);
  });
});
