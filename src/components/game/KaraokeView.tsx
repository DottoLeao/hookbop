'use client';

import { Fragment, useEffect, useRef, useState } from 'react';
import { t } from '@/i18n/t';
import { activeLineIndex } from '@/lib/lyrics/lrc';
import type { LyricLine } from '@/lib/types';
import { focusRing, pieces, tappableShape } from './lineWords';

interface KaraokeViewProps {
  lines: LyricLine[];
  /** The game's clock, in ms: the one the game accepted, never the player's raw reading (ruling R44). */
  timeMs: number;
  /**
   * The translation of the line at that position. A rejection means there is none: the view then shows nothing under
   * that line, no error, and does not ask for it again.
   */
  fetchTranslation: (lineIndex: number) => Promise<string>;
  /** A tap on a word of the current line: the word to explain. */
  onExplain: (target: string) => void;
  /**
   * Show the translations under the lines. While they are hidden none is fetched. A switch of the screen, not a
   * setting: the game screen starts it shown every time.
   */
  showTranslations?: boolean;
  /**
   * False while something stands in for the lyrics, which are then only hidden (the settings sheet). A list that is
   * hidden loses its scroll, so the current line is centered again when it is shown.
   */
  visible?: boolean;
}

/**
 * The line to show as current: the one playing at `timeMs` or, when none is (a break in the music between two lines,
 * or the end of the song), the last one that started, as the singer left it. -1 only before the first line starts.
 */
function currentLineIndex(lines: LyricLine[], timeMs: number): number {
  const playing = activeLineIndex(lines, timeMs);
  return playing !== -1 ? playing : lines.findLastIndex((line) => line.startMs <= timeMs);
}

function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Karaokê (design/canvas/Karaoke.dc.html in the Limão colors): all the lyrics in a list that follows the song, each
 * line with its Portuguese translation under it. The current line is lime, in Space Grotesk, and every word of it can
 * be tapped to have it explained. The lines before it are muted and those after it are plain, and none of them can be
 * tapped. There are no blanks, no combo and no points.
 *
 * Only the current line and the next one are translated, each at most once for the whole session (a line the song
 * comes back to, or hiding and showing the translations again, asks for nothing twice). Before the first line starts,
 * only the first line is. A refusal is never asked again, so a service that is down is asked twice a line, not
 * every second.
 *
 * The list scrolls inside its own box, which is the only thing that moves: the current line is centered with
 * `scrollTo` on the list. `scrollIntoView` would also scroll the page to center the line in the window, and push the
 * player off the screen.
 */
export function KaraokeView({
  lines,
  timeMs,
  fetchTranslation,
  onExplain,
  showTranslations = true,
  visible = true,
}: KaraokeViewProps) {
  const current = currentLineIndex(lines, timeMs);
  const [translations, setTranslations] = useState<Record<number, string>>({});
  // The lines that were asked for, whatever the answer was.
  const requested = useRef(new Set<number>());
  const listRef = useRef<HTMLOListElement>(null);

  useEffect(() => {
    if (!showTranslations) return;
    for (const index of [current, current + 1]) {
      if (index < 0 || index >= lines.length || requested.current.has(index)) continue;
      requested.current.add(index);
      fetchTranslation(index).then(
        (text) => setTranslations((known) => ({ ...known, [index]: text })),
        () => {},
      );
    }
  }, [current, showTranslations, lines.length, fetchTranslation]);

  // The current line is centered in the list when it changes. Also when the translations are hidden or shown, as every
  // line then changes its height, and when the list is shown again after being hidden, as that loses its scroll.
  useEffect(() => {
    const list = listRef.current;
    const line = list?.children[current];
    if (!list || !line || !visible) return;
    const aboveLine = line.getBoundingClientRect().top - list.getBoundingClientRect().top;
    const roomAround = list.clientHeight - line.getBoundingClientRect().height;
    list.scrollTo({
      top: list.scrollTop + aboveLine - roomAround / 2,
      behavior: prefersReducedMotion() ? 'auto' : 'smooth',
    });
  }, [current, showTranslations, visible]);

  return (
    <ol
      ref={listRef}
      aria-label={t('karaoke.lyrics')}
      // Scrollable, so the keyboard has to be able to reach it.
      tabIndex={0}
      className={`flex max-h-[calc(100dvh-27rem)] min-h-48 flex-1 flex-col gap-3 overflow-y-auto rounded-button ${focusRing}`}
    >
      {lines.map((line, i) => {
        const isCurrent = i === current;
        const translation = showTranslations ? translations[i] : undefined;
        return (
          <li
            key={line.index}
            aria-current={isCurrent ? 'true' : undefined}
            className={
              isCurrent
                ? 'flex flex-col gap-1 rounded-button bg-lime px-3 py-2.5 text-bg'
                : `flex flex-col gap-1 px-3 ${i < current ? 'text-muted' : 'text-text'}`
            }
          >
            <p lang="en" className={isCurrent ? 'font-heading text-verse leading-snug font-bold' : 'text-lyric'}>
              {isCurrent
                ? pieces(line.text).map((piece, k) =>
                    'word' in piece ? (
                      <button
                        key={k}
                        type="button"
                        onClick={() => onExplain(piece.word)}
                        className={`${tappableShape} px-0.5 hover:underline focus-visible:outline-bg`}
                      >
                        {piece.text}
                      </button>
                    ) : (
                      <Fragment key={k}>{piece.text}</Fragment>
                    ),
                  )
                : line.text}
            </p>
            {translation && (
              <p lang="pt-BR" className={isCurrent ? 'text-body italic' : 'text-label text-muted italic'}>
                {translation}
              </p>
            )}
          </li>
        );
      })}
    </ol>
  );
}
