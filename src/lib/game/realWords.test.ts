import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { isRealWord } from './realWords';

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

  it('treats the other apostrophe-like marks of a keyboard as the apostrophe', () => {
    expect(isRealWord('‘cause')).toBe(true);
    expect(isRealWord('´cause')).toBe(true);
    expect(isRealWord('`cause')).toBe(true);
    expect(isRealWord('ʼcause')).toBe(true);
  });

  it('knows the less common words up to level 50', () => {
    expect(isRealWord('abash')).toBe(true); // level 40
    expect(isRealWord('abalone')).toBe(true); // level 50
  });

  it('still knows the words the blocklist keeps out of the pool, so a typo of them is not mistaken for a word', () => {
    for (const word of ['hell', 'damn', 'crap', 'sex', 'retard', 'suck']) expect(isRealWord(word)).toBe(true);
  });

  it('does not know typos, words from the rarer levels, or an empty text', () => {
    expect(isRealWord('gte')).toBe(false);
    expect(isRealWord('dont')).toBe(false);
    expect(isRealWord('xyzzyq')).toBe(false);
    expect(isRealWord('abseil')).toBe(false); // level 55
    expect(isRealWord('')).toBe(false);
  });
});

describe('where the big word lists are loaded (ruling R51)', () => {
  // Every source file of the app (not the tests), as a path from src/.
  const root = join(import.meta.dirname, '..', '..');
  const sources = readdirSync(root, { recursive: true, encoding: 'utf8' })
    .filter((file) => /\.tsx?$/.test(file) && !/\.test\./.test(file))
    .map((file) => ({ file: file.replaceAll('\\', '/'), text: readFileSync(join(root, file), 'utf8') }));
  const importing = (needle: string) => sources.filter(({ text }) => text.includes(needle)).map(({ file }) => file);

  it('keeps the levels 40 and 50 (~680 KB) in realWords.ts alone, out of the code the choice mode loads', () => {
    expect(importing('english-words-40')).toEqual(['lib/game/realWords.ts']);
    expect(importing('english-words-50')).toEqual(['lib/game/realWords.ts']);
  });

  it('is imported by typo.ts alone', () => {
    expect(importing('/realWords')).toEqual(['lib/game/typo.ts']);
  });
});
