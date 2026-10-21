import { describe, expect, it } from 'vitest';
import { displayNameFor } from './displayName';

describe('displayNameFor', () => {
  it('prefers the Google full name', () => {
    expect(
      displayNameFor({
        email: 'maria.silva@gmail.com',
        user_metadata: { full_name: 'Maria Silva', name: 'Maria' },
      }),
    ).toBe('Maria Silva');
  });

  it('falls back to the Google name when there is no full name', () => {
    expect(displayNameFor({ email: 'maria@gmail.com', user_metadata: { name: 'Maria' } })).toBe('Maria');
  });

  it('skips a blank full name and trims the one it uses', () => {
    expect(displayNameFor({ email: 'a@b.com', user_metadata: { full_name: '   ', name: '  Maria  ' } })).toBe(
      'Maria',
    );
  });

  it('uses the part of the e-mail before the @ for a magic-link user', () => {
    expect(displayNameFor({ email: 'maria.silva@gmail.com', user_metadata: {} })).toBe('maria.silva');
  });

  it('ignores metadata that is not text', () => {
    expect(displayNameFor({ email: 'joao@x.com', user_metadata: { full_name: 42, name: { first: 'J' } } })).toBe(
      'joao',
    );
  });

  it('copes with missing metadata', () => {
    expect(displayNameFor({ email: 'joao@x.com' })).toBe('joao');
    expect(displayNameFor({ email: 'joao@x.com', user_metadata: null })).toBe('joao');
  });

  it('is empty when there is nothing to build a name from', () => {
    expect(displayNameFor({})).toBe('');
    expect(displayNameFor({ email: null, user_metadata: null })).toBe('');
  });
});
