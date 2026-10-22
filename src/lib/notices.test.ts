import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/** Reads a file from the project (the tests run from its root), with Windows line ends made plain. */
function read(path: string): string {
  return readFileSync(resolve(process.cwd(), path), 'utf8').replace(/\r\n/g, '\n');
}

describe('third-party notices', () => {
  const notices = read('THIRD_PARTY_NOTICES.md');

  it('holds the whole SCOWL notice that ships with wordlist-english', () => {
    const scowl = read('node_modules/wordlist-english/Copyright').trim();
    expect(scowl.length).toBeGreaterThan(10000);
    expect(notices).toContain(scowl);
    expect(notices).toContain('Kevin Atkinson');
  });

  it('holds the MIT licence of double-metaphone', () => {
    const licence = read('node_modules/double-metaphone/license').trim();
    expect(notices).toContain(licence);
    expect(notices).toContain('Titus Wormer');
  });

  it.each([
    ['React', 'node_modules/react/LICENSE'],
    ['React DOM', 'node_modules/react-dom/LICENSE'],
    ['Next.js', 'node_modules/next/license.md'],
    ['@supabase/ssr', 'node_modules/@supabase/ssr/LICENSE'],
    ['@supabase/supabase-js', 'node_modules/@supabase/supabase-js/LICENSE'],
    ['qrcode', 'node_modules/qrcode/license'],
  ])('holds the MIT licence of %s, as its package ships it', (_name, path) => {
    const licence = read(path).trim();
    expect(licence).toMatch(/MIT License/);
    expect(notices).toContain(licence);
  });

  it.each([
    ['Inter', 'Copyright 2020 The Inter Project Authors (https://github.com/rsms/inter)'],
    ['Space Grotesk', 'Copyright 2020 The Space Grotesk Project Authors (https://github.com/floriankarsten/space-grotesk)'],
  ])('holds the copyright of the %s font with the SIL Open Font License 1.1 after it', (_name, copyright) => {
    const at = notices.indexOf(copyright);
    expect(at).toBeGreaterThan(-1);
    const after = notices.slice(at);
    expect(after).toContain('This Font Software is licensed under the SIL Open Font License, Version 1.1.');
    expect(after).toContain('SIL OPEN FONT LICENSE Version 1.1 - 26 February 2007');
    expect(after).toContain('5) The Font Software, modified or unmodified, in part or in whole,');
    expect(after).toContain('OTHER DEALINGS IN THE FONT SOFTWARE.');
  });

  it('is served with the app as public/licencas.txt, the same text', () => {
    expect(read('public/licencas.txt')).toBe(notices);
  });
});
