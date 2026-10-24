import type { AnswerRecord, AttemptKind, Difficulty, Mode } from '@/lib/types';
import type { BlankStatus, GameState, RestorableProgress } from './reducer';
import type { ScoreState } from './scoring';

/** The shape of what is stored. Another number means another shape, and what is stored is dropped. */
export const PROGRESS_VERSION = 1;

/** A saved round older than this is not offered any more. */
export const PROGRESS_MAX_AGE_MS = 24 * 60 * 60 * 1000;

/**
 * What the saved progress uses of `Storage`: `window.localStorage` in the app, a fake in tests. `key` and `length` are
 * only for `sweepProgress`, which looks for the saved games of other songs.
 */
export type ProgressStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem' | 'key' | 'length'>;

const KEY_PREFIX = 'hb_progress:';

/**
 * A round in progress, as it is kept on the device so the player can come back to the same song and go on. One per
 * song, under `hb_progress:<youtubeId>`. Which blanks the round has is not stored: they come from the video and the
 * difficulty (see `RESTORE`), and the ids in `status` say whether this is still the same round.
 */
export interface SavedProgress extends RestorableProgress {
  version: typeof PROGRESS_VERSION;
  youtubeId: string;
  mode: Mode;
  difficulty: Difficulty;
  /** When it was saved, in ms since 1970 (`Date.now()`). */
  savedAt: number;
}

function keyOf(youtubeId: string): string {
  return KEY_PREFIX + youtubeId;
}

// Records over the unions, so that a new mode, status or kind cannot be forgotten here: the compiler asks for it.
const MODES: Record<Mode, true> = { escolha: true, digitacao: true, karaoke: true, montar: true };
const DIFFICULTIES: Record<Difficulty, true> = { facil: true, medio: true, dificil: true };
const STATUSES: Record<BlankStatus, true> = { pending: true, skipped: true, correct: true, wrong: true };
const KINDS: Record<AttemptKind, true> = { first: true, retry: true, helped: true };

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isOneOf(set: object) {
  return (value: unknown): boolean => typeof value === 'string' && Object.hasOwn(set, value);
}

/** An object whose every value is accepted by `ok`. */
function valuesAre(value: unknown, ok: (value: unknown) => boolean): boolean {
  return isObject(value) && Object.values(value).every(ok);
}

function isAnswerRecord(value: unknown): value is AnswerRecord {
  return (
    isObject(value) &&
    typeof value.blankId === 'string' &&
    isOneOf(KINDS)(value.kind) &&
    typeof value.correct === 'boolean' &&
    typeof value.beforeLineEnd === 'boolean'
  );
}

function isScore(value: unknown): value is ScoreState {
  return (
    isObject(value) &&
    [value.combo, value.maxCombo, value.xp, value.firstTryCorrect, value.totalBlanks].every(isNumber) &&
    Array.isArray(value.records) &&
    value.records.every(isAnswerRecord)
  );
}

/** Whether what was read is a progress of this song in the current shape. */
function isProgress(value: unknown, youtubeId: string): value is SavedProgress {
  return (
    isObject(value) &&
    value.version === PROGRESS_VERSION &&
    value.youtubeId === youtubeId &&
    isOneOf(MODES)(value.mode) &&
    isOneOf(DIFFICULTIES)(value.difficulty) &&
    isNumber(value.savedAt) &&
    isNumber(value.lastTickMs) &&
    valuesAre(value.status, isOneOf(STATUSES)) &&
    valuesAre(value.attempted, (flag) => typeof flag === 'boolean') &&
    valuesAre(value.hinted, (flag) => typeof flag === 'boolean') &&
    valuesAre(value.tilesPlaced, (row) => Array.isArray(row) && row.every((word) => typeof word === 'string')) &&
    isScore(value.score)
  );
}

/**
 * The progress of a round, as it stands. A blank a wait holds for is kept as pending, whatever it was (a skipped blank,
 * or a miss, is waited for again too): the round comes back playing and not waiting, so the blank has to be one the clip
 * waits for when it plays through its line's end once more (ruling S24).
 */
export function progressOf(
  game: GameState,
  meta: { youtubeId: string; difficulty: Difficulty; now: number },
): SavedProgress {
  const held = game.phase === 'waiting' ? game.waitingBlankId : null;
  return {
    version: PROGRESS_VERSION,
    youtubeId: meta.youtubeId,
    mode: game.mode,
    difficulty: meta.difficulty,
    savedAt: meta.now,
    lastTickMs: game.lastTickMs,
    status: held === null ? game.status : { ...game.status, [held]: 'pending' },
    attempted: game.attempted,
    hinted: game.hinted,
    tilesPlaced: game.tilesPlaced,
    score: game.score,
  };
}

/** Keeps the progress, replacing the one the song had. When the storage refuses (site data blocked, no space) nothing is kept. */
export function saveProgress(storage: ProgressStorage, progress: SavedProgress): void {
  try {
    storage.setItem(keyOf(progress.youtubeId), JSON.stringify(progress));
  } catch {
    // A convenience: not being able to go on later must not break the game.
  }
}

/**
 * The song's saved progress, or null when there is none, it is more than 24 hours old, it is dated after `now` (a clock
 * set back), it is of another version or it cannot be read. What is of no use any more is taken out of the storage. A
 * storage that throws just has none.
 */
export function loadProgress(storage: ProgressStorage, youtubeId: string, now: number): SavedProgress | null {
  let stored: string | null;
  try {
    stored = storage.getItem(keyOf(youtubeId));
  } catch {
    return null;
  }
  if (stored === null) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(stored);
  } catch {
    parsed = null;
  }
  if (isProgress(parsed, youtubeId) && parsed.savedAt <= now && now - parsed.savedAt <= PROGRESS_MAX_AGE_MS) return parsed;

  clearProgress(storage, youtubeId);
  return null;
}

/** Forgets the song's saved progress: its round ended, or the player chose to start over. */
export function clearProgress(storage: ProgressStorage, youtubeId: string): void {
  try {
    storage.removeItem(keyOf(youtubeId));
  } catch {
    // Nothing to forget, or the storage is blocked: either way there is nothing more to do.
  }
}

/**
 * Takes out every saved game of every song that is of no use any more (too old, from the future, another version,
 * unreadable), so a song that is never opened again does not keep its game on the device for good. Other keys are left
 * alone. A storage that cannot be listed, or that refuses to forget, is left as it is.
 */
export function sweepProgress(storage: ProgressStorage, now: number): void {
  try {
    const songs: string[] = [];
    for (let index = 0; index < storage.length; index++) {
      const key = storage.key(index);
      if (key?.startsWith(KEY_PREFIX)) songs.push(key.slice(KEY_PREFIX.length));
    }
    // `loadProgress` forgets what is of no use, so it does the sweeping; the keys are listed first because forgetting
    // changes the positions.
    for (const youtubeId of songs) loadProgress(storage, youtubeId, now);
  } catch {
    // The storage is blocked: there is nothing it can be swept of.
  }
}
