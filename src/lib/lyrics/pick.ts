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
/** An artist less alike than this is someone else's song of the same name... */
const MIN_ARTIST_SIMILARITY = 0.3;
/** ...unless the duration is this close to the video's, which says it is the same recording. */
const SAME_RECORDING_S = 2;
const TRACK_WEIGHT = 0.5;
const ARTIST_WEIGHT = 0.3;
const DURATION_WEIGHT = 0.2;
/** A duration this far from the video's earns nothing. */
const DURATION_REACH_S = 30;
/** Scores closer than this are a tie (floating point noise is not a difference). */
const SCORE_TIE = 1e-9;

/** A group in round or square brackets at the end of a title, with the space before it. */
const TRAILING_GROUP = /\s*(?:\([^()]*\)|\[[^[\]]*\])\s*$/;

/** A dash (hyphen, en or em) between spaces, and everything after it. */
const DASH_SUFFIX = /\s+[-–—]\s+.*$/;

interface Scored {
  candidate: LrclibCandidate;
  score: number;
  durationDiffS: number;
}

/**
 * The title without the decorations LRCLIB entries often carry at the end:
 * "(Remastered 2011)", "[Live]", "(feat. X)", " - Radio Edit". Removed over and over until none is left,
 * so "Song (feat. Y) - Live (2011)" becomes "Song".
 */
function stripTrailingDecorations(title: string): string {
  let text = title.trim();
  for (;;) {
    const next = text.replace(TRAILING_GROUP, '').replace(DASH_SUFFIX, '').trim();
    if (next === text) return text;
    text = next;
  }
}

/**
 * The candidate's score, or null when it cannot be used: no synced lyrics, a different title, or a different artist
 * with a duration more than 2 s from the video's (a cover or another song of the same name).
 */
function scoreOf(candidate: LrclibCandidate, q: LyricsQuery): Scored | null {
  if (!candidate.syncedLyrics?.trim()) return null;

  // A decorated entry ("Song (Remastered 2011)") counts as the song it decorates, so the better of both reads wins.
  const trackSimilarity = Math.max(
    diceSimilarity(candidate.trackName, q.track),
    diceSimilarity(stripTrailingDecorations(candidate.trackName), q.track),
  );
  if (trackSimilarity < MIN_TRACK_SIMILARITY) return null;

  const artistSimilarity = diceSimilarity(candidate.artistName, q.artist);
  const diff = Math.abs(candidate.duration - q.durationS);
  // An unusable duration (NaN) says nothing, so it is treated as infinitely far.
  const durationDiffS = Number.isFinite(diff) ? diff : Infinity;
  if (artistSimilarity < MIN_ARTIST_SIMILARITY && durationDiffS > SAME_RECORDING_S) return null;
  const durationCloseness = Math.max(0, 1 - durationDiffS / DURATION_REACH_S);

  const score =
    TRACK_WEIGHT * trackSimilarity + ARTIST_WEIGHT * artistSimilarity + DURATION_WEIGHT * durationCloseness;
  return { candidate, score, durationDiffS };
}

/** True when the candidate could be picked for the song at all: synced lyrics, the same title and artist rules. */
export function isSameSong(candidate: LrclibCandidate, q: LyricsQuery): boolean {
  return scoreOf(candidate, q) !== null;
}

function isBetter(a: Scored, b: Scored): boolean {
  if (Math.abs(a.score - b.score) > SCORE_TIE) return a.score > b.score;
  return a.durationDiffS < b.durationDiffS;
}

/**
 * The candidate that best matches the song, or null when none is good enough.
 * Only candidates with synced lyrics and a title at least 0.6 similar to the track count;
 * the title is compared as written and without its trailing decorations, and the better match counts.
 * An artist less than 0.3 similar rules a candidate out, unless its duration is within 2 s of the video's.
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
