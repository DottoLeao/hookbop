import { linesOfVideo } from '@/lib/lyrics/linesOfVideo';
import type { LyricLine } from '@/lib/types';
import { parseYouTubeId } from '@/lib/youtube/parseUrl';
import type { AiUsageEntry, HelpDeps } from './helpService';
import { ModelError } from './modelError';
import { costUsd, HELP_MODEL, type TokenUsage } from './pricing';
import { SONG_TRANSLATE_SYSTEM, songTranslateUserMessage } from './prompts';
import { MAX_LINE_CHARS, sameTextKey, type StoredVideo } from './validate';

/**
 * The translation of a whole song in one call to the model (`POST /api/translate-song`): every line of the video's
 * stored lyrics, by line index, from the per-line cache (`line_help`, kind 'translate', target '') when it has them,
 * and from one streamed call for the rest. The model never reads text the browser sent: the lines are the stored ones.
 */

/** What the browser asks about: a video, and the lyrics it has for it (so an answer never fits other lyrics). */
export interface SongAsk {
  youtubeId: string;
  lyricsRef: string;
}

/** The translation of one line of the song. */
export interface LineTranslation {
  lineIndex: number;
  text: string;
}

/** A text the model is asked about, once, and every line of the song that has it (a chorus is sung more than once). */
export interface SongGroup {
  text: string;
  lineIndexes: number[];
}

/** What a song needs: the lines it can be given at once, and the texts the model has to be asked about. */
export interface SongPlan {
  /** The lines with a translation already, in song order: from the cache, or from a line with the same text. */
  known: LineTranslation[];
  /** Of `known`, those that came from a line with the same text: they are saved for their own line too. */
  reused: LineTranslation[];
  /** The texts with no translation yet, each once, in the order they are first sung. */
  missing: SongGroup[];
}

/** What the model is asked, for one song. */
export interface SongModelRequest {
  system: string;
  user: string;
  maxTokens: number;
  schema: Readonly<Record<string, unknown>>;
}

/** What a streamed call cost, once it ended well. */
export interface StreamedAnswer {
  usage: TokenUsage;
  latencyMs: number;
}

/**
 * Asks the model, handing each piece of its text to `onText` as it comes. Resolves when the answer is finished and
 * rejects with a ModelError otherwise (see `streamModel` in model.ts).
 */
export type StreamModel = (request: SongModelRequest, onText: (delta: string) => void) => Promise<StreamedAnswer>;

/**
 * What a song's translation reaches outside itself for: the video row, the per-line cache, the hourly budget and the
 * usage log (the database, through the service key) and the model.
 */
export type SongDeps = Pick<HelpDeps, 'reserve' | 'release' | 'recordUsage'> & {
  getVideo(youtubeId: string): Promise<StoredVideo | null>;
  /** Every translation `line_help` has for these lyrics, by line index. */
  getCachedTranslations(youtubeId: string, lyricsRef: string): Promise<Map<number, string>>;
  /** Saves these translations for every member. A row another member saved first stays as it is. */
  saveTranslations(youtubeId: string, lyricsRef: string, rows: readonly LineTranslation[]): Promise<void>;
  streamModel: StreamModel;
};

/**
 * Sends the translations to the player as they come, and ends the stream once every line that can be had is out. It
 * resolves when the work after that is done too (saving, logging), and never rejects: a failure there is a warning.
 */
export type SongRun = (send: (lines: readonly LineTranslation[]) => void, end: () => void) => Promise<void>;

export type SongStart = { status: 400 } | { status: 429 } | { status: 200; run: SongRun };

/** The `ai_usage.line_index` of a call about the whole song, which is no line of it (see docs/analytics.md). */
export const WHOLE_SONG_LINE_INDEX = -1;

/** A ref is an id of the lyrics source: anything longer is not one. */
export const MAX_LYRICS_REF_CHARS = 200;

/** At most this many texts in one call; the lines after them get the translation by line, as before. */
export const MAX_SONG_TEXTS = 150;

/** A translation longer than this is not one of a song line (those are 300 characters at most), and is dropped. */
export const MAX_TRANSLATION_CHARS = 600;

/**
 * Room for the answer: the JSON around it, and about 60 tokens a line (a line of a song is 10 to 30 tokens of text,
 * plus its number and keys), up to a ceiling. The call streams, so a big answer is no timeout.
 */
const BASE_TOKENS = 200;
const TOKENS_PER_TEXT = 60;
const MAX_TOKENS = 8000;

export function songMaxTokens(texts: number): number {
  return Math.min(MAX_TOKENS, BASE_TOKENS + TOKENS_PER_TEXT * texts);
}

/**
 * The shape of the answer (structured outputs): a list of lines, each with its number in the list it was given and
 * its translation. Easy to read a line at a time while it streams (`createItemScanner`), and to check.
 */
export const SONG_TRANSLATION_SCHEMA = {
  type: 'object',
  properties: {
    lines: {
      type: 'array',
      items: {
        type: 'object',
        properties: { n: { type: 'integer' }, translation: { type: 'string' } },
        required: ['n', 'translation'],
        additionalProperties: false,
      },
    },
  },
  required: ['lines'],
  additionalProperties: false,
} as const;

