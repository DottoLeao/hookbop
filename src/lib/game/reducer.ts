import type { PlayerState } from '@/lib/player/adapter';
import type { AnswerRecord, AttemptKind, Blank, Command, LyricLine, Mode, PlaySummary } from '@/lib/types';
import { tokenize } from './blanks';
import { createScore, recordAnswer, summarize, type ScoreState } from './scoring';
import { isNextTileCorrect } from './tiles';

/** The clip pauses this long before the end of a line that still has a blank with no answer. */
const PAUSE_LEAD_MS = 150;

/** A forward step longer than this between two ticks, while the player plays, is a seek: ticks come every 100 ms. */
const SEEK_JUMP_MS = 1500;

/**
 * `skipped`: the player went past the line without answering (a seek, or playing on from the player's own
 * controls during a wait). It still counts in the total and can still be answered, as a first try if it never was.
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
  /** `waiting`: the clip is paused at the end of a line until its blanks are answered. */
  phase: 'playing' | 'waiting' | 'ended';
  waitingBlankId: string | null;
  lastTickMs: number;
  playerPlaying: boolean;
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
  | { type: 'SET_RATE'; rate: 0.75 | 1 };

/**
 * A new round, playing from the start. Karaoke gets no blanks, so it never pauses and scores nothing.
 * The player counts as playing until it says otherwise: its adapter does not report the state it is already in.
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
    playerPlaying: true,
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
 * A forward seek skips the blanks of the lines it jumped over (R4). Then, while the clip plays, the first pending
 * blank of a line that is 150 ms or less from its end pauses it (R3). The line must not have ended before the
 * previous tick: a blank left behind while the player was stopped never pauses the clip further on.
 */
function onTick(s: GameState, timeMs: number): GameState {
  const previousMs = s.lastTickMs;
  const seeked = s.playerPlaying && timeMs - previousMs > SEEK_JUMP_MS;
  const next: GameState = {
    ...s,
    status: seeked ? skipPending(s, (line) => line.endMs <= timeMs) : s.status,
    lastTickMs: timeMs,
  };
  if (next.phase !== 'playing' || !next.playerPlaying) return next;

  const due = next.blanks.find((blank) => {
    const line = lineOf(next, blank);
    return (
      next.status[blank.id] === 'pending' && timeMs >= line.endMs - PAUSE_LEAD_MS && previousMs < line.endMs
    );
  });
  return due ? { ...next, phase: 'waiting', waitingBlankId: due.id, commands: [{ type: 'pause' }] } : next;
}

function onPlayerState(s: GameState, state: PlayerState): GameState {
  if (state === 'ended') return { ...s, phase: 'ended', waitingBlankId: null, playerPlaying: false };

  const playerPlaying = state === 'playing';
  if (playerPlaying && s.phase === 'waiting') {
    // The game never plays during a wait, so the player's own controls did: the player moves on. The blanks at or
    // past their pause point are skipped; one dragged back before it stays pending and pauses there again.
    return {
      ...s,
      status: skipPending(s, (line) => s.lastTickMs >= line.endMs - PAUSE_LEAD_MS),
      playerPlaying,
      phase: 'playing',
      waitingBlankId: null,
    };
  }
  return { ...s, playerPlaying };
}

/** helped once a hint was used on the blank, retry once it was attempted, first otherwise. */
function attemptKind(s: GameState, blankId: string): AttemptKind {
  if (s.hinted[blankId]) return 'helped';
  return s.attempted[blankId] ? 'retry' : 'first';
}

/**
 * Records an answer and moves the clip on. A miss with auto-repeat plays its line again from the start. Any other
 * miss plays on, and the blank stays answerable. A hit sends nothing unless it ends a wait.
 */
function settle(s: GameState, blank: Blank, correct: boolean, atMs: number): GameState {
  const line = lineOf(s, blank);
  const record: AnswerRecord = {
    blankId: blank.id,
    kind: attemptKind(s, blank.id),
    correct,
    beforeLineEnd: atMs < line.endMs,
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
      commands: [{ type: 'seek', ms: line.startMs }, { type: 'play' }],
    };
  }
  if (next.phase === 'waiting') return continueWait(next);
  return correct ? next : { ...next, commands: [{ type: 'play' }] };
}

/** After an answer during a wait: it goes on while the paused line still has a pending blank, then the clip plays. */
function continueWait(s: GameState): GameState {
  const waitingLine = s.blanks.find((blank) => blank.id === s.waitingBlankId)?.lineIndex;
  const pending = s.blanks.find((blank) => blank.lineIndex === waitingLine && s.status[blank.id] === 'pending');
  if (pending) return { ...s, waitingBlankId: pending.id };
  return { ...s, phase: 'playing', waitingBlankId: null, commands: [{ type: 'play' }] };
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
  const waiting = s.phase === 'waiting' ? s.blanks.find((blank) => blank.id === s.waitingBlankId) : undefined;
  const line = waiting ? lineOf(s, waiting) : s.lines.findLast((l) => l.startMs <= s.lastTickMs);
  if (!line) return s;
  return {
    ...s,
    phase: 'playing',
    waitingBlankId: null,
    commands: [{ type: 'seek', ms: line.startMs }, { type: 'play' }],
  };
}
