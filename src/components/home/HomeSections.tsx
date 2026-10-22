import { currentUserId } from '@/lib/auth/currentUser';
import type { VideoRecord } from '@/lib/lyrics/resolveSong';
import { isActiveOwner, listActiveMembers } from '@/lib/supabase/members';
import { recentSongs } from '@/lib/supabase/plays';
import { createServerSupabase } from '@/lib/supabase/server';
import { HomeLinks } from './HomeLinks';
import { SongList, SongListUnavailable } from './SongList';

/**
 * The songs the gang played. Reading them is request-time work, so the home page puts this behind Suspense. When it
 * fails, the rest of the page (the paste box and the links) goes on working.
 */
export async function GangSongs() {
  const supabase = await createServerSupabase();
  let songs: VideoRecord[];
  try {
    songs = await recentSongs(supabase);
  } catch (error) {
    console.error('Could not read the songs of the gang.', error);
    return <SongListUnavailable />;
  }
  return <SongList songs={songs} />;
}

/**
 * The links at the foot of the home page. "Admin" is for the owner, decided the way /admin decides it. A failed check
 * only leaves the link out: /admin keeps its own gate. The members and the signed-in member do not depend on each
 * other, so they are read at the same time.
 */
export async function HomeShortcuts() {
  const supabase = await createServerSupabase();
  let owner = false;
  try {
    const [members, userId] = await Promise.all([listActiveMembers(supabase), currentUserId(supabase)]);
    owner = isActiveOwner(members, userId);
  } catch (error) {
    console.error('Could not tell whether this member is the owner.', error);
  }
  return <HomeLinks showAdmin={owner} />;
}
