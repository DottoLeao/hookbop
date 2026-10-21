import { describe, expect, it } from 'vitest';
import { foldApostrophes, foldWord } from './text';

describe('foldApostrophes', () => {
  it('makes every kind of apostrophe the plain one', () => {
    expect(foldApostrophes('don’t')).toBe("don't"); // right single quotation mark
    expect(foldApostrophes('‘cause')).toBe("'cause"); // left single quotation mark
    expect(foldApostrophes('donʼt')).toBe("don't"); // modifier letter apostrophe
    expect(foldApostrophes('don´t')).toBe("don't"); // acute accent
    expect(foldApostrophes('don`t')).toBe("don't"); // backtick
  });

  it('changes every one in the text and leaves everything else alone', () => {
    expect(foldApostrophes('y’all ain´t rock`n’roll')).toBe("y'all ain't rock'n'roll");
    expect(foldApostrophes("Don't stop. Café, “quoted”")).toBe("Don't stop. Café, “quoted”");
    expect(foldApostrophes('')).toBe('');
  });
});

describe('foldWord', () => {
  it('lowercases and makes the apostrophes plain', () => {
    expect(foldWord('Y’ALL')).toBe("y'all");
    expect(foldWord('DON´T')).toBe("don't");
    expect(foldWord('Get')).toBe('get');
  });
});
