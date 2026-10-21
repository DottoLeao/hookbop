import { describe, expect, it } from 'vitest';
import { getEntitlements } from './entitlements';

describe('getEntitlements', () => {
  it('gives every perk away free during the closed beta', () => {
    expect(getEntitlements('closed_beta')).toEqual({ hint: 'free', double_xp: 'free', streak_repair: 'free' });
  });

  it('puts every perk behind an ad once the app is public', () => {
    expect(getEntitlements('public')).toEqual({ hint: 'ad', double_xp: 'ad', streak_repair: 'ad' });
  });

  // A misconfigured env must never make the perks vanish: only the exact string 'public' turns ads on.
  it.each([
    ['undefined', undefined],
    ['an empty string', ''],
    ['PUBLIC in capitals', 'PUBLIC'],
    ['a typo', 'beta'],
    ['public with a space', ' public'],
    ['an unknown phase', 'staging'],
  ])('gives every perk away free for %s, the same as the closed beta', (_label, phase) => {
    expect(getEntitlements(phase)).toEqual({ hint: 'free', double_xp: 'free', streak_repair: 'free' });
  });

  it('hands out a fresh object, so a caller cannot change what the next one sees', () => {
    const first = getEntitlements('closed_beta');
    first.hint = 'off';
    expect(getEntitlements('closed_beta').hint).toBe('free');

    const fallback = getEntitlements(undefined);
    fallback.hint = 'off';
    expect(getEntitlements(undefined).hint).toBe('free');
  });
});
