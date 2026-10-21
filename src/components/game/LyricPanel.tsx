'use client';

import { Fragment } from 'react';
import { t } from '@/i18n/t';
import { tokenize } from '@/lib/game/blanks';
import type { BlankStatus } from '@/lib/game/reducer';
import { foldApostrophes } from '@/lib/game/text';
import type { Blank, LyricLine } from '@/lib/types';

interface LyricPanelProps {
  lines: LyricLine[];
  /** The index of the line in play. */
  current: number;
  blanks: Blank[];
  status: Record<string, BlankStatus>;
  /** Show the line's translation under it, when there is one, in place of "Traduzir verso". */
  showTranslation: boolean;
  /** The translation of the line in play, once something has fetched it. */
  translation?: string;
  /** "Traduzir verso". */
  onTranslate: () => void;
  /** "Não entendi", or a tap on a word of the line in play: the word or expression to explain. */
  onExplain: (target: string) => void;
}

/** A word of the line, numbered as `tokenize` numbers it (a blank's tokenIndex), or what sits between two words. */
type Piece = { word: string; index: number; text: string } | { text: string };

/**
 * The line cut into its words and the spaces and punctuation between them, all as written. `tokenize` reads the
 * text with its apostrophes made plain, which keeps every character where it was, so its words are found in order.
 */
function pieces(text: string): Piece[] {
  const plain = foldApostrophes(text);
  const out: Piece[] = [];
  let cursor = 0;
  tokenize(text).forEach((word, index) => {
    const at = plain.indexOf(word, cursor);
    if (at > cursor) out.push({ text: text.slice(cursor, at) });
    out.push({ word, index, text: text.slice(at, at + word.length) });
    cursor = at + word.length;
  });
  if (cursor < text.length) out.push({ text: text.slice(cursor) });
  return out;
}

const focusRing = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime';

/** An answered blank or a word that can be tapped, at least 44 px tall even inside a line of text. */
const tappable = `inline-flex min-h-11 items-center rounded-blank align-middle ${focusRing}`;

/** A blank still open. The one in play is solid ("sua vez"); the others, and those of the lines around it, dashed. */
function Slot({ inPlay, small }: { inPlay: boolean; small: boolean }) {
  const look = small
    ? 'h-5 w-12 border-[1.5px] border-dashed border-faint'
    : inPlay
      ? 'h-[34px] w-18 border-[2.5px] border-lime bg-card'
      : 'h-[34px] w-18 border-2 border-dashed border-lime';
  return (
    <span className={`inline-block rounded-blank align-middle ${look}`}>
      <span className="sr-only">{t('jogo.blank')}</span>
    </span>
  );
}

interface LineTextProps {
  text: string;
  blanks: Blank[];
  status: Record<string, BlankStatus>;
  /** Only for the line in play: its words can be tapped. */
  onExplain?: (word: string) => void;
  /** The blank the player answers now, on the line in play. */
  inPlayId?: string;
}

/** A line with its open blanks hidden, so no line on screen gives an answer away. */
function LineText({ text, blanks, status, onExplain, inPlayId }: LineTextProps) {
  return pieces(text).map((piece, i) => {
    if (!('word' in piece)) return <Fragment key={i}>{piece.text}</Fragment>;
    const blank = blanks.find((b) => b.tokenIndex === piece.index);
    if (blank && status[blank.id] !== 'correct') {
      return <Slot key={i} inPlay={blank.id === inPlayId} small={!onExplain} />;
    }
    if (!onExplain) return <Fragment key={i}>{piece.text}</Fragment>;
    const look = blank ? 'bg-lime px-2.5 text-bg' : 'px-0.5 hover:text-lime-light';
    return (
      <button key={i} type="button" onClick={() => onExplain(piece.word)} className={`${tappable} ${look}`}>
        {piece.text}
      </button>
    );
  });
}

function Pill({ onClick, children }: { onClick: () => void; children: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`min-h-11 rounded-full border-[1.5px] border-border px-3.5 text-body font-semibold text-text ${focusRing}`}
    >
      {children}
    </button>
  );
}

/**
 * The lyrics around the clip: the line before in muted text, the line in play in Space Grotesk with its blank, and
 * the line after in muted text. Under the line in play: its translation when it is always shown, "Traduzir verso"
 * when it is not, and "Não entendi" once a blank of the line has an answer.
 */
export function LyricPanel({
  lines,
  current,
  blanks,
  status,
  showTranslation,
  translation,
  onTranslate,
  onExplain,
}: LyricPanelProps) {
  const line = lines[current];
  if (!line) return null;
  const previous = lines[current - 1];
  const next = lines[current + 1];
  const blanksOf = (lineIndex: number) => blanks.filter((blank) => blank.lineIndex === lineIndex);
  const own = blanksOf(current);
  const inPlay = own.find((blank) => status[blank.id] !== 'correct');
  const answered = own.filter((blank) => status[blank.id] === 'correct' || status[blank.id] === 'wrong').at(-1);
  const shownTranslation = showTranslation && translation ? translation : null;

  return (
    <div className="flex flex-col gap-2.5">
      {previous && (
        <p data-testid="line-previous" className="text-lyric text-muted">
          <LineText text={previous.text} blanks={blanksOf(current - 1)} status={status} />
        </p>
      )}
      <p data-testid="line-current" className="font-heading text-verse leading-snug font-bold">
        <LineText text={line.text} blanks={own} status={status} onExplain={onExplain} inPlayId={inPlay?.id} />
      </p>
      {shownTranslation && (
        <p data-testid="translation" className="text-lyric text-muted">
          {shownTranslation}
        </p>
      )}
      {(!shownTranslation || answered) && (
        <div className="flex flex-wrap gap-2">
          {!shownTranslation && <Pill onClick={onTranslate}>{t('jogo.translate')}</Pill>}
          {answered && <Pill onClick={() => onExplain(answered.answer)}>{t('jogo.explain')}</Pill>}
        </div>
      )}
      {next && (
        <p data-testid="line-next" className="text-lyric text-muted">
          <LineText text={next.text} blanks={blanksOf(current + 1)} status={status} />
        </p>
      )}
    </div>
  );
}
