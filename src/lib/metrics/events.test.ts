// @vitest-environment node
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ALLOWED_PROPS,
  EVENT_NAMES,
  MAX_EVENTS_PER_REQUEST,
  isSessionId,
  parseEventsRequest,
} from './events';

const SESSION = '4f0c2a9e-7b1d-4c35-9a6e-0d2b8f5e1c77';
const ID = 'aaaaaaaaaaa';

/** The thirteen actions of the brief, in its order. */
const THE_THIRTEEN = [
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
];

function request(events: unknown[], sessionId: unknown = SESSION) {
  return { sessionId, events };
}

describe('the list of actions', () => {
  it('is the thirteen of the brief', () => {
    expect([...EVENT_NAMES]).toEqual(THE_THIRTEEN);
  });

  it('is the list the database accepts: the check on app_events.name in the migration', () => {
    const sql = readFileSync(join(process.cwd(), 'supabase/migrations/0006_metrics.sql'), 'utf8');
    const check = /create table public\.app_events \([\s\S]*?check \(name in \(([\s\S]*?)\)\)/.exec(sql);
    expect(check).not.toBeNull();

    const inMigration = [...check![1].matchAll(/'([a-z_]+)'/g)].map((match) => match[1]);

    expect(inMigration).toEqual([...EVENT_NAMES]);
  });

  it('lets only the three fields of a finished game, and the line of a help request, into props', () => {
    expect(ALLOWED_PROPS.game_finished).toEqual(['pct', 'durationMs', 'totalBlanks']);
    expect(ALLOWED_PROPS.help_explain).toEqual(['lineIndex']);
    expect(ALLOWED_PROPS.help_translate).toEqual(['lineIndex']);
    for (const name of EVENT_NAMES) {
      if (name !== 'game_finished' && name !== 'help_explain' && name !== 'help_translate') {
        expect(ALLOWED_PROPS[name], name).toEqual([]);
      }
    }
  });
});

describe('isSessionId', () => {
  it('takes a uuid, in either case, and nothing else', () => {
    expect(isSessionId(SESSION)).toBe(true);
    expect(isSessionId(SESSION.toUpperCase())).toBe(true);
    for (const bad of ['', 'abc', SESSION.slice(1), `${SESSION}0`, `x${SESSION}`, null, undefined, 7, {}]) {
      expect(isSessionId(bad), String(bad)).toBe(false);
    }
  });
});

describe('parseEventsRequest', () => {
  it('turns a valid request into events with their session, the missing parts null and props empty', () => {
    expect(parseEventsRequest(request([{ name: 'app_opened' }]))).toEqual({
      sessionId: SESSION,
      events: [{ name: 'app_opened', youtubeId: null, mode: null, props: {} }],
    });
  });

  it('keeps the song and the mode of an event', () => {
    const parsed = parseEventsRequest(request([{ name: 'game_started', youtubeId: ID, mode: 'montar' }]));

    expect(parsed?.events[0]).toEqual({ name: 'game_started', youtubeId: ID, mode: 'montar', props: {} });
  });

  it('refuses a name that is not on the list', () => {
    expect(parseEventsRequest(request([{ name: 'app_opened' }, { name: 'page_view' }]))).toBeNull();
    expect(parseEventsRequest(request([{ name: 'APP_OPENED' }]))).toBeNull();
    expect(parseEventsRequest(request([{ name: 'toString' }]))).toBeNull();
    expect(parseEventsRequest(request([{ name: 7 }]))).toBeNull();
    expect(parseEventsRequest(request([{}]))).toBeNull();
  });

  it('accepts every name on the list', () => {
    for (const name of EVENT_NAMES) {
      expect(parseEventsRequest(request([{ name }]))?.events[0].name, name).toBe(name);
    }
  });

  it('drops the props an action may not carry, and keeps the ones it may', () => {
    const parsed = parseEventsRequest(
      request([
        { name: 'game_finished', props: { pct: 80, durationMs: 61000, totalBlanks: 12, email: 'a@b.c', lineIndex: 3, name: 'Ana' } },
        { name: 'help_explain', props: { lineIndex: 4, pct: 90, target: 'river' } },
        { name: 'help_translate', props: { lineIndex: 0, durationMs: 5 } },
        { name: 'game_started', props: { pct: 100, lineIndex: 1 } },
        { name: 'app_opened', props: { anything: 1 } },
      ]),
    );

    expect(parsed?.events.map((event) => event.props)).toEqual([
      { pct: 80, durationMs: 61000, totalBlanks: 12 },
      { lineIndex: 4 },
      { lineIndex: 0 },
      {},
      {},
    ]);
  });

  it('drops an allowed prop that is not a plain non-negative number, or a score past 100', () => {
    const parsed = parseEventsRequest(
      request([
        { name: 'game_finished', props: { pct: '80', durationMs: -5, totalBlanks: null } },
        { name: 'game_finished', props: { pct: 101, durationMs: 0, totalBlanks: 0 } },
        { name: 'help_explain', props: { lineIndex: { $gt: 0 } } },
      ]),
    );

    expect(parsed?.events.map((event) => event.props)).toEqual([{}, { durationMs: 0, totalBlanks: 0 }, {}]);
  });

  it('is not fooled by props that are not an object', () => {
    for (const props of [null, 'pct', 5, [1, 2], true]) {
      expect(parseEventsRequest(request([{ name: 'game_finished', props }]))?.events[0].props, String(props)).toEqual({});
    }
  });

  it('never copies a field it does not know, a user_id included', () => {
    const parsed = parseEventsRequest({
      sessionId: SESSION,
      user_id: 'someone-else',
      events: [{ name: 'app_opened', user_id: 'someone-else', userId: 'someone-else', created_at: '2001-01-01' }],
    });

    expect(parsed).toEqual({
      sessionId: SESSION,
      events: [{ name: 'app_opened', youtubeId: null, mode: null, props: {} }],
    });
  });

  it('refuses more than 20 events, and takes exactly 20', () => {
    const many = (n: number) => request(Array.from({ length: n }, () => ({ name: 'app_opened' })));

    expect(MAX_EVENTS_PER_REQUEST).toBe(20);
    expect(parseEventsRequest(many(21))).toBeNull();
    expect(parseEventsRequest(many(20))?.events).toHaveLength(20);
  });

  it('refuses a request with no events', () => {
    expect(parseEventsRequest(request([]))).toBeNull();
  });

  it('refuses a session that is not a uuid', () => {
    expect(parseEventsRequest(request([{ name: 'app_opened' }], 'not-a-uuid'))).toBeNull();
    expect(parseEventsRequest({ events: [{ name: 'app_opened' }] })).toBeNull();
    expect(parseEventsRequest(request([{ name: 'app_opened' }], 12))).toBeNull();
  });

  it('writes the session in lowercase', () => {
    expect(parseEventsRequest(request([{ name: 'app_opened' }], SESSION.toUpperCase()))?.sessionId).toBe(SESSION);
  });

  it('refuses a song that is not a YouTube id and a mode that is not one of the four', () => {
    expect(parseEventsRequest(request([{ name: 'song_opened', youtubeId: 'short' }]))).toBeNull();
    expect(parseEventsRequest(request([{ name: 'song_opened', youtubeId: 'https://youtu.be/aaaaaaaaaaa' }]))).toBeNull();
    expect(parseEventsRequest(request([{ name: 'song_opened', youtubeId: 12 }]))).toBeNull();
    expect(parseEventsRequest(request([{ name: 'mode_selected', mode: 'freestyle' }]))).toBeNull();
    expect(parseEventsRequest(request([{ name: 'mode_selected', mode: 4 }]))).toBeNull();
    for (const mode of ['escolha', 'digitacao', 'karaoke', 'montar']) {
      expect(parseEventsRequest(request([{ name: 'mode_selected', mode }]))?.events[0].mode, mode).toBe(mode);
    }
  });

  it('takes null, as well as nothing, for a song or a mode that an action does not have', () => {
    const parsed = parseEventsRequest(request([{ name: 'app_opened', youtubeId: null, mode: null, props: null }]));

    expect(parsed?.events[0]).toEqual({ name: 'app_opened', youtubeId: null, mode: null, props: {} });
  });

  it('refuses what is not a request: not an object, no events, events that are not a list or not objects', () => {
    for (const body of [null, undefined, 'x', 5, [], { sessionId: SESSION }, { sessionId: SESSION, events: 'app_opened' }]) {
      expect(parseEventsRequest(body), JSON.stringify(body)).toBeNull();
    }
    expect(parseEventsRequest(request(['app_opened']))).toBeNull();
    expect(parseEventsRequest(request([null]))).toBeNull();
    expect(parseEventsRequest(request([['app_opened']]))).toBeNull();
  });
});
