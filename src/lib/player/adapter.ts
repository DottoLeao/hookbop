/** What the player is doing, in the app's own words (not YouTube's numeric codes). */
export type PlayerState = 'unstarted' | 'playing' | 'paused' | 'buffering' | 'ended';

/** Why a video cannot play: the owner blocked embedding, it does not exist, or anything else. */
export type PlayerError = 'not_embeddable' | 'not_found' | 'other';

/** A volume as the players take it: a whole number from 0 (silent) to 100 (full). */
export function clampVolume(v: number): number {
  return Math.min(100, Math.max(0, Math.round(v)));
}

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
  /** Sets the volume, rounded to a whole number from 0 to 100. Some platforms (iOS) ignore it. */
  setVolume(v: number): void;
  /** The volume from 0 to 100. A player that is gone reads as 100, the volume a new one starts with. */
  getVolume(): number;
  /** The state the player is in right now. It reads the player; it does not wait for an `onState` event. */
  getPlayerState(): PlayerState;
  onState(cb: (s: PlayerState) => void): () => void;
  onError(cb: (e: PlayerError) => void): () => void;
  destroy(): void;
}
