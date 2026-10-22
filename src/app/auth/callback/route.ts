import type { SupabaseClient, User } from '@supabase/supabase-js';
import { NextResponse, type NextRequest } from 'next/server';
import { completeSignIn } from '@/lib/auth/completeSignIn';
import { INVITE_COOKIE } from '@/lib/auth/inviteCookie';
import { loginErrorPath, loginPath } from '@/lib/auth/paths';
import type { Database } from '@/lib/supabase/database.types';
import { createServerSupabase } from '@/lib/supabase/server';

/**
 * Who just signed in, by whichever way they came, or why nobody did:
 * - `?code=` is the one-time code Google or the e-mail link sends back, traded for a session here. A code that does not
 *   trade (expired, used, or opened in another browser than the one that asked for it) is a link that did not work.
 * - `?error_code=` is Supabase saying an e-mail link did not work (expired or used) before any code was made.
 * - `?via=otp` means the six-digit code was verified in the browser, which already left the session in the cookies,
 *   so only the user is read (and checked with the auth server).
 * Nothing at all (the person cancelled at Google) is no failure of a link.
 */
async function signedInUser(
  supabase: SupabaseClient<Database>,
  params: URLSearchParams,
): Promise<{ user: User | null; linkFailed: boolean }> {
  if (params.get('via') === 'otp') {
    const { data } = await supabase.auth.getUser();
    return { user: data.user, linkFailed: false };
  }

  const code = params.get('code');
  if (!code) return { user: null, linkFailed: params.has('error_code') };

  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  return error ? { user: null, linkFailed: true } : { user: data.user, linkFailed: false };
}

// The one place every sign-in ends: Google, the e-mail link and the six-digit code.
// completeSignIn decides who becomes a member and where to go.
export async function GET(request: NextRequest) {
  const go = (path: string) => NextResponse.redirect(new URL(path, request.url));

  const supabase = await createServerSupabase();
  const { user, linkFailed } = await signedInUser(supabase, request.nextUrl.searchParams);
  // The sign-in page then says, calmly, that the link did not work and a new one can be asked for there.
  if (!user) return go(linkFailed ? loginErrorPath('link') : loginPath());

  const inviteCode = request.cookies.get(INVITE_COOKIE)?.value;
  const { path, clearInviteCookie } = await completeSignIn(supabase, user, inviteCode);

  const response = go(path);
  if (clearInviteCookie) response.cookies.delete(INVITE_COOKIE);
  return response;
}
