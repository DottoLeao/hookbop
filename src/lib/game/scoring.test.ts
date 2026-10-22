import { describe, expect, it } from 'vitest';
import type { AnswerRecord } from '@/lib/types';
import { comboMultiplier, createScore, helpedBlanks, recordAnswer, repeatMultiplier, summarize } from './scoring';

function answer(blankId: string, kind: AnswerRecord['kind'], correct: boolean, beforeLineEnd = false): AnswerRecord {
  return { blankId, kind, correct, beforeLineEnd };
}

/** `count` first-try hits in a row, none of them before the line ends. */
function hits(count: number, mode: 'escolha' | 'karaoke' = 'escolha') {
  let s = createScore(100);
  for (let i = 0; i < count; i++) s = recordAnswer(s, answer(`${i}:0`, 'first', true), mode);
  return s;
}

describe('createScore', () => {
  it('starts empty', () => {
    expect(createScore(12)).toEqual({
      combo: 0,
      maxCombo: 0,
      xp: 0,
      firstTryCorrect: 0,
      totalBlanks: 12,
      records: [],
    });
  });
});

describe('comboMultiplier', () => {
  it('grows by 0.5 every 5 hits in a row', () => {
    expect([0, 1, 4, 5, 9, 10, 15].map(comboMultiplier)).toEqual([1, 1, 1, 1.5, 1.5, 2, 2.5]);
  });

  it('stops at 3', () => {
    expect([20, 21, 25, 100].map(comboMultiplier)).toEqual([3, 3, 3, 3]);
  });
});

describe('recordAnswer', () => {
  it('scores first-try hits with the combo multiplier and the early-answer bonus', () => {
    let s = createScore(12);
    for (let i = 0; i < 5; i++) {
      s = recordAnswer(s, { blankId: `${i}:0`, kind: 'first', correct: true, beforeLineEnd: false }, 'escolha');
    }
    expect(s.xp).toBe(55);
    expect(s.combo).toBe(5);

    s = recordAnswer(s, { blankId: '5:0', kind: 'first', correct: true, beforeLineEnd: true }, 'escolha');
    expect(s.xp).toBe(55 + 15 + 2); // bonus of 2 for answering before the line ends

    s = recordAnswer(s, { blankId: '6:0', kind: 'first', correct: false, beforeLineEnd: false }, 'escolha');
    expect(s.combo).toBe(0);

    const xpBefore = s.xp;
    s = recordAnswer(s, { blankId: '6:0', kind: 'retry', correct: true, beforeLineEnd: false }, 'escolha');
    s = recordAnswer(s, { blankId: '7:0', kind: 'helped', correct: true, beforeLineEnd: false }, 'escolha');
    expect(s.xp).toBe(xpBefore);
    expect(s.combo).toBe(0);
    expect(s.firstTryCorrect).toBe(6);
  });

  it('applies the multiplier to the 10 base points but not to the early-answer bonus', () => {
    // The 10th hit in a row has multiplier 2: round(10 * 2) + 2 = 22, not (10 + 2) * 2.
    const s = recordAnswer(hits(9), answer('9:0', 'first', true, true), 'escolha');
    expect(s.combo).toBe(10);
    expect(s.xp).toBe(hits(9).xp + 22);
  });

  it('pays 10 for each of the first four hits', () => {
    expect(hits(4).xp).toBe(40);
  });

  it('caps a hit at 30 XP: the 25th hit would be at 3.5 without the cap', () => {
    const before = hits(24);
    const after = recordAnswer(before, answer('24:0', 'first', true), 'escolha');
    expect(after.combo).toBe(25);
    expect(after.xp - before.xp).toBe(30);
  });

  it('keeps maxCombo at the highest streak after a miss', () => {
    let s = hits(7);
    expect(s.maxCombo).toBe(7);
    s = recordAnswer(s, answer('7:0', 'first', false), 'escolha');
    expect(s.combo).toBe(0);
    expect(s.maxCombo).toBe(7);
    for (let i = 0; i < 3; i++) s = recordAnswer(s, answer(`${8 + i}:0`, 'first', true), 'escolha');
    expect(s.combo).toBe(3);
    expect(s.maxCombo).toBe(7);
  });

  it('lets a retry or a helped answer pass without touching a running streak', () => {
    let s = hits(3);
    const before = { combo: s.combo, maxCombo: s.maxCombo, xp: s.xp, firstTryCorrect: s.firstTryCorrect };
    s = recordAnswer(s, answer('x:0', 'retry', true, true), 'escolha');
    s = recordAnswer(s, answer('y:0', 'retry', false), 'escolha');
    s = recordAnswer(s, answer('z:0', 'helped', true, true), 'escolha');
    s = recordAnswer(s, answer('w:0', 'helped', false), 'escolha');
    expect({ combo: s.combo, maxCombo: s.maxCombo, xp: s.xp, firstTryCorrect: s.firstTryCorrect }).toEqual(before);
  });

  it('never gives a miss any XP', () => {
    const s = recordAnswer(hits(2), answer('2:0', 'first', false, true), 'escolha');
    expect(s.xp).toBe(hits(2).xp);
    expect(s.firstTryCorrect).toBe(2);
  });

  it('stores every record in order, whatever its kind', () => {
    const records = [
      answer('0:0', 'first', false),
      answer('0:0', 'retry', true),
      answer('1:0', 'helped', true),
      answer('2:0', 'first', true, true),
    ];
    const s = records.reduce((acc, r) => recordAnswer(acc, r, 'digitacao'), createScore(3));
    expect(s.records).toEqual(records);
  });

  it('returns a new state and leaves the old one as it was', () => {
    const before = hits(2);
    const snapshot = structuredClone(before);
    const after = recordAnswer(before, answer('2:0', 'first', true, true), 'escolha');
    expect(after).not.toBe(before);
    expect(after.records).not.toBe(before.records);
    expect(before).toEqual(snapshot);

    // The same holds for answers that change nothing but the records.
    const afterRetry = recordAnswer(before, answer('0:0', 'retry', true), 'escolha');
    expect(afterRetry).not.toBe(before);
    expect(afterRetry.records).not.toBe(before.records);
    expect(before).toEqual(snapshot);
  });

  it('gives karaoke no XP, but still stores the record', () => {
    const r = answer('0:0', 'first', true, true);
    const s = recordAnswer(createScore(3), r, 'karaoke');
    expect(s.xp).toBe(0);
    expect(s.records).toEqual([r]);
  });

  it('keeps karaoke at 0 XP however long the streak', () => {
    expect(hits(30, 'karaoke').xp).toBe(0);
  });

  it('pays the same in every mode that scores', () => {
    const r = answer('0:0', 'first', true, true);
    const xps = (['escolha', 'digitacao', 'montar'] as const).map(
      (mode) => recordAnswer(createScore(3), r, mode).xp,
    );
    expect(xps).toEqual([12, 12, 12]);
  });
});

