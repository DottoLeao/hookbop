'use client';

import { Fragment, type MouseEvent } from 'react';
import { t } from '@/i18n/t';
import type { BlankStatus } from '@/lib/game/reducer';
import type { Blank, LyricLine } from '@/lib/types';
import { CorrectedWord } from './CorrectedWord';
import { pieces, tappable } from './lineWords';
import { ResultIcon } from './ResultIcon';
import { focusRing } from './styles';

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
  /**
   * The translation of the line in play, as far as it got: on its way, there, or not to be had (with what DJ Bop says
   * about it). Shown whenever there is one, whatever "Mostrar tradução sempre" says: that setting only decides whether
   * the game screen asks for it by itself (ruling R64).
   */
  translation?: TranslationView;
  /** "Traduzir verso", with the index of the line it is under. */
  onTranslate: (lineIndex: number) => void;
  /**
   * "Não entendi", or a tap on a word of the line in play: the word or expression to explain, the index of the line
   * that was drawn (the clock may have moved past it by the time of the tap), and the button that was tapped, which
   * gets the focus back when the explanation closes. Safari gives a tapped button no focus, so it is handed over here.
   */
  onExplain: (target: string, lineIndex: number, opener: HTMLElement) => void;
}

export type TranslationView =
  | { status: 'loading' }
  | { status: 'done'; text: string }
  | { status: 'error'; message: string };

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
  onExplain?: (word: string, opener: HTMLElement) => void;
  /** The blank the player answers now, on the line in play. */
  inPlayId?: string;
  /** The letters fixed in the blanks that were typed with a slip, on the line in play. */
  corrected?: Record<string, number[]>;
}

/**
 * A line with its open blanks hidden, so no line on screen gives an answer away. A line that is a puzzle (a blank for
 * the whole line) is hidden altogether until the puzzle is right (ruling R52), and then drawn as an ordinary line. In
 * the game a right puzzle line in play is never drawn here but in the answer area's row, which has its check and its
 * words to tap (ruling R59), so the panel only ever draws such a line before or after the line in play.
 */
function LineText({ text, blanks, status, onExplain, inPlayId, corrected }: LineTextProps) {
  const wholeLine = blanks.find((b) => b.tokenIndex === WHOLE_LINE);
  if (wholeLine && status[wholeLine.id] !== 'correct') {
    return <Slot small={!onExplain} whole />;
  }
  return pieces(text).map((piece, i) => {
    if (!('word' in piece)) return <Fragment key={i}>{piece.text}</Fragment>;
    const blank = blanks.find((b) => b.tokenIndex === piece.index);
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
          onClick={(event) => onExplain(piece.word, event.currentTarget)}
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
        onClick={(event) => onExplain(piece.word, event.currentTarget)}
        className={`${tappable} px-0.5 hover:text-lime-light`}
      >
        {piece.text}
      </button>
    );
  });
}

function Pill({ onClick, children }: { onClick: (event: MouseEvent<HTMLButtonElement>) => void; children: string }) {
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
 * the line after in muted text. Under the line in play: its translation once there is one, and "Traduzir verso" until
 * then ("Traduzindo..." while it is on its way, and DJ Bop's calm line next to the pill when it cannot be had), and
 * "Não entendi" once a blank of the line has an answer.
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
  const shownTranslation = translation?.status === 'done' ? translation.text : null;
  // "Traduzir verso" until the translation is there, except while it is on its way. After a failure it asks again.
  const canTranslate = !shownTranslation && translation?.status !== 'loading';
  const translationNote =
    translation?.status === 'loading' ? t('ajuda.translating') : translation?.status === 'error' ? translation.message : null;
  // The word the player tapped belongs to the line drawn now, whatever line the clock reaches before the tap lands.
  const explain = (target: string, opener: HTMLElement) => onExplain(target, current, opener);

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
            onExplain={explain}
            inPlayId={inPlayId}
            corrected={corrected}
          />
        </p>
      )}
      {shownTranslation && (
        <p data-testid="translation" lang="pt-BR" className="text-lyric text-muted">
          {shownTranslation}
        </p>
      )}
      {translationNote && (
        <p role="status" className="text-body text-muted">
          {translationNote}
        </p>
      )}
      {(canTranslate || answered) && (
        <div className="flex flex-wrap gap-2">
          {canTranslate && <Pill onClick={() => onTranslate(current)}>{t('jogo.translate')}</Pill>}
          {answered && <Pill onClick={(event) => explain(answered.answer, event.currentTarget)}>{t('jogo.explain')}</Pill>}
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
