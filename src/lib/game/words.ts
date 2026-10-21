// The word lists are the package's own JSON files, read one by one. The package entry point reads every level and
// dialect from disk with `fs`, so it cannot run in the browser and would pull in all of the lists.
import level10 from 'wordlist-english/english-words-10.json';
import level20 from 'wordlist-english/english-words-20.json';
import level35 from 'wordlist-english/english-words-35.json';
import level40 from 'wordlist-english/english-words-40.json';
import level50 from 'wordlist-english/english-words-50.json';
import blocklist from './data/blocklist.json';
import contractionList from './data/contractions.json';
import { foldWord } from './text';

/** A word that can be picked as a wrong option: only plain lowercase letters, no accents, capitals or apostrophes. */
const PLAIN_WORD = /^[a-z]+$/;

// Both collections are built the first time they are asked for, so loading the module costs nothing.
let realWords: Set<string> | undefined;
let pool: string[] | undefined;

/**
 * True when the text is an English word: one of the words in the levels 10 to 50 of the common lists (SCOWL
 * through `wordlist-english`) or in `contractions.json`. Capitals and apostrophe marks do not matter.
 * Offensive words count as words here; only the pool of wrong options leaves them out.
 */
export function isRealWord(word: string): boolean {
  realWords ??= new Set([level10, level20, level35, level40, level50, contractionList].flat().map(foldWord));
  return realWords.has(foldWord(word));
}

/**
 * The words that can be offered as wrong options: the plain lowercase words of the levels 10 to 35, without the
 * words in `blocklist.json` (slurs, sexual and anatomical words, profanity, rape, suicide and slavery, with their
 * inflections). The common lists hold all of those, and a learner must never be shown one as an option.
 * A new array comes back each time, so the caller can change it.
 */
export function distractorPool(): string[] {
  if (pool === undefined) {
    const blocked = new Set<string>(blocklist);
    pool = [level10, level20, level35].flat().filter((word) => PLAIN_WORD.test(word) && !blocked.has(word));
  }
  return [...pool];
}
