'use client';

import { Fragment, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { t } from '@/i18n/t';
import { lastStartedLineIndex } from '@/lib/lyrics/startedLine';
import { useReducedMotion } from '@/lib/motion/useReducedMotion';
import type { LyricLine } from '@/lib/types';
import { pieces, tappableShape } from './lineWords';
import { focusRing } from './styles';
import { useLineHighlight } from './useLineTransition';

interface KaraokeViewProps {
  lines: LyricLine[];
  /** The game's clock, in ms: the one the game accepted, never the player's raw reading (ruling R44). */
  timeMs: number;
  /**
   * The translation of the line at that position. A rejection means there is none: the view then shows nothing under
   * that line, no error, and does not ask for it again.
   */
  fetchTranslation: (lineIndex: number) => Promise<string>;
  /**
   * A tap on a word of the current line: the word to explain, the index of the line it was drawn on, and the button,
   * which gets the focus back when the explanation closes.
   */
  onExplain: (target: string, lineIndex: number, opener: HTMLElement) => void;
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
 * The list is as tall as the screen allows and no taller, so the page never has to scroll and the player stays in
 * view; on a very short screen it keeps 12 rem, about three lines. 27 rem is everything else on the screen, from the
 * top: the header (3.75 rem), the 16:9 player (13.7 rem on a 390 px phone, 15.75 at the widest the column gets), the
 * progress bar (0.25), the tools (2.75), the bottom padding (1) and the four 1 rem gaps between those pieces (4).
 */
const LIST_HEIGHT = 'max-h-[calc(100dvh-27rem)] min-h-48 flex-1';

/**
 * Karaokê (design/canvas/Karaoke.dc.html in the Limão colors): all the lyrics in a list that follows the song, each
 * line with its Portuguese translation under it. The current line is lime, in Space Grotesk, and every word of it can
 * be tapped to have it explained. The lines before it are muted and those after it are plain, and none of them can be
 * tapped. There are no blanks, no combo and no points.
 *
 * The current line is the last one that started, so it stays through a break in the music and after the last line.
 * Only the current line and the next one are translated, each at most once for the whole session (a line the song
 * comes back to, or hiding and showing the translations again, asks for nothing twice). Before the first line starts,
 * only the first line is. A refusal is never asked again, so a service that is down is asked twice a line, not
 * every second.
 *
 * The list scrolls inside its own box, which is the only thing that moves: the current line is centered with
 * `scrollTo` on the list. `scrollIntoView` would also scroll the page to center the line in the window, and push the
 * player off the screen. The list sweeps only when the song moves on to the next line; every other time it is put back
 * in place at once, including when the translation of the current or the next line comes in, as that changes the
 * heights around the line. When the song moves on, the new current line also lights up (`useLineHighlight`): it grows
 * into place without moving, so the place the list scrolls to stays the same. With reduced motion the list jumps and
 * the line only fades in.
 *
 * The words of the current line are the only buttons, so when the song moves on, the one that had the keyboard focus
 * goes away and the focus would fall to the page. The view then puts it on the first word of the new line, or on the
 * list when that line has none, unless the focus is somewhere else by then.
 */
export function KaraokeView({
  lines,
  timeMs,
  fetchTranslation,
  onExplain,
  showTranslations = true,
  visible = true,
}: KaraokeViewProps) {
  const current = lastStartedLineIndex(lines, timeMs);
  const [translations, setTranslations] = useState<Record<number, string>>({});
  // The lines that were asked for, whatever the answer was.
  const requested = useRef(new Set<number>());
  const listRef = useRef<HTMLOListElement>(null);
  // The keyboard focus was on a word the last time it moved, so it is the song moving on that takes it away.
  const focusOnWord = useRef(false);
  // What the list was centered on the last time, to tell the song moving on from every other reason to center again.
  const centered = useRef<{ line: number; visible: boolean } | null>(null);
  const reducedMotion = useReducedMotion();
  useLineHighlight(listRef, current, reducedMotion);

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

  // A word that had the focus is gone with its line. When that left the focus on the page (and nowhere else: never
  // take it from anything the player moved it to), it goes to the new line, without scrolling anything.
  useLayoutEffect(() => {
    if (!focusOnWord.current) return;
    const focused = document.activeElement;
    if (focused && focused !== document.body) return;
    const list = listRef.current;
    const target = list?.children[current]?.querySelector('button') ?? list;
    target?.focus({ preventScroll: true });
  }, [current]);

  // The translations on screen around the current line: when one comes in, the lines there get taller.
  const currentTranslation = showTranslations ? translations[current] : undefined;
  const nextTranslation = showTranslations ? translations[current + 1] : undefined;

  // The current line is centered in the list when it changes. Also when the translations are hidden or shown, as every
  // line then changes its height, when the translation of the current or next line comes in, and when the list is
  // shown again after being hidden, as that loses its scroll.
  useEffect(() => {
    const before = centered.current;
    centered.current = { line: current, visible };
    const list = listRef.current;
    const line = list?.children[current];
    if (!list || !line || !visible) return;
    const songMovedOn = before !== null && before.visible && current === before.line + 1;
    const aboveLine = line.getBoundingClientRect().top - list.getBoundingClientRect().top;
    const roomAround = list.clientHeight - line.getBoundingClientRect().height;
    list.scrollTo({
      top: list.scrollTop + aboveLine - roomAround / 2,
      behavior: songMovedOn && !reducedMotion ? 'smooth' : 'auto',
    });
  }, [current, showTranslations, visible, currentTranslation, nextTranslation, reducedMotion]);

  return (
    <ol
      ref={listRef}
      // The reset that takes the bullets off makes WebKit drop the list semantics, unless the role says them.
      role="list"
      aria-label={t('karaoke.lyrics')}
      // Scrollable, so the keyboard has to be able to reach it.
      tabIndex={0}
      onFocus={(event) => {
        focusOnWord.current = event.target instanceof HTMLButtonElement;
      }}
      // A blur with nothing to take the focus is also what a word going away looks like in some browsers, so only a
      // blur that hands the focus to another element counts as the player leaving the words.
      onBlur={(event) => {
        if (event.relatedTarget) focusOnWord.current = false;
      }}
      className={`flex ${LIST_HEIGHT} flex-col gap-3 overflow-y-auto rounded-button ${focusRing}`}
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
                        onClick={(event) => onExplain(piece.word, i, event.currentTarget)}
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
