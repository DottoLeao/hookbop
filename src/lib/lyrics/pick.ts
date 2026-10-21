import { diceSimilarity } from './similarity';
import type { LyricsQuery } from './source';

/** One song as LRCLIB describes it (durations in seconds). */
export type LrclibCandidate = {
  id: number;
  trackName: string;
  artistName: string;
  duration: number;
  syncedLyrics: string | null;
};

const MIN_TRACK_SIMILARITY = 0.6;
const TRACK_WEIGHT = 0.5;
const ARTIST_WEIGHT = 0.3;
const DURATION_WEIGHT = 0.2;
/** A duration this far from the video's earns nothing. */
const DURATION_REACH_S = 30;
/** Scores closer than this are a tie (floating point noise is not a difference). */
const SCORE_TIE = 1e-9;

interface Scored {
  candidate: LrclibCandidate;
  score: number;
  durationDiffS: number;
}

/** The candidate's score, or null when it cannot be used (no synced lyrics, or a different song). */
function scoreOf(candidate: LrclibCandidate, q: LyricsQuery): Scored | null {
  if (!candidate.syncedLyrics?.trim()) return null;

  const trackSimilarity = diceSimilarity(candidate.trackName, q.track);
  if (trackSimilarity < MIN_TRACK_SIMILARITY) return null;

  const artistSimilarity = diceSimilarity(candidate.artistName, q.artist);
  const diff = Math.abs(candidate.duration - q.durationS);
  // An unusable duration (NaN) says nothing, so it is treated as infinitely far.
  const durationDiffS = Number.isFinite(diff) ? diff : Infinity;
  const durationCloseness = Math.max(0, 1 - durationDiffS / DURATION_REACH_S);

  const score =
    TRACK_WEIGHT * trackSimilarity + ARTIST_WEIGHT * artistSimilarity + DURATION_WEIGHT * durationCloseness;
  return { candidate, score, durationDiffS };
}

function isBetter(a: Scored, b: Scored): boolean {
  if (Math.abs(a.score - b.score) > SCORE_TIE) return a.score > b.score;
  return a.durationDiffS < b.durationDiffS;
}

/**
 * The candidate that best matches the song, or null when none is good enough.
 * Only candidates with synced lyrics and a title at least 0.6 similar to the track count.
 * The score is 0.5 title + 0.3 artist + 0.2 duration; on a tie the closer duration wins,
 * and on a full tie the earlier candidate stays.
 */
export function pickBestCandidate(cands: LrclibCandidate[], q: LyricsQuery): LrclibCandidate | null {
  let best: Scored | null = null;
  for (const candidate of cands) {
    const scored = scoreOf(candidate, q);
    if (scored && (best === null || isBetter(scored, best))) best = scored;
  }
  return best?.candidate ?? null;
}
