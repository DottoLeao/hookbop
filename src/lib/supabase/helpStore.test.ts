import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import type { HelpRequest } from '@/lib/help/helpService';
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
  return { admin: { from } as unknown as Client, calls };
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

  describe('countRecent', () => {
    it('counts the requests of the member since that time, without reading the rows', async () => {
      const { admin, calls } = fakeAdmin({ count: 12 });
      const since = Date.parse('2026-10-22T11:00:00.000Z');

      expect(await createSupabaseHelpStore(admin).countRecent('user-1', since)).toBe(12);
      expect(calls).toEqual([
        {
          table: 'help_requests',
          steps: [
            ['select', 'id', { count: 'exact', head: true }],
            ['eq', 'user_id', 'user-1'],
            ['gte', 'created_at', '2026-10-22T11:00:00.000Z'],
          ],
        },
      ]);
    });

    it('fails when the requests cannot be counted', async () => {
      const { admin } = fakeAdmin({ error: { message: 'timeout' } });

      await expect(createSupabaseHelpStore(admin).countRecent('user-1', 0)).rejects.toThrow(/timeout/);
    });
  });

  describe('logRequest', () => {
    it('adds one request of the member to help_requests', async () => {
      const { admin, calls } = fakeAdmin({});

      await createSupabaseHelpStore(admin).logRequest('user-1');

      expect(calls).toEqual([{ table: 'help_requests', steps: [['insert', { user_id: 'user-1' }]] }]);
    });

    it('fails when the request cannot be recorded', async () => {
      const { admin } = fakeAdmin({ error: { message: 'nope' } });

      await expect(createSupabaseHelpStore(admin).logRequest('user-1')).rejects.toThrow(/nope/);
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
