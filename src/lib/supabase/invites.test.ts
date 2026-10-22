import type { SupabaseClient } from '@supabase/supabase-js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Database } from './database.types';
import {
  createInvite,
  generateInviteCode,
  INVITE_CODE_ALPHABET,
  inviteUrl,
  isInviteCode,
  listMyInvites,
  lookupInvite,
  whatsappInviteUrl,
} from './invites';

describe('generateInviteCode', () => {
  it('has 10 characters from the alphabet without look-alikes', () => {
    expect(generateInviteCode()).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{10}$/);
  });

  it('never uses the characters that read the same (0 O 1 I L)', () => {
    for (const lookAlike of '01OIL') expect(INVITE_CODE_ALPHABET).not.toContain(lookAlike);
  });

  it('gives a different code each time', () => {
    const codes = new Set(Array.from({ length: 200 }, generateInviteCode));
    expect(codes.size).toBe(200);
  });

  describe('without modulo bias', () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    /** Makes crypto.getRandomValues hand out these bytes, in order, across calls. */
    function randomBytes(...bytes: number[]) {
      let next = 0;
      vi.spyOn(crypto, 'getRandomValues').mockImplementation(((array: Uint8Array) => {
        for (let i = 0; i < array.length; i++) array[i] = bytes[next++ % bytes.length];
        return array;
      }) as typeof crypto.getRandomValues);
    }

    it('maps a byte to the alphabet by its position', () => {
      // 31 is the alphabet length, so byte 31 wraps to the first character again.
      randomBytes(0, 1, 30, 31, 32, 247, 0, 0, 0, 0);

      expect(generateInviteCode()).toBe('AB' + '9' + 'A' + 'B' + INVITE_CODE_ALPHABET[247 % 31] + 'AAAA');
    });

    it('throws away bytes from 248 up, the ones that would favour the first characters', () => {
      // 248 = 31 * 8 is the largest multiple of 31 that fits in a byte. 248..255 would
      // make the first 8 characters more likely than the rest, so they are skipped.
      randomBytes(255, 254, 248, 248, 5, 255, 5, 5, 5, 5, 5, 5, 5, 5, 5);

      expect(generateInviteCode()).toBe(INVITE_CODE_ALPHABET[5].repeat(10));
    });

    it('asks for more bytes when too many are thrown away', () => {
      // 24 rejected bytes (more than one batch of random numbers), then ten accepted ones.
      randomBytes(...Array<number>(24).fill(250), ...Array<number>(10).fill(2));

      expect(generateInviteCode()).toBe(INVITE_CODE_ALPHABET[2].repeat(10));
    });
  });
});

describe('isInviteCode', () => {
  it('accepts what generateInviteCode makes', () => {
    expect(isInviteCode(generateInviteCode())).toBe(true);
    expect(isInviteCode('ABCDEFGH23')).toBe(true);
  });

  it.each([
    ['', 'empty'],
    ['ABCDEFGH2', 'one short'],
    ['ABCDEFGH234', 'one long'],
    ['abcdefgh23', 'lower case'],
    ['NAOEXISTE1', 'has characters outside the alphabet (O, I, 1)'],
    ['ABCDEFGH2\n', 'has a trailing newline'],
    ['ABCD%00FGH', 'has an escape sequence'],
  ])('rejects %j (%s)', (value) => {
    expect(isInviteCode(value)).toBe(false);
  });
});

describe('inviteUrl', () => {
  it('is the invite page under the base address', () => {
    expect(inviteUrl('ABCDEFGH23', 'https://hookbop.app')).toBe('https://hookbop.app/convite/ABCDEFGH23');
  });
});

describe('whatsappInviteUrl', () => {
  it('opens WhatsApp with the invitation text and the link', () => {
    expect(whatsappInviteUrl('ABCDEFGH23', 'https://hookbop.app')).toBe(
      'https://wa.me/?text=' +
        encodeURIComponent(
          'Bora jogar Hookbop comigo? Aprende inglês com música. Seu convite: https://hookbop.app/convite/ABCDEFGH23',
        ),
    );
  });
});

