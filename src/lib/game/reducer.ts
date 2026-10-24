import type { PlayerState } from '@/lib/player/adapter';
import type { AnswerRecord, AttemptKind, Blank, Command, LyricLine, Mode, PlaySummary } from '@/lib/types';
import { tokenize } from './blanks';
import { createScore, recordAnswer, summarize, type ScoreState } from './scoring';
import { isNextTileCorrect } from './tiles';
import { FADE_OUT_MS } from './timing';

/**
 * A wait starts this long before the end of a line that still has a blank with no answer. The music does not stop
 * there: it fades out for about 2 s, so the lead says when the wait begins, not when the clip is stopped.
 */
export const PAUSE_LEAD_MS = 150;

/** A forward step longer than this between two ticks, while the player plays, is a seek: ticks come every 100 ms. */
const SEEK_JUMP_MS = 1500;

/**
 * The furthest back the music goes to replay a line the fade ran into: the fade lasts `FADE_OUT_MS` and the clock can be
 * a tick or two late, so a second more covers it. A line further back than this was not heard in the fade, as when the
 * stopped clip was scrubbed far ahead during the wait, so the music plays on from where it is.
 */
const WAY_BACK_MAX_MS = FADE_OUT_MS + 1000;

/**
 * `skipped`: the player went past the line without answering (a seek, or playing on from the player's own
 * controls during a wait). It still counts in the total and can still be answered, as a first try if it never was.
 * Like a miss with auto-repeat, it is waited for again when the clip plays through its line's end.
 */
export type BlankStatus = 'pending' | 'skipped' | 'correct' | 'wrong';

export interface GameState {
  mode: Mode;
  lines: LyricLine[];
  blanks: Blank[];
  status: Record<string, BlankStatus>;
  attempted: Record<string, boolean>;
  hinted: Record<string, boolean>;
  /** Montar only: the words already placed, in the line's own spelling, always the start of the line. */
  tilesPlaced: Record<string, string[]>;
  /**
   * `waiting`: the clip fades out and stops at the end of a line, or has ended, until the line's blanks are answered.
   * It plays on during the fade, so `lastTickMs` can go past the line end and into the lines that follow.
   */
  phase: 'playing' | 'waiting' | 'ended';
  waitingBlankId: string | null;
  lastTickMs: number;
  /**
   * The last state the player reported. Until it reports one, `playing`: its adapter does not report the state it
   * is already in.
   */
  playerState: PlayerState;
  /** `playerState` is `playing`. */
  playerPlaying: boolean;
  /**
   * The clip runs, as far as the player has told. `playing` sets it, `buffering` leaves it as it was (a stall in the
   * middle of a play, or the start of one from a stopped clip), and any other state clears it. Starts set, like
   * `playerState`. A `playing` during a wait with it cleared is the player's own play.
   */
  clipRunning: boolean;
  autoRepeat: boolean;
  score: ScoreState;
  /** What the screen must tell the player to do, produced by the last event only. */
  commands: Command[];
}

export type GameEvent =
  | { type: 'TICK'; timeMs: number }
  | { type: 'PLAYER_STATE'; state: PlayerState }
  // Escolha and Digitação: the screen decides whether the answer is right.
  | { type: 'ANSWER'; blankId: string; correct: boolean; atMs: number }
  // Monte o verso.
  | { type: 'TILE'; blankId: string; word: string; atMs: number }
  | { type: 'HINT'; blankId: string }
  | { type: 'REPEAT_LINE' }
  // The clock is set to where the clip really is, after a stretch with no ticks. Not a seek: nothing is skipped.
  | { type: 'RESYNC'; timeMs: number }
  | { type: 'SET_RATE'; rate: 0.75 | 1 };

/**
 * A new round, playing from the start. Karaoke gets no blanks, so it never pauses and scores nothing.
 * The player counts as playing until it says otherwise.
 */
export function initGame(p: { mode: Mode; lines: LyricLine[]; blanks: Blank[]; autoRepeat: boolean }): GameState {
  const blanks = p.mode === 'karaoke' ? [] : p.blanks;
  return {
    mode: p.mode,
    lines: p.lines,
    blanks,
    status: Object.fromEntries(blanks.map((blank) => [blank.id, 'pending' as const])),
    attempted: {},
    hinted: {},
    tilesPlaced: p.mode === 'montar' ? Object.fromEntries(blanks.map((blank) => [blank.id, []])) : {},
    phase: 'playing',
    waitingBlankId: null,
    lastTickMs: 0,
    playerState: 'playing',
    playerPlaying: true,
    clipRunning: true,
    autoRepeat: p.autoRepeat,
    score: createScore(blanks.length),
    commands: [],
  };
}

