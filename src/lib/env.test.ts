import { afterEach, describe, expect, it, vi } from 'vitest';
import { appUrl, supabaseEnv } from './env';

describe('supabaseEnv', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('reads the project URL and the anon key', () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://127.0.0.1:54321');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'anon-key');

    expect(supabaseEnv()).toEqual({ url: 'http://127.0.0.1:54321', anonKey: 'anon-key' });
  });

  it.each([
    ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY'],
    ['NEXT_PUBLIC_SUPABASE_ANON_KEY', 'NEXT_PUBLIC_SUPABASE_URL'],
  ])('fails loudly when %s is missing', (missing, present) => {
    vi.stubEnv(missing, '');
    vi.stubEnv(present, 'value');

    expect(() => supabaseEnv()).toThrow(/NEXT_PUBLIC_SUPABASE_URL.*NEXT_PUBLIC_SUPABASE_ANON_KEY/);
  });
});

describe('appUrl', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('is the configured address of the app', () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'http://localhost:3000');

    expect(appUrl()).toBe('http://localhost:3000');
  });

  it('drops a trailing slash so paths can be appended', () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://hookbop.app/');

    expect(appUrl()).toBe('https://hookbop.app');
  });

  it('fails loudly when it is missing', () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', '');

    expect(() => appUrl()).toThrow(/NEXT_PUBLIC_APP_URL/);
  });
});
