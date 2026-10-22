import { describe, expect, it } from 'vitest';
import { isLoginError, isLoginState, isPublicPath, loginErrorPath, loginPath, pathAfterRedeem } from './paths';

describe('isPublicPath', () => {
  it.each([
    '/entrar',
    '/auth/callback',
    '/convite/ABC123',
    '/manifest.webmanifest',
    '/sw.js',
    '/icons/icon-192.png',
  ])('lets %s through without a session', (path) => {
    expect(isPublicPath(path)).toBe(true);
  });

  it.each(['/', '/jogar/dQw4w9WgXcQ', '/compartilhar', '/convidar', '/admin', '/api/help'])(
    'keeps %s for members only',
    (path) => {
      expect(isPublicPath(path)).toBe(false);
    },
  );

  it.each(['/entrar-fake', '/entrar/x', '/authx/callback', '/auth', '/convite', '/icons', '/sw.js.map'])(
    'does not treat the look-alike %s as public',
    (path) => {
      expect(isPublicPath(path)).toBe(false);
    },
  );

  it('does not let a public prefix climb out to a private page', () => {
    expect(isPublicPath('/icons/../admin')).toBe(false);
    expect(isPublicPath('/convite/../convidar')).toBe(false);
  });
});

describe('loginErrorPath and isLoginError', () => {
  it('carries the error on ?erro=', () => {
    expect(loginErrorPath('link')).toBe('/entrar?erro=link');
    expect(loginErrorPath('servico')).toBe('/entrar?erro=servico');
  });

  it('knows only the errors the sign-in page has a message for', () => {
    expect(isLoginError('link')).toBe(true);
    expect(isLoginError('servico')).toBe(true);
    expect(isLoginError('qualquer-coisa')).toBe(false);
    expect(isLoginError(['link'])).toBe(false);
    expect(isLoginError(undefined)).toBe(false);
  });
});

describe('loginPath', () => {
  it('is the bare sign-in page without a state', () => {
    expect(loginPath()).toBe('/entrar');
  });

  it('carries the state in the query string', () => {
    expect(loginPath('sem-convite')).toBe('/entrar?estado=sem-convite');
  });

  it('escapes anything that is not a plain word', () => {
    expect(loginPath('a&b=c')).toBe('/entrar?estado=a%26b%3Dc');
  });
});

describe('isLoginState', () => {
  it.each(['sem-convite', 'used', 'full', 'removed', 'not_found'])('knows %s', (state) => {
    expect(isLoginState(state)).toBe(true);
  });

  it.each(['', 'ok', 'already_member', 'toString', '__proto__', undefined, null, ['used']])(
    'rejects %j',
    (state) => {
      expect(isLoginState(state)).toBe(false);
    },
  );
});

describe('pathAfterRedeem', () => {
  it.each(['ok', 'already_member'])('sends a %s sign-in to the app', (result) => {
    expect(pathAfterRedeem(result)).toBe('/');
  });

  it.each(['used', 'full', 'removed', 'not_found'])('sends %s back to sign-in with that state', (result) => {
    expect(pathAfterRedeem(result)).toBe(`/entrar?estado=${result}`);
  });
});