type Client = SupabaseClient<Database>;
const UNIQUE_VIOLATION = { code: '23505', message: 'duplicate key value violates unique constraint "invites_pkey"' };

describe('createInvite', () => {
  type Row = { code: string; created_by: string };
  type Result = { error: { code: string; message: string } | null };

  function clientWith(...results: Result[]) {
    const insert = vi.fn<(row: Row) => Promise<Result>>(async () => results.shift() ?? { error: null });
    const from = vi.fn(() => ({ insert }));
    return { client: { from } as unknown as Client, from, insert };
  }

  it('inserts a new code in the name of the member and returns it', async () => {
    const { client, from, insert } = clientWith({ error: null });

    const code = await createInvite(client, 'user-1');

    expect(code).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{10}$/);
    expect(from).toHaveBeenCalledWith('invites');
    expect(insert).toHaveBeenCalledExactlyOnceWith({ code, created_by: 'user-1' });
  });

  it('tries again with a new code when the code is already taken', async () => {
    const { client, insert } = clientWith({ error: UNIQUE_VIOLATION }, { error: UNIQUE_VIOLATION }, { error: null });

    const code = await createInvite(client, 'user-1');

    expect(insert).toHaveBeenCalledTimes(3);
    const tried = insert.mock.calls.map(([row]) => row.code);
    expect(new Set(tried).size).toBe(3);
    expect(code).toBe(tried[2]);
  });

  it('retries up to 3 times after the first attempt, then gives up', async () => {
    const { client, insert } = clientWith(
      { error: UNIQUE_VIOLATION },
      { error: UNIQUE_VIOLATION },
      { error: UNIQUE_VIOLATION },
      { error: UNIQUE_VIOLATION },
      { error: null },
    );

    expect(await createInvite(client, 'user-1')).toBeNull();
    expect(insert).toHaveBeenCalledTimes(4);
  });

  it('does not retry an error that is not a clash, such as a refused insert', async () => {
    const { client, insert } = clientWith({ error: { code: '42501', message: 'new row violates row-level security policy' } });

    expect(await createInvite(client, 'user-1')).toBeNull();
    expect(insert).toHaveBeenCalledTimes(1);
  });
});

