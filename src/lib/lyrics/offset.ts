/** A video this much longer than the lyrics probably has an intro the lyrics do not cover. */
const CALIBRATION_THRESHOLD_S = 10;

/**
 * The largest offset a vote may carry, either way, in ms. The database refuses a vote beyond it (migration 0005, ruling
 * R87), so the calibration sheet checks it first. Music videos with a long intro need a lot more than 30 s.
 */
export const MAX_OFFSET_MS = 120_000;

/** True when the video is more than 10 s longer than the lyrics, so their timing may be off. */
export function needsCalibration(videoDurationS: number, lyricsDurationS: number): boolean {
  return videoDurationS - lyricsDurationS > CALIBRATION_THRESHOLD_S;
}

/**
 * The middle value of the offsets players voted for, in ms (0 when there are none).
 * With an even count it is the mean of the two middle values.
 * The median keeps one wild vote from moving the result.
 */
export function medianOffset(votesMs: number[]): number {
  if (votesMs.length === 0) return 0;
  const sorted = [...votesMs].sort((x, y) => x - y);
  const mid = sorted.length >> 1;
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}
