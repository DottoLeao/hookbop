import { afterEach, describe, expect, it, vi } from 'vitest';
import { INVITE_COOKIE, inviteCookieOptions } from './inviteCookie';

describe('invite cookie', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('is called hb_invite', () => {
    expect(INVITE_COOKIE).toBe('hb_invite');
  });

  it('is httpOnly, lasts seven days and survives the trip back from Google', () => {
    expect(inviteCookieOptions()).toMatchObject({
      httpOnly: true,
      maxAge: 7 * 24 * 60 * 60,
      path: '/',
      sameSite: 'lax',
    });
  });

  it('is sent over https only in production', () => {
    vi.stubEnv('NODE_ENV', 'production');
    expect(inviteCookieOptions().secure).toBe(true);

    vi.stubEnv('NODE_ENV', 'development');
    expect(inviteCookieOptions().secure).toBe(false);
  });
});
