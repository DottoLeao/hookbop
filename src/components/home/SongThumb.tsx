'use client';

import Image from 'next/image';
import { useState } from 'react';
import { t } from '@/i18n/t';

/** The id of a YouTube video: 11 characters, letters, digits, "-" and "_". */
const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

/** The box of a song's picture on its card: 80 x 45, which is 16:9, the shape of the picture YouTube keeps. */
const WIDTH = 80;
const HEIGHT = 45;

/** The disc: what the card shows when there is no picture to show. */
function Disc() {
  return (
    <span
      aria-hidden="true"
      data-testid="song-disc"
      className="flex h-[45px] w-20 shrink-0 items-center justify-center rounded-blank bg-border"
    >
      <svg width="28" height="28" viewBox="0 0 44 44" focusable="false">
        <circle cx="22" cy="22" r="21" fill="#26262C" />
        <circle cx="22" cy="22" r="14" fill="none" stroke="#6E6E78" strokeWidth="1.5" opacity="0.6" />
        <circle cx="22" cy="22" r="5" fill="#C8FF2E" />
      </svg>
    </span>
  );
}

/**
 * The picture of a song on its card: the thumbnail YouTube keeps for the video, which the page loads straight from
 * YouTube, only once the card comes on screen. The app keeps no copy of it. When there is none to show, the disc stands
 * in: the picture did not load (no network, or the video is gone), or the id is not the id of a video.
 *
 * It is the `next/image` component with `unoptimized`, so the address goes to the browser as it is, and nothing is
 * sent through the app to be resized (so no host has to be allowed in the config). It is chosen over a plain `<img>`
 * for what it does when the page comes from the server: a picture that failed before React took over has lost its
 * error event, and the component asks for it again once it has taken over, so the disc still replaces it.
 */
export function SongThumb({ youtubeId, title }: { youtubeId: string; title: string }) {
  const [failed, setFailed] = useState(false);
  // The id comes from a table every member can write to: only the shape of a video id gets to be part of an address.
  if (failed || !VIDEO_ID.test(youtubeId)) return <Disc />;
  return (
    <Image
      src={`https://i.ytimg.com/vi/${encodeURIComponent(youtubeId)}/mqdefault.jpg`}
      alt={t('home.songThumbAlt', { musica: title })}
      width={WIDTH}
      height={HEIGHT}
      loading="lazy"
      decoding="async"
      unoptimized
      onError={() => setFailed(true)}
      className="h-[45px] w-20 shrink-0 rounded-blank bg-border object-cover"
    />
  );
}
