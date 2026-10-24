import type { CSSProperties, ReactNode } from 'react';
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

/** The cards start one step apart for the first six, and together after those (see `card-in` in `globals.css`). */
const LAST_STEP = 5;

/**
 * "Músicas da galera": the songs the members played, newest first, as cards. Before anyone played anything it is DJ Bop
 * inviting the first one. The list comes ready from `recentSongs`.
 *
 * It stays a server component, and the cards come in one after another by CSS alone (`card-in`, ruling S35): each says
 * where it is in the sequence through the custom property `--i`. The keyframes play from the page the server sends,
 * before any script, and leave every card visible; cards drawn out of sight until a script brought them in would leave
 * the home blank on a slow phone.
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
        {songs.map((song, index) => (
          <li
            key={song.youtubeId}
            className="card-in"
            style={{ '--i': Math.min(index, LAST_STEP) } as CSSProperties}
          >
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
