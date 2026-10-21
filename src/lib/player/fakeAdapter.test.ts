import { describe, expect, it, vi } from 'vitest';
import type { PlayerError, PlayerState } from './adapter';
import { FakePlayerAdapter } from './fakeAdapter';

function recordStates(p: FakePlayerAdapter): PlayerState[] {
  const seen: PlayerState[] = [];
  p.onState((s) => seen.push(s));
  return seen;
}

describe('FakePlayerAdapter', () => {
  it('advances time while playing and records the calls', () => {
    const p = new FakePlayerAdapter(180000);
    p.play();
    p.advance(5000);
    expect(p.getCurrentTimeMs()).toBe(5000);
    p.seekTo(1000);
    expect(p.calls).toEqual(['play', 'seek:1000']);
    expect(p.getCurrentTimeMs()).toBe(1000);
  });

  it('starts at 0 and reports the duration it was built with', () => {
    const p = new FakePlayerAdapter(180000);
    expect(p.getCurrentTimeMs()).toBe(0);
    expect(p.getDurationMs()).toBe(180000);
  });

  it('only advances time while the state is playing', () => {
    const p = new FakePlayerAdapter(180000);
    p.advance(1000); // unstarted
    expect(p.getCurrentTimeMs()).toBe(0);
    p.play();
    p.advance(2000);
    p.pause();
    p.advance(5000); // paused
    expect(p.getCurrentTimeMs()).toBe(2000);
    p.emitState('buffering');
    p.advance(5000);
    expect(p.getCurrentTimeMs()).toBe(2000);
    p.emitState('playing');
    p.advance(500);
    expect(p.getCurrentTimeMs()).toBe(2500);
  });

  it('play and pause emit their state and record the call', () => {
    const p = new FakePlayerAdapter(180000);
    const seen = recordStates(p);
    p.play();
    p.pause();
    expect(seen).toEqual(['playing', 'paused']);
    expect(p.calls).toEqual(['play', 'pause']);
  });

  it('emitState reaches every listener', () => {
    const p = new FakePlayerAdapter(180000);
    const first = recordStates(p);
    const second = recordStates(p);
    p.emitState('buffering');
    expect(first).toEqual(['buffering']);
    expect(second).toEqual(['buffering']);
  });

  it('stops at the duration and emits ended once it is reached', () => {
    const p = new FakePlayerAdapter(10000);
    const seen = recordStates(p);
    p.play();
    p.advance(9999);
    expect(seen).toEqual(['playing']);
    p.advance(5000);
    expect(p.getCurrentTimeMs()).toBe(10000);
    expect(seen).toEqual(['playing', 'ended']);
    p.advance(5000); // already ended, nothing more happens
    expect(p.getCurrentTimeMs()).toBe(10000);
    expect(seen).toEqual(['playing', 'ended']);
  });

  it('emits ended when time lands exactly on the duration', () => {
    const p = new FakePlayerAdapter(10000);
    const seen = recordStates(p);
    p.play();
    p.advance(10000);
    expect(seen).toEqual(['playing', 'ended']);
  });

  it('clamps seeks to the range from 0 to the duration, and logs the requested ms', () => {
    const p = new FakePlayerAdapter(10000);
    p.seekTo(-500);
    expect(p.getCurrentTimeMs()).toBe(0);
    p.seekTo(99999);
    expect(p.getCurrentTimeMs()).toBe(10000);
    expect(p.calls).toEqual(['seek:-500', 'seek:99999']);
  });

  it('clamps time at 0 when advanced backwards', () => {
    const p = new FakePlayerAdapter(10000);
    p.play();
    p.advance(300);
    p.advance(-1000);
    expect(p.getCurrentTimeMs()).toBe(0);
  });

  it('logs the rate on setRate', () => {
    const p = new FakePlayerAdapter(180000);
    p.setRate(0.75);
    p.play();
    p.setRate(1);
    expect(p.calls).toEqual(['rate:0.75', 'play', 'rate:1']);
  });

  it('emitError reaches every error listener', () => {
    const p = new FakePlayerAdapter(180000);
    const a: PlayerError[] = [];
    const b: PlayerError[] = [];
    p.onError((e) => a.push(e));
    p.onError((e) => b.push(e));
    p.emitError('not_embeddable');
    expect(a).toEqual(['not_embeddable']);
    expect(b).toEqual(['not_embeddable']);
  });

  it('the function onState and onError return stops that listener', () => {
    const p = new FakePlayerAdapter(180000);
    const onState = vi.fn();
    const onError = vi.fn();
    const offState = p.onState(onState);
    const offError = p.onError(onError);
    offState();
    offError();
    p.emitState('playing');
    p.emitError('other');
    expect(onState).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
  });

  it('destroy drops every listener', () => {
    const p = new FakePlayerAdapter(180000);
    const onState = vi.fn();
    const onError = vi.fn();
    p.onState(onState);
    p.onError(onError);
    p.destroy();
    p.play();
    p.emitError('not_found');
    expect(onState).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
  });
});
