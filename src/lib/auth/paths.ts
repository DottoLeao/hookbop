export const LOGIN_PATH = '/entrar';
export const CALLBACK_PATH = '/auth/callback';

// Reachable without a session: the sign-in page, the route that finishes
// sign-in, the invite landing pages, and what the browser needs to install the app.
const PUBLIC_PATHS: ReadonlySet<string> = new Set([
  LOGIN_PATH,
  CALLBACK_PATH,
  '/manifest.webmanifest',
  '/sw.js',
]);
const PUBLIC_PREFIXES = ['/convite/', '/icons/'];

export function isPublicPath(pathname: string): boolean {
  // A ".." segment could climb out of a public prefix into a private page.
  if (pathname.includes('..')) return false;
  return PUBLIC_PATHS.has(pathname) || PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

/** Why the sign-in page was opened, as carried by `/entrar?estado=`. */
export const LOGIN_STATES = ['sem-convite', 'used', 'full', 'removed', 'not_found'] as const;
export type LoginState = (typeof LOGIN_STATES)[number];

export function isLoginState(value: unknown): value is LoginState {
  return typeof value === 'string' && (LOGIN_STATES as readonly string[]).includes(value);
}

export function loginPath(estado?: string): string {
  return estado ? `${LOGIN_PATH}?estado=${encodeURIComponent(estado)}` : LOGIN_PATH;
}

/** Where to send someone once redeem_invite has answered. */
export function pathAfterRedeem(result: string): string {
  return result === 'ok' || result === 'already_member' ? '/' : loginPath(result);
}
