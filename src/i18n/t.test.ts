import { describe, expect, it } from 'vitest';
import { ptBR } from './pt-BR';
import { t, tCount } from './t';

describe('tCount', () => {
  it('uses the singular for exactly one and the plural for any other count, zero included', () => {
    expect(tCount('metricas.n.people', 1)).toBe('1 pessoa');
    expect(tCount('metricas.n.people', 2)).toBe('2 pessoas');
    expect(tCount('metricas.n.people', 0)).toBe('0 pessoas');
    expect(tCount('metricas.n.activePeople', 1)).toBe('1 pessoa ativa');
    expect(tCount('metricas.n.gamesStarted', 1)).toBe('1 partida começada');
    expect(tCount('metricas.n.songsPlayed', 3)).toBe('3 músicas jogadas');
  });

  it('writes the count as it is given, so a big number keeps its thousands dot', () => {
    expect(tCount('metricas.n.people', 1234, '1.234')).toBe('1.234 pessoas');
  });

  it('has every singular paired with a plural, and both say the count', () => {
    const keys = Object.keys(ptBR);
    const singulars = keys.filter((key) => key.endsWith('.one'));
    const plurals = keys.filter((key) => key.endsWith('.other'));

    expect(singulars.length).toBeGreaterThan(0);
    expect(singulars.map((key) => key.slice(0, -'.one'.length))).toEqual(plurals.map((key) => key.slice(0, -'.other'.length)));
    for (const key of [...singulars, ...plurals]) expect(ptBR[key as keyof typeof ptBR]).toContain('{n}');
  });
});

describe('t', () => {
  it('returns the pt-BR message for a key', () => {
    expect(t('home.pastePlaceholder')).toBe('Cole o link do YouTube');
  });

  it('interpolates {n}-style variables', () => {
    expect(t('dj.combo', { n: 5 })).toBe('Tá on fire, x5!');
  });
});
