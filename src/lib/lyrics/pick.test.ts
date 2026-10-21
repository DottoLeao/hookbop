import { describe, expect, it } from 'vitest';
import { pickBestCandidate, type LrclibCandidate } from './pick';
import { diceSimilarity } from './similarity';

const base = { trackName: 'Song', artistName: 'Artist', syncedLyrics: '[00:01.00]x' };
const q = { artist: 'Artist', track: 'Song', durationS: 200 };

describe('pickBestCandidate', () => {
  it('prefers the candidate whose duration is closest to the video', () => {
    expect(pickBestCandidate([{ ...base, id: 1, duration: 175 }, { ...base, id: 2, duration: 201 }], q)?.id).toBe(2);
  });

  it('ignores candidates without synced lyrics', () => {
    expect(pickBestCandidate([{ ...base, id: 3, duration: 200, syncedLyrics: null }], q)).toBeNull();
    expect(pickBestCandidate([{ ...base, id: 3, duration: 200, syncedLyrics: '  ' }], q)).toBeNull();
    const withLyrics = { ...base, id: 5, duration: 150 };
    expect(pickBestCandidate([{ ...base, id: 3, duration: 200, syncedLyrics: null }, withLyrics], q)).toBe(withLyrics);
  });

  it('rejects a candidate whose title is not similar to the track', () => {
    expect(pickBestCandidate([{ ...base, id: 4, trackName: 'Completely Other', duration: 200 }], q)).toBeNull();
  });

  it('returns null when there are no candidates', () => {
    expect(pickBestCandidate([], q)).toBeNull();
  });

  it('matches the title ignoring case, accents and punctuation', () => {
    const query = { artist: 'Artist', track: 'Não Quero Dinheiro', durationS: 200 };
    const candidate = { ...base, id: 6, trackName: 'nao quero dinheiro!', duration: 200 };
    expect(pickBestCandidate([candidate], query)).toBe(candidate);
  });

  it('prefers the candidate by the right artist when the rest is equal', () => {
    const other = { ...base, id: 7, artistName: 'Someone Else', duration: 200 };
    const right = { ...base, id: 8, duration: 200 };
    expect(pickBestCandidate([other, right], q)).toBe(right);
    expect(pickBestCandidate([right, other], q)).toBe(right);
  });

  it('breaks a tie in score by the smaller duration difference', () => {
    // Both are more than 30 s off, so the duration term is 0 for both and the scores tie.
    const far: LrclibCandidate = { ...base, id: 9, duration: 260 };
    const nearer: LrclibCandidate = { ...base, id: 10, duration: 240 };
    expect(pickBestCandidate([far, nearer], q)).toBe(nearer);
    expect(pickBestCandidate([nearer, far], q)).toBe(nearer);
  });

  it('accepts a title similarity of exactly 0.6 and rejects anything below it', () => {
    const query = { artist: 'Artist', track: 'abcdef', durationS: 200 };
    // abcdef and abcdyz share 3 of 5 + 5 bigrams: 2 * 3 / 10 = 0.6.
    const atThreshold = { ...base, id: 11, trackName: 'abcdyz', duration: 200 };
    // abcdef and abcdyzw share 3 of 5 + 6 bigrams: 6 / 11, about 0.55.
    const below = { ...base, id: 12, trackName: 'abcdyzw', duration: 200 };
    expect(pickBestCandidate([atThreshold], query)).toBe(atThreshold);
    expect(pickBestCandidate([below], query)).toBeNull();
  });

  it('still picks by title and artist when the video duration is unusable', () => {
    const weakTitle = { ...base, id: 13, trackName: 'Songs', duration: 200 };
    const exactTitle = { ...base, id: 14, duration: 200 };
    expect(pickBestCandidate([weakTitle, exactTitle], { ...q, durationS: NaN })).toBe(exactTitle);
  });
});

describe('diceSimilarity', () => {
  it('is 1 for the same text and 0 for text with no bigram in common', () => {
    expect(diceSimilarity('Song', 'Song')).toBe(1);
    expect(diceSimilarity('Song', 'Completely Other')).toBe(0);
  });

  it('ignores case, accents and punctuation', () => {
    expect(diceSimilarity('Não, Quero!', 'nao quero')).toBe(1);
    expect(diceSimilarity("Don't Stop", 'DONT   STOP')).toBe(1);
    expect(diceSimilarity('Beyoncé', 'BEYONCE')).toBe(1);
  });

  it('keeps letters from other alphabets and compares Korean syllable by syllable', () => {
    expect(diceSimilarity('사랑해', '사랑해!')).toBe(1);
    expect(diceSimilarity('사랑해', '이별')).toBe(0);
    // Two syllable bigrams against one, sharing one: 2 * 1 / (2 + 1).
    expect(diceSimilarity('사랑해', '사랑')).toBeCloseTo(2 / 3, 10);
  });

  it('is the share of bigrams in common (night / nacht share only "ht")', () => {
    expect(diceSimilarity('night', 'nacht')).toBeCloseTo(0.25, 10);
  });

  it('counts a repeated bigram as many times as it appears', () => {
    // aaaa has three "aa", aa has one: 2 * 1 / (3 + 1).
    expect(diceSimilarity('aaaa', 'aa')).toBeCloseTo(0.5, 10);
  });

  it('gives the same value in both directions', () => {
    expect(diceSimilarity('Space Oddity', 'Space')).toBe(diceSimilarity('Space', 'Space Oddity'));
  });

  it('handles one-character text', () => {
    expect(diceSimilarity('X', 'x')).toBe(1);
    expect(diceSimilarity('X', 'Y')).toBe(0);
    expect(diceSimilarity('X', 'XY')).toBe(0);
  });

  it('is 0 when nothing is left to compare after cleaning', () => {
    expect(diceSimilarity('', '')).toBe(0);
    expect(diceSimilarity('!!!', '???')).toBe(0);
    expect(diceSimilarity('Song', '')).toBe(0);
  });
});
