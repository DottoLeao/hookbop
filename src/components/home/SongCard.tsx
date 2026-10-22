import Link from 'next/link';
import { focusRing } from '@/components/game/styles';
import { t } from '@/i18n/t';
import { formatDuration } from '@/lib/format';
import { cleanTitle } from '@/lib/lyrics/cleanTitle';
import type { VideoRecord } from '@/lib/lyrics/resolveSong';

/**
 * A song somebody played, as a card that opens it (design/canvas/Componentes.dc.html, "Cartões"). The whole card is
 * the link, and "Jogar" is the look of it. The thumbnail is a disc, not the video's picture: a card should not call
 * YouTube just to be listed, twenty times over, before anyone chose to play.
 */
export function SongCard({ video }: { video: VideoRecord }) {
  const { artist, track } = cleanTitle(video.title, video.channel);
  return (
    <Link
      // The id comes from a table every member can write to, so it is kept to one path segment.
      href={`/jogar/${encodeURIComponent(video.youtubeId)}`}
      className={`flex min-h-17 items-center gap-3 rounded-card bg-card p-3 ${focusRing}`}
    >
      <span aria-hidden="true" className="flex h-[45px] w-20 shrink-0 items-center justify-center rounded-blank bg-border">
        <svg width="28" height="28" viewBox="0 0 44 44" focusable="false">
          <circle cx="22" cy="22" r="21" fill="#26262C" />
          <circle cx="22" cy="22" r="14" fill="none" stroke="#6E6E78" strokeWidth="1.5" opacity="0.6" />
          <circle cx="22" cy="22" r="5" fill="#C8FF2E" />
        </svg>
      </span>
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
