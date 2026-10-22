import { currentUserId } from '@/lib/auth/currentUser';
import { handleHelpRequest } from '@/lib/help/handler';
import { callModel } from '@/lib/help/model';
import { createServiceSupabase } from '@/lib/supabase/admin';
import { createSupabaseHelpStore } from '@/lib/supabase/helpStore';
import { createServerSupabase } from '@/lib/supabase/server';

/**
 * "Não entendi" and "Traduzir verso" (see `handleHelpRequest`). The member check runs with the person's own session;
 * the help cache and the request log, which no member may write, go through the service key.
 */
export async function POST(request: Request) {
  const supabase = await createServerSupabase();
  return handleHelpRequest(request, {
    userId: () => currentUserId(supabase),
    async isMember() {
      const { data, error } = await supabase.rpc('is_member');
      if (error) throw new Error(`Could not check the membership: ${error.message}`);
      return data === true;
    },
    store: () => createSupabaseHelpStore(createServiceSupabase()),
    callModel,
    now: Date.now,
  });
}
