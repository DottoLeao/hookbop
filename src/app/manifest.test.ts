// @vitest-environment node
import { describe, expect, it } from 'vitest';
import manifest from './manifest';

describe('manifest', () => {
  const m = manifest();

  it('names the app and starts it standalone on the home page, on the dark brand color', () => {
    expect(m.name).toBe('Hookbop');
    expect(m.short_name).toBe('Hookbop');
    expect(m.start_url).toBe('/');
    expect(m.display).toBe('standalone');
    expect(m.background_color).toBe('#0E0E10');
    expect(m.theme_color).toBe('#0E0E10');
  });

  it('appears in the Android share menu: a GET to /compartilhar with the title, text and url', () => {
    expect(m.share_target).toEqual({
      action: '/compartilhar',
      method: 'GET',
      params: { title: 'title', text: 'text', url: 'url' },
    });
  });

  it('has the 192 and 512 icons and a maskable 512 one, all PNG files that ship in public/', () => {
    const icons = m.icons ?? [];
    const find = (src: string) => icons.find((icon) => icon.src === src);

    expect(find('/icons/icon-192.png')).toMatchObject({ sizes: '192x192', type: 'image/png', purpose: 'any' });
    expect(find('/icons/icon-512.png')).toMatchObject({ sizes: '512x512', type: 'image/png', purpose: 'any' });
    expect(find('/icons/icon-maskable-512.png')).toMatchObject({
      sizes: '512x512',
      type: 'image/png',
      purpose: 'maskable',
    });
    expect(icons.some((icon) => icon.purpose === 'maskable')).toBe(true);
  });
});