/**
 * The round after one event. Pure: it never touches the player, it only lists in `commands` what the screen must
 * tell the player to do. Every event gives a new state whose `commands` are that event's only. Once the song has
 * ended, nothing changes any more.
 */
export function gameReducer(s: GameState, e: GameEvent): GameState {
  const next: GameState = { ...s, commands: [] };
  if (s.phase === 'ended') return next;

  switch (e.type) {
    case 'TICK':
      return onTick(next, e.timeMs);
    case 'PLAYER_STATE':
      return onPlayerState(next, e.state);
    case 'ANSWER': {
      const blank = openBlank(next, e.blankId);
      return blank ? settle(next, blank, e.correct, e.atMs) : next;
    }
    case 'TILE': {
      const blank = openBlank(next, e.blankId);
      return blank ? placeTile(next, blank, e.word, e.atMs) : next;
    }
    case 'HINT': {
      const blank = openBlank(next, e.blankId);
      return blank ? onHint(next, blank) : next;
    }
    case 'REPEAT_LINE':
      return onRepeatLine(next);
    case 'RESYNC':
      return { ...next, lastTickMs: e.timeMs };
    case 'SET_RATE':
      return { ...next, commands: [{ type: 'rate', rate: e.rate }] };
  }
}

export function summaryOf(s: GameState): PlaySummary {
  return summarize(s.score);
}

function lineOf(s: GameState, blank: Blank): LyricLine {
  return s.lines[blank.lineIndex];
}

/**
 * The clip plays, as far as the game knows, with no wait holding it: what a pause of the game's own (the translation,
 * DJ Bop's sheet) can stop. A clip that is stopped, or fading out for a wait, is not.
 */
export function clipPlays(s: GameState): boolean {
  return s.phase === 'playing' && (s.playerState === 'playing' || s.playerState === 'buffering');
}

/** The blank a wait holds for, while the game waits. */
function waitedBlank(s: GameState): Blank | undefined {
  return s.phase === 'waiting' ? s.blanks.find((blank) => blank.id === s.waitingBlankId) : undefined;
}

/** The music coming back: it plays, and its volume rises. */
function playWithFade(): Command {
  return { type: 'play', fade: true };
}

/** The blank with that id while it can still be answered, that is, until it is right. */
function openBlank(s: GameState, blankId: string): Blank | undefined {
  return s.status[blankId] === 'correct' ? undefined : s.blanks.find((blank) => blank.id === blankId);
}

/** The statuses with every pending blank whose line `passed` accepts turned to skipped. */
function skipPending(s: GameState, passed: (line: LyricLine) => boolean): Record<string, BlankStatus> {
  const status = { ...s.status };
  for (const blank of s.blanks) {
    if (status[blank.id] === 'pending' && passed(lineOf(s, blank))) status[blank.id] = 'skipped';
  }
  return status;
}

/**
 * A forward seek skips the blanks of the lines it jumped over (R4). Then, while the clip plays, the first blank
 * that is due starts a wait and fades the music out (R3, R37). During the wait the ticks only move the clock: the clip
 * plays on for the fade, and that must not start another wait or skip a blank.
 */
function onTick(s: GameState, timeMs: number): GameState {
  const previousMs = s.lastTickMs;
  // The clip moves on by itself while it plays or buffers, so a jump then is a seek. A jump while it is stopped is not,
  // nor one during a wait: the clip only plays then to fade out, the player's own controls end a wait through the
  // player's state (see `onPlayerState`), and a stall of the clock during the fade must not skip the lines it jumps
  // over.
  const moving = s.playerState === 'playing' || s.playerState === 'buffering';
  const seeked = s.phase === 'playing' && moving && timeMs - previousMs > SEEK_JUMP_MS;
  const next: GameState = {
    ...s,
    status: seeked ? skipPending(s, (line) => line.endMs <= timeMs) : s.status,
    lastTickMs: timeMs,
  };
  if (next.phase !== 'playing' || !next.playerPlaying) return next;

  const due = next.blanks.find((blank) => pausesAt(next, blank, previousMs, timeMs, seeked));
  return due ? { ...next, phase: 'waiting', waitingBlankId: due.id, commands: [{ type: 'pause', fade: true }] } : next;
}

/**
 * Whether the blank starts a wait on a tick from `previousMs` to `timeMs`. A pending blank does once its line is
 * 150 ms or less from its end, unless the line had already ended by the previous tick: one left behind while the
 * player was stopped never waits further on. A skipped blank, or a miss with auto-repeat, waits again only
 * when the clip plays through that point, never on a seek.
 */
