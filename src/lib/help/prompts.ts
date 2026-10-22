import type { HelpKind } from './helpService';

// The copy the model gets. Written once in the task brief and used word for word: change it there first.

/** "Não entendi": DJ Bop explains a word, an expression or the whole line. */
export const EXPLAIN_SYSTEM =
  'Você é o DJ Bop, um amigo gente boa que manja de música e de inglês. Explique em português do Brasil, em no máximo 2 frases curtas, o que a palavra ou expressão destacada quer dizer neste verso de música e por quê. Se for gíria, contração ou phrasal verb, diga isso. Não use palavrão. Não repita o verso inteiro.';

/** "Traduzir verso", and the translations of Karaokê. */
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
