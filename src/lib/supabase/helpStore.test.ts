import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import { HELP_BUDGET_PER_HOUR, type HelpRequest } from '@/lib/help/helpService';
import type { Database } from './database.types';
import { createSupabaseHelpStore } from './helpStore';

type Client = SupabaseClient<Database>;

// An invented line, not a lyric.
const ASK: HelpRequest = {
  youtubeId: 'aaaaaaaaaaa',
  lyricsRef: '777',
  lineIndex: 2,
  lineText: 'Paper boats on a river of light',
  kind: 'explain',
  target: 'river',
};

/**
 * A query builder that records every filter and answers `answer` once awaited, whatever the chain. `from` gives one
 * per table call.
 */
function fakeAdmin(answer: { data?: unknown; error?: { message: string } | null; count?: number | null }) {
  const calls: { table: string; steps: [string, ...unknown[]][] }[] = [];
  const from = vi.fn((table: string) => {
    const call = { table, steps: [] as [string, ...unknown[]][] };
    calls.push(call);
    const builder: Record<string, unknown> = {};
    for (const step of ['select', 'eq', 'gte', 'maybeSingle', 'upsert', 'insert']) {
      builder[step] = (...args: unknown[]) => {
        call.steps.push([step, ...args]);
        return builder;
      };
    }
    builder.then = (resolve: (value: unknown) => void) =>
      resolve({ data: answer.data ?? null, error: answer.error ?? null, count: answer.count ?? null });
    return builder;
  });
  const rpc = vi.fn(async (name: string, args: unknown) => {
    calls.push({ table: `rpc:${name}`, steps: [['args', args]] });
    return { data: answer.data ?? null, error: answer.error ?? null };
  });
  return { admin: { from, rpc } as unknown as Client, calls };
}

describe('createSupabaseHelpStore', () => {
  describe('getCached', () => {
    it('reads the help of that line, kind and target from line_help', async () => {
      const { admin, calls } = fakeAdmin({ data: { content: 'Rio, aqui.' } });

      expect(await createSupabaseHelpStore(admin).getCached(ASK)).toBe('Rio, aqui.');
      expect(calls).toEqual([
        {
          table: 'line_help',
          steps: [
            ['select', 'content'],
            ['eq', 'youtube_id', 'aaaaaaaaaaa'],
            ['eq', 'lyrics_ref', '777'],
            ['eq', 'line_index', 2],
            ['eq', 'kind', 'explain'],
            ['eq', 'target', 'river'],
            ['maybeSingle'],
          ],
        },
      ]);
    });

    it('is null when the line has no such help yet', async () => {
      const { admin } = fakeAdmin({ data: null });

      expect(await createSupabaseHelpStore(admin).getCached(ASK)).toBeNull();
    });

    it('fails when the cache cannot be read', async () => {
      const { admin } = fakeAdmin({ error: { message: 'permission denied' } });

      await expect(createSupabaseHelpStore(admin).getCached(ASK)).rejects.toThrow(/permission denied/);
    });
  });

  describe('saveCached', () => {
    it('adds the help to line_help, leaving a row another member saved first as it is', async () => {
      const { admin, calls } = fakeAdmin({});

      await createSupabaseHelpStore(admin).saveCached(ASK, 'Rio, aqui.');

      expect(calls).toEqual([
        {
          table: 'line_help',
          steps: [
            [
              'upsert',
              {
                youtube_id: 'aaaaaaaaaaa',
                lyrics_ref: '777',
                line_index: 2,
                kind: 'explain',
                target: 'river',
                content: 'Rio, aqui.',
              },
              { onConflict: 'youtube_id,lyrics_ref,line_index,kind,target', ignoreDuplicates: true },
            ],
          ],
        },
      ]);
    });

    it('fails when the help cannot be saved', async () => {
      const { admin } = fakeAdmin({ error: { message: 'disk full' } });

      await expect(createSupabaseHelpStore(admin).saveCached(ASK, 'x')).rejects.toThrow(/disk full/);
    });
  });

  describe('reserve', () => {
    it('takes one request of the member\u2019s budget for that kind, with the hourly limit of the kind', async () => {
      const { admin, calls } = fakeAdmin({ data: 17 });

      expect(await createSupabaseHelpStore(admin).reserve('user-1', 'explain')).toBe(17);
      expect(calls).toEqual([
        {
          table: 'rpc:reserve_help_request',
          steps: [['args', { p_user_id: 'user-1', p_kind: 'explain', p_limit: HELP_BUDGET_PER_HOUR.explain }]],
        },
      ]);
    });

    it('asks with the limit of translations for a translation', async () => {
      const { admin, calls } = fakeAdmin({ data: 18 });

      await createSupabaseHelpStore(admin).reserve('user-1', 'translate');

      expect(calls[0].steps[0][1]).toEqual({
        p_user_id: 'user-1',
        p_kind: 'translate',
        p_limit: HELP_BUDGET_PER_HOUR.translate,
      });
    });

    it('is null when the budget has no request left', async () => {
      const { admin } = fakeAdmin({ data: null });

      expect(await createSupabaseHelpStore(admin).reserve('user-1', 'explain')).toBeNull();
    });

    it('fails when the budget cannot be read', async () => {
      const { admin } = fakeAdmin({ error: { message: 'timeout' } });

      await expect(createSupabaseHelpStore(admin).reserve('user-1', 'explain')).rejects.toThrow(/timeout/);
    });
  });

  describe('release', () => {
    it('gives the reservation back', async () => {
      const { admin, calls } = fakeAdmin({});

      await createSupabaseHelpStore(admin).release(17);

      expect(calls).toEqual([{ table: 'rpc:release_help_request', steps: [['args', { p_id: 17 }]] }]);
    });

    it('fails when the reservation cannot be given back', async () => {
      const { admin } = fakeAdmin({ error: { message: 'nope' } });

      await expect(createSupabaseHelpStore(admin).release(17)).rejects.toThrow(/nope/);
    });
  });

  describe('getVideo', () => {
    it('reads what the line check needs from the video row', async () => {
      const { admin, calls } = fakeAdmin({
        data: { status: 'ok', lyrics_ref: '777', lyrics_lrc: '[00:01.00]Paper boats', lyrics_duration_s: 30 },
      });

      expect(await createSupabaseHelpStore(admin).getVideo('aaaaaaaaaaa')).toEqual({
        status: 'ok',
        lyricsRef: '777',
        lyricsLrc: '[00:01.00]Paper boats',
        lyricsDurationS: 30,
      });
      expect(calls).toEqual([
        {
          table: 'videos',
          steps: [
            ['select', 'status, lyrics_ref, lyrics_lrc, lyrics_duration_s'],
            ['eq', 'youtube_id', 'aaaaaaaaaaa'],
            ['maybeSingle'],
          ],
        },
      ]);
    });

    it('is null for a video the app does not know', async () => {
      const { admin } = fakeAdmin({ data: null });

      expect(await createSupabaseHelpStore(admin).getVideo('aaaaaaaaaaa')).toBeNull();
    });

    it('fails when the video cannot be read', async () => {
      const { admin } = fakeAdmin({ error: { message: 'gone' } });

      await expect(createSupabaseHelpStore(admin).getVideo('aaaaaaaaaaa')).rejects.toThrow(/gone/);
    });
  });
});
