'use client';

import { Fragment } from 'react';
import { t } from '@/i18n/t';
import type { BlankStatus } from '@/lib/game/reducer';
import type { Blank, LyricLine } from '@/lib/types';
import { CorrectedWord } from './CorrectedWord';
import { focusRing, pieces, tappable } from './lineWords';
import { ResultIcon } from './ResultIcon';

interface LyricPanelProps {
  lines: LyricLine[];
  /** The index of the line in play. */
  current: number;
  blanks: Blank[];
  status: Record<string, BlankStatus>;
  /**
   * The blank the player answers now, as the game screen picked it for the answer area: it gets the solid
   * "sua vez" slot. The panel never picks one itself, so the slot and the options always point at the same blank.
   * When it is a blank for the whole line (Monte o verso), the answer area is where that line is built, so the panel
   * draws neither that line nor the line after it (ruling R59).
   */
  inPlayId?: string;
  /**
   * The letters that were fixed in the blanks the typing mode took with a slip, by blank id (the places in the
   * answer, as `matchTyped` gives them). Such a blank on the line in play shows them marked, as in
   * design/canvas/Digitacao.dc.html.
   */
  corrected?: Record<string, number[]>;
  /** Show the line's translation under it, when there is one, in place of "Traduzir verso". */
  showTranslation: boolean;
  /** The translation of the line in play, once something has fetched it. */
  translation?: string;
  /** "Traduzir verso". */
  onTranslate: () => void;
  /** "Não entendi", or a tap on a word of the line in play: the word or expression to explain. */
  onExplain: (target: string) => void;
}

/**
 * The `tokenIndex` of a blank for the whole line (Monte o verso, `selectTileLines`): the line is the puzzle, so no
 * word of it is a blank of its own.
 */
const WHOLE_LINE = -1;

/** How big a slot is: for a word, or for a whole line, in the line in play (large) or the lines around it (small). */
const SLOT_SIZE = {
  word: { large: 'h-[34px] w-18', small: 'h-5 w-12' },
  line: { large: 'h-[34px] w-full', small: 'h-5 w-40 max-w-full' },
};

/**
 * A blank still open. The one in play is solid ("sua vez"); the others, and those of the lines around it, dashed.
 * `whole` is a line that is a puzzle, hidden altogether: one dashed bar as wide as the line in place of its words
 * (the player builds it in the answer area, so the bar has no "sua vez" look).
 */
function Slot({ inPlay = false, small, whole = false }: { inPlay?: boolean; small: boolean; whole?: boolean }) {
  const size = SLOT_SIZE[whole ? 'line' : 'word'][small ? 'small' : 'large'];
  const look = small
    ? 'border-[1.5px] border-dashed border-faint'
    : inPlay
      ? 'border-[2.5px] border-lime bg-card'
      : 'border-2 border-dashed border-lime';
  return (
    <span className={`inline-block rounded-blank align-middle ${size} ${look}`}>
      <span className="sr-only">{t(whole ? 'jogo.hiddenLine' : 'jogo.blank')}</span>
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
  /** The letters fixed in the blanks that were typed with a slip, on the line in play. */
  corrected?: Record<string, number[]>;
}

/**
 * A line with its open blanks hidden, so no line on screen gives an answer away. A line that is a puzzle (a blank for
 * the whole line) is hidden altogether until the puzzle is right (ruling R52): then its words show, each one a right
 * one, as the blanks of the other modes do (ruling R55).
 */
function LineText({ text, blanks, status, onExplain, inPlayId, corrected }: LineTextProps) {
  const wholeLine = blanks.find((b) => b.tokenIndex === WHOLE_LINE);
  if (wholeLine && status[wholeLine.id] !== 'correct') {
    return <Slot small={!onExplain} whole />;
  }
  return pieces(text).map((piece, i) => {
    if (!('word' in piece)) return <Fragment key={i}>{piece.text}</Fragment>;
    const blank = wholeLine ?? blanks.find((b) => b.tokenIndex === piece.index);
    if (blank && status[blank.id] !== 'correct') {
      return <Slot key={i} inPlay={blank.id === inPlayId} small={!onExplain} />;
    }
    if (!onExplain) return <Fragment key={i}>{piece.text}</Fragment>;
    if (blank) {
      // A right blank: lime with ✓, whatever the mode, so two right words on a line look alike. One typed with a slip
      // also has the letters that were fixed under a wavy line, and says so to screen readers.
      const fixed = corrected?.[blank.id] ?? [];
      return (
        <button
          key={i}
          type="button"
          aria-label={t(fixed.length > 0 ? 'digitacao.corrected' : 'jogo.hit', { palavra: piece.text })}
          onClick={() => onExplain(piece.word)}
          className={`${tappable} gap-1 bg-lime px-2.5 text-bg`}
        >
          <ResultIcon hit />
          {fixed.length > 0 ? <CorrectedWord word={piece.text} corrected={fixed} /> : piece.text}
        </button>
      );
    }
    return (
      <button
        key={i}
        type="button"
        onClick={() => onExplain(piece.word)}
        className={`${tappable} px-0.5 hover:text-lime-light`}
      >
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
 *
 * A line that is a puzzle (Monte o verso) is never drawn as text until it is right (ruling R52), and while it is in
 * play the answer area holds it (ruling R59): the panel then draws neither that line nor the line after it, only the
 * line before, "Traduzir verso" and the translation, so nothing here changes size when the line is solved. A puzzle
 * line never gets "Não entendi": that pill would explain the hidden line, and the area has "Não entendi a ordem".
 */
export function LyricPanel({
  lines,
  current,
  blanks,
  status,
  inPlayId,
  corrected,
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
  const inArea = own.some((blank) => blank.id === inPlayId && blank.tokenIndex === WHOLE_LINE);
  const answerable = own.filter((blank) => blank.tokenIndex !== WHOLE_LINE);
  const answered = answerable.filter((blank) => status[blank.id] === 'correct' || status[blank.id] === 'wrong').at(-1);
  const shownTranslation = showTranslation && translation ? translation : null;

  return (
    <div className="flex flex-col gap-2.5">
      {previous && (
        <p data-testid="line-previous" className="text-lyric text-muted">
          <LineText text={previous.text} blanks={blanksOf(current - 1)} status={status} />
        </p>
      )}
      {!inArea && (
        <p data-testid="line-current" className="font-heading text-verse leading-snug font-bold">
          <LineText
            text={line.text}
            blanks={own}
            status={status}
            onExplain={onExplain}
            inPlayId={inPlayId}
            corrected={corrected}
          />
        </p>
      )}
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
      {next && !inArea && (
        <p data-testid="line-next" className="text-lyric text-muted">
          <LineText text={next.text} blanks={blanksOf(current + 1)} status={status} />
        </p>
      )}
    </div>
  );
}
