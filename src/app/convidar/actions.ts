'use server';

import { refresh } from 'next/cache';
import { currentUserId } from '@/lib/auth/currentUser';
import { createInvite } from '@/lib/supabase/invites';
import { createServerSupabase } from '@/lib/supabase/server';

export interface CreateInviteState {
  failed: boolean;
}

/**
 * Makes one new invite for the signed-in member, on every call. A Server Action can be
 * posted to directly, so it works out who is asking itself; the insert then goes through
 * the member's own session, where row-level security only lets a member add invites in
 * their own name.
 */
export async function createInviteAction(): Promise<CreateInviteState> {
  const supabase = await createServerSupabase();
  const userId = await currentUserId(supabase);
  if (!userId) return { failed: true };

  const code = await createInvite(supabase, userId);
  if (!code) return { failed: true };

  // Draw the page again so the new invite shows up.
  refresh();
  return { failed: false };
}
