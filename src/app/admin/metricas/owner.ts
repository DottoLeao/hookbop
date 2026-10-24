import { currentUserId } from '@/lib/auth/currentUser';
import { isActiveOwner, listActiveMembers } from '@/lib/supabase/members';
import { createServerSupabase } from '@/lib/supabase/server';

/**
 * Whether the owner is the one asking, decided the way /admin decides it: who is signed in, read from the session,
 * among the active members, with the person's own session. The metrics page, its export and its action each ask this
 * on every request, before they make the service client.
 *
 * A check that cannot be made (the database out of reach) is a no: what it guards stays closed, and the answer is the
 * same 404 anyone else gets. Only the reason goes to the server log.
 */
export async function askedByOwner(): Promise<boolean> {
  const supabase = await createServerSupabase();
  try {
    const [members, userId] = await Promise.all([listActiveMembers(supabase), currentUserId(supabase)]);
    return isActiveOwner(members, userId);
  } catch (error) {
    console.warn('Could not tell whether the owner is asking.', error);
    return false;
  }
}