describe('lookupInvite', () => {
  /** What the service-role client answers for `invites ... where code = ...`. */
  function adminWith(answer: { data: unknown; error: { message: string } | null }) {
    const maybeSingle = vi.fn(async () => answer);
    const eq = vi.fn(() => ({ maybeSingle }));
    const select = vi.fn(() => ({ eq }));
    const from = vi.fn(() => ({ select }));
    return { admin: { from } as unknown as Client, from, select, eq };
  }

  it('says a valid invite is valid and names who sent it', async () => {
    const { admin, from, eq } = adminWith({
      data: { used_by: null, used_at: null, inviter: { display_name: 'Maria', removed_at: null } },
      error: null,
    });

    expect(await lookupInvite(admin, 'ABCDEFGH23')).toEqual({ state: 'valid', inviterName: 'Maria' });
    expect(from).toHaveBeenCalledWith('invites');
    expect(eq).toHaveBeenCalledWith('code', 'ABCDEFGH23');
  });

  it('reads whether the inviter was removed, along with the name', async () => {
    const { admin, select } = adminWith({
      data: { used_by: null, used_at: null, inviter: { display_name: 'Maria', removed_at: null } },
      error: null,
    });

    await lookupInvite(admin, 'ABCDEFGH23');

    expect(select).toHaveBeenCalledExactlyOnceWith(expect.stringContaining('(display_name, removed_at)'));
  });

  it('says an open invite whose inviter was removed is not found, like redeem_invite does, and shows no name', async () => {
    const { admin } = adminWith({
      data: { used_by: null, used_at: null, inviter: { display_name: 'Maria', removed_at: '2026-10-21T09:00:00Z' } },
      error: null,
    });

    const lookup = await lookupInvite(admin, 'ABCDEFGH23');

    expect(lookup).toEqual({ state: 'not_found' });
    expect(JSON.stringify(lookup)).not.toContain('Maria');
  });

  it('still says used for an invite that was used, even when its inviter has since been removed', async () => {
    // redeem_invite checks "used" before the inviter, so the page tells the same story as the redeem.
    const { admin } = adminWith({
      data: {
        used_by: 'user-2',
        used_at: '2026-10-22T10:00:00Z',
        inviter: { display_name: 'Maria', removed_at: '2026-10-23T09:00:00Z' },
      },
      error: null,
    });

    expect(await lookupInvite(admin, 'ABCDEFGH23')).toEqual({ state: 'used' });
  });

  it('says an invite that someone already used is used, without naming anyone', async () => {
    const { admin } = adminWith({
      data: { used_by: 'user-2', used_at: '2026-10-22T10:00:00Z', inviter: { display_name: 'Maria' } },
      error: null,
    });

    expect(await lookupInvite(admin, 'ABCDEFGH23')).toEqual({ state: 'used' });
  });

  it('counts an invite as used when only used_at is set', async () => {
    const { admin } = adminWith({
      data: { used_by: null, used_at: '2026-10-22T10:00:00Z', inviter: { display_name: 'Maria' } },
      error: null,
    });

    expect(await lookupInvite(admin, 'ABCDEFGH23')).toEqual({ state: 'used' });
  });

  it('says a code with no invite is not found', async () => {
    const { admin } = adminWith({ data: null, error: null });

    expect(await lookupInvite(admin, 'ABCDEFGH23')).toEqual({ state: 'not_found' });
  });

  it('says a malformed code is not found without asking the database', async () => {
    const { admin, from } = adminWith({ data: null, error: null });

    expect(await lookupInvite(admin, 'NAOEXISTE1')).toEqual({ state: 'not_found' });
    expect(from).not.toHaveBeenCalled();
  });

  it('fails when the database cannot be read, instead of calling the invite missing', async () => {
    const { admin } = adminWith({ data: null, error: { message: 'connection refused' } });

    await expect(lookupInvite(admin, 'ABCDEFGH23')).rejects.toThrow(/connection refused/);
  });
});

describe('listMyInvites', () => {
  /** What the member's client answers for `invites ... where created_by = ... order by created_at desc`. */
  function clientWith(answer: { data: unknown; error: { message: string } | null }) {
    const order = vi.fn(async () => answer);
    const eq = vi.fn(() => ({ order }));
    const select = vi.fn(() => ({ eq }));
    const from = vi.fn(() => ({ select }));
    return { client: { from } as unknown as Client, from, eq, order };
  }

  it('lists the invites of the member, newest first, with the name of who used each one', async () => {
    const { client, from, eq, order } = clientWith({
      data: [
        { code: 'BBBBBBBB22', used_by: null, used: null },
        { code: 'AAAAAAAA22', used_by: 'user-2', used: { display_name: 'Joana' } },
      ],
      error: null,
    });

    expect(await listMyInvites(client, 'user-1')).toEqual([
      { code: 'BBBBBBBB22', usedByName: null },
      { code: 'AAAAAAAA22', usedByName: 'Joana' },
    ]);
    expect(from).toHaveBeenCalledWith('invites');
    // The row-level rules already limit this to the member's own invites; the filter says so out loud.
    expect(eq).toHaveBeenCalledWith('created_by', 'user-1');
    expect(order).toHaveBeenCalledWith('created_at', { ascending: false });
  });

  it('is empty for a member who made no invites', async () => {
    const { client } = clientWith({ data: [], error: null });

    expect(await listMyInvites(client, 'user-1')).toEqual([]);
  });

  it('fails when the invites cannot be read', async () => {
    const { client } = clientWith({ data: null, error: { message: 'permission denied' } });

    await expect(listMyInvites(client, 'user-1')).rejects.toThrow(/permission denied/);
  });
});