/** A request body with a valid video id and a lyrics ref, or null (a 400). */
export function parseSongAsk(body: unknown): SongAsk | null {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return null;
  const { youtubeId, lyricsRef } = body as Record<string, unknown>;
  if (typeof youtubeId !== 'string' || typeof lyricsRef !== 'string') return null;
  if (parseYouTubeId(youtubeId) !== youtubeId) return null;
  if (lyricsRef === '' || lyricsRef.length > MAX_LYRICS_REF_CHARS) return null;
  return { youtubeId, lyricsRef };
}

/** The stored lines of the lyrics asked about, or null when the video is not playable or has other lyrics now. */
function storedLines(ask: SongAsk, video: StoredVideo | null): LyricLine[] | null {
  if (!video || video.status !== 'ok') return null;
  const { lyricsRef, lyricsLrc, lyricsDurationS } = video;
  if (lyricsRef === null || lyricsLrc === null || lyricsDurationS === null || lyricsRef !== ask.lyricsRef) return null;
  const lines = linesOfVideo({ lyricsLrc, lyricsDurationS });
  return lines.length > 0 ? lines : null;
}

/**
 * The lines grouped by their text as two lines sung alike compare (`sameTextKey`, ruling R72), each group taking the
 * translation the cache has for any of its lines. A line too long to be a song line (`MAX_LINE_CHARS`) is left out,
 * as the help by line turns it down too.
 */
export function planSongTranslation(lines: readonly LyricLine[], cached: ReadonlyMap<number, string>): SongPlan {
  const groups = new Map<string, SongGroup>();
  for (const line of lines) {
    const text = line.text.trim();
    if (text === '' || text.length > MAX_LINE_CHARS) continue;
    const key = sameTextKey(text);
    const group = groups.get(key);
    if (group) group.lineIndexes.push(line.index);
    else groups.set(key, { text, lineIndexes: [line.index] });
  }

  const known: LineTranslation[] = [];
  const reused: LineTranslation[] = [];
  const missing: SongGroup[] = [];
  for (const group of groups.values()) {
    const found = group.lineIndexes.map((lineIndex) => cached.get(lineIndex)).find((text) => text !== undefined);
    if (found === undefined) {
      if (missing.length < MAX_SONG_TEXTS) missing.push(group);
      continue;
    }
    for (const lineIndex of group.lineIndexes) {
      const own = cached.get(lineIndex);
      known.push({ lineIndex, text: own ?? found });
      if (own === undefined) reused.push({ lineIndex, text: found });
    }
  }
  const bySong = (a: LineTranslation, b: LineTranslation) => a.lineIndex - b.lineIndex;
  return { known: known.sort(bySong), reused: reused.sort(bySong), missing };
}

/**
 * Reads the answer as it streams: each item of the list (`{"n": .., "translation": ..}`, the objects one level inside
 * the top object's array) is handed to `onItem` as soon as its closing brace comes, parsed. Strings are skipped
 * whole, so a brace or a quote inside a translation changes nothing. An item that is not JSON is skipped, and an
 * answer of another shape gives nothing. It never throws.
 */
export function createItemScanner(onItem: (item: unknown) => void): (chunk: string) => void {
  let depth = 0;
  let inString = false;
  let escaped = false;
  let reading = false;
  let item = '';
  return (chunk) => {
    for (const char of chunk) {
      if (reading) item += char;
      if (inString) {
        if (escaped) escaped = false;
        else if (char === '\\') escaped = true;
        else if (char === '"') inString = false;
        continue;
      }
      if (char === '"') {
        inString = true;
      } else if (char === '{' || char === '[') {
        depth += 1;
        if (char === '{' && depth === 3) {
          reading = true;
          item = '{';
        }
      } else if (char === '}' || char === ']') {
        depth -= 1;
        if (reading && depth === 2) {
          reading = false;
          let parsed: unknown;
          try {
            parsed = JSON.parse(item);
          } catch {
            continue;
          }
          onItem(parsed);
        }
      }
    }
  };
}

/** One item of the answer as the app can use it, or null: a number in the list asked about and a real translation. */
function readItem(item: unknown, count: number): { n: number; text: string } | null {
  if (typeof item !== 'object' || item === null) return null;
  const { n, translation } = item as Record<string, unknown>;
  if (typeof n !== 'number' || !Number.isInteger(n) || n < 1 || n > count) return null;
  if (typeof translation !== 'string') return null;
  const text = translation.trim();
  if (text === '' || text.length > MAX_TRANSLATION_CHARS) return null;
  return { n, text };
}

/** Saves translations for every member. One that cannot be saved is still a good answer: a warning, nothing more. */
async function persist(deps: SongDeps, ask: SongAsk, rows: readonly LineTranslation[]): Promise<void> {
  if (rows.length === 0) return;
  try {
    await deps.saveTranslations(ask.youtubeId, ask.lyricsRef, rows);
  } catch (error) {
    console.warn('Could not save the song translation.', error);
  }
}

