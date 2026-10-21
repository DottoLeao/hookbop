import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { connection } from 'next/server';
import { supabaseEnv } from '@/lib/env';
import type { Database } from './database.types';

/**
 * Supabase client for Server Components, Route Handlers and Server Actions.
 * Create one per request; never keep it in a module-level variable.
 */
export async function createServerSupabase() {
  // Whatever is done with this client first checks the session token against the clock
  // (Date.now()), and Next.js does not allow that while it prepares a page ahead of time
  // (the dev server logs "Date.now() while prerendering"). Waiting for a real request keeps
  // the session work out of the part of the page that is built before any request.
  await connection();

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
