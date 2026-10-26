'use client';

import type { Ref } from 'react';
import { t } from '@/i18n/t';
import { focusRing } from './styles';

export interface ToolsBarProps {
  /** 0.75x: slows the clip down, or puts it back to normal speed. */
  onSlow: () => void;
  /** "Repetir verso". */
  onRepeat: () => void;
  /** The "Repetir verso" button, for a screen that moves the focus to it. */
  repeatRef?: Ref<HTMLButtonElement>;
  /** The clip plays at 0.75x. */
  slow: boolean;
  /**
   * An action of the mode, as a third tool: Karaokê's "Esconder tradução" / "Mostrar tradução", or the translation
   * switch of the modes with blanks.
   */
  action?: {
    /** What the button says. */
    label: string;
    onClick: () => void;
    /** For a switch: whether it is on. It is then drawn and announced like 0.75x (`aria-pressed`). */
    pressed?: boolean;
  };
}

const toolBase = `flex min-h-11 min-w-0 items-center justify-center rounded-button px-1 text-body font-semibold ${focusRing}`;

// Each tool gets its own share of the row, so "Repetir verso" fits on one line on a 320 px phone.
const tool = `${toolBase} whitespace-nowrap`;

/**
 * The tools under the answers: 0.75x and "Repetir verso", which split the row between them (as the wireframes give
 * each tool `flex: 1`).
 *
 * A mode can give an `action` too, which takes a third place in the row: Karaokê's translation switch, or the
 * translation switch of the modes with blanks ("Tradução", lime and `aria-pressed` while it is on, as 0.75x). Its
 * label can be the longest of the three, so it gets the widest share of the row (Karaoke.dc.html gives its translation
 * switch the widest too), at the cost of 0.75x, the shortest tool. At 14 px, "Esconder tradução" is 128 px wide,
 * "Repetir verso" 90 and "0.75x" 38, each plus 8 of padding, and each tool is its 8 plus its share of what the row has
 * left. The shares below keep the label on one line from a 350 px phone up, and "Repetir verso" and 0.75x whole down
 * to 320 px. On a narrower phone the label wraps onto a second line (the 44 px of the row hold two) instead of running
 * out of the button.
 */
export function ToolsBar({ onSlow, onRepeat, repeatRef, slow, action }: ToolsBarProps) {
  return (
    <div className="mt-auto flex gap-2">
      <button
        type="button"
        aria-pressed={slow}
        onClick={onSlow}
        className={`${tool} ${action ? 'flex-[0.55]' : 'flex-1'} ${slow ? 'bg-lime text-bg' : 'bg-card text-text'}`}
      >
        {t('jogo.slow')}
      </button>
      <button
        ref={repeatRef}
        type="button"
        onClick={onRepeat}
        className={`${tool} ${action ? 'flex-[1.3]' : 'flex-1'} bg-card text-text`}
      >
        {t('jogo.repeat')}
      </button>
      {action && (
        <button
          type="button"
          aria-pressed={action.pressed}
          onClick={action.onClick}
          className={`${toolBase} flex-[1.6] text-center leading-tight ${action.pressed ? 'bg-lime text-bg' : 'bg-card text-text'}`}
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
