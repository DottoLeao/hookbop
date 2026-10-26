'use client';

import { Fragment, useRef, type MouseEvent } from 'react';
import { t } from '@/i18n/t';
import type { BlankStatus } from '@/lib/game/reducer';
import { useReducedMotion } from '@/lib/motion/useReducedMotion';
import type { Blank, LyricLine } from '@/lib/types';
import { CorrectedWord } from './CorrectedWord';
import { pieces, tappable } from './lineWords';
import { ResultIcon } from './ResultIcon';
import { focusRing } from './styles';
import { useLineTransition } from './useLineTransition';

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
   * The translation of the line in play, as far as it got: on its way, or there. The game screen gives one only while
   * its translation switch is on and the line may show it (no blank of it awaits an answer); without one,
   * nothing is drawn for it.
   */
  translation?: TranslationView;
  /**
   * "Não entendi", or a tap on a word of the line in play: the word or expression to explain, the index of the line
   * that was drawn (the clock may have moved past it by the time of the tap), and the button that was tapped, which
   * gets the focus back when the explanation closes. Safari gives a tapped button no focus, so it is handed over here.
   */
  onExplain: (target: string, lineIndex: number, opener: HTMLElement) => void;
}

export type TranslationView = { status: 'loading' } | { status: 'done'; text: string };

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
 * A blank still open. The one in play is solid ("sua vez") and pulses in lime (`blank-pulse`, in `globals.css`: a ring that
 * swells and fades around the slot, which itself never moves, and none at all when motion is reduced); the others, and
 * those of the lines around it, dashed.
 * `whole` is a line that is a puzzle, hidden altogether: one dashed bar as wide as the line in place of its words
 * (the player builds it in the answer area, so the bar has no "sua vez" look).
 */
function Slot({ inPlay = false, small, whole = false }: { inPlay?: boolean; small: boolean; whole?: boolean }) {
  const size = SLOT_SIZE[whole ? 'line' : 'word'][small ? 'small' : 'large'];
  const look = small
    ? 'border-[1.5px] border-dashed border-faint'
    : inPlay
      ? 'blank-pulse border-[2.5px] border-lime bg-card'
      : 'border-2 border-dashed border-lime';
  return (
    <span className={`inline-block rounded-blank align-middle ${size} ${look}`}>
      <span className="sr-only">{t(whole ? 'jogo.hiddenLine' : 'jogo.blank')}</span>
    </span>
  );
}

/**
 * A blank of the line in play that was missed and is no longer the one to answer: red with ✕, the size of a slot, so
 * it reads as missed and not as still open. The right word is not shown (nor any word: a word in red would read as a
 * wrong word), and the result is for screen readers only.
 */
function Missed() {
  return (
    <span className="inline-flex h-[34px] w-18 items-center justify-center rounded-blank bg-error align-middle text-bg">
      <ResultIcon hit={false} />
      <span className="sr-only">{t('jogo.miss', { palavra: t('jogo.blank') })}</span>
    </span>
  );
}

interface LineTextProps {
  text: string;
  blanks: Blank[];
  status: Record<string, BlankStatus>;
  /** The line in play, drawn large with its right blanks marked. The lines around it are muted plain text. */
  inPlay?: boolean;
  /**
   * Only for the line in play, and only once help may open on it (ruling R83): its words can be tapped. Without it the
   * line in play is drawn the same way, with nothing to tap.
   */
  onExplain?: (word: string, opener: HTMLElement) => void;
  /** The blank the player answers now, on the line in play. */
  inPlayId?: string;
  /** The letters fixed in the blanks that were typed with a slip, on the line in play. */
  corrected?: Record<string, number[]>;
}

/** A blank of the line in play that is right: lime with ✓, as a button to tap or, while help waits, as plain marking. */
function RightWord({
  word,
  fixed,
  onExplain,
}: {
  word: { word: string; text: string };
  fixed: number[];
  onExplain?: (word: string, opener: HTMLElement) => void;
}) {
  const label = t(fixed.length > 0 ? 'digitacao.corrected' : 'jogo.hit', { palavra: word.text });
  const look = `${tappable} gap-1 bg-lime px-2.5 text-bg`;
  const drawn = (
    <>
      <ResultIcon hit />
      {fixed.length > 0 ? <CorrectedWord word={word.text} corrected={fixed} /> : word.text}
    </>
  );
  if (!onExplain) {
    return (
      <span className={look}>
        <span aria-hidden="true" className="contents">
          {drawn}
        </span>
        <span className="sr-only">{label}</span>
      </span>
    );
  }
  return (
    <button type="button" aria-label={label} onClick={(event) => onExplain(word.word, event.currentTarget)} className={look}>
      {drawn}
    </button>
  );
}

/**
 * A line with its open blanks hidden, so no line on screen gives an answer away. A line that is a puzzle (a blank for
 * the whole line) is hidden altogether until the puzzle is right (ruling R52), and then drawn as an ordinary line. In
 * the game a right puzzle line in play is never drawn here but in the answer area's row, which has its check and its
 * words to tap (ruling R59), so the panel only ever draws such a line before or after the line in play.
 */
