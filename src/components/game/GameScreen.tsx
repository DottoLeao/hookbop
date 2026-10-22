'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal, flushSync } from 'react-dom';
import { DjBop, type DjBopExpression } from '@/components/brand/DjBop';
import { t } from '@/i18n/t';
import { getEntitlements } from '@/lib/entitlements';
import { tokenize } from '@/lib/game/blanks';
import { awaitsAnswer, gameReducer, initGame, summaryOf, type GameEvent, type GameState } from '@/lib/game/reducer';
import { playHit, playMiss } from '@/lib/game/sfx';
import { helpErrorCopy } from '@/lib/help/helpError';
import { postHelp, useLineHelp, type HelpRequester } from '@/lib/help/useLineHelp';
import { cleanTitle } from '@/lib/lyrics/cleanTitle';
import type { VideoRecord } from '@/lib/lyrics/resolveSong';
import { lastStartedLineIndex } from '@/lib/lyrics/startedLine';
import type { PlayerAdapter } from '@/lib/player/adapter';
import { usePlayerTime } from '@/lib/player/usePlayerTime';
import { DEFAULT_SETTINGS, loadSettings, saveSettings, type Settings } from '@/lib/settings';
import type { AnswerRecord, Blank, Command, Difficulty, LyricLine, Mode, PlaySummary } from '@/lib/types';
import { EscolhaArea, escolhaOptions } from './EscolhaArea';
import { HelpSheet } from './HelpSheet';
import { KaraokeView } from './KaraokeView';
import { LazyDigitacaoArea, preloadDigitacaoArea } from './LazyDigitacaoArea';
import { LyricPanel, type TranslationView } from './LyricPanel';
import { MontarArea } from './MontarArea';
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
  /** How an ask for AI help reaches the server. `postHelp` (`POST /api/help`) when left out; tests pass a fake. */
  requestHelp?: HelpRequester;
}

