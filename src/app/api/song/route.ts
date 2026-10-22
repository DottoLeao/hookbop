import { currentUserId } from '@/lib/auth/currentUser';
import { createLrclibSource, LRCLIB_CLIENT } from '@/lib/lyrics/lrclib';
import { handleSongRequest } from '@/lib/song/handler';
import { createServiceSupabase } from '@/lib/supabase/admin';
import { createServerSupabase } from '@/lib/supabase/server';
import { createSupabaseSongStore } from '@/lib/supabase/songStore';
import { fetchOEmbedMeta } from '@/lib/youtube/oembed';

/**
 * The lyrics and what the app remembers about a video, for the song screen (see `handleSongRequest`, ruling R81). The
 * member check runs with the person's own session; the `videos` rows, which no member may write, go through the
 * service key, and YouTube's oEmbed and LRCLIB are asked from here.
 *
 * The session client is made inside the handler, on its first use, so a failure to make it is answered like any
 * other: a 503 that no cache keeps.
 */
export async function POST(request: Request) {
  let session: ReturnType<typeof createServerSupabase> | undefined;
  const supabase = () => (session ??= createServerSupabase());

  return handleSongRequest(request, {
    userId: async () => currentUserId(await supabase()),
    async isMember() {
      const { data, error } = await (await supabase()).rpc('is_member');
      if (error) throw new Error(`Could not check the membership: ${error.message}`);
      return data === true;
    },
    store: () => createSupabaseSongStore(createServiceSupabase()),
    meta: (id) => fetchOEmbedMeta(id),
    lyrics: () => createLrclibSource({ fetch: globalThis.fetch, client: LRCLIB_CLIENT }),
    now: () => new Date(),
  });
}
