/**
 * The notice that the privacy policy changed (the policy promises "Se esta política mudar, avisamos no app"). It shows
 * once per change on each device, to the members who knew the policy before it: those who joined before the change.
 * A member who joined after it never saw an older one, and is told nothing.
 */

/** The day the policy last changed, the date at the top of /privacidade (`privacidade.updated`). Change both at once. */
export const POLICY_DATE = '2026-10-26';

/** Where the device keeps the date of the last change it told the member about. */
export const POLICY_NOTICE_KEY = 'hb_policy_notice';

/** The change took effect at midnight in Brasília (UTC-3 all year), as the app counts its days. */
const CHANGED_AT = Date.parse(`${POLICY_DATE}T00:00:00-03:00`);

type NoticeStorage = Pick<Storage, 'getItem' | 'setItem'>;

/** Whether a member who joined at `joinedAt` (an ISO time) knew a policy older than this one. */
export function knewOlderPolicy(joinedAt: string): boolean {
  const at = Date.parse(joinedAt);
  return Number.isFinite(at) && at < CHANGED_AT;
}

/**
 * Whether the notice is to be shown: the member knew an older policy, and this device has not told them of this change
 * yet. Browser storage can be blocked (private mode, site data off), and then the notice does not show, as it could
 * not be shown only once (the install prompt does the same).
 */
export function policyNoticeDue(storage: NoticeStorage | null, joinedAt: string): boolean {
  if (!storage || !knewOlderPolicy(joinedAt)) return false;
  try {
    return storage.getItem(POLICY_NOTICE_KEY) !== POLICY_DATE;
  } catch {
    return false;
  }
}

/** Remembers that the member was told of this change. When the storage refuses, nothing is remembered. */
export function rememberPolicyNotice(storage: NoticeStorage | null): void {
  try {
    storage?.setItem(POLICY_NOTICE_KEY, POLICY_DATE);
  } catch {
    // Blocked or full: the notice was shown for this visit anyway.
  }
}
