import { NextResponse, type NextRequest } from 'next/server';
import { isPublicPath, loginErrorPath, loginPath } from '@/lib/auth/paths';
import { updateSession } from '@/lib/supabase/middleware';

// Next.js 16 calls the edge middleware file "proxy". It does three things:
// keeps the session fresh, sends anyone without a session to sign-in, and
// sends signed-in people who are not members (no invite yet, or removed) to
// sign-in with an explanation. When the membership cannot be checked at all,
// sign-in says it did not work this time, never that there is no invite.
//
// The public paths (src/lib/auth/paths.ts) are let through with no session and
// no membership check. One of them is not a page but a route that does its own
// checks: POST /api/events, which the app calls in the background (and with
// sendBeacon as a page is left). It answers 401 or 403 itself, because a
// redirect to the sign-in page is no answer for a request that no one reads.
// The session is still refreshed on it, as on every path.
export async function proxy(request: NextRequest) {
  const publicPath = isPublicPath(request.nextUrl.pathname);
  const session = await updateSession(request, { checkMembership: !publicPath });

  if (!publicPath && !session.signedIn) {
    return session.apply(NextResponse.redirect(new URL(loginPath(), request.url)));
  }
  if (!publicPath && session.membershipFailed) {
    return session.apply(NextResponse.redirect(new URL(loginErrorPath('servico'), request.url)));
  }
  if (!publicPath && !session.isMember) {
    return session.apply(NextResponse.redirect(new URL(loginPath('sem-convite'), request.url)));
  }
  return session.apply(NextResponse.next({ request }));
}

export const config = {
  // Everything except Next.js internals and the favicon the browser asks for by itself.
  matcher: ['/((?!_next/|favicon\\.ico$).*)'],
};