/** Logs the usage of the call. A log that cannot be written changes nothing for the player: a warning. */
async function record(deps: SongDeps, entry: AiUsageEntry): Promise<void> {
  try {
    await deps.recordUsage(entry);
  } catch (error) {
    console.warn('Could not record the AI usage.', error);
  }
}

function usageEntry(
  userId: string,
  ask: SongAsk,
  source: 'model' | 'cache',
  call: { usage?: TokenUsage; latencyMs?: number },
  outcome: AiUsageEntry['outcome'],
): AiUsageEntry {
  const usage = call.usage ?? { inputTokens: 0, outputTokens: 0 };
  const asked = source === 'model';
  return {
    userId,
    youtubeId: ask.youtubeId,
    lineIndex: WHOLE_SONG_LINE_INDEX,
    kind: 'translate',
    source,
    model: asked ? HELP_MODEL : null,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    costUsd: asked ? costUsd(HELP_MODEL, usage) : 0,
    latencyMs: call.latencyMs ?? null,
    outcome,
  };
}

/** Sends what the cache has (and saves what a same-text line gave): no model, no budget. */
function fromCache(userId: string, ask: SongAsk, plan: SongPlan, deps: SongDeps): SongRun {
  return async (send, end) => {
    if (plan.known.length > 0) send(plan.known);
    end();
    await persist(deps, ask, plan.reused);
    await record(deps, usageEntry(userId, ask, 'cache', {}, 'ok'));
  };
}

/**
 * Sends what the cache has, then asks the model once about every missing text and sends each line as soon as its
 * translation comes, to every line that has that text. When the model is done (or broke off), the stream ends; then
 * everything that came is saved, the reservation is given back when no answer came at all (ruling R75), and the call is
 * logged.
 */
function fromModel(userId: string, ask: SongAsk, plan: SongPlan, reservation: number, deps: SongDeps): SongRun {
  return async (send, end) => {
    if (plan.known.length > 0) send(plan.known);

    const got: LineTranslation[] = [];
    const done = new Set<number>();
    const feed = createItemScanner((item) => {
      const read = readItem(item, plan.missing.length);
      if (!read || done.has(read.n)) return;
      done.add(read.n);
      const lines = plan.missing[read.n - 1].lineIndexes.map((lineIndex) => ({ lineIndex, text: read.text }));
      got.push(...lines);
      send(lines);
    });

    let entry: AiUsageEntry;
    let giveBack = false;
    try {
      const answer = await deps.streamModel(
        {
          system: SONG_TRANSLATE_SYSTEM,
          user: songTranslateUserMessage(plan.missing.map((group) => group.text)),
          maxTokens: songMaxTokens(plan.missing.length),
          schema: SONG_TRANSLATION_SCHEMA,
        },
        feed,
      );
      entry = usageEntry(userId, ask, 'model', answer, 'ok');
    } catch (error) {
      console.warn('The song translation stopped short.', error);
      const failure = error instanceof ModelError ? error : undefined;
      giveBack = !failure?.answered;
      entry = usageEntry(userId, ask, 'model', failure ?? {}, failure?.declined ? 'declined' : 'error');
    }

    end();
    if (giveBack) {
      await deps.release(reservation).catch((error: unknown) => {
        console.warn('Could not give the help request back.', error);
      });
    }
    await persist(deps, ask, [...plan.reused, ...got]);
    await record(deps, entry);
  };
}

/**
 * The translation of a whole song, in this order:
 * 1. the lyrics asked about must be the video's stored ones (400 otherwise);
 * 2. every line the cache has, or has for a line with the same text, is known at once: free;
 * 3. when that is every line, nothing more: no model and no budget;
 * 4. otherwise one request of the member's hourly translation budget is reserved, for the whole song. With none left,
 *    the lines already known are still sent, and with none of those either it is a 429;
 * 5. the model is asked once about the missing texts, each once (`run`).
 *
 * Steps 1 to 4 run before the answer starts, so a 400 or a 429 is a status of its own; what comes after streams. One
 * `ai_usage` row is logged per call, with line_index -1: 'cache' when the model was not asked, 'model' otherwise.
 */
export async function startSongTranslation(userId: string, ask: SongAsk, deps: SongDeps): Promise<SongStart> {
  const lines = storedLines(ask, await deps.getVideo(ask.youtubeId));
  if (!lines) return { status: 400 };

  const plan = planSongTranslation(lines, await deps.getCachedTranslations(ask.youtubeId, ask.lyricsRef));
  if (plan.missing.length === 0) return { status: 200, run: fromCache(userId, ask, plan, deps) };

  const reservation = await deps.reserve(userId, 'translate');
  if (reservation === null) {
    return plan.known.length === 0 ? { status: 429 } : { status: 200, run: fromCache(userId, ask, plan, deps) };
  }
  return { status: 200, run: fromModel(userId, ask, plan, reservation, deps) };
}
