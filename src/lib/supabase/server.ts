import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { supabaseEnv } from '@/lib/env';
import type { Database } from './database.types';

/**
 * Supabase client for Server Components, Route Handlers and Server Actions.
 * Create one per request; never keep it in a module-level variable.
 */
export async function createServerSupabase() {
  const { url, anonKey } = supabaseEnv();
  const cookieStore = await cookies();

  return createServerClient<Database>(url, anonKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // A Server Component cannot write cookies. That is fine: src/proxy.ts
          // refreshes the session on every request before the page renders.
        }
      },
    },
  });
}
