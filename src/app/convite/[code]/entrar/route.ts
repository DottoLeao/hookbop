import { NextResponse, type NextRequest } from 'next/server';
import { INVITE_COOKIE, inviteCookieOptions } from '@/lib/auth/inviteCookie';
import { loginPath } from '@/lib/auth/paths';
import { createServiceSupabase } from '@/lib/supabase/admin';
import { lookupInvite } from '@/lib/supabase/invites';

// The "Entrar" button of /convite/[code] posts here. It lives one segment below the page
// because Next.js does not allow a route.ts next to a page.tsx.
//
// A valid code is kept in the hb_invite cookie, which /auth/callback reads once the person
// has signed in. Anything else goes back to the invite page, which says what is wrong.
export async function POST(request: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;

  const invite = await lookupInvite(createServiceSupabase(), code);
  if (invite.state !== 'valid') {
    // 303: the browser follows a POST with a GET.
    return NextResponse.redirect(new URL(`/convite/${encodeURIComponent(code)}`, request.url), 303);
  }

  const response = NextResponse.redirect(new URL(loginPath(), request.url), 303);
  response.cookies.set(INVITE_COOKIE, code, inviteCookieOptions());
  return response;
}
