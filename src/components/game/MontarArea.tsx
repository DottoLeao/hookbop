'use client';

import { useMemo, useState } from 'react';
import { t } from '@/i18n/t';
import { isNextTileCorrect, makeTiles, tileSeed } from '@/lib/game/tiles';
import type { Blank } from '@/lib/types';
import { ResultIcon } from './ResultIcon';
import { focusRing } from './styles';

interface MontarAreaProps {
  /** The blank for the whole line (its `tokenIndex` is -1). */
  blank: Blank;
  /** The words of the line, in order (`tokenize`). */
  tokens: string[];
  /** The words already placed (`tilesPlaced` of the game): always the start of the line. */
  placed: readonly string[];
  /**
   * The song's seed. With the line's index it fixes the order of the tiles (`tileSeed`), which is the order
   * `selectTileLines` checked.
   */
  youtubeId: string;
  /** The line is already right: the row shows its check, and nothing can be placed. */
  solved?: boolean;
  /**
   * The line has an answer, a miss or the right one. Until then "Não entendi a ordem" stays away: explaining the order
   * before the first try would hand over the answer while that try still counts (ruling R65).
   */
  answered?: boolean;
  /** A tile was tapped. The game decides what it is: the next word joins the row, any other one is a miss. */
  onTile: (word: string) => void;
  /**
   * "Não entendi a ordem", with '' as the word since it is the order of the whole line that is not clear, or a tap on a
   * word of the row once the line is right. Always with the index of this line, and the button that was tapped, which
   * gets the focus back when the explanation closes.
   */
  onExplain: (target: string, lineIndex: number, opener: HTMLElement) => void;
}

/**
 * The tiles each placed word stands for, as positions in `tiles`. A word that is on the line twice has two tiles, and
 * each time it is placed it takes the first one still free: one spelled the same ("Baby" for "Baby"), and only when
 * there is none, one that differs in capitals alone (a tile "baby" taken for the word "Baby"). Worked out from
 * `placed` alone, so a screen shown again from the same game looks the same.
 */
function usedTiles(tiles: readonly string[], placed: readonly string[]): Set<number> {
  const used = new Set<number>();
  for (const word of placed) {
    const firstFree = (same: (tile: string) => boolean) =>
      tiles.findIndex((tile, position) => !used.has(position) && same(tile));
    const exact = firstFree((tile) => tile === word);
    const at = exact >= 0 ? exact : firstFree((tile) => tile.toLowerCase() === word.toLowerCase());
    if (at >= 0) used.add(at);
  }
  return used;
}

/** A word in the row: at least as wide as an empty slot (56 px), so a slot never takes more room than its word. */
const chip = 'inline-flex h-10 min-w-14 items-center justify-center rounded-blank px-3.5 text-button font-bold';

/**
 * A word of a right row, which can be tapped to have it explained. It keeps the 40 px of a chip, so the row does not
 * grow when the line is solved, and its touch area reaches 44 px through 2 px above and below it, inside the 8 px
 * between two rows.
 */
const wordChip = `${chip} relative bg-lime text-bg before:absolute before:inset-x-0 before:-inset-y-0.5 ${focusRing}`;

/** A tile is at least 44 px tall and wide (a one-letter word such as "I"), and wraps onto the next row. */
const tileLook = `relative inline-flex min-h-11 min-w-11 items-center justify-center rounded-button text-button [overflow-wrap:anywhere] ${focusRing}`;

/**
 * "Monte o verso": the shuffled words of a whole line to tap in order (design/canvas/MonteVerso.dc.html, Limão
 * colors). The words placed so far sit in a row of lime chips followed by empty slots; their tiles stay in the pool,
 * dashed and faint. A wrong tile turns red with ✕ until the next tap (or a hint), and the row starts over (the game
 * clears it itself). When the line is right the row turns lime with ✓, and its words can be tapped to have them
 * explained: while the line is in play, this row is the only place it is drawn (ruling R59).
 *
 * A tile that cannot be tapped (placed, or any tile once the line is right) is `aria-disabled`, never `disabled`: a
 * disabled button drops the focus the tap gave it, and the player would lose their place on every right tap. The tap
 * is ignored in `pick`. The result is said only to screen readers (a status line that is `sr-only`) and in accessible
 * names ("tonight, errou"), never as text on screen.
 */
