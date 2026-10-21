/** Holds the invite code of someone who is about to sign in. Set by the invite page, read by the callback. */
export const INVITE_COOKIE = 'hb_invite';

const SEVEN_DAYS_S = 7 * 24 * 60 * 60;

export function inviteCookieOptions() {
  return {
    httpOnly: true,
    // Lax, not strict: the cookie has to come back on the redirect from Google.
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SEVEN_DAYS_S,
  };
}
