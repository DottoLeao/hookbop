'use client';

import { t } from '@/i18n/t';
import type { Entitlement } from '@/lib/entitlements';
import { focusRing } from './styles';

interface ToolsBarBaseProps {
  /** 0.75x: slows the clip down, or puts it back to normal speed. */
  onSlow: () => void;
  /** "Repetir verso". */
  onRepeat: () => void;
  /** The clip plays at 0.75x. */
  slow: boolean;
}

/** The third tool is the hint... */
interface HintProps {
  onHint: () => void;
  /** How the hint is unlocked in this phase (`getEntitlements`). */
  hintPerk: Entitlement;
  /** There is no blank to help with right now, or it already had its hint. */
  hintDisabled?: boolean;
  action?: never;
}

/** ...or, in a mode that has no use for one, an action of that mode in its place (Karaokê: the translation switch). */
interface ActionProps {
  action: {
    /** What the button says. */
    label: string;
    onClick: () => void;
  };
  onHint?: never;
  hintPerk?: never;
  hintDisabled?: never;
}

export type ToolsBarProps = ToolsBarBaseProps & (HintProps | ActionProps);

const toolBase = `flex min-h-11 min-w-0 items-center justify-center rounded-button px-1 text-body font-semibold ${focusRing}`;

// Each tool gets its own share of the row, so "Repetir verso" fits on one line on a 320 px phone.
const tool = `${toolBase} whitespace-nowrap`;

/**
 * The tools under the answers: 0.75x, "Repetir verso" and the hint. The hint sits in a dashed lime border, the mark
 * of an ad spot. In this phase it is free; behind an ad (the public phase) it keeps that lime spot but stays off,
 * since there are no ads yet (ruling R46). A free hint with nothing to help with greys out.
 *
 * A mode with no hint gives an `action` instead, which takes the hint's place in the row. It is a tool like 0.75x and
 * "Repetir verso", not an ad spot, so it has no dashed border. Its label is longer than "Dica", so it gets the widest
 * share of the row (Karaoke.dc.html gives its translation switch the widest too), at the cost of 0.75x, the shortest
 * tool. At 14 px, "Esconder tradução" is 128 px wide, "Repetir verso" 90 and "0.75x" 38, each plus 8 of padding, and
 * each tool is its 8 plus its share of what the row has left. The shares below keep the label on one line from a
 * 350 px phone up, and "Repetir verso" and 0.75x whole down to 320 px. On a narrower phone the label wraps onto a
 * second line (the 44 px of the row hold two) instead of running out of the button.
 */
export function ToolsBar(props: ToolsBarProps) {
  const { onSlow, onRepeat, slow, action, onHint, hintPerk, hintDisabled } = props;
  const hintLook = hintPerk === 'free' ? 'disabled:border-border disabled:text-faint' : '';
  return (
    <div className="mt-auto flex gap-2">
      <button
        type="button"
        aria-pressed={slow}
        onClick={onSlow}
        className={`${tool} ${action ? 'flex-[0.55]' : 'flex-[0.8]'} ${slow ? 'bg-lime text-bg' : 'bg-card text-text'}`}
      >
        {t('jogo.slow')}
      </button>
      <button type="button" onClick={onRepeat} className={`${tool} flex-[1.3] bg-card text-text`}>
        {t('jogo.repeat')}
      </button>
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className={`${toolBase} flex-[1.6] bg-card text-center leading-tight text-text`}
        >
          {action.label}
        </button>
      )}
      {!action && hintPerk !== 'off' && (
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
