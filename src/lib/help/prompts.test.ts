import { describe, expect, it } from 'vitest';
import {
  EXPLAIN_SYSTEM,
  SONG_TRANSLATE_SYSTEM,
  TRANSLATE_SYSTEM,
  explainUserMessage,
  songTranslateUserMessage,
  systemFor,
  translateUserMessage,
} from './prompts';

// Invented lines, not lyrics.
describe('prompts', () => {
  it('asks DJ Bop to explain the highlighted word in two short sentences of Brazilian Portuguese', () => {
    expect(EXPLAIN_SYSTEM).toBe(
      'Você é o DJ Bop, um amigo gente boa que manja de música e de inglês. Explique em português do Brasil, em no máximo 2 frases curtas, o que a palavra ou expressão destacada quer dizer neste verso de música e por quê. Se for gíria, contração ou phrasal verb, diga isso. Não use palavrão. Não repita o verso inteiro.',
    );
  });

  it('asks for a natural translation and nothing else', () => {
    expect(TRANSLATE_SYSTEM).toBe(
      'Traduza este verso de música para um português do Brasil natural, do jeito que uma pessoa falaria. Responda só com a tradução, sem aspas e sem explicação.',
    );
  });

  it('sends the line and the highlight to explain', () => {
    expect(explainUserMessage('Paper boats on a river of light', 'river')).toBe(
      'Verso: Paper boats on a river of light\nDestaque: river',
    );
  });

  it('asks about the whole line when nothing is highlighted', () => {
    expect(explainUserMessage('Paper boats on a river of light', '')).toBe(
      'Verso: Paper boats on a river of light\nDestaque: (o verso inteiro)',
    );
  });

  it('sends only the line to translate', () => {
    expect(translateUserMessage('Paper boats on a river of light')).toBe('Verso: Paper boats on a river of light');
  });

  it('picks the system prompt of each kind of help', () => {
    expect(systemFor('explain')).toBe(EXPLAIN_SYSTEM);
    expect(systemFor('translate')).toBe(TRANSLATE_SYSTEM);
  });

  it('asks for the whole song in natural Brazilian Portuguese, slang kept in its sense, one translation per line', () => {
    expect(SONG_TRANSLATE_SYSTEM).toBe(
      'Traduza os versos desta música para um português do Brasil natural, do jeito que uma pessoa falaria. Mantenha o sentido das gírias e das expressões em vez de traduzir palavra por palavra. Cada verso vem com um número: devolva uma tradução para cada verso, com o mesmo número, sem aspas, sem explicação e sem comentário.',
    );
  });

  it('sends the lines of the song numbered from 1, one per line', () => {
    expect(songTranslateUserMessage(['Paper boats on a river of light', 'Hold the line till the morning comes'])).toBe(
      'Versos:\n1. Paper boats on a river of light\n2. Hold the line till the morning comes',
    );
  });
});
