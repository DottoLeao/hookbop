import { NextResponse, type NextRequest } from 'next/server';
import { isPublicPath, loginErrorPath, loginPath } from '@/lib/auth/paths';
import { updateSession } from '@/lib/supabase/middleware';

// Next.js 16 calls the edge middleware file "proxy". It does three things:
// keeps the session fresh, sends anyone without a session to sign-in, and
// sends signed-in people who are not members (no invite yet, or removed) to
// sign-in with an explanation. When the membership cannot be checked at all,
// sign-in says it did not work this time, never that there is no invite.
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
