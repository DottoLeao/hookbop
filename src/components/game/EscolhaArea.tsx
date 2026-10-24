'use client';

import { useRef, useState, type ReactNode } from 'react';
import { t } from '@/i18n/t';
import { tokenize } from '@/lib/game/blanks';
import { makeDistractors } from '@/lib/game/distractors';
import { seededRng, shuffled } from '@/lib/game/rng';
import type { Blank, LyricLine } from '@/lib/types';
import { ResultIcon } from './ResultIcon';
import { useAnswerFeedback, type AnswerResult } from './useAnswerFeedback';

/**
 * The three options of a blank: its answer and two distractors, in an order drawn from the blank id and the video,
 * so a song always asks the same question the same way. Finding the distractors can take ~100 ms the first time,
 * so the game screen asks only for the blank in play.
 */
export function escolhaOptions(blank: Blank, line: LyricLine, youtubeId: string): string[] {
  const seed = `${blank.id}${youtubeId}`;
  return shuffled([blank.answer, ...makeDistractors(blank.answer, tokenize(line.text), seed)], seededRng(seed));
}

interface EscolhaAreaProps {
  blank: Blank;
  /** The answer and its distractors, in the order to show them (`escolhaOptions`). */
  options: readonly string[];
  /** A hint was used on the blank: one wrong option that was not tried yet is greyed out. */
  hinted?: boolean;
  /** The blank is already right: the answer shows its check, and nothing can be picked. */
  solved?: boolean;
  onAnswer: (correct: boolean) => void;
}

const option =
  'flex min-h-13 min-w-0 items-center justify-center gap-1.5 rounded-answer px-2 text-center text-button [overflow-wrap:anywhere] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime';

interface OptionButtonProps {
  /** What the option came to: it pops when it is right and shakes when it is wrong, as its mark comes. */
  result: AnswerResult;
  disabled: boolean;
  /** The option has its result, and takes no more taps (it is `aria-disabled`, never `disabled`). */
  tried: boolean;
  /** The accessible name: the result, said to screen readers, once there is one. */
  label?: string;
  className: string;
  onClick: () => void;
  children: ReactNode;
}

/** One answer button, which moves with its own result (`useAnswerFeedback`): the other options stay where they are. */
function OptionButton({ result, disabled, tried, label, className, onClick, children }: OptionButtonProps) {
  const ref = useRef<HTMLButtonElement>(null);
  useAnswerFeedback(ref, result);
  return (
    <button
      ref={ref}
      type="button"
      disabled={disabled}
      aria-disabled={tried || undefined}
      aria-label={label}
      onClick={onClick}
      className={className}
    >
      {children}
    </button>
  );
}

/**
 * "Escolha a palavra que falta": three answer buttons (design/canvas/Escolha.dc.html, Limão colors). A right pick
 * turns lime with ✓ and closes the question; a wrong one turns red with ✕ and the other two stay open for another
 * try. The result is said only in the button's accessible name ("let, acertou"), never as text on screen. As the mark
 * comes, a right option pops and a wrong one shakes, for 0.3 s at most (`useAnswerFeedback`): no tap is held back by
 * it, and the focus stays on the option that was tapped.
 */
export function EscolhaArea({ blank, options, hinted = false, solved = false, onAnswer }: EscolhaAreaProps) {
  const [picked, setPicked] = useState<readonly string[]>([]);
  const done = solved || picked.includes(blank.answer);
  // The first wrong option in the row that was not tried: once the hint is in, that one stays the same.
  const greyedOut = hinted ? options.find((o) => o !== blank.answer && !picked.includes(o)) : undefined;

  function pick(choice: string) {
    if (done || picked.includes(choice)) return;
    setPicked([...picked, choice]);
    onAnswer(choice === blank.answer);
  }

  return (
    <div role="group" aria-label={t('escolha.question')} className="grid grid-cols-3 gap-2">
      {options.map((choice) => {
        const hit = choice === blank.answer && done;
        const miss = choice !== blank.answer && picked.includes(choice);
        const greyed = choice === greyedOut;
        // A tried option is only aria-disabled (`pick` ignores it): a disabled button would lose the focus the tap
        // gave it, and a screen reader would not read its result.
        const tried = hit || miss;
        const look = hit
          ? 'bg-lime font-bold text-bg'
          : miss
            ? 'bg-error font-bold text-bg'
            : greyed
              ? 'border-[1.5px] border-dashed border-border font-semibold text-faint'
              : 'bg-card font-semibold text-text disabled:text-muted';
        return (
          <OptionButton
            key={choice}
            result={hit ? 'hit' : miss ? 'miss' : null}
            disabled={!tried && (done || greyed)}
            tried={tried}
            label={hit ? t('escolha.hit', { palavra: choice }) : miss ? t('escolha.miss', { palavra: choice }) : undefined}
            onClick={() => pick(choice)}
            className={`${option} ${look}`}
          >
            {(hit || miss) && <ResultIcon hit={hit} />}
            {choice}
          </OptionButton>
        );
      })}
    </div>
  );
}
