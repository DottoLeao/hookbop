'use client';

import { useMemo, useState } from 'react';
import { t } from '@/i18n/t';
import { isNextTileCorrect, makeTiles, tileSeed } from '@/lib/game/tiles';
import type { Blank } from '@/lib/types';
import { ResultIcon } from './ResultIcon';

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
  /** A tile was tapped. The game decides what it is: the next word joins the row, any other one is a miss. */
  onTile: (word: string) => void;
  /** "Não entendi a ordem". The word to explain is '' since it is the order of the whole line that is not clear. */
  onExplain: (target: string) => void;
}

/**
 * The tiles each placed word stands for, as positions in `tiles`. A word that is on the line twice has two tiles, and
 * each time it is placed it takes the first one still free, capitals ignored. Worked out from `placed` alone, so a
 * screen shown again from the same game looks the same.
 */
function usedTiles(tiles: readonly string[], placed: readonly string[]): Set<number> {
  const used = new Set<number>();
  for (const word of placed) {
    const at = tiles.findIndex((tile, position) => !used.has(position) && tile.toLowerCase() === word.toLowerCase());
    if (at >= 0) used.add(at);
  }
  return used;
}

const focusRing = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime';

/** A word in the row: at least as wide as an empty slot (56 px), so a slot never takes more room than its word. */
const chip = 'inline-flex h-10 min-w-14 items-center justify-center rounded-blank px-3.5 text-button font-bold';

/** A tile is at least 44 px tall, and wraps onto the next row when the line is long. */
const tileLook = `relative inline-flex min-h-11 min-w-0 items-center justify-center rounded-button text-button [overflow-wrap:anywhere] ${focusRing}`;

/**
 * "Monte o verso": the shuffled words of a whole line to tap in order (design/canvas/MonteVerso.dc.html, Limão
 * colors). The words placed so far sit in a row of lime chips followed by empty slots; their tiles stay in the pool,
 * disabled and dashed. A wrong tile turns red with ✕ until the next tap, and the row starts over (the game clears it
 * itself). When the line is right the row turns lime with ✓. The result is said only in accessible names
 * ("tonight, errou"), never as text on screen.
 */
export function MontarArea({ blank, tokens, placed, youtubeId, solved = false, onTile, onExplain }: MontarAreaProps) {
  const tiles = useMemo(
    () => makeTiles(tokens, tileSeed(youtubeId, blank.lineIndex)),
    [tokens, youtubeId, blank.lineIndex],
  );
  // The tile that was a wrong tap, until the next tap.
  const [missedAt, setMissedAt] = useState<number | null>(null);
  const used = usedTiles(tiles, placed);

  function pick(position: number) {
    if (solved || used.has(position)) return;
    const word = tiles[position];
    setMissedAt(isNextTileCorrect(tokens, placed.length, word) ? null : position);
    onTile(word);
  }

  return (
    <div className="flex flex-col gap-3">
      <div
        data-testid="montar-row"
        role="group"
        aria-label={solved ? t('montar.hit', { palavra: tokens.join(' ') }) : t('montar.row')}
        className={`grid rounded-button border-2 bg-card p-3 ${solved ? 'border-lime' : 'border-border'}`}
      >
        {/* The row of the finished line, unseen, sets the height of the box from the start: a row that grew as the
            words came in would push the tiles down while the player is tapping them. Chips are never narrower than
            a slot, so the row being built never takes more lines than this one. */}
        <div aria-hidden="true" className="invisible col-start-1 row-start-1 flex flex-wrap gap-2">
          {tokens.map((word, position) => (
            <span key={position} className={chip}>
              {word}
            </span>
          ))}
          <span className="h-10 w-4" />
        </div>
        <ol aria-live="polite" className="col-start-1 row-start-1 flex flex-wrap content-start gap-2">
          {placed.map((word, position) => (
            <li key={position} className={`${chip} bg-lime text-bg`}>
              {word}
            </li>
          ))}
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
          const miss = missedAt === position && !isPlaced;
          // A placed tile keeps its place in the pool, dashed and faint, as in the wireframe. A wrong one is red, and
          // its ✕ takes the room of the left padding (wider here, narrower on the right): the tile keeps its width,
          // so the pool does not shift.
          const look = isPlaced
            ? 'border-[1.5px] border-dashed border-faint px-4 font-semibold text-faint'
            : miss
              ? 'border-[1.5px] border-transparent bg-error pr-2 pl-6 font-bold text-bg'
              : 'border-[1.5px] border-border bg-card px-4 font-semibold text-text';
          return (
            <button
              key={position}
              type="button"
              disabled={solved || isPlaced}
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

      <button
        type="button"
        onClick={() => onExplain('')}
        className={`min-h-11 rounded-button border-[1.5px] border-border px-3.5 text-body font-semibold text-text ${focusRing}`}
      >
        {t('montar.explain')}
      </button>
    </div>
  );
}
