'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal, flushSync } from 'react-dom';
import { DjBop, type DjBopExpression } from '@/components/brand/DjBop';
import { t } from '@/i18n/t';
import { tokenize } from '@/lib/game/blanks';
import { awaitsAnswer, gameReducer, summaryOf, type GameEvent, type GameState } from '@/lib/game/reducer';
import type { ProgressStorage, SavedProgress } from '@/lib/game/savedProgress';
import { playHit, playMiss } from '@/lib/game/sfx';
import { FADE_IN_MS, FADE_OUT_MS } from '@/lib/game/timing';
import type { SongTranslation } from '@/lib/help/songTranslation';
import { postHelp, useLineHelp, type HelpRequester } from '@/lib/help/useLineHelp';
import { cleanTitle } from '@/lib/lyrics/cleanTitle';
import type { VideoRecord } from '@/lib/lyrics/resolveSong';
import { lastStartedLineIndex } from '@/lib/lyrics/startedLine';
// Named apart: this screen has a `track` of its own, the name of the song (`cleanTitle`).
import { track as trackEvent } from '@/lib/metrics/track';
import type { PlayerAdapter } from '@/lib/player/adapter';
import { createFader, supportsVolume } from '@/lib/player/fade';
import { usePlayerTime } from '@/lib/player/usePlayerTime';
import { DEFAULT_SETTINGS, loadSettings, saveSettings, type Settings } from '@/lib/settings';
import type { AnswerRecord, Blank, Command, Difficulty, LyricLine, Mode, PlaySummary } from '@/lib/types';
import { EscolhaArea, escolhaOptions } from './EscolhaArea';
import { HelpSheet } from './HelpSheet';
import { KaraokeView } from './KaraokeView';
import { LazyDigitacaoArea, preloadDigitacaoArea } from './LazyDigitacaoArea';
import { LyricPanel } from './LyricPanel';
import { MontarArea } from './MontarArea';
import { SettingsSheet } from './SettingsSheet';
import { focusRing } from './styles';
import { ToolsBar } from './ToolsBar';
import { useAwayAndBack } from './useAwayAndBack';
import { useGameAbandoned } from './useGameAbandoned';
import { useHelpSheet } from './useHelpSheet';
import { useLineTranslation } from './useLineTranslation';
import { startingGame, useSavedProgress } from './useSavedProgress';

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
  /**
   * The translation of the whole song, which the song screen asked for as soon as the lyrics were known. Without it,
   * each line shown is asked for alone (`requestHelp`).
   */
  songTranslation?: SongTranslation | null;
  /**
   * The game saved on the device for this song, to go on from. It is used only if it has this game's blanks; otherwise
   * the game starts from zero and the saved one is dropped (ruling S22).
   */
  resume?: SavedProgress;
  /** Where the game in progress is kept: `window.localStorage` in the app. Nothing is kept or dropped when left out. */
  progressStorage?: ProgressStorage | null;
  /** The time of day in ms since 1970, which dates the saved game. `Date.now` when left out. */
  wallClock?: () => number;
}

const defaultWallClock = () => Date.now();


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

/** "Continuar" after the page was away (spec §6): big and lime, the first thing in the game area, under the player. */
const continueAfterAwayLook = `flex min-h-12 w-full items-center justify-center rounded-button bg-lime px-4 text-button font-bold text-bg ${focusRing}`;

/** The first control of each answer area: the typing field, Escolha's first option, Monte o verso's first free tile. */
const ANSWER_START = [
  'input',
  `[role="group"][aria-label="${t('escolha.question')}"] button`,
  `[role="group"][aria-label="${t('montar.question')}"] button:not([aria-disabled="true"])`,
].join(', ');

