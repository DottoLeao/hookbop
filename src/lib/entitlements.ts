/** Things a player can get beyond the plain game: a hint, double XP on a song, a second way to repair the streak. */
export type Perk = 'hint' | 'double_xp' | 'streak_repair';

/** How a perk is unlocked: `free` for everyone, `ad` after a rewarded ad, `off` for nobody. */
export type Entitlement = 'free' | 'ad' | 'off';

/** The phases the app knows about. Documentation of the valid values; `getEntitlements` accepts any string. */
export type AppPhase = 'closed_beta' | 'public';

const BY_PHASE: Record<AppPhase, Record<Perk, Entitlement>> = {
  // Phase 1: every ad spot is on screen, but it unlocks its perk for free.
  closed_beta: { hint: 'free', double_xp: 'free', streak_repair: 'free' },
  // Public launch: the same spots now ask for a rewarded ad.
  public: { hint: 'ad', double_xp: 'ad', streak_repair: 'ad' },
};

/**
 * What the player can use in this phase. This is the only place that decides it, so turning ads on is a change of
 * phase and not of screens.
 *
 * The caller passes `process.env.NEXT_PUBLIC_APP_PHASE` as it is. Only the exact string 'public' puts the perks
 * behind ads; anything else (not set, empty, a typo, 'PUBLIC') gets the closed-beta table, so a misconfigured env
 * can never make the perks vanish.
 */
export function getEntitlements(phase: string | undefined): Record<Perk, Entitlement> {
  return { ...BY_PHASE[phase === 'public' ? 'public' : 'closed_beta'] };
}
