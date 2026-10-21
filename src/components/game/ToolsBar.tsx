'use client';

import { t } from '@/i18n/t';
import type { Entitlement } from '@/lib/entitlements';

interface ToolsBarProps {
  /** 0.75x: slows the clip down, or puts it back to normal speed. */
  onSlow: () => void;
  /** "Repetir verso". */
  onRepeat: () => void;
  onHint: () => void;
  /** How the hint is unlocked in this phase (`getEntitlements`). */
  hintPerk: Entitlement;
  /** The clip plays at 0.75x. */
  slow: boolean;
  /** There is no blank to help with right now, or it already had its hint. */
  hintDisabled?: boolean;
}

// Each tool gets its own share of the row, so "Repetir verso" fits on one line on a 320 px phone.
const tool =
  'flex min-h-11 min-w-0 items-center justify-center rounded-button px-1 text-body font-semibold whitespace-nowrap focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime';

/**
 * The tools under the answers: 0.75x, "Repetir verso" and the hint. The hint sits in a dashed lime border, the mark
 * of an ad spot. In this phase it is free; behind an ad (the public phase) it keeps that lime spot but stays off,
 * since there are no ads yet (ruling R46). A free hint with nothing to help with greys out.
 */
export function ToolsBar({ onSlow, onRepeat, onHint, hintPerk, slow, hintDisabled = false }: ToolsBarProps) {
  const hintLook = hintPerk === 'free' ? 'disabled:border-border disabled:text-faint' : '';
  return (
    <div className="mt-auto flex gap-2">
      <button
        type="button"
        aria-pressed={slow}
        onClick={onSlow}
        className={`${tool} flex-[0.8] ${slow ? 'bg-lime text-bg' : 'bg-card text-text'}`}
      >
        {t('jogo.slow')}
      </button>
      <button type="button" onClick={onRepeat} className={`${tool} flex-[1.3] bg-card text-text`}>
        {t('jogo.repeat')}
      </button>
      {hintPerk !== 'off' && (
        <button
          type="button"
          onClick={onHint}
          disabled={hintPerk !== 'free' || hintDisabled}
          className={`${tool} flex-[1.1] border-[1.5px] border-dashed border-lime text-lime ${hintLook}`}
        >
          {t(hintPerk === 'free' ? 'jogo.hint' : 'jogo.hintAd')}
        </button>
      )}
    </div>
  );
}
