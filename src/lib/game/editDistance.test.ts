import { describe, expect, it } from 'vitest';
import { damerau } from './editDistance';

describe('damerau', () => {
  it('counts one edit for a swap, a substitution, an insertion or a deletion', () => {
    expect(damerau('get', 'gte')).toBe(1); // two neighbouring letters swapped
    expect(damerau('get', 'got')).toBe(1); // one letter replaced
    expect(damerau('get', 'gent')).toBe(1); // one letter added
    expect(damerau('dont', "don't")).toBe(1); // one letter missing
  });

  it('counts the edits between words that differ more', () => {
    expect(damerau('let', 'late')).toBe(2);
    expect(damerau('kitten', 'sitting')).toBe(3);
  });

  it('is 0 for the same text and the length of the other text when one is empty', () => {
    expect(damerau('get', 'get')).toBe(0);
    expect(damerau('', '')).toBe(0);
    expect(damerau('', 'get')).toBe(3);
    expect(damerau('get', '')).toBe(3);
  });

  it('gives the same number whichever way round the words are', () => {
    expect(damerau('late', 'let')).toBe(damerau('let', 'late'));
    expect(damerau('gte', 'get')).toBe(damerau('get', 'gte'));
  });

  it('counts a swap of neighbours as one edit, but a swap of letters that are apart as two', () => {
    expect(damerau('ab', 'ba')).toBe(1);
    expect(damerau('abcd', 'acbd')).toBe(1);
    expect(damerau('abc', 'cba')).toBe(2);
  });

  it('tells letters from each other by case', () => {
    expect(damerau('Get', 'get')).toBe(1);
  });
});
