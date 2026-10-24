import Link from 'next/link';
import { focusRing } from '@/components/game/styles';
import { t } from '@/i18n/t';
import { formatDuration } from '@/lib/format';
import { cleanTitle } from '@/lib/lyrics/cleanTitle';
import type { VideoRecord } from '@/lib/lyrics/resolveSong';
import { SongThumb } from './SongThumb';

/**
 * A song somebody played, as a card that opens it (design/canvas/Componentes.dc.html, "Cartões"). The whole card is
 * the link, and "Jogar" is the look of it. Its picture is the video's own thumbnail (`SongThumb`), which loads only once
 * the card comes on screen, so a long list does not call YouTube twenty times over before anyone scrolls to it. The
 * disc stands in when there is no picture.
 */
export function SongCard({ video }: { video: VideoRecord }) {
  const { artist, track } = cleanTitle(video.title, video.channel);
  return (
    <Link
      // The id comes from a table every member can write to, so it is kept to one path segment.
      href={`/jogar/${encodeURIComponent(video.youtubeId)}`}
      className={`flex min-h-17 items-center gap-3 rounded-card bg-card p-3 ${focusRing}`}
    >
      <SongThumb youtubeId={video.youtubeId} title={track} />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-lyric font-bold">{track}</span>
        <span className="truncate text-label text-muted">
          {t('home.songMeta', { artista: artist, duracao: formatDuration(video.durationS) })}
        </span>
      </span>
      <span className="flex min-h-11 shrink-0 items-center rounded-button bg-lime px-4 text-body font-bold text-bg">
        {t('home.play')}
      </span>
    </Link>
  );
}
