import type { PlayerAdapter, PlayerError, PlayerState } from './adapter';

/**
 * A player for tests. Time moves only when a test calls `advance`, and only while the state is 'playing'.
 * `emitState` and `emitError` stand in for what YouTube would report; `calls` records what the code under test asked for.
 */
export class FakePlayerAdapter implements PlayerAdapter {
  /** 'play', 'pause', 'seek:<ms>' and 'rate:<r>', in the order they were called. */
  readonly calls: string[] = [];

  private readonly durationMs: number;
  private timeMs = 0;
  private state: PlayerState = 'unstarted';
  private readonly stateListeners = new Set<(s: PlayerState) => void>();
  private readonly errorListeners = new Set<(e: PlayerError) => void>();

  constructor(durationMs: number) {
    this.durationMs = durationMs;
  }

  getCurrentTimeMs(): number {
    return this.timeMs;
  }

  getDurationMs(): number {
    return this.durationMs;
  }

  play(): void {
    this.calls.push('play');
    this.emitState('playing');
  }

  pause(): void {
    this.calls.push('pause');
    this.emitState('paused');
  }

  seekTo(ms: number): void {
    this.calls.push(`seek:${ms}`);
    this.timeMs = this.clamp(ms);
  }

  setRate(rate: 0.75 | 1): void {
    this.calls.push(`rate:${rate}`);
  }

  onState(cb: (s: PlayerState) => void): () => void {
    this.stateListeners.add(cb);
    return () => {
      this.stateListeners.delete(cb);
    };
  }

  onError(cb: (e: PlayerError) => void): () => void {
    this.errorListeners.add(cb);
    return () => {
      this.errorListeners.delete(cb);
    };
  }

  destroy(): void {
    this.stateListeners.clear();
    this.errorListeners.clear();
  }

  /** Test helper: moves the clock forward by `ms`, but only while playing. Emits 'ended' at the end. */
  advance(ms: number): void {
    if (this.state !== 'playing') return;
    this.timeMs = this.clamp(this.timeMs + ms);
    if (this.timeMs >= this.durationMs) this.emitState('ended');
  }

  /** Test helper: reports a state as YouTube would. It also becomes the state that `advance` checks. */
  emitState(s: PlayerState): void {
    this.state = s;
    for (const cb of [...this.stateListeners]) cb(s);
  }

  /** Test helper: reports an error as YouTube would. */
  emitError(e: PlayerError): void {
    for (const cb of [...this.errorListeners]) cb(e);
  }

  private clamp(ms: number): number {
    return Math.min(Math.max(ms, 0), this.durationMs);
  }
}
