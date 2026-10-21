import type { AnswerRecord, Mode, PlaySummary } from '@/lib/types';

/** What a first-try hit is worth before the combo multiplier. */
const BASE_XP = 10;

/** Extra XP, never multiplied, for answering before the line has ended. */
const EARLY_ANSWER_BONUS = 2;

/** The combo multiplier never goes above this. */
const MAX_MULTIPLIER = 3;

export interface ScoreState {
  /** First-try hits in a row. A first-try miss sets it back to 0. */
  combo: number;
  /** The highest `combo` reached so far. */
  maxCombo: number;
  xp: number;
  /** Blanks answered right on the first attempt. Retries and answers with a hint never count. */
  firstTryCorrect: number;
  totalBlanks: number;
  /** Every answer given, in order, whatever its kind. */
  records: AnswerRecord[];
}

export function createScore(totalBlanks: number): ScoreState {
  return { combo: 0, maxCombo: 0, xp: 0, firstTryCorrect: 0, totalBlanks, records: [] };
}

/** 1 for the first 4 hits in a row, then 0.5 more for every 5 hits, up to 3. */
export function comboMultiplier(combo: number): number {
  return Math.min(MAX_MULTIPLIER, 1 + 0.5 * Math.floor(combo / 5));
}

/**
 * The score after one more answer; the state it was given is left as it was.
 *
 * Only the first attempt on a blank counts. A first-try hit adds XP, grows the combo and counts toward
 * `firstTryCorrect`; a first-try miss sets the combo back to 0. A retry or an answer made with a hint changes
 * none of those, it is only recorded. Karaoke never gives XP.
 */
export function recordAnswer(s: ScoreState, r: AnswerRecord, mode: Mode): ScoreState {
  const records = [...s.records, r];
  if (r.kind !== 'first') return { ...s, records };
  if (!r.correct) return { ...s, combo: 0, records };

  const combo = s.combo + 1;
  const earned =
    mode === 'karaoke'
      ? 0
      : Math.round(BASE_XP * comboMultiplier(combo)) + (r.beforeLineEnd ? EARLY_ANSWER_BONUS : 0);
  return {
    ...s,
    combo,
    maxCombo: Math.max(s.maxCombo, combo),
    xp: s.xp + earned,
    firstTryCorrect: s.firstTryCorrect + 1,
    records,
  };
}

/** The end-of-song numbers. `pct` is the share of blanks answered right on the first try, 0 when there are none. */
export function summarize(s: ScoreState): PlaySummary {
  const pct = s.totalBlanks === 0 ? 0 : Math.round((s.firstTryCorrect / s.totalBlanks) * 100);
  return {
    totalBlanks: s.totalBlanks,
    firstTryCorrect: s.firstTryCorrect,
    pct,
    maxCombo: s.maxCombo,
    xp: s.xp,
  };
}

/** XP shrinks each time the same song is played again: 1, then 0.5, 0.25 and, from the third replay on, 0.1. */
const REPEAT_MULTIPLIERS = [1, 0.5, 0.25, 0.1];

/** The factor for a song the player already played `playsSameSongLast7Days` times in the last 7 days. */
export function repeatMultiplier(playsSameSongLast7Days: number): number {
  const plays = Math.floor(playsSameSongLast7Days);
  return REPEAT_MULTIPLIERS[Math.min(REPEAT_MULTIPLIERS.length - 1, Math.max(0, plays))];
}
