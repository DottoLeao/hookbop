'use client';

import { useRef, type ReactNode } from 'react';
import { DjBop } from '@/components/brand/DjBop';
import { t } from '@/i18n/t';
import type { VideoRecord } from '@/lib/lyrics/resolveSong';
import { useCardsIn } from '@/lib/motion/transitions';
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
 * Out of sight until the card comes in. The list is drawn on the server and shown before the page is taken over, and
 * the cards come in one after another then: drawn in sight, they would show, vanish and come back. The entrance takes
 * this off (it clears the opacity it started from) when each card is in.
 */
const NOT_IN_YET = { opacity: 0 } as const;

/** The cards, which come in one after another as the list appears or when the songs in it are other ones. */
function Cards({ songs }: { songs: VideoRecord[] }) {
  const listRef = useRef<HTMLUListElement>(null);
  useCardsIn(listRef, 'li', songs.map((song) => song.youtubeId).join());
  return (
    <ul ref={listRef} aria-labelledby={HEADING_ID} className="flex flex-col gap-2">
      {songs.map((song) => (
        <li key={song.youtubeId} style={NOT_IN_YET}>
          <SongCard video={song} />
        </li>
      ))}
    </ul>
  );
}

/**
 * "Músicas da galera": the songs the members played, newest first, as cards that come in one after another. Before
 * anyone played anything it is DJ Bop inviting the first one. The list comes ready from `recentSongs`.
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
      <Cards songs={songs} />
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
