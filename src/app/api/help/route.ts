import { after } from 'next/server';
import { currentUserId } from '@/lib/auth/currentUser';
import { handleHelpRequest } from '@/lib/help/handler';
import { callModel } from '@/lib/help/model';
import { createServiceSupabase } from '@/lib/supabase/admin';
import { createSupabaseHelpStore, type HelpStore } from '@/lib/supabase/helpStore';
import { createServerSupabase } from '@/lib/supabase/server';

/**
 * The store with its usage log written after the response (ruling S42): `recordUsage` only schedules the write with
 * `after()`, so the player never waits for it, and on Vercel the function stays alive until it is done. A write that
 * fails is a warning in the server log and nothing else; the callback never rejects, so Next has nothing to report.
 * `getHelp` stays unaware of all this.
 */
function withUsageAfterResponse(store: HelpStore): HelpStore {
  return {
    ...store,
    async recordUsage(entry) {
      after(async () => {
        try {
          await store.recordUsage(entry);
        } catch (error) {
          console.warn('Could not record the AI usage.', error);
        }
      });
    },
  };
}

/**
 * "Não entendi" and "Traduzir verso" (see `handleHelpRequest`). The member check runs with the person's own session;
 * the help cache, the budgets and the usage log, which no member may write, go through the service key.
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
    store: () => withUsageAfterResponse(createSupabaseHelpStore(createServiceSupabase())),
    callModel,
  });
}