export function MontarArea({
  blank,
  tokens,
  placed,
  youtubeId,
  solved = false,
  answered = false,
  onTile,
  onExplain,
}: MontarAreaProps) {
  const tiles = useMemo(
    () => makeTiles(tokens, tileSeed(youtubeId, blank.lineIndex)),
    [tokens, youtubeId, blank.lineIndex],
  );
  // The tile that was a wrong tap. The red holds until the next tap, and a wrong tap always empties the row, so a
  // row that has words again (a right tap, or a hint after the miss) is the end of it.
  const [missedAt, setMissedAt] = useState<number | null>(null);
  const used = usedTiles(tiles, placed);
  const missed = placed.length === 0 ? missedAt : null;

  function pick(position: number) {
    if (solved || used.has(position)) return;
    const word = tiles[position];
    setMissedAt(isNextTileCorrect(tokens, placed.length, word) ? null : position);
    onTile(word);
  }

  // What a screen reader says: the line that is right, or the wrong tile.
  const hitLabel = t('montar.hit', { palavra: tokens.join(' ') });
  const status = solved ? hitLabel : missed !== null ? t('montar.miss', { palavra: tiles[missed] }) : null;
  // "Não entendi a ordem" once the first try is spent (ruling R65).
  const explainable = answered || solved;

  return (
    <div className="flex flex-col gap-3">
      <div
        data-testid="montar-row"
        role="group"
        aria-label={solved ? hitLabel : t('montar.row')}
        className={`grid rounded-button border-2 bg-card p-3 ${solved ? 'border-lime' : 'border-border'}`}
      >
        {/* The row of the finished line, unseen, sets the height of the box from the start: a row that grew as the
            words came in would push the tiles down while the player is tapping them. Chips are never narrower than
            a slot, so the row being built never takes more lines than this one. It holds the answer in order, so it
            must stay `invisible` and `aria-hidden`: it is never seen, read out or reached by the keyboard. */}
        <div aria-hidden="true" className="invisible col-start-1 row-start-1 flex flex-wrap gap-2">
          {tokens.map((word, position) => (
            <span key={position} className={chip}>
              {word}
            </span>
          ))}
          <span className="h-10 w-4" />
        </div>
        <ol aria-live="polite" className="col-start-1 row-start-1 flex flex-wrap content-start gap-2">
          {placed.map((word, position) =>
            solved ? (
              <li key={position} className="flex">
                <button
                  type="button"
                  onClick={(event) => onExplain(word, blank.lineIndex, event.currentTarget)}
                  className={wordChip}
                >
                  {word}
                </button>
              </li>
            ) : (
              <li key={position} className={`${chip} bg-lime text-bg`}>
                {word}
              </li>
            ),
          )}
          {Array.from({ length: tokens.length - placed.length }, (_, position) => (
            <li
              key={`slot-${position}`}
              aria-hidden="true"
              data-testid="montar-slot"
              className="h-10 w-14 rounded-blank border-2 border-dashed border-lime"
            />
          ))}
          {solved && (
            <li aria-hidden="true" className="flex h-10 items-center text-lime">
              <ResultIcon hit />
            </li>
          )}
        </ol>
      </div>

      <div role="group" aria-label={t('montar.question')} className="flex flex-wrap gap-2">
        {tiles.map((word, position) => {
          const isPlaced = used.has(position);
          const miss = missed === position;
          // A placed tile keeps its place in the pool, dashed and faint, as in the wireframe. A wrong one is red, and
          // its ✕ takes the room of the left padding (wider here, narrower on the right) and its text stays as heavy
          // as the others: the tile keeps its width, so the pool does not shift.
          const look = isPlaced
            ? 'border-[1.5px] border-dashed border-faint px-4 font-semibold text-faint'
            : miss
              ? 'border-[1.5px] border-transparent bg-error pr-2 pl-6 font-semibold text-bg'
              : 'border-[1.5px] border-border bg-card px-4 font-semibold text-text';
          return (
            <button
              key={position}
              type="button"
              aria-disabled={solved || isPlaced || undefined}
              aria-label={miss ? t('montar.miss', { palavra: word }) : undefined}
              onClick={() => pick(position)}
              className={`${tileLook} ${look}`}
            >
              {miss && (
                <span className="absolute left-1.5 flex">
                  <ResultIcon hit={false} />
                </span>
              )}
              {word}
            </button>
          );
        })}
      </div>

      {/* Until the line has an answer, the button keeps its place unseen and out of reach (ruling R65), so the tools
          under it do not jump down when it comes. */}
      <button
        type="button"
        disabled={!explainable}
        aria-hidden={explainable ? undefined : true}
        onClick={(event) => onExplain('', blank.lineIndex, event.currentTarget)}
        className={`min-h-11 rounded-button border-[1.5px] border-border px-3.5 text-body font-semibold text-text ${focusRing} ${explainable ? '' : 'invisible'}`}
      >
        {t('montar.explain')}
      </button>
      <span role="status" className="sr-only">
        {status}
      </span>
    </div>
  );
}