describe('summarize', () => {
  it('rounds the first-try percentage', () => {
    expect(summarize({ ...createScore(12), firstTryCorrect: 11 }).pct).toBe(92);
  });

  it('reports 0% for a song with no blanks', () => {
    expect(summarize(createScore(0)).pct).toBe(0);
  });

  it('reports 100% when every blank was a first-try hit', () => {
    expect(summarize({ ...createScore(4), firstTryCorrect: 4 }).pct).toBe(100);
  });

  it('carries the totals of the play', () => {
    let s = createScore(5);
    for (let i = 0; i < 3; i++) s = recordAnswer(s, answer(`${i}:0`, 'first', true), 'escolha');
    s = recordAnswer(s, answer('3:0', 'first', false), 'escolha');
    expect(summarize(s)).toEqual({ totalBlanks: 5, firstTryCorrect: 3, pct: 60, maxCombo: 3, xp: 30 });
  });
});

describe('helpedBlanks', () => {
  const answer = (blankId: string, kind: AnswerRecord['kind'], correct = true): AnswerRecord => ({
    blankId,
    kind,
    correct,
    beforeLineEnd: true,
  });

  it('counts the blanks answered with a hint, each once, right or wrong (spec §8, "com ajuda")', () => {
    const records = [
      answer('a', 'first'),
      answer('b', 'helped', false),
      answer('b', 'helped'),
      answer('c', 'first', false),
      answer('c', 'helped'),
      answer('d', 'retry'),
    ];

    expect(helpedBlanks(records)).toBe(2);
  });

  it('is 0 with no hint at all', () => {
    expect(helpedBlanks([answer('a', 'first'), answer('a', 'retry')])).toBe(0);
    expect(helpedBlanks([])).toBe(0);
  });
});

describe('repeatMultiplier', () => {
  it('pays less each time the same song is played again within 7 days', () => {
    expect([0, 1, 2, 3, 9].map(repeatMultiplier)).toEqual([1, 0.5, 0.25, 0.1, 0.1]);
  });

  it('counts a missing or negative number of plays as no replay', () => {
    expect([Number.NaN, -1, -0.5, -Infinity].map(repeatMultiplier)).toEqual([1, 1, 1, 1]);
  });

  it('rounds a fractional number of plays down', () => {
    expect([0.9, 1.9, 2.5, 3.2].map(repeatMultiplier)).toEqual([1, 0.5, 0.25, 0.1]);
  });

  it('keeps an enormous number of plays at the floor of 0.1', () => {
    expect(repeatMultiplier(Infinity)).toBe(0.1);
  });
});