/** "Não entendi" (or a tapped word) while its sheet is open. */
interface HelpAsk {
  target: string;
  /** Asks for the explanation; made once per ask, so the sheet does not ask again on every render. */
  load: () => Promise<string>;
  /** What had the focus when the sheet opened, which gets it back on "Valeu". */
  opener: HTMLElement | null;
  /** The sheet paused the clip, so "Valeu" plays it again. */
  pausedClip: boolean;
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

/**
 * The line on screen: the one the game waits on, otherwise the last one that has started by the game's clock (the
 * first, before any). That clock moves only with the TICKs the game took, so a stale reading of the player right
 * after a seek never shows on screen.
 */
function currentLineIndex(game: GameState): number {
  const waiting = waitingBlank(game);
  if (waiting) return waiting.lineIndex;
  return Math.max(0, lastStartedLineIndex(game.lines, game.lastTickMs));
}

/**
 * The blank to answer now, which both the answer area and the "sua vez" slot of the lyrics show: the one the game
 * waits on, otherwise the first one of the line on screen that awaits an answer as the reducer sees it (a miss with
 * auto-repeat off does not). When none does, the line's last blank, so the last answer stays on screen.
 */
function currentBlank(game: GameState, lineIndex: number): Blank | null {
  const waiting = waitingBlank(game);
  if (waiting) return waiting;
  const onLine = game.blanks.filter((blank) => blank.lineIndex === lineIndex);
  return onLine.find((blank) => awaitsAnswer(game, blank)) ?? onLine.at(-1) ?? null;
}

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
 *
 * Karaokê has no blanks and no points: the scrolling lyrics of `KaraokeView` take the place of the lyric panel and the
 * answer area, "Livre" the place of the combo, and the translation switch the place of "Dica". It follows the game's
 * clock like the other modes, and plays through to the end report.
 *
 * The AI help (`useLineHelp`) runs only when the player asks: "Não entendi", a tapped word and "Não entendi a ordem"
 * open DJ Bop's explanation in place of the game area, and "Traduzir verso" puts the translation under the line. With
 * "Mostrar tradução sempre" on, the line in play is also translated as it comes into play, and Karaokê translates the
 * current and next lines. Answers are never checked with it.
 */
export function GameScreen({
  adapter,
  mode,
  lines,
  blanks,
  video,
  onEnd,
  headerSlot,
  requestHelp = postHelp,
}: GameScreenProps) {
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
  // The letters fixed in each blank the typing mode took with a slip ("gte" for "get"), by blank id. The lyrics and
  // the typing area mark them.
  const [corrected, setCorrected] = useState<Record<string, number[]>>({});
  const [settingsOpen, setSettingsOpen] = useState(false);
  // Karaokê only. Shown at the start of every round, and not a setting: it is not saved.
  const [showTranslations, setShowTranslations] = useState(true);
  const gearRef = useRef<HTMLButtonElement>(null);
  const lineHelp = useLineHelp({ youtubeId: video.youtubeId, lyricsRef: video.lyricsRef, lines, request: requestHelp });
  const [helpAsk, setHelpAsk] = useState<HelpAsk | null>(null);
  // The translations of the lyric panel, by line index. A line the player asked for keeps its translation on screen.
  const [translations, setTranslations] = useState<Record<number, TranslationView>>({});
  // The lines "Mostrar tradução sempre" asked for by itself, each once in the round.
  const autoTranslated = useRef(new Set<number>());

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

  // A typing round starts getting the typing area's code as soon as the screen is up, so it is there by the first blank.
  useEffect(() => {
    if (mode === 'digitacao') preloadDigitacaoArea();
  }, [mode]);

  useEffect(() => adapter.onState((state) => dispatch({ type: 'PLAYER_STATE', state })), [adapter, dispatch]);

  // "Jogar" starts the round from the top of the clip.
  useEffect(() => {
    run([{ type: 'seek', ms: 0 }, { type: 'play' }]);
  }, [run]);

  // The player's raw clock goes to the game as TICK, except just after a seek, when it may still be the old
  // position. Nothing on screen reads it directly: the screen follows the game's clock (`lastTickMs`).
  const readingMs = usePlayerTime(adapter, TICK_MS);
  useEffect(() => {
    if (performance.now() < ticksFromRef.current) return;
    dispatch({ type: 'TICK', timeMs: readingMs });
  }, [readingMs, dispatch]);

  // The song is over: its result goes to the song screen, once.
  useEffect(() => {
    if (game.phase !== 'ended' || endReportedRef.current) return;
    endReportedRef.current = true;
    onEnd(summaryOf(game), game.score.records);
  }, [game, onEnd]);

  useEffect(() => () => clearTimeout(djTimerRef.current), []);

  const karaoke = mode === 'karaoke';
  const lineIndex = currentLineIndex(game);
  const blank = currentBlank(game, lineIndex);
  const solved = blank !== null && game.status[blank.id] === 'correct';
  const hinted = blank !== null && game.hinted[blank.id] === true;
  // Only for the blank in play, and once per blank: the first search for distractors is slow.
  const options = useMemo(
    () => (mode === 'escolha' && blank ? escolhaOptions(blank, lines[blank.lineIndex], video.youtubeId) : null),
    [mode, blank, lines, video.youtubeId],
  );

  // The words of the line in play, for Monte o verso only.
  const montarTokens = useMemo(
    () => (mode === 'montar' && blank ? tokenize(lines[blank.lineIndex].text) : null),
    [mode, blank, lines],
  );

  // "Mostrar tradução sempre": the line in play is translated as it comes into play, once in the round. The player
  // opted in to that. A translation that cannot be had shows nothing here, and "Traduzir verso" stays to ask for it.
  useEffect(() => {
    if (karaoke || !settings.alwaysShowTranslation || autoTranslated.current.has(lineIndex)) return;
    autoTranslated.current.add(lineIndex);
    lineHelp.translate(lineIndex).then(
      (text) => setTranslations((known) => ({ ...known, [lineIndex]: { status: 'done', text } })),
      () => {},
    );
  }, [karaoke, settings.alwaysShowTranslation, lineIndex, lineHelp]);

  /**
   * "Traduzir verso": the translation goes under the line, whatever "Mostrar tradução sempre" says (ruling R64), with
   * "Traduzindo..." until it comes, and DJ Bop's calm line if it cannot be had. A hidden Monte o verso line can be
   * translated too: a translation scores nothing (ruling R60).
   */
  function translateLine(index: number) {
    const unlessDone = (view: TranslationView) => (known: Record<number, TranslationView>) =>
      known[index]?.status === 'done' ? known : { ...known, [index]: view };
    setTranslations(unlessDone({ status: 'loading' }));
    lineHelp.translate(index).then(
      (text) => setTranslations((known) => ({ ...known, [index]: { status: 'done', text } })),
      (error: unknown) => setTranslations(unlessDone({ status: 'error', message: t(helpErrorCopy(error).message) })),
    );
  }

  /**
   * "Não entendi", a tapped word or "Não entendi a ordem": DJ Bop's explanation of `target` in the line it was asked
   * from, in place of the game area. A clip that plays is paused while the sheet is open (ruling R70), through the same
   * commands as the game's own pauses. One that is already stopped (the game waiting for an answer, or the player's own
   * pause) is left as it is.
   */
  function openHelp(target: string, index: number) {
    const { phase, playerState } = gameRef.current;
    const pausedClip = phase === 'playing' && (playerState === 'playing' || playerState === 'buffering');
    if (pausedClip) run([{ type: 'pause' }]);
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setHelpAsk({ target, load: () => lineHelp.explain(index, target), opener, pausedClip });
  }

  /**
   * "Valeu": the game area comes back and the focus returns to what opened the sheet. The clip plays again only if the
   * sheet paused it and the game has not begun to wait for an answer since (YouTube can report the pause late, and a
   * wait can start in between): playing then would read to the game as the player skipping the line.
   */
  function closeHelp() {
    const ask = helpAsk;
    if (!ask) return;
    // The game area has to be on screen again before the focus can go back into it.
    flushSync(() => setHelpAsk(null));
    if (ask.pausedClip && gameRef.current.phase === 'playing') run([{ type: 'play' }]);
    if (ask.opener?.isConnected) ask.opener.focus();
  }

  function showReaction(expression: DjBopExpression) {
    setDj(expression);
    clearTimeout(djTimerRef.current);
    djTimerRef.current = setTimeout(() => setDj('idle'), REACTION_MS);
  }

  /**
   * An event that can settle a blank goes through the game, and when the game took an answer (a record was added),
   * the sound and DJ Bop react to it. When it took none, nothing does: the blank was already right, the song is over,
   * or (Monte o verso) the tile only joined the row in the middle of the line.
   */
  function dispatchAnswer(event: GameEvent, correctedIndices: number[] = []) {
    const before = gameRef.current;
    const next = dispatch(event);
    const record = next.score.records.at(-1);
    if (!record || next.score.records.length === before.score.records.length) return;
    const { blankId, correct } = record;
    if (correct && correctedIndices.length > 0) {
      setCorrected((marks) => ({ ...marks, [blankId]: correctedIndices }));
    }

    const { combo } = next.score;
    // sfx never looks at the setting, so the switch is checked here.
    if (settings.sounds) {
      if (correct) playHit(combo);
      else playMiss();
    }
    const comboReached = combo > before.score.combo && combo % COMBO_CHEER === 0;
    showReaction(!correct ? 'errou' : comboReached ? 'combo' : 'acertou');
  }

  /** Escolha and Digitação: the area says whether the answer is right. */
  function answer(answered: Blank, correct: boolean, correctedIndices: number[] = []) {
    const atMs = adapter.getCurrentTimeMs();
    dispatchAnswer({ type: 'ANSWER', blankId: answered.id, correct, atMs }, correctedIndices);
  }

  /** Monte o verso: the game decides whether the tile is the next word, and answers the line when the row is full. */
  function placeTile(placing: Blank, word: string) {
    dispatchAnswer({ type: 'TILE', blankId: placing.id, word, atMs: adapter.getCurrentTimeMs() });
  }

  // In Monte o verso the hint places the next word, which can finish the line: that is an answer like any other.
  function hint() {
    if (blank && !solved) dispatchAnswer({ type: 'HINT', blankId: blank.id });
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
  const progress = durationMs > 0 ? Math.min(100, (game.lastTickMs / durationMs) * 100) : 0;

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
      {karaoke ? (
        // Karaokê has no blanks and gives no points, so there is no combo to show.
        <p className="shrink-0 rounded-full border-[1.5px] border-border px-3 py-1.5 text-body font-bold">
          {t('jogo.free')}
        </p>
      ) : (
        <p className="shrink-0 rounded-full bg-lime px-3 py-1.5 text-body font-bold text-bg">
          <span className="sr-only">{t('jogo.comboLabel')} </span>
          {t('jogo.combo', { n: game.score.combo })}
        </p>
      )}
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
          <div data-testid="progress" className="h-full bg-lime" style={{ width: `${progress}%` }} />
        </div>
        {/* Under the player, never over it. It stands in for the game area, which is only hidden, so the answers
            already picked are still there when the sheet closes. */}
        {settingsOpen && <SettingsSheet settings={settings} onChange={changeSettings} onClose={closeSettings} />}
        {/* DJ Bop's explanation stands in for the game area the same way. */}
        {helpAsk && !settingsOpen && <HelpSheet target={helpAsk.target} load={helpAsk.load} onClose={closeHelp} />}
        <div hidden={settingsOpen || helpAsk !== null} className="contents">
          {karaoke ? (
            <KaraokeView
              lines={lines}
              timeMs={game.lastTickMs}
              fetchTranslation={lineHelp.translate}
              onExplain={openHelp}
              showTranslations={showTranslations}
              visible={!settingsOpen && helpAsk === null}
            />
          ) : (
            <LyricPanel
              lines={lines}
              current={lineIndex}
              blanks={game.blanks}
              status={game.status}
              inPlayId={blank?.id}
              corrected={corrected}
              translation={translations[lineIndex]}
              onTranslate={translateLine}
              onExplain={openHelp}
            />
          )}
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
          {blank && mode === 'digitacao' && (
            <LazyDigitacaoArea
              blank={blank}
              hinted={hinted}
              solved={solved}
              corrected={corrected[blank.id]}
              onAnswer={(correct, correctedIndices) => answer(blank, correct, correctedIndices)}
            />
          )}
          {blank && montarTokens && (
            <MontarArea
              key={blank.id}
              blank={blank}
              tokens={montarTokens}
              placed={game.tilesPlaced[blank.id] ?? []}
              youtubeId={video.youtubeId}
              solved={solved}
              answered={solved || game.status[blank.id] === 'wrong'}
              onTile={(word) => placeTile(blank, word)}
              onExplain={openHelp}
            />
          )}
          <ToolsBar
            slow={slow}
            onSlow={toggleSlow}
            onRepeat={() => dispatch({ type: 'REPEAT_LINE' })}
            {...(karaoke
              ? {
                  // No blanks, so no hint: its place is the switch for the translations.
                  action: {
                    label: t(showTranslations ? 'karaoke.hideTranslation' : 'karaoke.showTranslation'),
                    onClick: () => setShowTranslations((shown) => !shown),
                  },
                }
              : { onHint: hint, hintPerk: entitlements.hint, hintDisabled: !blank || solved || hinted })}
          />
        </div>
      </section>
    </>
  );
}
