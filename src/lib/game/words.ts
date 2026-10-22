// The word lists are the package's own JSON files, read one by one. The package entry point reads every level and
// dialect from disk with `fs`, so it cannot run in the browser and would pull in all of the lists.
// This module holds the levels 10 to 35 only. The levels 40 and 50 (~680 KB) are in `realWords.ts`, which only the
// typing mode's typo check loads, so the choice mode does not carry them.
import level10 from 'wordlist-english/english-words-10.json';
import level20 from 'wordlist-english/english-words-20.json';
import level35 from 'wordlist-english/english-words-35.json';
import blocklist from './data/blocklist.json';

/** A word that can be picked as a wrong option: only plain lowercase letters, no accents, capitals or apostrophes. */
const PLAIN_WORD = /^[a-z]+$/;

// Built the first time it is asked for, so loading the module costs nothing.
let pool: string[] | undefined;

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
