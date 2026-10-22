import { currentUserId } from '@/lib/auth/currentUser';
import { handleHelpRequest } from '@/lib/help/handler';
import { callModel } from '@/lib/help/model';
import { createServiceSupabase } from '@/lib/supabase/admin';
import { createSupabaseHelpStore } from '@/lib/supabase/helpStore';
import { createServerSupabase } from '@/lib/supabase/server';

/**
 * "Não entendi" and "Traduzir verso" (see `handleHelpRequest`). The member check runs with the person's own session;
 * the help cache and the budgets, which no member may write, go through the service key.
 *
 * The session client is made inside the handler, on its first use, so a failure to make it is answered like any
 * other: a 503 that no cache keeps.
 */
export async function POST(request: Request) {
  let session: ReturnType<typeof createServerSupabase> | undefined;
  const supabase = () => (session ??= createServerSupabase());

  return handleHelpRequest(request, {
    userId: async () => currentUserId(await supabase()),
    async isMember() {
      const { data, error } = await (await supabase()).rpc('is_member');
      if (error) throw new Error(`Could not check the membership: ${error.message}`);
      return data === true;
    },
    store: () => createSupabaseHelpStore(createServiceSupabase()),
    callModel,
  });
}
