/** Things a player can get beyond the plain game: a hint, double XP on a song, a second way to repair the streak. */
export type Perk = 'hint' | 'double_xp' | 'streak_repair';

/** How a perk is unlocked: `free` for everyone, `ad` after a rewarded ad, `off` for nobody. */
export type Entitlement = 'free' | 'ad' | 'off';

export type AppPhase = 'closed_beta' | 'public';

const BY_PHASE: Record<AppPhase, Record<Perk, Entitlement>> = {
  // Phase 1: every ad spot is on screen, but it unlocks its perk for free.
  closed_beta: { hint: 'free', double_xp: 'free', streak_repair: 'free' },
  // Public launch: the same spots now ask for a rewarded ad.
  public: { hint: 'ad', double_xp: 'ad', streak_repair: 'ad' },
};

/**
 * What the player can use in this phase. This is the only place that decides it, so turning ads on is a change of
 * phase and not of screens. The caller passes the phase (the screens read `NEXT_PUBLIC_APP_PHASE`).
 */
export function getEntitlements(phase: AppPhase): Record<Perk, Entitlement> {
  return { ...BY_PHASE[phase] };
}