function pausesAt(s: GameState, blank: Blank, previousMs: number, timeMs: number, seeked: boolean): boolean {
  const line = lineOf(s, blank);
  const pausePoint = line.endMs - PAUSE_LEAD_MS;
  const status = s.status[blank.id];
  if (status === 'pending') return timeMs >= pausePoint && previousMs < line.endMs;
  const playedThrough = !seeked && previousMs < pausePoint && pausePoint <= timeMs;
  return playedThrough && awaitsAnswer(s, blank);
}

/**
 * Pending, skipped, or missed with auto-repeat on: a wait holds for it. A miss without auto-repeat lets the song
 * move on. The game screen uses the same rule to pick the blank in play.
 */
export function awaitsAnswer(s: GameState, blank: Blank): boolean {
  const status = s.status[blank.id];
  return status === 'pending' || status === 'skipped' || (status === 'wrong' && s.autoRepeat);
}

function onPlayerState(s: GameState, playerState: PlayerState): GameState {
  const playerPlaying = playerState === 'playing';
  // `buffering` does not say whether the clip was running: `playing, buffering, playing` is a stall, and
  // `paused, buffering, playing` is the player starting a stopped clip. So it leaves `clipRunning` as it was.
  const clipRunning = playerState === 'buffering' ? s.clipRunning : playerPlaying;
  const next: GameState = { ...s, playerState, playerPlaying, clipRunning };
  if (playerState === 'ended') return onClipEnded(next);

  // The game never plays during a wait, so a clip that was stopped and plays again was started from the player's own
  // controls: the player moves on, and the music comes back up, as the fade left its volume at 0. A `playing` while
  // the clip was running (it still plays the fade, it stalled and went on, or a late or repeated report around the
  // game's own pause) is not that.
  if (playerPlaying && s.phase === 'waiting' && !s.clipRunning) {
    // The blanks at or past their pause point are skipped; one dragged back before it stays pending and pauses
    // there again.
    return {
      ...next,
      status: skipPending(s, (line) => s.lastTickMs >= line.endMs - PAUSE_LEAD_MS),
      phase: 'playing',
      waitingBlankId: null,
      commands: [playWithFade()],
    };
  }
  return next;
}

/**
 * The clip ran out, so no line can lose by time: a wait goes on, and with none, the first blank still pending is
 * waited for (usually on the last line, whose end the clip may never reach). No command goes out. Once that line is
 * answered, the game ends. With nothing pending, it ends now.
 */
function onClipEnded(s: GameState): GameState {
  if (s.phase === 'waiting') return s;
  const pending = s.blanks.find((blank) => s.status[blank.id] === 'pending');
  if (pending) return { ...s, phase: 'waiting', waitingBlankId: pending.id };
  return { ...s, phase: 'ended', waitingBlankId: null };
}

/** helped once a hint was used on the blank, retry once it was attempted, first otherwise. */
function attemptKind(s: GameState, blankId: string): AttemptKind {
  if (s.hinted[blankId]) return 'helped';
  return s.attempted[blankId] ? 'retry' : 'first';
}

/**
 * Whether an answer came before its line ended: while a wait holds for the line, or when `atMs` is before the end.
 * During the wait the clip plays on only to fade out and then stands still, so its clock says nothing about how fast
 * the player was. A wait held after the clip ended (an old pending blank left behind) is not that, the clip did not
 * stop there, so it keeps the clock's word.
 */
function answeredBeforeLineEnd(s: GameState, blank: Blank, atMs: number): boolean {
  const waitedOnItsLine = waitedBlank(s)?.lineIndex === blank.lineIndex && s.playerState !== 'ended';
  return waitedOnItsLine || atMs < lineOf(s, blank).endMs;
}

/**
 * Records an answer and moves the clip on. A miss with auto-repeat plays its line again from the start. Any other
 * miss plays on, and the blank stays answerable. A hit sends nothing unless it ends a wait. Whenever the music plays
 * again, its volume rises.
 */
function settle(s: GameState, blank: Blank, correct: boolean, atMs: number): GameState {
  const line = lineOf(s, blank);
  const record: AnswerRecord = {
    blankId: blank.id,
    kind: attemptKind(s, blank.id),
    correct,
    beforeLineEnd: answeredBeforeLineEnd(s, blank, atMs),
  };
  const next: GameState = {
    ...s,
    status: { ...s.status, [blank.id]: correct ? 'correct' : 'wrong' },
    attempted: { ...s.attempted, [blank.id]: true },
    score: recordAnswer(s.score, record, s.mode),
  };

  if (!correct && next.autoRepeat) {
    return {
      ...next,
      phase: 'playing',
      waitingBlankId: null,
      commands: [{ type: 'seek', ms: line.startMs }, playWithFade()],
    };
  }
  if (next.phase === 'waiting') return continueWait(next);
  return correct ? next : { ...next, commands: [playWithFade()] };
}

