import { currentUserId } from '@/lib/auth/currentUser';
import type { VideoRecord } from '@/lib/lyrics/resolveSong';
import { isActiveOwner, listActiveMembers } from '@/lib/supabase/members';
import { recentSongs } from '@/lib/supabase/plays';
import { createServerSupabase } from '@/lib/supabase/server';
import { HomeLinks } from './HomeLinks';
import { PasteLink } from './PasteLink';
import { PolicyNotice } from './PolicyNotice';
import { SongList, SongListUnavailable } from './SongList';

/**
 * The paste box, with its message already there when the home page comes from a share that held no video (`?erro=link`,
 * see src/app/compartilhar/route.ts). The query is request-time data, so this sits behind Suspense, and until it is
 * read the page shows the same box without the message, from the static shell.
 */
export async function PasteLinkWithShareError({ searchParams }: { searchParams: Promise<{ erro?: string | string[] }> }) {
  const { erro } = await searchParams;
  return <PasteLink initialInvalid={erro === 'link'} />;
}

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
 * The notice that the privacy policy changed, for the signed-in member: it needs the day they joined, since only those
 * who joined before the change knew an older policy. When that cannot be read there is simply no notice.
 */
export async function PolicyNoticeForMember() {
  const supabase = await createServerSupabase();
  let joinedAt: string | undefined;
  try {
    const [members, userId] = await Promise.all([listActiveMembers(supabase), currentUserId(supabase)]);
    joinedAt = members.find((member) => member.id === userId)?.joinedAt;
  } catch (error) {
    console.error('Could not tell when this member joined.', error);
  }
  return joinedAt ? <PolicyNotice joinedAt={joinedAt} /> : null;
}

/**
 * The links at the foot of the home page. "Admin" and "Métricas" are for the owner, decided the way /admin and
 * /admin/metricas decide it. A failed check only leaves the links out: each page keeps its own gate. The members and
 * the signed-in member do not depend on each other, so they are read at the same time.
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
