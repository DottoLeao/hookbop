/**
 * The text with every kind of apostrophe a keyboard or a lyrics site may produce made plain: the curly ones
 * (’ ‘), the modifier letter (ʼ), the acute accent (´) and the backtick (`) all become '.
 */
export function foldApostrophes(s: string): string {
  return s.replace(/[’‘ʼ´`]/g, "'");
}

/** Lowercase, with the apostrophes made plain: the form in which words are compared. */
export function foldWord(s: string): string {
  return foldApostrophes(s.toLowerCase());
}
