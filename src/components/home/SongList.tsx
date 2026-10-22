import type { ReactNode } from 'react';
import { DjBop } from '@/components/brand/DjBop';
import { t } from '@/i18n/t';
import type { VideoRecord } from '@/lib/lyrics/resolveSong';
import { SongCard } from './SongCard';

const HEADING_ID = 'musicas-da-galera';

function Section({ children }: { children: ReactNode }) {
  return (
    <section aria-labelledby={HEADING_ID} className="flex flex-col gap-3">
      <h2 id={HEADING_ID} className="font-heading text-button font-bold">
        {t('home.songsTitle')}
      </h2>
      {children}
    </section>
  );
}

/**
 * "Músicas da galera": the songs the members played, newest first, as cards. Before anyone played anything it is DJ Bop
 * inviting the first one. The list comes ready from `recentSongs`.
 */
export function SongList({ songs }: { songs: VideoRecord[] }) {
  if (songs.length === 0) {
    return (
      <Section>
        <div className="flex items-end gap-3 rounded-card bg-card p-4">
          <DjBop expression="idle" size={64} />
          <p className="pb-1 text-lyric font-semibold">{t('home.empty')}</p>
        </div>
      </Section>
    );
  }

  return (
    <Section>
      <ul aria-labelledby={HEADING_ID} className="flex flex-col gap-2">
        {songs.map((song) => (
          <li key={song.youtubeId}>
            <SongCard video={song} />
          </li>
        ))}
      </ul>
    </Section>
  );
}

/** The same place when the songs could not be read: a quiet line, and the rest of the page goes on working. */
export function SongListUnavailable() {
  return (
    <Section>
      <p className="text-body text-muted">{t('home.songsError')}</p>
    </Section>
  );
}
