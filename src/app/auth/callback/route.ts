import { NextResponse, type NextRequest } from 'next/server';
import { displayNameFor } from '@/lib/auth/displayName';
import { INVITE_COOKIE } from '@/lib/auth/inviteCookie';
import { loginPath, pathAfterRedeem } from '@/lib/auth/paths';
import { createServerSupabase } from '@/lib/supabase/server';

// Where Google and the e-mail link send people back to. It trades the one-time
// code for a session, makes the owner a member, or turns a pending invite
// (cookie hb_invite) into a membership, and then decides where to go.
export async function GET(request: NextRequest) {
  const go = (path: string) => NextResponse.redirect(new URL(path, request.url));

  const code = request.nextUrl.searchParams.get('code');
  // No code: the person cancelled at Google, or the link is broken.
  if (!code) return go(loginPath());

  const supabase = await createServerSupabase();

  const { data: session, error: sessionError } = await supabase.auth.exchangeCodeForSession(code);
  if (sessionError) return go(loginPath());

  const { data: isOwner, error: ownerError } = await supabase.rpc('ensure_owner');
  if (ownerError) return go(loginPath());

  const inviteCode = request.cookies.get(INVITE_COOKIE)?.value;
  let destination = '/';

  if (!isOwner && inviteCode) {
    const { data: result, error: redeemError } = await supabase.rpc('redeem_invite', {
      p_code: inviteCode,
      p_display_name: displayNameFor(session.user),
    });
    // Keep the cookie when the call itself failed, so signing in again can retry.
    if (redeemError) return go(loginPath());
    destination = pathAfterRedeem(result);
  }

  // Anyone else lands on "/" and the proxy decides: members get in, the rest
  // are sent back to sign-in with "sem-convite".
  const response = go(destination);
  if (inviteCode) response.cookies.delete(INVITE_COOKIE);
  return response;
}
