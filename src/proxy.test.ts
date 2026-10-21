// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { config } from './proxy';

// Next.js anchors the matcher to the whole path, so the same is done here.
const matcher = new RegExp(`^${config.matcher[0]}$`);

describe('proxy matcher', () => {
  it.each(['/', '/entrar', '/auth/callback', '/jogar/dQw4w9WgXcQ', '/icons/icon-192.png', '/sw.js'])(
    'runs on %s',
    (path) => {
      expect(matcher.test(path)).toBe(true);
    },
  );

  it.each(['/favicon.ico', '/_next/static/chunks/main.js', '/_next/image'])('skips %s', (path) => {
    expect(matcher.test(path)).toBe(false);
  });

  it('treats the dot in favicon.ico as a dot, not as any character', () => {
    expect(matcher.test('/faviconXico')).toBe(true);
    expect(matcher.test('/favicon-ico')).toBe(true);
  });
});
