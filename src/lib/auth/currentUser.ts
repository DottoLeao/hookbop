import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/database.types';

/**
 * Who is signed in, read from the session token after checking its signature (the same check
 * src/proxy.ts makes), or null without a session. Pages and Server Actions use it to say
 * whose data to touch; row-level security still decides what that person may touch.
 */
export async function currentUserId(supabase: SupabaseClient<Database>): Promise<string | null> {
  const { data } = await supabase.auth.getClaims();
  return data?.claims.sub ?? null;
}