/**
 * The game: the header, the lyrics around the clip, the answer area of the mode, and the tools
 * (design/canvas/Escolha.dc.html in the Limão colors). The player sits above it, in the song screen.
 *
 * Every event goes through the game reducer, and the commands it gives go to the player at once. The player's clock
 * comes in as TICK every 100 ms (ignored for 300 ms after a seek) and its state as PLAYER_STATE.
 *
 * Karaokê has no blanks and no points: the scrolling lyrics of `KaraokeView` take the place of the lyric panel and the
 * answer area, "Livre" the place of the combo, and the translation switch a third tool beside 0.75x and "Repetir verso".
 * It follows the game's clock like the other modes, and plays through to the end report.
 *
 * The translations come from the translation of the whole song (`songTranslation`), fetched by the song screen as
 * soon as the lyrics were known; a line it did not give is asked for alone. In the modes with blanks, "Tradução" is the
 * third tool, a switch: on, the line in play shows its translation under it, line by line as the song plays, and the
 * music goes on. It is "Mostrar tradução sempre", the same setting, so it stays as it was left for the next songs. A
 * line shows no translation while any blank of it still awaits an answer (the retry after a miss included, while
 * "Repetir sozinho depois de errar" is on), since it would give the meaning of the word away. Karaokê shows the translations of the current and next lines, from the same
 * translation of the song, with its own switch.
 *
 * DJ Bop's explanation (`useLineHelp`) runs only when the player asks: "Não entendi", a tapped word and "Não entendi a
 * ordem" open it in place of the game area. Answers are never checked with any of the AI help.
 *
 * The music never stops short. A wait and DJ Bop's sheet fade it out for `FADE_OUT_MS` and then pause the clip; it
 * plays again with its volume rising over `FADE_IN_MS`. Where the device ignores the volume (an iPhone) the fade is only
 * the wait. Leaving the app is the one pause with no fade. A translation never pauses anything.
 *
 * Coming back to the app (spec §6), the lyrics go to where the clip is, the music never comes back by itself, and a big
 * "Continuar" in the game area brings it back with its volume rising (see `useAwayAndBack`).
 *
 * The game in progress is kept on the device (`progressStorage`, see `useSavedProgress`) after each answer and tile,
 * every 5 s, as the app goes away and as the screen does, and forgotten when the song ends. Given a saved game
 * (`resume`) that is this game's, it goes on from there, the clip starting again at the line it was in.
 *
 * The owner's panel hears (`track`) of each ask for help (`help_explain`, and `help_translate` when the translation
 * switch is turned on, with the line in play: not when it is turned off, nor for the lines it then shows), of "Continuar"
 * after coming back (`continue_after_leave`), and of a game left without finishing (`game_abandoned`, see
 * `useGameAbandoned`).
 */
