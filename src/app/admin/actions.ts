'use server';

import { refresh } from 'next/cache';
import { createServerSupabase } from '@/lib/supabase/server';

export interface RemoveMemberState {
  failed: boolean;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Removes a member, which frees one of the member slots. A Server Action can be posted to
 * directly, so nothing here trusts the page: remove_member itself refuses anyone who is not
 * the owner (and the owner), and this runs it with the caller's own session.
 */
export async function removeMemberAction(_previous: RemoveMemberState, formData: FormData): Promise<RemoveMemberState> {
  const userId = formData.get('userId');
  if (typeof userId !== 'string' || !UUID.test(userId)) return { failed: true };

  const supabase = await createServerSupabase();
  const { error } = await supabase.rpc('remove_member', { p_user: userId });
  if (error) return { failed: true };

  refresh();
  return { failed: false };
}
