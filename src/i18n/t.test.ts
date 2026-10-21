import { describe, expect, it } from 'vitest';
import { t } from './t';

describe('t', () => {
  it('returns the pt-BR message for a key', () => {
    expect(t('home.pastePlaceholder')).toBe('Cole o link do YouTube');
  });

  it('interpolates {n}-style variables', () => {
    expect(t('dj.combo', { n: 5 })).toBe('Tá on fire, x5!');
  });
});
