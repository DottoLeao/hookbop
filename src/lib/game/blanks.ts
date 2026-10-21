import type { Blank, Difficulty, LyricLine } from '@/lib/types';
import contractionList from './data/contractions.json';
import phrasalVerbList from './data/phrasal-verbs.json';
import stopwordList from './data/stopwords.json';
import { seededRng, shuffled } from './rng';
import { foldApostrophes } from './text';

/** A line shorter or longer than this (in ms) is too quick or too long to answer, so it never gets a blank. */
const MIN_LINE_MS = 1200;
const MAX_LINE_MS = 15000;

/** Share of the eligible lines that get a blank, per difficulty. */
const LINE_SHARE: Record<Difficulty, number> = { facil: 1 / 3, medio: 1 / 2, dificil: 1 };

/** In dificil, a line with this many words or more gets a second blank. */
const LONG_LINE_WORDS = 8;
const MIN_LETTERS = 3;

/**
 * Sounds people sing that are not words to learn, stretched or not: o/oh/ooh, yeah, ya, la, na, uh, hey/heyyy,
 * woah/whoa/woooah, ah, mm/hm/hmm, ha, huh, and runs of la, na or da such as nanana, lalala and dadada.
 */
const AD_LIB = /^(o+h*|yeah+|ya+|la+|na+|uh+|h?ey+|wh?o+a+h*|ah+|mm+|hm+|ha+|hu?h|(?:la|na|da)+)$/i;

const STOPWORDS = new Set<string>(stopwordList);
const CONTRACTIONS = new Set<string>(contractionList);

/** Phrasal verb particles by verb, e.g. let -> {down}. */
const PARTICLES_BY_VERB = new Map<string, Set<string>>();
for (const [verb, particle] of phrasalVerbList) {
  const particles = PARTICLES_BY_VERB.get(verb) ?? new Set<string>();
  particles.add(particle);
  PARTICLES_BY_VERB.set(verb, particles);
}

/** A word, with the apostrophes inside it and the one that may start it ("don't", "'cause"). */
const WORD = /'?[\p{L}\p{N}]+(?:'[\p{L}\p{N}]+)*/gu;

/**
 * The words of a text, in the original case, without punctuation.
 * Apostrophes inside a word and at its start are kept ("don't", "'cause", "I'm"); every apostrophe-like mark
 * (’ ‘ ʼ ´ `) counts as a plain one.
 */
export function tokenize(text: string): string[] {
  return foldApostrophes(text).match(WORD) ?? [];
}

/** True when the line is long enough to hear and short enough to answer. */
export function hasBlankableDuration(line: LyricLine): boolean {
  const durationMs = line.endMs - line.startMs;
  return durationMs >= MIN_LINE_MS && durationMs <= MAX_LINE_MS;
}

/**
 * The lines of the difficulty's share, drawn with `rng`: round(n x share) of the n eligible ones,
 * back in their original order. Both blanks and tiles use it, so they give the same share.
 */
export function drawLines<T>(eligible: readonly T[], difficulty: Difficulty, rng: () => number): T[] {
  const count = Math.round(eligible.length * LINE_SHARE[difficulty]);
  const positions = shuffled(
    eligible.map((_, position) => position),
    rng,
  )
    .slice(0, count)
    .sort((a, b) => a - b);
  return positions.map((position) => eligible[position]);
}

function isCapitalized(token: string): boolean {
  return /^'?\p{Lu}/u.test(token);
}

function letterCount(token: string): number {
  return (token.match(/\p{L}/gu) ?? []).length;
}

/**
 * The token in lower case and without the apostrophe that may start it, which is how stopwords, ad-libs and
 * phrasal verbs are looked up ("'you" is "you"). The contraction list is checked with the apostrophe too,
 * because some of its entries start with one ("'cause").
 */
function lookupForm(token: string): string {
  const word = token.toLowerCase();
  return word.startsWith("'") ? word.slice(1) : word;
}

/**
 * True on an ALL CAPS or Title Case line, where every word of 3 letters or more starts with a capital.
 * Capitals mean nothing there, so they cannot tell a name from any other word.
 */
function capitalsAreNoSignal(tokens: string[]): boolean {
  return tokens.filter((token) => letterCount(token) >= MIN_LETTERS).every(isCapitalized);
}

/**
 * The token positions that can be a blank, best first: the verb of a phrasal verb whose particle comes later in the line,
 * then a contraction from the list, then any content word of 3 letters or more. Ad-libs never count,
 * and neither does a capitalized word that does not start the line, because it is a name (unless the whole
 * line is in capitals, where that tells nothing). Lists are compared in lower case.
 */
function rankedCandidates(tokens: string[]): [phrasal: number[], contractions: number[], content: number[]] {
  const phrasal: number[] = [];
  const contractions: number[] = [];
  const content: number[] = [];
  const namesShowByCapital = !capitalsAreNoSignal(tokens);
  tokens.forEach((token, position) => {
    const word = lookupForm(token);
    if (AD_LIB.test(word)) return;
    if (namesShowByCapital && position > 0 && isCapitalized(token)) return;
    const particles = PARTICLES_BY_VERB.get(word);
    if (particles && tokens.slice(position + 1).some((later) => particles.has(lookupForm(later)))) {
      phrasal.push(position);
    } else if (CONTRACTIONS.has(token.toLowerCase()) || CONTRACTIONS.has(word)) {
      contractions.push(position);
    } else if (!STOPWORDS.has(word) && letterCount(token) >= MIN_LETTERS) {
      content.push(position);
    }
  });
  return [phrasal, contractions, content];
}

function hasCandidate(groups: number[][]): boolean {
  return groups.some((group) => group.length > 0);
}

/** True when at least one word of the line could be a blank. Blanks and tile lines both ask for it. */
export function hasBlankableWord(tokens: string[]): boolean {
  return hasCandidate(rankedCandidates(tokens));
}

/** Takes `count` positions from the best group that still has any, one at a time, at random inside the group. */
function pickPositions(groups: number[][], count: number, rng: () => number): number[] {
  const left = groups.map((group) => [...group]);
  const picked: number[] = [];
  while (picked.length < count) {
    const group = left.find((candidates) => candidates.length > 0);
    if (!group) break;
    picked.push(...group.splice(Math.floor(rng() * group.length), 1));
  }
  return picked.sort((a, b) => a - b);
}

/**
 * Picks the blanks of a song: the same lyrics, difficulty and seed always give the same blanks.
 * Only lines of a playable length with at least one usable word are eligible. A share of them gets a blank
 * (a third in facil, half in medio, all in dificil), and in dificil a line of 8 words or more gets two.
 */
export function selectBlanks(lines: LyricLine[], difficulty: Difficulty, seed: string): Blank[] {
  const rng = seededRng(seed);
  const eligible = lines
    .filter(hasBlankableDuration)
    .map((line) => {
      const tokens = tokenize(line.text);
      return { line, tokens, groups: rankedCandidates(tokens) };
    })
    .filter(({ groups }) => hasCandidate(groups));

  const blanks: Blank[] = [];
  for (const { line, tokens, groups } of drawLines(eligible, difficulty, rng)) {
    const perLine = difficulty === 'dificil' && tokens.length >= LONG_LINE_WORDS ? 2 : 1;
    for (const tokenIndex of pickPositions(groups, perLine, rng)) {
      blanks.push({ id: `${line.index}:${tokenIndex}`, lineIndex: line.index, tokenIndex, answer: tokens[tokenIndex] });
    }
  }
  return blanks;
}
