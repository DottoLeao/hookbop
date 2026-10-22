// The word lists are the package's own JSON files, read one by one. The package entry point reads every level and
// dialect from disk with `fs`, so it cannot run in the browser and would pull in all of the lists.
//
// Only `typo.ts` imports this module. The levels 40 and 50 weigh about 258 KB, and they are needed by the typing mode
// alone, so they must not be reachable from the code the choice mode and the game screen load up front: that is why
// this lives apart from `words.ts` (which the distractors use, with the levels 10 to 35 only).
import level10 from 'wordlist-english/english-words-10.json';
import level20 from 'wordlist-english/english-words-20.json';
import level35 from 'wordlist-english/english-words-35.json';
import level40 from 'wordlist-english/english-words-40.json';
import level50 from 'wordlist-english/english-words-50.json';
import contractionList from './data/contractions.json';
import { foldWord } from './text';

// Built the first time it is asked for, so loading the module costs nothing.
let realWords: Set<string> | undefined;

/**
 * True when the text is an English word: one of the words in the levels 10 to 50 of the common lists (SCOWL
 * through `wordlist-english`) or in `contractions.json`. Capitals and apostrophe marks do not matter.
 * Offensive words count as words here; only the pool of wrong options (`distractorPool`) leaves them out.
 */
export function isRealWord(word: string): boolean {
  realWords ??= new Set([level10, level20, level35, level40, level50, contractionList].flat().map(foldWord));
  return realWords.has(foldWord(word));
}
