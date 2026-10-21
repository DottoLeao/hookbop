import { doubleMetaphone } from 'double-metaphone';
import homophoneGroups from './data/homophones.json';
import { damerau } from './editDistance';
import { seededRng, shuffled } from './rng';
import { foldWord } from './text';
import { distractorPool } from './words';

/** A wrong option may be at most this many letters longer or shorter than the answer. */
const MAX_LENGTH_GAP = 2;

/** A word that does not sound like the answer is still a candidate when it is this many edits away or fewer. */
const MAX_EDITS = 3;

/** How many wrong options a question has. */
const WRONG_OPTIONS = 2;

const VOWELS = 'aeiou';

/** The primary Double Metaphone code of each word asked for so far: the list is large and the code is slow to redo. */
const soundCache = new Map<string, string>();

/** How the word sounds, roughly: its primary Double Metaphone code ("let" and "late" are both "LT"). */
function sound(word: string): string {
  let code = soundCache.get(word);
  if (code === undefined) {
    code = doubleMetaphone(word)[0];
    soundCache.set(word, code);
  }
  return code;
}

/**
 * For each word, the other words that sound exactly like it (night, knight). A word that is in two groups has the
 * words of both, but the groups are not chained: "red" and "reed" are not homophones because both are "read".
 */
const HOMOPHONES = new Map<string, Set<string>>();
for (const group of homophoneGroups) {
  const words = group.map(foldWord);
  for (const word of words) {
    const same = HOMOPHONES.get(word) ?? new Set<string>();
    for (const other of words) if (other !== word) same.add(other);
    HOMOPHONES.set(word, same);
  }
}

/**
 * The answer with s, es, 's, ed, d or ing added, with the spelling changes those bring: a doubled last letter
 * (stop, stopped, stopping), a lost final e (love, loving), y turned into i (try, tries, tried).
 * These are not wrong options, because to a learner they are the answer in another form.
 * (Exported so the tests can check the spelling rules; the screen only needs `makeDistractors`.)
 */
export function inflections(word: string): Set<string> {
  const forms = [`${word}s`, `${word}es`, `${word}'s`, `${word}ed`, `${word}d`, `${word}ing`];
  const last = word[word.length - 1] ?? '';
  const beforeLast = word[word.length - 2] ?? '';
  const stem = word.slice(0, -1);
  if (last === 'e') forms.push(`${stem}ing`);
  if (last === 'y' && beforeLast !== '' && !VOWELS.includes(beforeLast)) forms.push(`${stem}ies`, `${stem}ied`);
  const endsInDoublingConsonant = /^[a-z]$/.test(last) && !VOWELS.includes(last) && !'wxy'.includes(last);
  if (endsInDoublingConsonant && VOWELS.includes(beforeLast)) forms.push(`${word}${last}ed`, `${word}${last}ing`);
  return new Set(forms);
}

/** The word written the way the model is: ALL CAPS stays all caps, a capital first letter stays a capital. */
function matchCase(word: string, model: string): string {
  const letters = model.replace(/[^\p{L}]/gu, '');
  if (letters.length === 0) return word;
  if (letters.length > 1 && letters === letters.toUpperCase()) return word.toUpperCase();
  const first = letters[0];
  if (first === first.toUpperCase()) return word[0].toUpperCase() + word.slice(1);
  return word;
}

/**
 * The words with their edits from the target, the ones with more than `maxEdits` left out, fewest edits first.
 * Words with the same number of edits come in the order of a draw from `rng`.
 */
function closestFirst(
  words: string[],
  target: string,
  rng: () => number,
  maxEdits = Infinity,
): Array<{ word: string; edits: number }> {
  const near = words.map((word) => ({ word, edits: damerau(word, target) })).filter((entry) => entry.edits <= maxEdits);
  // The shuffle comes first and the sort keeps equal items in order, so the draw settles every tie.
  return shuffled(near, rng).sort((a, b) => a.edits - b.edits);
}

/**
 * Two wrong options for a "choose the word" question, real English words that sound or look like the answer.
 *
 * A candidate comes from the list of common words (without the offensive ones) and is not the answer, not a word of
 * the line, not the answer with s, 's, ed or ing, and not a homophone of the answer (night and knight can not be
 * told apart by ear). It is at most 2 letters longer or shorter than the answer.
 * The order of preference is:
 *   1. words that sound like the answer (same primary Double Metaphone code), the fewest edits first;
 *   2. then the other words that are 1 to 3 edits away, the fewest edits first.
 * Words that tie are drawn with an RNG made from the seed, so the same seed always gives the same words.
 * When fewer than two candidates are left, the rest come from the list at random among the words of the answer's
 * length (or, if there are none, of the closest length).
 * The words come back in the case of the answer.
 */
export function makeDistractors(answer: string, lineTokens: string[], seed: string): [string, string] {
  const rng = seededRng(seed);
  const target = foldWord(answer);
  const targetSound = sound(target);
  const inLine = new Set(lineTokens.map(foldWord));
  // Words that cannot be told apart from the answer, by ear or in meaning: its forms and the words that sound like it.
  const related = new Set([...inflections(target), ...(HOMOPHONES.get(target) ?? [])]);
  const pool = distractorPool().filter((word) => word !== target && !inLine.has(word) && !related.has(word));

  // Splitting by sound first saves the edit count of the many words that sound nothing like the answer.
  const alike: string[] = [];
  const unlike: string[] = [];
  for (const word of pool) {
    if (Math.abs(word.length - target.length) > MAX_LENGTH_GAP) continue;
    (targetSound !== '' && sound(word) === targetSound ? alike : unlike).push(word);
  }

  const options = closestFirst(alike, target, rng)
    .slice(0, WRONG_OPTIONS)
    .map((entry) => entry.word);
  if (options.length < WRONG_OPTIONS) {
    const close = closestFirst(unlike, target, rng, MAX_EDITS);
    options.push(...close.slice(0, WRONG_OPTIONS - options.length).map((entry) => entry.word));
  }

  if (options.length < WRONG_OPTIONS) {
    const chosen = new Set(options);
    const gap = (word: string) => Math.abs(word.length - target.length);
    const spare = shuffled(
      pool.filter((word) => !chosen.has(word)),
      rng,
    ).sort((a, b) => gap(a) - gap(b));
    options.push(...spare.slice(0, WRONG_OPTIONS - options.length));
  }

  return [matchCase(options[0], answer), matchCase(options[1], answer)];
}
