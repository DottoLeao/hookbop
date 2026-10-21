// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { inviteQrSvg } from './qr';

describe('inviteQrSvg', () => {
  it('draws the link as SVG markup', async () => {
    const svg = await inviteQrSvg('https://hookbop.app/convite/ABCDEFGH23');

    expect(svg).toMatch(/^<svg [^>]*viewBox="0 0 \d+ \d+"/);
    expect(svg).toMatch(/<\/svg>$/);
  });

  it('is dark squares on a light background, so phone cameras read it on the dark app too', async () => {
    const svg = await inviteQrSvg('https://hookbop.app/convite/ABCDEFGH23');

    expect(svg).toContain('stroke="#0E0E10"');
    expect(svg).toContain('fill="#FFFFFF"');
  });

  it('holds nothing but shapes, whatever the text, so it is safe to place in the page as markup', async () => {
    const svg = await inviteQrSvg('"><script>alert(1)</script><img src=x onerror=alert(2)>');

    const tags = [...svg.matchAll(/<\/?([a-zA-Z][\w-]*)/g)].map((match) => match[1]);
    expect(new Set(tags)).toEqual(new Set(['svg', 'path']));
    expect(svg).not.toMatch(/script|onerror|alert/i);
  });

  it('draws different squares for different links', async () => {
    const one = await inviteQrSvg('https://hookbop.app/convite/ABCDEFGH23');
    const other = await inviteQrSvg('https://hookbop.app/convite/ZZZZZZZZ99');

    expect(one).not.toBe(other);
  });
});
