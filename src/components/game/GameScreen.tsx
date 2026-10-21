'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { DjBop, type DjBopExpression } from '@/components/brand/DjBop';
import { t } from '@/i18n/t';
import { getEntitlements } from '@/lib/entitlements';
import { gameReducer, initGame, summaryOf, type GameEvent, type GameState } from '@/lib/game/reducer';
import { playHit, playMiss } from '@/lib/game/sfx';
import { cleanTitle } from '@/lib/lyrics/cleanTitle';
import type { VideoRecord } from '@/lib/lyrics/resolveSong';
import type { PlayerAdapter } from '@/lib/player/adapter';
import { usePlayerTime } from '@/lib/player/usePlayerTime';
import { DEFAULT_SETTINGS, loadSettings, saveSettings, type Settings } from '@/lib/settings';
import type { AnswerRecord, Blank, Command, Difficulty, LyricLine, Mode, PlaySummary } from '@/lib/types';
import { EscolhaArea, escolhaOptions } from './EscolhaArea';
import { LyricPanel } from './LyricPanel';
import { SettingsSheet } from './SettingsSheet';
import { ToolsBar } from './ToolsBar';

/** How often the player's clock is read and handed to the game. */
const TICK_MS = 100;

/**
 * After the game seeks the clip, its clock is ignored for this long (ruling R44): the player can go on reporting
 * the old position for a moment, and a reading from before the seek would pause the line again.
 */
const SEEK_SETTLE_MS = 300;

/** How long DJ Bop keeps a reaction on his face. */
const REACTION_MS = 1000;

/** DJ Bop makes his combo face each time the combo reaches a multiple of this. */
const COMBO_CHEER = 5;

/** What the player can use in this phase, which is fixed when the app is built. */
const entitlements = getEntitlements(process.env.NEXT_PUBLIC_APP_PHASE);

export interface GameScreenProps {
  /** The player the song screen owns; the game drives it but never destroys it. */
  adapter: PlayerAdapter;
  mode: Mode;
  difficulty: Difficulty;
  /** The lines with the video's offset already applied. */
  lines: LyricLine[];
  blanks: Blank[];
  video: VideoRecord;
  /** How long the song screen took to get the song ready, for saving the play. */
  timeToReadyMs: number;
  /** Called once, when the clip has ended and every blank the game waited for has its answer. */
  onEnd: (summary: PlaySummary, records: AnswerRecord[]) => void;
  /** Where the header goes: above the player, which the song screen owns. Drawn in place when left out. */
  headerSlot?: HTMLElement | null;
}

/** The browser storage for the settings, or null when touching it throws (site data blocked: SecurityError). */
function settingsStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function waitingBlank(game: GameState): Blank | undefined {
  return game.blanks.find((blank) => blank.id === game.waitingBlankId);
}

/** The line on screen: the one the game waits on, otherwise the last one that has started (the first, before any). */
function currentLineIndex(game: GameState, timeMs: number): number {
  const waiting = waitingBlank(game);
  if (waiting) return waiting.lineIndex;
  return Math.max(0, game.lines.findLastIndex((line) => line.startMs <= timeMs));
}

/**
 * The blank to answer now: the one the game waits on, otherwise the first one of the line on screen that is not
 * right yet. When all of that line's blanks are right, its last one, so its answer stays on screen.
 */
function currentBlank(game: GameState, lineIndex: number): Blank | null {
  const waiting = waitingBlank(game);
  if (waiting) return waiting;
  const onLine = game.blanks.filter((blank) => blank.lineIndex === lineIndex);
  return onLine.find((blank) => game.status[blank.id] !== 'correct') ?? onLine.at(-1) ?? null;
}

/** There is no help sheet yet: "Traduzir verso", "Não entendi" and a tapped word open nothing for now. */
function noHelpYet() {}

const iconButton =
  'flex size-11 shrink-0 items-center justify-center rounded-button bg-card text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime';

