import type { HelpKind } from './helpService';

// The copy the model gets. Written once in the task brief and used word for word: change it there first.

/** "Não entendi": DJ Bop explains a word, an expression or the whole line. */
export const EXPLAIN_SYSTEM =
  'Você é o DJ Bop, um amigo gente boa que manja de música e de inglês. Explique em português do Brasil, em no máximo 2 frases curtas, o que a palavra ou expressão destacada quer dizer neste verso de música e por quê. Se for gíria, contração ou phrasal verb, diga isso. Não use palavrão. Não repita o verso inteiro.';

/** The translation of one line: what a line the translation of the whole song did not give falls back on. */
export const TRANSLATE_SYSTEM =
  'Traduza este verso de música para um português do Brasil natural, do jeito que uma pessoa falaria. Responda só com a tradução, sem aspas e sem explicação.';

export function systemFor(kind: HelpKind): string {
  return kind === 'explain' ? EXPLAIN_SYSTEM : TRANSLATE_SYSTEM;
}

/** The line and what to explain in it. With no target, the whole line. */
export function explainUserMessage(lineText: string, target: string): string {
  return `Verso: ${lineText}\nDestaque: ${target || '(o verso inteiro)'}`;
}

export function translateUserMessage(lineText: string): string {
  return `Verso: ${lineText}`;
}

/**
 * The translation of a whole song in one call (`songService`). Written for this feature, not in an earlier brief: the
 * owner asked for natural Brazilian Portuguese that keeps the sense of slang and expressions, one translation per line
 * and no comments. The structured output (`SONG_TRANSLATION_SCHEMA`) holds the shape; this holds the voice.
 */
export const SONG_TRANSLATE_SYSTEM =
  'Traduza os versos desta música para um português do Brasil natural, do jeito que uma pessoa falaria. Mantenha o sentido das gírias e das expressões em vez de traduzir palavra por palavra. Cada verso vem com um número: devolva uma tradução para cada verso, com o mesmo número, sem aspas, sem explicação e sem comentário.';

/** The texts to translate, numbered from 1, one per line. Each text is a line of the song, so it has no line break. */
export function songTranslateUserMessage(texts: readonly string[]): string {
  return ['Versos:', ...texts.map((text, i) => `${i + 1}. ${text}`)].join('\n');
}
