'use client';

import { useEffect, useRef, useState } from 'react';
import { DjBop } from '@/components/brand/DjBop';
import { t } from '@/i18n/t';
import { helpErrorCopy } from '@/lib/help/helpError';
import { useSheetEnter } from '@/lib/motion/transitions';
import { focusRing } from './styles';

interface HelpSheetProps {
  /** The word or expression to explain, as the player tapped it; '' for the whole line. */
  target: string;
  /** Asks for the explanation. Called when the sheet opens, and again for "Tentar de novo". */
  load: () => Promise<string>;
  /** "Valeu" or Escape. */
  onClose: () => void;
}

type View = { status: 'loading' } | { status: 'done'; text: string } | { status: 'error'; error: unknown };

const action = `min-h-11 rounded-button px-4 text-button font-bold ${focusRing}`;

/**
 * "Não entendi": DJ Bop explains a word, an expression or the whole line (the explain card of
 * design/canvas/Karaoke.dc.html, with DJ Bop's speech bubble from Componentes.dc.html). The word sits on top, and DJ Bop
 * says the explanation, or that he is on it, or, when it cannot be had, a calm line: come back later past the limit,
 * try again when the service is down (with a button for it), and a general line otherwise.
 *
 * Like the settings, it is a panel in the page and not an overlay: the game screen shows it under the player in place
 * of the game area, because nothing may be drawn over the YouTube player. It rises from below as it opens
 * (`useSheetEnter`) and closes at once, with no way out to wait for.
 */
export function HelpSheet({ target, load, onClose }: HelpSheetProps) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<View>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  useSheetEnter(sheetRef);

  // The sheet takes the focus when it opens, so a screen reader starts in it and Escape reaches it.
  useEffect(() => {
    sheetRef.current?.focus();
  }, []);

  useEffect(() => {
    let open = true;
    load().then(
      (text) => open && setView({ status: 'done', text }),
      (error: unknown) => open && setView({ status: 'error', error }),
    );
    return () => {
      open = false;
    };
  }, [load, attempt]);

  function retry() {
    setView({ status: 'loading' });
    setAttempt((n) => n + 1);
    // The button goes away with the error, and the focus would fall to the page, out of reach of Escape.
    sheetRef.current?.focus();
  }

  const problem = view.status === 'error' ? helpErrorCopy(view.error) : null;
  const said = view.status === 'done' ? view.text : problem ? t(problem.message) : t('ajuda.loading');

  return (
    <div
      ref={sheetRef}
      role="dialog"
      aria-label={t('ajuda.dialog')}
      tabIndex={-1}
      onKeyDown={(event) => {
        if (event.key === 'Escape') onClose();
      }}
      className="flex flex-col gap-4 rounded-card bg-card px-4 pt-5 pb-6 outline-none"
    >
      <h2 lang={target ? 'en' : undefined} className="font-heading text-verse font-bold">
        {target || t('ajuda.wholeLine')}
      </h2>
      <div className="flex items-end gap-2.5">
        <div className="shrink-0">
          <DjBop expression="idle" size={44} />
        </div>
        <p
          role="status"
          lang={view.status === 'done' ? 'pt-BR' : undefined}
          className="min-w-0 flex-1 rounded-[16px_16px_16px_4px] bg-elevated px-3.5 py-2.5 text-body font-semibold"
        >
          {said}
        </p>
      </div>
      {problem?.retry && (
        <button type="button" onClick={retry} className={`${action} border-[1.5px] border-border text-text`}>
          {t('ajuda.retry')}
        </button>
      )}
      <button type="button" onClick={onClose} className={`${action} bg-lime text-bg`}>
        {t('ajuda.close')}
      </button>
    </div>
  );
}