/** A 20 px line icon in the color of the text around it. */
function LineIcon({ children }: { children: ReactNode }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

/**
 * The game: the header, the lyrics around the clip, the answer area of the mode, and the tools
 * (design/canvas/Escolha.dc.html in the Limão colors). The player sits above it, in the song screen.
 *
 * Every event goes through the game reducer, and the commands it gives go to the player at once. The player's clock
 * comes in as TICK every 100 ms (ignored for 300 ms after a seek) and its state as PLAYER_STATE.
 */
export function GameScreen({ adapter, mode, lines, blanks, video, onEnd, headerSlot }: GameScreenProps) {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [game, setGame] = useState(() =>
    initGame({ mode, lines, blanks, autoRepeat: DEFAULT_SETTINGS.autoRepeatOnMiss }),
  );
  // The game as the last event left it, ahead of React's render: each event must start from the one before it,
  // and its commands must run exactly once, even when React batches the renders.
  const gameRef = useRef(game);
  // The clock is ignored until this time (performance.now()), set by each seek.
  const ticksFromRef = useRef(0);
  const endReportedRef = useRef(false);
  const [slow, setSlow] = useState(false);
  const [dj, setDj] = useState<DjBopExpression>('idle');
  const djTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const gearRef = useRef<HTMLButtonElement>(null);

  const run = useCallback(
    (commands: readonly Command[]) => {
      for (const command of commands) {
        switch (command.type) {
          case 'pause':
            adapter.pause();
            break;
          case 'play':
            adapter.play();
            break;
          case 'seek':
            ticksFromRef.current = performance.now() + SEEK_SETTLE_MS;
            adapter.seekTo(command.ms);
            break;
          case 'rate':
            adapter.setRate(command.rate);
            break;
        }
      }
    },
    [adapter],
  );

  /** One event through the reducer, then its commands to the player. Gives back the new state. */
  const dispatch = useCallback(
    (event: GameEvent): GameState => {
      const next = gameReducer(gameRef.current, event);
      gameRef.current = next;
      setGame(next);
      run(next.commands);
      return next;
    },
    [run],
  );

  /**
   * New settings. Auto-repeat is part of the game state, set when the round starts; the reducer has no event to
   * change it, so it is switched here, the only change to the game made outside the reducer.
   */
  const applySettings = useCallback((next: Settings) => {
    setSettings(next);
    const updated: GameState = { ...gameRef.current, autoRepeat: next.autoRepeatOnMiss, commands: [] };
    gameRef.current = updated;
    setGame(updated);
  }, []);

  // The first render shows the defaults, which is what a server render would show; the saved settings come in
  // once the screen is on. That costs one more render, on purpose.
  useEffect(() => {
    const storage = settingsStorage();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the one-time, SSR-safe read of browser storage
    if (storage) applySettings(loadSettings(storage));
  }, [applySettings]);

  useEffect(() => adapter.onState((state) => dispatch({ type: 'PLAYER_STATE', state })), [adapter, dispatch]);

  // "Jogar" starts the round from the top of the clip.
  useEffect(() => {
    run([{ type: 'seek', ms: 0 }, { type: 'play' }]);
  }, [run]);

  // The clock goes to the game as TICK, except just after a seek, when it may still be the old position.
  const timeMs = usePlayerTime(adapter, TICK_MS);
  useEffect(() => {
    if (performance.now() < ticksFromRef.current) return;
    dispatch({ type: 'TICK', timeMs });
  }, [timeMs, dispatch]);

  // The song is over: its result goes to the song screen, once.
  useEffect(() => {
    if (game.phase !== 'ended' || endReportedRef.current) return;
    endReportedRef.current = true;
    onEnd(summaryOf(game), game.score.records);
  }, [game, onEnd]);

  useEffect(() => () => clearTimeout(djTimerRef.current), []);

  const lineIndex = currentLineIndex(game, timeMs);
  const blank = currentBlank(game, lineIndex);
  const solved = blank !== null && game.status[blank.id] === 'correct';
  const hinted = blank !== null && game.hinted[blank.id] === true;
  // Only for the blank in play, and once per blank: the first search for distractors is slow.
  const options = useMemo(
    () => (mode === 'escolha' && blank ? escolhaOptions(blank, lines[blank.lineIndex], video.youtubeId) : null),
    [mode, blank, lines, video.youtubeId],
  );

  function showReaction(expression: DjBopExpression) {
    setDj(expression);
    clearTimeout(djTimerRef.current);
    djTimerRef.current = setTimeout(() => setDj('idle'), REACTION_MS);
  }

  function answer(answered: Blank, correct: boolean) {
    const before = gameRef.current;
    const next = dispatch({ type: 'ANSWER', blankId: answered.id, correct, atMs: adapter.getCurrentTimeMs() });
    // The game took no answer: the blank was already right, or the song is over.
    if (next.score.records.length === before.score.records.length) return;

    const { combo } = next.score;
    // sfx never looks at the setting, so the switch is checked here.
    if (settings.sounds) {
      if (correct) playHit(combo);
      else playMiss();
    }
    const comboReached = combo > before.score.combo && combo % COMBO_CHEER === 0;
    showReaction(!correct ? 'errou' : comboReached ? 'combo' : 'acertou');
  }

  function hint() {
    if (blank && !solved) dispatch({ type: 'HINT', blankId: blank.id });
  }

  function toggleSlow() {
    dispatch({ type: 'SET_RATE', rate: slow ? 1 : 0.75 });
    setSlow(!slow);
  }

  function changeSettings(next: Settings) {
    applySettings(next);
    const storage = settingsStorage();
    if (storage) saveSettings(storage, next);
  }

  function closeSettings() {
    setSettingsOpen(false);
    gearRef.current?.focus();
  }

  const { artist, track } = cleanTitle(video.title, video.channel);
  const durationMs = adapter.getDurationMs();
  const progress = durationMs > 0 ? Math.min(100, (timeMs / durationMs) * 100) : 0;

  const header = (
    <header className="flex items-center gap-2.5 px-4 pt-4">
      <Link href="/" aria-label={t('jogar.back')} className={iconButton}>
        <LineIcon>
          <path d="M15 18l-6-6 6-6" />
        </LineIcon>
      </Link>
      <div className="flex min-w-0 flex-1 flex-col">
        <p className="truncate text-body font-bold">{t('jogo.song', { musica: track, artista: artist })}</p>
        <p className="truncate text-label text-muted">{t('jogo.mode', { modo: t(`modo.${mode}`) })}</p>
      </div>
      <p className="shrink-0 rounded-full bg-lime px-3 py-1.5 text-body font-bold text-bg">
        <span className="sr-only">{t('jogo.comboLabel')} </span>
        {t('jogo.combo', { n: game.score.combo })}
      </p>
      <DjBop expression={dj} size={36} />
      <button
        ref={gearRef}
        type="button"
        aria-label={t('jogo.settings')}
        onClick={() => setSettingsOpen(true)}
        className={iconButton}
      >
        {/* Two sliders, for the sheet of switches it opens. */}
        <LineIcon>
          <path d="M20 7h-9M14 17H5" />
          <circle cx="17" cy="17" r="3" />
          <circle cx="7" cy="7" r="3" />
        </LineIcon>
      </button>
    </header>
  );

  return (
    <>
      {headerSlot ? createPortal(header, headerSlot) : header}
      <section className="flex flex-1 flex-col gap-4">
        <div aria-hidden="true" className="h-1 overflow-hidden rounded-full bg-elevated">
          <div className="h-full bg-lime" style={{ width: `${progress}%` }} />
        </div>
        {/* Under the player, never over it. It stands in for the game area, which is only hidden, so the answers
            already picked are still there when the sheet closes. */}
        {settingsOpen && <SettingsSheet settings={settings} onChange={changeSettings} onClose={closeSettings} />}
        <div hidden={settingsOpen} className="contents">
          <LyricPanel
            lines={lines}
            current={lineIndex}
            blanks={game.blanks}
            status={game.status}
            showTranslation={settings.alwaysShowTranslation}
            onTranslate={noHelpYet}
            onExplain={noHelpYet}
          />
          {blank && options && (
            <EscolhaArea
              key={blank.id}
              blank={blank}
              options={options}
              hinted={hinted}
              solved={solved}
              onAnswer={(correct) => answer(blank, correct)}
            />
          )}
          <ToolsBar
            slow={slow}
            onSlow={toggleSlow}
            onRepeat={() => dispatch({ type: 'REPEAT_LINE' })}
            onHint={hint}
            hintPerk={entitlements.hint}
            hintDisabled={!blank || solved || hinted}
          />
        </div>
      </section>
    </>
  );
}
