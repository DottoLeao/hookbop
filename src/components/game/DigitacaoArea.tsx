'use client';

import { useEffect, useId, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { t } from '@/i18n/t';
import { matchTyped, normalizeTyped, warmUpWordList } from '@/lib/game/typo';
import type { Blank } from '@/lib/types';
import { CorrectedWord } from './CorrectedWord';
import { ResultIcon } from './ResultIcon';

/** Where the browser has no idle callback (Safari), the word list is built this long after the area appears. */
const WARM_UP_DELAY_MS = 300;

/** The longest the word list waits for an idle moment. */
const WARM_UP_TIMEOUT_MS = 2000;

export interface DigitacaoAreaProps {
  blank: Blank;
  /** A hint was used on the blank: the first letter of the answer shows as the example text in the field. */
  hinted?: boolean;
  /** The blank is already right: the field starts right, read-only, with the answer. */
  solved?: boolean;
  /** The places in the answer of the letters that were fixed when the blank was answered; only a solved blank has any. */
  corrected?: readonly number[];
  /** `correctedIndices` are the letters of the answer that were fixed (see `matchTyped`); empty unless corrected. */
  onAnswer: (correct: boolean, correctedIndices: number[]) => void;
}

type Phase = 'typing' | 'wrong' | 'right';

/** The first letter of the answer, which is not its apostrophe when it starts with one ("'cause" gives "c"). */
function firstLetter(answer: string): string | undefined {
  return answer.match(/\p{L}/u)?.[0];
}

/**
 * "Digite a palavra que falta": a field to type the word in (design/canvas/Digitacao.dc.html, Limão colors). A slip
 * of one letter is forgiven (`matchTyped`) and the corrected word shows with the fixed letters marked.
 *  - A right answer turns the field lime with ✓ and read-only.
 *  - A wrong one turns it red with ✕ and selects the text, so a new try replaces it. The same wrong word sent again
 *    (the same once capitals, spaces and final punctuation are put aside) is not counted twice.
 *  - A hint given after a miss (the `HINT` event stays in the game, though no button gives one now) clears the wrong
 *    word, so the first letter shows as the example text, and puts the focus back in the field, since whatever gave
 *    the hint may have taken it.
 * The result is said only to screen readers (a status line that is `sr-only`), never as text on screen.
 *
 * Send goes through the form, not a key event: the "done" key of some Android keyboards sends no Enter keydown.
 */
export function DigitacaoArea({ blank, hinted = false, solved = false, corrected = [], onAnswer }: DigitacaoAreaProps) {
  const id = useId();
  const statusId = `${id}-status`;
  const inputRef = useRef<HTMLInputElement>(null);
  // An input method (a Japanese or Chinese keyboard, a predictive one) is still putting the word together.
  const composingRef = useRef(false);
  const [typed, setTyped] = useState('');
  const [phase, setPhase] = useState<Phase>('typing');
  const [fixed, setFixed] = useState<readonly number[]>(corrected);
  // The last wrong word, as it is compared: sending it again is not a new try.
  const lastWrongRef = useRef<string | null>(null);
  const right = solved || phase === 'right';
  const wrong = !right && phase === 'wrong';

  // A hint asked for after a miss: the wrong word is still in the field, and would hide the example text. Clear it.
  const [hintSeen, setHintSeen] = useState(hinted);
  if (hinted !== hintSeen) {
    setHintSeen(hinted);
    if (hinted && wrong) {
      setTyped('');
      setPhase('typing');
    }
  }

  // The word list takes ~100 ms to build the first time it is asked, so it is built while the player is not typing
  // yet, not on their first Enter.
  useEffect(() => {
    if (typeof requestIdleCallback === 'function') {
      const idle = requestIdleCallback(warmUpWordList, { timeout: WARM_UP_TIMEOUT_MS });
      return () => cancelIdleCallback(idle);
    }
    const timer = setTimeout(warmUpWordList, WARM_UP_DELAY_MS);
    return () => clearTimeout(timer);
  }, []);

  // A new field takes the focus so the player goes on typing from one blank to the next, but only when nothing else
  // has it (the body has it when nothing does), and without scrolling the page.
  useEffect(() => {
    if (solved) return;
    const active = document.activeElement;
    if (active === null || active === document.body) inputRef.current?.focus({ preventScroll: true });
  }, [solved]);

  // Giving the hint may have taken the focus (a tap on a button does, and closes the phone keyboard). It goes back to
  // the field: the player is about to type. Only for a hint given now, not for an area that appears already hinted (a
  // saved game that carries one).
  const wasHintedRef = useRef(hinted);
  useEffect(() => {
    const wasHinted = wasHintedRef.current;
    wasHintedRef.current = hinted;
    if (hinted && !wasHinted && !solved) inputRef.current?.focus({ preventScroll: true });
  }, [hinted, solved]);

  function change(event: ChangeEvent<HTMLInputElement>) {
    if (right) return;
    setTyped(event.target.value);
    setPhase('typing');
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // Nothing to answer: no word (nothing but spaces, invisible characters or final punctuation), the blank is
    // already right, or the input method has not finished the word.
    const word = normalizeTyped(typed);
    if (right || composingRef.current || word === '') return;
    if (word === lastWrongRef.current) {
      // The same wrong word again: not a new try. The field says it is still wrong, with the text ready to replace.
      setPhase('wrong');
      inputRef.current?.select();
      return;
    }

    const { result, correctedIndices } = matchTyped(typed, blank.answer);
    if (result === 'wrong') {
      lastWrongRef.current = word;
      setPhase('wrong');
      inputRef.current?.select();
      onAnswer(false, []);
      return;
    }
    setFixed(correctedIndices);
    setPhase('right');
    onAnswer(true, correctedIndices);
  }

  const status = right
    ? t(fixed.length > 0 ? 'digitacao.corrected' : 'digitacao.hit', { palavra: blank.answer })
    : wrong
      ? t('digitacao.miss', { palavra: typed.trim() })
      : null;
  const look = right
    ? 'border-lime bg-lime text-bg'
    : wrong
      ? 'border-error bg-error text-bg'
      : 'border-border bg-card text-text';

  // The height is label (20 px) + gap (6 px) + field (48 px) = 74 px: the game screen keeps that room while this
  // area is being loaded (its `Suspense` fallback), so change both together.
  return (
    <form onSubmit={submit} className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-body leading-5 font-semibold">
        {t('digitacao.label')}
      </label>
      <div
        className={`flex h-12 items-center gap-2 rounded-answer border-2 px-3 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-lime ${look}`}
      >
        {(right || wrong) && <ResultIcon hit={right} />}
        {right && (
          <span aria-hidden="true" className="min-w-0 text-button font-bold [overflow-wrap:anywhere]">
            <CorrectedWord word={blank.answer} corrected={fixed} />
          </span>
        )}
        {/* A right answer shows as the corrected word above; the field stays, out of sight, so the focus and the
            label stay with it. The text is 16 px: a smaller field makes iOS zoom the page in on focus. */}
        <input
          ref={inputRef}
          id={id}
          type="text"
          value={right ? blank.answer : typed}
          readOnly={right}
          placeholder={hinted ? firstLetter(blank.answer) : undefined}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          autoComplete="off"
          enterKeyHint="done"
          aria-invalid={wrong || undefined}
          aria-describedby={statusId}
          onChange={change}
          onCompositionStart={() => {
            composingRef.current = true;
          }}
          onCompositionEnd={() => {
            composingRef.current = false;
          }}
          className={
            right
              ? 'sr-only'
              : `h-full min-w-0 flex-1 bg-transparent text-button font-semibold outline-none placeholder:text-muted ${
                  wrong ? 'selection:bg-bg selection:text-error' : ''
                }`
          }
        />
      </div>
      <span id={statusId} role="status" className="sr-only">
        {status}
      </span>
    </form>
  );
}
