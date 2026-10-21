/** What the player is doing, in the app's own words (not YouTube's numeric codes). */
export type PlayerState = 'unstarted' | 'playing' | 'paused' | 'buffering' | 'ended';

/** Why a video cannot play: the owner blocked embedding, it does not exist, or anything else. */
export type PlayerError = 'not_embeddable' | 'not_found' | 'other';

/**
 * The only way the game, the song screen and the game screen drive the player.
 * Times are in milliseconds. `onState` and `onError` return the function that removes the listener.
 */
export interface PlayerAdapter {
  getCurrentTimeMs(): number;
  getDurationMs(): number;
  play(): void;
  pause(): void;
  seekTo(ms: number): void;
  setRate(rate: 0.75 | 1): void;
  onState(cb: (s: PlayerState) => void): () => void;
  onError(cb: (e: PlayerError) => void): () => void;
  destroy(): void;
}
