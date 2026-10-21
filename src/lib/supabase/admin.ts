import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { supabaseEnv } from '@/lib/env';
import type { Database } from './database.types';

// The marker import above makes the build fail if a Client Component ever pulls this
// module in. The key has no NEXT_PUBLIC_ prefix either, so Next.js never inlines it
// into browser code.

/** Service role key of the project: full access to the database, past every row-level rule. */
export function serviceRoleKey(): string {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY must be set (see .env.example).');
  }
  return key;
}

/**
 * Supabase client that bypasses row-level security. Server code only, and only for the
 * few reads that no member may do on their own (an invite page for someone not signed in,
 * the member cap). Check who is asking before using it, and return only what the page needs.
 */
export function createServiceSupabase() {
  const { url } = supabaseEnv();
  return createClient<Database>(url, serviceRoleKey(), {
    // A server-wide client has no user: nothing to store or refresh.
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
