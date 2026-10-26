import { after } from 'next/server';
import { currentUserId } from '@/lib/auth/currentUser';
import { streamModel } from '@/lib/help/model';
import { handleTranslateSongRequest } from '@/lib/help/songHandler';
import { createServiceSupabase } from '@/lib/supabase/admin';
import { createSupabaseHelpStore, createSupabaseTranslationCache } from '@/lib/supabase/helpStore';
import { createServerSupabase } from '@/lib/supabase/server';

/**
 * The model call has 50 s (`streamModel`); the lines it gave are saved, and the call logged, after the stream, and
 * `after` runs within this limit too.
 */
export const maxDuration = 60;

/**
 * The translation of a whole song (see `handleTranslateSongRequest`). The member check runs with the person's own
 * session; the help cache, the budget and the usage log, which no member may write, go through the service key.
 *
 * The work of a translation outlives the response when it has to: `after` keeps the function alive until the stream
 * is over and what came is saved and logged, even if the player left (ruling S42: the log is written after the
 * response). The session client is made inside the handler, on its first use, so a failure to make it is a 503.
 */
export async function POST(request: Request) {
  let session: ReturnType<typeof createServerSupabase> | undefined;
  const supabase = () => (session ??= createServerSupabase());

  return handleTranslateSongRequest(request, {
    userId: async () => currentUserId(await supabase()),
    async isMember() {
      const { data, error } = await (await supabase()).rpc('is_member');
      if (error) throw new Error(`Could not check the membership: ${error.message}`);
      return data === true;
    },
    store() {
      const admin = createServiceSupabase();
      return { ...createSupabaseHelpStore(admin), ...createSupabaseTranslationCache(admin) };
    },
    streamModel,
    keepAlive: (job) => after(() => job),
  });
}
