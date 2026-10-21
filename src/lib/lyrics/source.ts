export interface LyricsQuery { artist: string; track: string; durationS: number }

export interface LyricsResult {
  source: 'lrclib';
  ref: string;
  syncedLrc: string;
  durationS: number;
  artist: string;
  track: string;
}

/**
 * What a lookup came back with.
 * `not_found` means the service answered and has no lyrics for the song.
 * `unavailable` means it could not answer in time (or at all), so nothing is known about the song.
 */
export type LyricsLookup =
  | { status: 'found'; result: LyricsResult }
  | { status: 'not_found' }
  | { status: 'unavailable' };

/** Where lyrics come from. LRCLIB today; another provider can replace it behind this interface. */
export interface LyricsSource { find(q: LyricsQuery): Promise<LyricsLookup> }