export function GameScreen({
  adapter,
  mode,
  difficulty,
  lines,
  blanks,
  video,
  onEnd,
  headerSlot,
  requestHelp = postHelp,
  songTranslation,
  resume,
  progressStorage,
  wallClock = defaultWallClock,
}: GameScreenProps) {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [start] = useState(() => startingGame({ mode, lines, blanks }, resume));
  const [game, setGame] = useState(start.game);
  // The game as the last event left it, ahead of React's render: each event must start from the one before it,
  // and its commands must run exactly once, even when React batches the renders.
  const gameRef = useRef(game);
  // The clock is ignored until this time (performance.now()), set by each seek, and the position that seek asked for.
  const ticksFromRef = useRef(0);
  const seekTargetRef = useRef(0);
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
  // The time away from the app (`useAwayAndBack`) ends with the first play the game sends. That hook needs `dispatch`,
  // so it comes further down, and `send` reaches its `end` through this.
  const endAwayRef = useRef<() => void>(() => {});
  // The game area, and "Repetir verso" in it: where the focus goes after "Continuar".
  const areaRef = useRef<HTMLDivElement>(null);
  const repeatRef = useRef<HTMLButtonElement>(null);
  const lineHelp = useLineHelp({ youtubeId: video.youtubeId, lyricsRef: video.lyricsRef, lines, request: requestHelp });

  // One fader for the player's volume. When the screen goes away a fade still running must not pause what comes next,
  // and the music must not be left down for the next round (or the calibration), so the volume goes straight back.
  const fader = useMemo(() => createFader(adapter, { volume: supportsVolume(navigator) }), [adapter]);
  useEffect(() => () => fader.restore(), [fader]);

  const run = useCallback(
    (commands: readonly Command[]) => {
      for (const command of commands) {
        switch (command.type) {
          case 'pause':
            if (command.fade) {
              fader.fadeOut(FADE_OUT_MS, () => adapter.pause());
            } else {
              // Leaving the app, or a clip that started while away: it stops at once, a fade in progress does not go
              // on, and the music stays silent until the game lets it go, so a play the phone starts is not heard.
              adapter.pause();
              fader.silence();
            }
            break;
          case 'play':
            if (command.fade) {
              // A fade-out that has not ended has not paused the clip yet: it still plays, and only its volume rises.
              // Unless the player stopped it meanwhile, with its own pause button: then it has to be played.
              const fadingOut = fader.fading() === 'out';
              if (fadingOut) fader.cancel();
              const state = adapter.getPlayerState();
              if (!fadingOut || (state !== 'playing' && state !== 'buffering')) adapter.play();
              fader.fadeIn(FADE_IN_MS);
            } else {
              adapter.play();
            }
            break;
          case 'seek':
            ticksFromRef.current = performance.now() + SEEK_SETTLE_MS;
            seekTargetRef.current = command.ms;
            adapter.seekTo(command.ms);
            break;
          case 'rate':
            adapter.setRate(command.rate);
            break;
        }
      }
    },
    [adapter, fader],
  );

  /**
   * `run`, for what can let the music go: a play with a fade ends the time away from the app, whoever asked for it (an
   * answer, "Repetir verso", the player's own play during a wait, DJ Bop's sheet closing, "Continuar" itself), before
   * the play goes out, so the play it is about to report is not taken for the phone's.
   */
  const send = useCallback(
    (commands: readonly Command[]) => {
      if (commands.some((command) => command.type === 'play' && command.fade)) endAwayRef.current();
      run(commands);
    },
    [run],
  );

  /** One event through the reducer, then its commands to the player. Gives back the new state. */
  const dispatch = useCallback(
    (event: GameEvent): GameState => {
      const next = gameReducer(gameRef.current, event);
      gameRef.current = next;
      setGame(next);
      send(next.commands);
      return next;
    },
    [send],
  );

  /** After "Continuar": the answer due during a wait, otherwise "Repetir verso". */
  const nextFocus = useCallback((): HTMLElement | null => {
    if (gameRef.current.phase !== 'waiting') return repeatRef.current;
    return areaRef.current?.querySelector<HTMLElement>(ANSWER_START) ?? repeatRef.current;
  }, []);

  // The game in progress is kept on the device (see `useSavedProgress`): here after every answer and tile; the hook
  // saves it every 5 s, as the app goes away and as the screen does, and forgets it when the song ends.
  const persist = useSavedProgress({
    gameRef,
    storage: progressStorage,
    youtubeId: video.youtubeId,
    difficulty,
    wallClock,
    resume,
    resumed: start.resumeAtMs !== null,
    ended: game.phase === 'ended',
  });

  /**
   * Where the clip is, as far as the game knows. For a moment after a seek the player can go on reporting the position
   * it had (ruling R44), so then it is the seek's target, which is where the clip is about to be.
   */
  const clipPositionMs = useCallback(
    () => (performance.now() < ticksFromRef.current ? seekTargetRef.current : adapter.getCurrentTimeMs()),
    [adapter],
  );

  // Leaving the app and coming back (spec §6, ruling R84): the clip never plays in the background nor comes back by
  // itself, and "Continuar" brings the music back.
  const away = useAwayAndBack({
    adapter,
    gameRef,
    run,
    send,
    dispatch,
    nextFocus,
    clipPositionMs,
    onContinue: () => trackEvent('continue_after_leave', { youtubeId: video.youtubeId, mode }),
  });
  const { backFromAway, continueRef, isAway, stopsPhonePlay, focusContinue, continueAfterAway } = away;
  useEffect(() => {
    endAwayRef.current = away.end;
  }, [away.end]);

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

  useEffect(
    () =>
      adapter.onState((state) => {
        if (stopsPhonePlay(state)) return;
        const wasStopped = !gameRef.current.clipRunning;
        dispatch({ type: 'PLAYER_STATE', state });
        // The player's own play, outside a wait (a wait lets the music go by its own command), finds the volume where
        // a pause of the game's own left it. A fade of the game's own that is already on its way up needs nothing more.
        if (state === 'playing' && wasStopped && gameRef.current.phase === 'playing' && fader.fading() === null) {
          fader.fadeIn(FADE_IN_MS);
        }
      }),
    [adapter, dispatch, fader, stopsPhonePlay],
  );

  // "Jogar" starts the round from the top of the clip. A player an earlier round left with the volume down (the song
  // ended inside the fade of its last wait) must not start muted, so the volume comes up if it needs to: at full
  // volume that sends nothing to the player.
  // "Continuar de onde parou" starts it instead from the line the saved game was in, the seek going through `run` like
  // any other (so the clock right after it is ignored, ruling R44), and the music playing with its volume rising
  // (ruling S21). It never does both. It happens once, when the screen comes up, whatever the callbacks do after that.
  const openedRef = useRef(false);
  useEffect(() => {
    if (openedRef.current) return;
    openedRef.current = true;
    if (start.resumeAtMs !== null) {
      run([{ type: 'seek', ms: start.resumeAtMs }, { type: 'play', fade: true }]);
      return;
    }
    run([{ type: 'seek', ms: 0 }, { type: 'play' }]);
    fader.fadeIn(FADE_IN_MS);
  }, [run, fader, start]);

  // The player's raw clock goes to the game as TICK, except just after a seek, when it may still be the old
  // position, and while away from the app, when it only realigns the lyrics (see `useAwayAndBack`). Nothing on screen
  // reads it directly: the screen follows the game's clock (`lastTickMs`).
  const readingMs = usePlayerTime(adapter, TICK_MS);
  useEffect(() => {
    if (performance.now() < ticksFromRef.current) return;
    dispatch(isAway() ? { type: 'RESYNC', timeMs: readingMs } : { type: 'TICK', timeMs: readingMs });
  }, [readingMs, dispatch, isAway]);

  // The song is over: its result goes to the song screen, once.
  useEffect(() => {
    if (game.phase !== 'ended' || endReportedRef.current) return;
    endReportedRef.current = true;
    onEnd(summaryOf(game), game.score.records);
  }, [game, onEnd]);

  useEffect(() => () => clearTimeout(djTimerRef.current), []);

  // Leaving the game before the song is over is told to the owner's panel; a game that reported its end is not that.
  useGameAbandoned({ youtubeId: video.youtubeId, mode, finished: () => endReportedRef.current });

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

  // DJ Bop's explanation, in place of the game area.
  const help = useHelpSheet({ explain: lineHelp.explain, gameRef, run: send });
  /** "Não entendi", a tapped word or "Não entendi a ordem": the explanation opens, and the panel hears that it was asked for. */
  const explain = (target: string, lineIndex: number, opener: HTMLElement) => {
    trackEvent('help_explain', { youtubeId: video.youtubeId, mode, props: { lineIndex } });
    help.open(target, lineIndex, opener);
  };

  // The translation under the line in play, while the switch is on. A line shows none while any blank of it still
  // awaits an answer (`awaitsAnswer`: pending, skipped, or missed with "Repetir sozinho depois de errar" on, which is
  // the retry): the translation would give the meaning of the word away while it can still be answered.
  const lineAnswered = !game.blanks.some((one) => one.lineIndex === lineIndex && awaitsAnswer(game, one));
  const translation = useLineTranslation({
    song: songTranslation,
    translate: lineHelp.translate,
    lineIndex,
    shown: !karaoke && settings.alwaysShowTranslation && lineAnswered,
  });

  // Karaokê's translations, from the same translation of the song; a line it did not give is asked for alone.
  const { translate: translateLine } = lineHelp;
  const karaokeTranslation = useCallback(
    async (index: number) => (await songTranslation?.line(index)) ?? translateLine(index),
    [songTranslation, translateLine],
  );

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
    // Whatever the event was, an answer or a tile in the row, the game is kept as it is now: a tile placed and then the
    // back link must not come back with the row empty.
    persist();
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

  function toggleSlow() {
    dispatch({ type: 'SET_RATE', rate: slow ? 1 : 0.75 });
    setSlow(!slow);
  }

  function changeSettings(next: Settings) {
    applySettings(next);
    const storage = settingsStorage();
    if (storage) saveSettings(storage, next);
  }

  /**
   * "Tradução": the switch is "Mostrar tradução sempre", so turning it on or off is kept for the next songs too. It
   * shows or hides the translation at once and never touches the music. Turning it on tells the owner's panel, with
   * the line in play; turning it off does not.
   */
  function toggleTranslation() {
    const on = !settings.alwaysShowTranslation;
    changeSettings({ ...settings, alwaysShowTranslation: on });
    if (on) trackEvent('help_translate', { youtubeId: video.youtubeId, mode, props: { lineIndex } });
  }

  /** The focus goes back to the gear, or to "Continuar" when the music still waits for it under the sheet. */
  function closeSettings() {
    // The game area has to be on screen again before the focus can go into it.
    flushSync(() => setSettingsOpen(false));
    if (!focusContinue()) gearRef.current?.focus();
  }

  /** DJ Bop's sheet closes as it does, and "Continuar" takes the focus when the music still waits for it. */
  function closeHelp() {
    help.close();
    focusContinue();
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
        {help.ask && !settingsOpen && <HelpSheet target={help.ask.target} load={help.ask.load} onClose={closeHelp} />}
        <div ref={areaRef} hidden={settingsOpen || help.ask !== null} className="contents">
          {backFromAway && (
            <button ref={continueRef} type="button" onClick={continueAfterAway} className={continueAfterAwayLook}>
              {t('jogo.continue')}
            </button>
          )}
          {karaoke ? (
            <KaraokeView
              lines={lines}
              timeMs={game.lastTickMs}
              fetchTranslation={karaokeTranslation}
              onExplain={explain}
              showTranslations={showTranslations}
              visible={!settingsOpen && help.ask === null}
            />
          ) : (
            <LyricPanel
              lines={lines}
              current={lineIndex}
              blanks={game.blanks}
              status={game.status}
              inPlayId={blank?.id}
              corrected={corrected}
              translation={translation}
              onExplain={explain}
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
              onExplain={explain}
            />
          )}
          <ToolsBar
            repeatRef={repeatRef}
            slow={slow}
            onSlow={toggleSlow}
            onRepeat={() => dispatch({ type: 'REPEAT_LINE' })}
            // A third tool: the switch for the translations. Karaokê's is its own, shown at the start of every round; the
            // other modes' is "Mostrar tradução sempre".
            action={
              karaoke
                ? {
                    label: t(showTranslations ? 'karaoke.hideTranslation' : 'karaoke.showTranslation'),
                    onClick: () => setShowTranslations((shown) => !shown),
                  }
                : { label: t('jogo.translation'), pressed: settings.alwaysShowTranslation, onClick: toggleTranslation }
            }
          />
        </div>
      </section>
    </>
  );
}
