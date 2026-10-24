import { useState } from 'react';
import { flushSync } from 'react-dom';
import { clipPlays, type GameState } from '@/lib/game/reducer';
import type { LineHelp } from '@/lib/help/useLineHelp';
import type { Command } from '@/lib/types';

/** "Não entendi" (or a tapped word) while its sheet is open. */
export interface HelpAsk {
  target: string;
  /** Asks for the explanation; made once per ask, so the sheet does not ask again on every render. */
  load: () => Promise<string>;
  /** The button that opened the sheet, which gets the focus back when it closes. */
  opener: HTMLElement;
  /** The sheet paused the clip, so closing it plays it again. */
  pausedClip: boolean;
}

interface HelpSheetOptions {
  explain: LineHelp['explain'];
  /** The game as the last event left it, which says whether the clip plays. */
  gameRef: { readonly current: GameState };
  /** Sends commands to the player the way the game's own do. */
  run: (commands: readonly Command[]) => void;
}

/**
 * DJ Bop's explanation sheet of the game screen: which ask is open, how it opens, and how it closes.
 *
 * `open` is "Não entendi", a tapped word or "Não entendi a ordem": the explanation of `target` in the line it was asked
 * from. A clip that plays is paused while the sheet is open (ruling R70), with the music fading out first; one that is
 * already stopped (the game waiting for an answer, or the player's own pause) is left as it is.
 *
 * `close` is "Valeu" or Escape: the game area comes back and the focus returns to the button that opened the sheet,
 * which was handed over, since Safari gives a tapped button no focus. The clip plays again, the music fading back in,
 * only if the sheet paused it and the game has not begun to wait for an answer since (YouTube can report the pause
 * late, and a wait can start in between), nor ended: playing then would read to the game as the player skipping the
 * line.
 */
export function useHelpSheet({ explain, gameRef, run }: HelpSheetOptions) {
  const [ask, setAsk] = useState<HelpAsk | null>(null);

  function open(target: string, lineIndex: number, opener: HTMLElement) {
    const pausedClip = clipPlays(gameRef.current);
    if (pausedClip) run([{ type: 'pause', fade: true }]);
    setAsk({ target, load: () => explain(lineIndex, target), opener, pausedClip });
  }

  function close() {
    if (!ask) return;
    // The game area has to be on screen again before the focus can go back into it.
    flushSync(() => setAsk(null));
    if (ask.pausedClip && gameRef.current.phase === 'playing') run([{ type: 'play', fade: true }]);
    if (ask.opener.isConnected) ask.opener.focus();
  }

  return { ask, open, close };
}
