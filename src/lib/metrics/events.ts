import type { Mode } from '@/lib/types';
import { isVideoId } from '@/lib/youtube/parseUrl';

/**
 * The actions the app records: a closed list, the same one the database accepts (the check on `app_events.name` in
 * supabase/migrations/0006_metrics.sql, which `events.test.ts` compares with this list).
 */
export const EVENT_NAMES = [
  'app_opened',
  'song_opened',
  'mode_selected',
  'game_started',
  'game_finished',
  'game_abandoned',
  'help_explain',
  'help_translate',
  'continue_after_leave',
  'install_prompt_shown',
  'install_accepted',
  'invite_created',
  'calibration_done',
] as const;
export type EventName = (typeof EVENT_NAMES)[number];

/** The few details an action may carry in `props`. Every one is a number, and none says who the player is. */
// A type and not an interface, so it can go into the database as the JSON it is.
export type EventProps = {
  /** `game_finished`: the share of blanks answered right on the first try, 0 to 100. */
  pct?: number;
  /** `game_finished`: how long the game lasted. */
  durationMs?: number;
  /** `game_finished`: how many blanks the game had (0 in Karaokê). */
  totalBlanks?: number;
  /** `help_explain` and `help_translate`: the line the help was asked on. */
  lineIndex?: number;
};
export type PropName = keyof EventProps;

/** Which `props` each action may carry. Anything else is dropped. */
export const ALLOWED_PROPS: Record<EventName, readonly PropName[]> = {
  app_opened: [],
  song_opened: [],
  mode_selected: [],
  game_started: [],
  game_finished: ['pct', 'durationMs', 'totalBlanks'],
  game_abandoned: [],
  help_explain: ['lineIndex'],
  help_translate: ['lineIndex'],
  continue_after_leave: [],
  install_prompt_shown: [],
  install_accepted: [],
  invite_created: [],
  calibration_done: [],
};

/** At most this many events in one request... */
export const MAX_EVENTS_PER_REQUEST = 20;
/** ...and this many bytes in its body. */
export const MAX_BODY_BYTES = 8 * 1024;

const EVENT_NAME_SET: ReadonlySet<string> = new Set(EVENT_NAMES);
const MODES: Record<Mode, true> = { escolha: true, digitacao: true, karaoke: true, montar: true };
const SESSION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Whether this is the id of a session: a uuid, which is what the database stores. */
export function isSessionId(value: unknown): value is string {
  return typeof value === 'string' && SESSION_ID.test(value);
}

/** One action of a request, checked. A song or a mode the action does not have is null, and `props` is never null. */
export interface ParsedEvent {
  name: EventName;
  youtubeId: string | null;
  mode: Mode | null;
  props: EventProps;
}

export interface ParsedEvents {
  sessionId: string;
  events: ParsedEvent[];
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** What a field of `props` may be: a plain number, never negative (and a score is at most 100). */
function propOk(prop: PropName, value: unknown): value is number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return false;
  return prop !== 'pct' || value <= 100;
}

/** The fields of `props` this action may carry and that are numbers; the rest is dropped. */
function allowedProps(name: EventName, props: unknown): EventProps {
  if (!isObject(props)) return {};
  const kept: EventProps = {};
  for (const prop of ALLOWED_PROPS[name]) {
    const value = props[prop];
    if (propOk(prop, value)) kept[prop] = value;
  }
  return kept;
}

function parseEvent(raw: unknown): ParsedEvent | null {
  if (!isObject(raw)) return null;
  const { name, youtubeId, mode, props } = raw;
  if (typeof name !== 'string' || !EVENT_NAME_SET.has(name)) return null;
  const eventName = name as EventName;

  if (youtubeId != null && (typeof youtubeId !== 'string' || !isVideoId(youtubeId))) return null;
  if (mode != null && (typeof mode !== 'string' || !Object.hasOwn(MODES, mode))) return null;

  return {
    name: eventName,
    youtubeId: youtubeId ?? null,
    mode: (mode as Mode | null | undefined) ?? null,
    props: allowedProps(eventName, props),
  };
}

/**
 * The body of `POST /api/events` as a list of events, or null when it is not a request (a 400): a session id that is a
 * uuid and 1 to 20 events, each with a name from the list, a song that is a YouTube id and a mode that is one of the
 * four, when they have any. It copies only what it knows, so a `user_id` in the body (or in an event) goes nowhere,
 * and `props` keeps only the fields the action may carry (`ALLOWED_PROPS`).
 */
export function parseEventsRequest(body: unknown): ParsedEvents | null {
  if (!isObject(body)) return null;
  const { sessionId, events } = body;
  if (!isSessionId(sessionId)) return null;
  if (!Array.isArray(events) || events.length === 0 || events.length > MAX_EVENTS_PER_REQUEST) return null;

  const parsed: ParsedEvent[] = [];
  for (const raw of events) {
    const event = parseEvent(raw);
    if (!event) return null;
    parsed.push(event);
  }
  return { sessionId: sessionId.toLowerCase(), events: parsed };
}
