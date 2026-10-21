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

  it('is served with the app as public/licencas.txt, the same text', () => {
    expect(read('public/licencas.txt')).toBe(notices);
  });
});
