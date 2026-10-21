import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { SongScreen } from '@/components/game/SongScreen';
import { parseYouTubeId } from '@/lib/youtube/parseUrl';

// The id comes from the address, which is request-time work, so it sits behind Suspense.
async function Song({ params }: { params: Promise<{ youtubeId: string }> }) {
  const { youtubeId } = await params;
  const id = parseYouTubeId(youtubeId);
  if (!id) redirect('/?erro=link');

  // A new key per video, so going from one song to another starts a fresh screen and player.
  return <SongScreen key={id} youtubeId={id} />;
}

export default function JogarPage({ params }: { params: Promise<{ youtubeId: string }> }) {
  return (
    <Suspense fallback={null}>
      <Song params={params} />
    </Suspense>
  );
}
