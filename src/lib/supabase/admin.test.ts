import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';

const createClient = vi.hoisted(() => vi.fn(() => ({ marker: 'service-client' })));
vi.mock('@supabase/supabase-js', () => ({ createClient }));

import { createServiceSupabase, serviceRoleKey } from './admin';

afterEach(() => {
  vi.unstubAllEnvs();
  createClient.mockClear();
});

describe('serviceRoleKey', () => {
  it('is the service role key of the project', () => {
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-key');

    expect(serviceRoleKey()).toBe('service-key');
  });

  it('fails loudly when it is missing', () => {
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '');

    expect(() => serviceRoleKey()).toThrow(/SUPABASE_SERVICE_ROLE_KEY/);
  });

  it('is listed in .env.example with no value, and not as a NEXT_PUBLIC variable the browser could read', () => {
    const example = readFileSync('.env.example', 'utf8');

    expect(example).toMatch(/^SUPABASE_SERVICE_ROLE_KEY=\s*$/m);
    expect(example).not.toMatch(/NEXT_PUBLIC_\w*SERVICE/i);
  });
});

describe('createServiceSupabase', () => {
  it('talks to the project with the service key and keeps no session of its own', () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://127.0.0.1:54321');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'anon-key');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-key');

    createServiceSupabase();

    expect(createClient).toHaveBeenCalledExactlyOnceWith('http://127.0.0.1:54321', 'service-key', {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  });

  it('is marked server-only, so a client bundle that imports it fails to build', () => {
    const source = readFileSync('src/lib/supabase/admin.ts', 'utf8');

    expect(source).toMatch(/^import 'server-only';$/m);
  });
});
