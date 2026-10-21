import { createBrowserClient } from '@supabase/ssr';
import { supabaseEnv } from '@/lib/env';
import type { Database } from './database.types';

/** Supabase client for Client Components. The session lives in cookies, so the server sees it too. */
export function createBrowserSupabase() {
  const { url, anonKey } = supabaseEnv();
  return createBrowserClient<Database>(url, anonKey);
}
