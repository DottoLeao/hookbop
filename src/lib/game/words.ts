// The word lists are the package's own JSON files, read one by one. The package entry point reads every level and
// dialect from disk with `fs`, so it cannot run in the browser and would pull in all of the lists.
import level10 from 'wordlist-english/english-words-10.json';
import level20 from 'wordlist-english/english-words-20.json';
import level35 from 'wordlist-english/english-words-35.json';
import level40 from 'wordlist-english/english-words-40.json';
import level50 from 'wordlist-english/english-words-50.json';
import contractionList from './data/contractions.json';

/** A word that can be picked as a wrong option: only plain lowercase letters, no accents, capitals or apostrophes. */
const PLAIN_WORD = /^[a-z]+$/;

/** Lowercase, with the typographic apostrophes made plain. */
function fold(word: string): string {
  return word.toLowerCase().replace(/[’‘ʼ]/g, "'");
}

// Both collections are built the first time they are asked for, so loading the module costs nothing.
let realWords: Set<string> | undefined;
let pool: string[] | undefined;

/**
 * True when the text is an English word: one of the words in the levels 10 to 50 of the common lists (SCOWL
 * through `wordlist-english`) or in `contractions.json`. Capitals and curly apostrophes do not matter.
 */
export function isRealWord(word: string): boolean {
  realWords ??= new Set([level10, level20, level35, level40, level50, contractionList].flat().map(fold));
  return realWords.has(fold(word));
}

/**
 * The words that can be offered as wrong options: the plain lowercase words of the levels 10 to 35. A new array
 * comes back each time, so the caller can change it.
 */
export function distractorPool(): string[] {
  pool ??= [level10, level20, level35].flat().filter((word) => PLAIN_WORD.test(word));
  return [...pool];
}
