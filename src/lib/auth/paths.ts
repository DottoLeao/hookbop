export const LOGIN_PATH = '/entrar';
export const CALLBACK_PATH = '/auth/callback';

// Reachable without a session: the sign-in page, the route that finishes
// sign-in, the invite landing pages, what the browser needs to install the app,
// and the privacy policy, which Google and anyone deciding whether to sign in must be able to read.
const PUBLIC_PATHS: ReadonlySet<string> = new Set([
  LOGIN_PATH,
  CALLBACK_PATH,
  '/manifest.webmanifest',
  '/sw.js',
  '/privacidade',
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

/**
 * Why the sign-in page says something went wrong, as carried by `/entrar?erro=`: `link` for a sign-in link that did
 * not work (expired, used, or opened in another browser), `servico` for a membership check that could not be made.
 */
export const LOGIN_ERRORS = ['link', 'servico'] as const;
export type LoginError = (typeof LOGIN_ERRORS)[number];

export function isLoginError(value: unknown): value is LoginError {
  return typeof value === 'string' && (LOGIN_ERRORS as readonly string[]).includes(value);
}

export function loginErrorPath(erro: LoginError): string {
  return `${LOGIN_PATH}?erro=${erro}`;
}

/** Where to send someone once redeem_invite has answered. */
export function pathAfterRedeem(result: string): string {
  return result === 'ok' || result === 'already_member' ? '/' : loginPath(result);
}