function LineText({ text, blanks, status, inPlay = false, onExplain, inPlayId, corrected }: LineTextProps) {
  const wholeLine = blanks.find((b) => b.tokenIndex === WHOLE_LINE);
  if (wholeLine && status[wholeLine.id] !== 'correct') {
    return <Slot small={!inPlay} whole />;
  }
  return pieces(text).map((piece, i) => {
    if (!('word' in piece)) return <Fragment key={i}>{piece.text}</Fragment>;
    const blank = blanks.find((b) => b.tokenIndex === piece.index);
    if (blank && status[blank.id] !== 'correct') {
      if (inPlay && status[blank.id] === 'wrong' && blank.id !== inPlayId) return <Missed key={i} />;
      return <Slot key={i} inPlay={blank.id === inPlayId} small={!inPlay} />;
    }
    if (!inPlay) return <Fragment key={i}>{piece.text}</Fragment>;
    if (blank) {
      // A right blank: lime with ✓, whatever the mode, so two right words on a line look alike. One typed with a slip
      // also has the letters that were fixed under a wavy line, and says so to screen readers.
      return <RightWord key={i} word={piece} fixed={corrected?.[blank.id] ?? []} onExplain={onExplain} />;
    }
    if (!onExplain) return <Fragment key={i}>{piece.text}</Fragment>;
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
 * the line after in muted text. Under the line in play: its translation when the game screen gives one, and "Não
 * entendi" once every blank of the line has had its first answer. Until then the words of the line in play cannot be
 * tapped either (ruling R83). The translation is turned on and off in the tools (the game screen's switch), never here.
 * While it is on its way, "Traduzindo..." is drawn in a box a shimmer passes over (`shimmer`, in `globals.css`), where
 * the translation will come; it is still the `role="status"` that says it.
 *
 * A line that is a puzzle (Monte o verso) is never drawn as text until it is right (ruling R52), and while it is in
 * play the answer area holds it (ruling R59): the panel then draws neither that line nor the line after it, only the
 * line before and the translation, so nothing here changes size when the line is solved. A puzzle line never gets
 * "Não entendi": that pill would explain the hidden line, and the area has "Não entendi a ordem".
 *
 * When the song moves on to the next line, the lyrics slide up to it (`useLineTransition`); the buttons do not move.
 */
export function LyricPanel({
  lines,
  current,
  blanks,
  status,
  inPlayId,
  corrected,
  translation,
  onExplain,
}: LyricPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const reducedMotion = useReducedMotion();
  useLineTransition(panelRef, current, reducedMotion);
  const line = lines[current];
  if (!line) return null;
  const previous = lines[current - 1];
  const next = lines[current + 1];
  const blanksOf = (lineIndex: number) => blanks.filter((blank) => blank.lineIndex === lineIndex);
  const own = blanksOf(current);
  const inArea = own.some((blank) => blank.id === inPlayId && blank.tokenIndex === WHOLE_LINE);
  const answerable = own.filter((blank) => blank.tokenIndex !== WHOLE_LINE);
  // Ruling R83: while a blank of the line has had no answer at all, an explanation of the line or of one of its words
  // could give it away while the first try still counts, and it would be kept for every member. So nothing on the line
  // can be tapped and "Não entendi" waits until each blank of it has had its first answer, right or wrong.
  const helpOpen = answerable.every((blank) => status[blank.id] === 'correct' || status[blank.id] === 'wrong');
  // "Não entendi" explains the blank in play, or the line's last one.
  const explained = helpOpen ? (answerable.find((blank) => blank.id === inPlayId) ?? answerable.at(-1)) : undefined;
  const shownTranslation = translation?.status === 'done' ? translation.text : null;
  const translating = translation?.status === 'loading';
  // The word the player tapped belongs to the line drawn now, whatever line the clock reaches before the tap lands.
  const explain = (target: string, opener: HTMLElement) => onExplain(target, current, opener);

  return (
    <div ref={panelRef} className="flex flex-col gap-2.5">
      {previous && (
        <p data-line="previous" data-testid="line-previous" className="text-lyric text-muted">
          <LineText text={previous.text} blanks={blanksOf(current - 1)} status={status} />
        </p>
      )}
      {!inArea && (
        <p data-line="current" data-testid="line-current" className="font-heading text-verse leading-snug font-bold">
          <LineText
            text={line.text}
            blanks={own}
            status={status}
            inPlay
            onExplain={helpOpen ? explain : undefined}
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
      {translating && (
        <p role="status" className="shimmer rounded-blank bg-elevated px-3 py-2 text-body text-muted">
          {t('ajuda.translating')}
        </p>
      )}
      {explained && (
        <div className="flex flex-wrap gap-2">
          <Pill onClick={(event) => explain(explained.answer, event.currentTarget)}>{t('jogo.explain')}</Pill>
        </div>
      )}
      {next && !inArea && (
        <p data-line="next" data-testid="line-next" className="text-lyric text-muted">
          <LineText text={next.text} blanks={blanksOf(current + 1)} status={status} />
        </p>
      )}
    </div>
  );
}