/**
 * After an answer during a wait: it goes on while the paused line still has a blank that awaits an answer. Then the
 * music is let go or, once the clip has ended, the game ends.
 */
function continueWait(s: GameState): GameState {
  const waited = waitedBlank(s);
  const unanswered = s.blanks.find((blank) => blank.lineIndex === waited?.lineIndex && awaitsAnswer(s, blank));
  if (unanswered) return { ...s, waitingBlankId: unanswered.id };
  if (s.playerState === 'ended') return { ...s, phase: 'ended', waitingBlankId: null };
  return { ...s, phase: 'playing', waitingBlankId: null, commands: releaseMusic(s, waited) };
}

/**
 * The music after a wait. It comes back from where the fade stopped it, unless the fade went into a later line that
 * has a blank awaiting an answer (see `lineToReplay`) and that line starts at most `WAY_BACK_MAX_MS` before the clock:
 * then it comes back from the start of that line.
 */
function releaseMusic(s: GameState, waited: Blank | undefined): Command[] {
  const replay = waited && lineToReplay(s, waited.lineIndex);
  const goBack = replay && s.lastTickMs - replay.startMs <= WAY_BACK_MAX_MS;
  return goBack ? [{ type: 'seek', ms: replay.startMs }, playWithFade()] : [playWithFade()];
}

/**
 * The clip plays on while the music fades out, so the clock may have gone from the waited line into the next ones, and
 * the player heard their first words with no way to answer. The earliest of those lines with a blank awaiting an
 * answer is the one to play again from its start, so no blank goes by inside a fade, not even in a line shorter than
 * the fade (`releaseMusic` limits how far back that may be). A line the clock only just reached has not been heard yet.
 */
function lineToReplay(s: GameState, waitedLineIndex: number): LyricLine | undefined {
  let earliest: LyricLine | undefined;
  for (const blank of s.blanks) {
    const line = lineOf(s, blank);
    const heard = blank.lineIndex > waitedLineIndex && line.startMs < s.lastTickMs;
    if (heard && awaitsAnswer(s, blank) && (!earliest || line.startMs < earliest.startMs)) earliest = line;
  }
  return earliest;
}

/**
 * Montar: the next right word joins the placed row and the full row answers the line. A wrong word is a miss: it
 * clears the row.
 */
function placeTile(s: GameState, blank: Blank, word: string, atMs: number): GameState {
  const tokens = tokenize(lineOf(s, blank).text);
  const placed = s.tilesPlaced[blank.id] ?? [];
  if (!isNextTileCorrect(tokens, placed.length, word)) {
    return settle({ ...s, tilesPlaced: { ...s.tilesPlaced, [blank.id]: [] } }, blank, false, atMs);
  }

  const nowPlaced = [...placed, tokens[placed.length]];
  const next: GameState = { ...s, tilesPlaced: { ...s.tilesPlaced, [blank.id]: nowPlaced } };
  return nowPlaced.length === tokens.length ? settle(next, blank, true, atMs) : next;
}

/** Marks the blank as hinted. In montar it also places the next right word, as if it were tapped. */
function onHint(s: GameState, blank: Blank): GameState {
  const next: GameState = { ...s, hinted: { ...s.hinted, [blank.id]: true } };
  if (s.mode !== 'montar') return next;

  const nextWord = tokenize(lineOf(s, blank).text)[(s.tilesPlaced[blank.id] ?? []).length];
  return nextWord === undefined ? next : placeTile(next, blank, nextWord, s.lastTickMs);
}

/**
 * Plays a line again from its start: the waited line during a wait, otherwise the one playing at the last tick, or
 * the one before it in a gap. Nothing before the first line. The phase goes back to playing, so the line's pending
 * blanks pause it again at its end.
 */
function onRepeatLine(s: GameState): GameState {
  const waited = waitedBlank(s);
  const line = waited ? lineOf(s, waited) : s.lines.findLast((l) => l.startMs <= s.lastTickMs);
  if (!line) return s;
  return {
    ...s,
    phase: 'playing',
    waitingBlankId: null,
    commands: [{ type: 'seek', ms: line.startMs }, playWithFade()],
  };
}
