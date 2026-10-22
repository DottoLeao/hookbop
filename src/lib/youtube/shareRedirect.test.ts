import { describe, expect, it } from 'vitest';
import { resolveShareRedirect } from './shareRedirect';

const params = (query: string) => new URLSearchParams(query);

describe('resolveShareRedirect', () => {
  it('opens the song for a link in the shared text (the YouTube app puts it there)', () => {
    expect(resolveShareRedirect(params('text=Olha https://youtu.be/dQw4w9WgXcQ'))).toBe('/jogar/dQw4w9WgXcQ');
  });

  it('opens the song for a link in the url field', () => {
    expect(resolveShareRedirect(params('url=https%3A%2F%2Fwww.youtube.com%2Fwatch%3Fv%3DdQw4w9WgXcQ'))).toBe(
      '/jogar/dQw4w9WgXcQ',
    );
  });

  it('opens the song for a link in the title, and for a link with a tracking suffix', () => {
    expect(resolveShareRedirect(params('title=https%3A%2F%2Fyoutu.be%2FdQw4w9WgXcQ%3Fsi%3Dabc'))).toBe('/jogar/dQw4w9WgXcQ');
  });

  it('goes back to the home with an error flag when there is no YouTube video in what was shared', () => {
    expect(resolveShareRedirect(params('text=oi'))).toBe('/?erro=link');
    expect(resolveShareRedirect(params(''))).toBe('/?erro=link');
    expect(resolveShareRedirect(params('text=https://example.com/watch?v=dQw4w9WgXcQ'))).toBe('/?erro=link');
    expect(resolveShareRedirect(params('url=https://www.youtube.com/playlist?list=PL123'))).toBe('/?erro=link');
  });

  it('only ever returns a path on this site, never something taken from the shared text', () => {
    const target = resolveShareRedirect(params('text=//evil.example/ https://youtu.be/dQw4w9WgXcQ'));
    expect(target).toBe('/jogar/dQw4w9WgXcQ');
    expect(target.startsWith('/')).toBe(true);
    expect(target.startsWith('//')).toBe(false);
  });
});
