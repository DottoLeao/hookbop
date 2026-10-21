import type { SupabaseClient } from '@supabase/supabase-js';
import { NextResponse, type NextRequest } from 'next/server';
import { completeSignIn } from '@/lib/auth/completeSignIn';
import { INVITE_COOKIE } from '@/lib/auth/inviteCookie';
import { loginPath } from '@/lib/auth/paths';
import type { Database } from '@/lib/supabase/database.types';
import { createServerSupabase } from '@/lib/supabase/server';

/**
 * Who just signed in, by whichever way they came:
 * - `?code=` is the one-time code Google or the e-mail link sends back, traded for a session here;
 * - `?via=otp` means the six-digit code was verified in the browser, which already
 *   left the session in the cookies, so only the user is read (and checked with the auth server).
 */
async function signedInUser(supabase: SupabaseClient<Database>, params: URLSearchParams) {
  if (params.get('via') === 'otp') {
    const { data } = await supabase.auth.getUser();
    return data.user;
  }

  const code = params.get('code');
  // No code: the person cancelled at Google, or the link is broken.
  if (!code) return null;

  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  return error ? null : data.user;
}

// The one place every sign-in ends: Google, the e-mail link and the six-digit code.
// completeSignIn decides who becomes a member and where to go.
export async function GET(request: NextRequest) {
  const go = (path: string) => NextResponse.redirect(new URL(path, request.url));

  const supabase = await createServerSupabase();
  const user = await signedInUser(supabase, request.nextUrl.searchParams);
  if (!user) return go(loginPath());

  const inviteCode = request.cookies.get(INVITE_COOKIE)?.value;
  const { path, clearInviteCookie } = await completeSignIn(supabase, user, inviteCode);

  const response = go(path);
  if (clearInviteCookie) response.cookies.delete(INVITE_COOKIE);
  return response;
}
