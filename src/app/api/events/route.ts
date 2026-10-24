import { currentUserId } from '@/lib/auth/currentUser';
import { handleEventsRequest } from '@/lib/metrics/handler';
import { createServiceSupabase } from '@/lib/supabase/admin';
import { createServerSupabase } from '@/lib/supabase/server';

/**
 * The actions of the app, for the owner's panel (see `handleEventsRequest`). The member check runs with the person's
 * own session; the rows, which no member may write, go through the service key, and the key is only taken up once the
 * member check and the validation have passed.
 *
 * src/proxy.ts lets this path through without a session (`isPublicPath`): the route answers 401 and 403 itself, so a
 * request from the sign-in page or from someone who is not a member gets a status, not a redirect to a page.
 *
 * The session client is made inside the handler, on its first use, so a failure to make it is answered like any
 * other: a 503 that no cache keeps.
 */
export async function POST(request: Request) {
  let session: ReturnType<typeof createServerSupabase> | undefined;
  const supabase = () => (session ??= createServerSupabase());

  return handleEventsRequest(request, {
    userId: async () => currentUserId(await supabase()),
    async isMember() {
      const { data, error } = await (await supabase()).rpc('is_member');
      if (error) throw new Error(`Could not check the membership: ${error.message}`);
      return data === true;
    },
    async record(rows) {
      const { error } = await createServiceSupabase().from('app_events').insert(rows);
      if (error) throw new Error(`Could not write the events: ${error.message}`);
    },
  });
}
