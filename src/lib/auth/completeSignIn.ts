import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/database.types';
import { displayNameFor, type NameSource } from './displayName';
import { loginErrorPath, pathAfterRedeem } from './paths';

export interface SignInOutcome {
  /** Where to send the browser next. */
  path: string;
  /** True when the pending invite (cookie hb_invite) has been answered and the cookie should go. */
  clearInviteCookie: boolean;
}

/**
 * What happens right after someone signs in, however they did it (Google, the
 * e-mail link or the six-digit code): the owner becomes a member, anyone else
 * with a pending invite redeems it, and the result says where to go.
 *
 * Someone with neither goes to "/" and the proxy decides: members get in, the
 * rest are sent back to sign-in with "sem-convite". That is how a returning
 * member signs in.
 *
 * When one of the two calls fails the person is not told they have no invite or no access: the sign-in page gets
 * `erro=servico` and says the check could not be made, the same as when the proxy cannot check membership.
 */
export async function completeSignIn(
  supabase: SupabaseClient<Database>,
  user: NameSource,
  inviteCode: string | undefined,
): Promise<SignInOutcome> {
  const { data: isOwner, error: ownerError } = await supabase.rpc('ensure_owner');
  if (ownerError) return { path: loginErrorPath('servico'), clearInviteCookie: false };

  // The owner has no use for an invite, so none is redeemed; a stray cookie is still cleared.
  if (isOwner) return { path: '/', clearInviteCookie: Boolean(inviteCode) };
  if (!inviteCode) return { path: '/', clearInviteCookie: false };

  const { data: result, error: redeemError } = await supabase.rpc('redeem_invite', {
    p_code: inviteCode,
    p_display_name: displayNameFor(user),
  });
  // The call itself failed, so keep the cookie: signing in again can retry.
  if (redeemError) return { path: loginErrorPath('servico'), clearInviteCookie: false };

  return { path: pathAfterRedeem(result), clearInviteCookie: true };
}
