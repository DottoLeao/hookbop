import { Suspense } from 'react';
import { Logo } from '@/components/brand/Logo';
import { HomeLinks } from '@/components/home/HomeLinks';
import { PasteLink } from '@/components/home/PasteLink';
import { SongList, SongListUnavailable } from '@/components/home/SongList';
import { currentUserId } from '@/lib/auth/currentUser';
import type { VideoRecord } from '@/lib/lyrics/resolveSong';
import { isActiveOwner, listActiveMembers } from '@/lib/supabase/members';
import { recentSongs } from '@/lib/supabase/plays';
import { createServerSupabase } from '@/lib/supabase/server';

// The songs the gang played. Reading them is request-time work, so it streams in behind Suspense. When it fails, the
// rest of the page (the paste box and the links) goes on working.
async function Songs() {
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

// "Admin" is for the owner, decided the way /admin decides it. A failed check only leaves the link out: /admin keeps
// its own gate.
async function Links() {
  const supabase = await createServerSupabase();
  let owner = false;
  try {
    owner = isActiveOwner(await listActiveMembers(supabase), await currentUserId(supabase));
  } catch (error) {
    console.error('Could not tell whether this member is the owner.', error);
  }
  return <HomeLinks showAdmin={owner} />;
}

// For members only (see src/proxy.ts).
export default function Home() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-6 px-4 py-6">
      <header className="flex justify-center py-2">
        <Logo size={48} />
      </header>
      <PasteLink />
      <Suspense fallback={null}>
        <Songs />
      </Suspense>
      <div className="mt-auto">
        {/* Until the owner check is back, the links every member has are already there. */}
        <Suspense fallback={<HomeLinks showAdmin={false} />}>
          <Links />
        </Suspense>
      </div>
    </main>
  );
}
