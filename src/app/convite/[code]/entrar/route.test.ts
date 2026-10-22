// @vitest-environment node
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { inviteCookieOptions } from '@/lib/auth/inviteCookie';
import { createServiceSupabase } from '@/lib/supabase/admin';
import { POST } from './route';

vi.mock('@/lib/supabase/admin', () => ({ createServiceSupabase: vi.fn() }));

const CODE = 'ABCDEFGH23';

type InviteRow = {
  used_by: string | null;
  used_at: string | null;
  inviter: { display_name: string; removed_at: string | null };
};

/** The service client answering `invites ... where code = CODE` with this row (null: no such invite). */
function arrange(row: InviteRow | null, error: { message: string } | null = null) {
  const maybeSingle = vi.fn(async () => ({ data: row, error }));
  const from = vi.fn(() => ({ select: () => ({ eq: () => ({ maybeSingle }) }) }));
  vi.mocked(createServiceSupabase).mockReturnValue({ from } as unknown as ReturnType<typeof createServiceSupabase>);
  return { from };
}

const OPEN: InviteRow = { used_by: null, used_at: null, inviter: { display_name: 'Maria', removed_at: null } };
const USED: InviteRow = {
  used_by: 'user-2',
  used_at: '2026-10-22T10:00:00Z',
  inviter: { display_name: 'Maria', removed_at: null },
};
const FROM_REMOVED: InviteRow = {
  ...OPEN,
  inviter: { display_name: 'Maria', removed_at: '2026-10-21T09:00:00Z' },
};

function post(code: string) {
  return POST(new NextRequest(`http://localhost:3000/convite/${encodeURIComponent(code)}/entrar`, { method: 'POST' }), {
    params: Promise.resolve({ code }),
  });
}

/** Where the response sends the browser, as a path. */
function destination(response: Response) {
  return new URL(response.headers.get('location') ?? '').pathname;
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe('POST /convite/[code]/entrar', () => {
  it('keeps a valid code in the invite cookie and sends the person to sign in', async () => {
    arrange(OPEN);

    const response = await post(CODE);

    // 303, so the browser follows the POST with a GET.
    expect(response.status).toBe(303);
    expect(destination(response)).toBe('/entrar');
    expect(response.cookies.get('hb_invite')).toMatchObject({ name: 'hb_invite', value: CODE, ...inviteCookieOptions() });
  });

  it('keeps the cookie out of reach of scripts and for a week', async () => {
    arrange(OPEN);

    const cookie = (await post(CODE)).cookies.get('hb_invite');

    expect(cookie).toMatchObject({ httpOnly: true, sameSite: 'lax', path: '/', maxAge: 7 * 24 * 60 * 60 });
  });

  it('sends a code someone already used back to the invite page, with no cookie', async () => {
    arrange(USED);

    const response = await post(CODE);

    expect(response.status).toBe(303);
    expect(destination(response)).toBe(`/convite/${CODE}`);
    expect(response.cookies.get('hb_invite')).toBeUndefined();
  });

  it('sends a code whose inviter was removed back to the invite page, with no cookie', async () => {
    arrange(FROM_REMOVED);

    const response = await post(CODE);

    expect(response.status).toBe(303);
    expect(destination(response)).toBe(`/convite/${CODE}`);
    expect(response.cookies.get('hb_invite')).toBeUndefined();
  });

  it('sends a code that does not exist back to the invite page, with no cookie', async () => {
    arrange(null);

    const response = await post(CODE);

    expect(destination(response)).toBe(`/convite/${CODE}`);
    expect(response.cookies.get('hb_invite')).toBeUndefined();
  });

  it('never stores something that is not an invite code, and never asks the database about it', async () => {
    const { from } = arrange(OPEN);

    const response = await post('NAOEXISTE1');

    expect(destination(response)).toBe('/convite/NAOEXISTE1');
    expect(response.cookies.get('hb_invite')).toBeUndefined();
    expect(from).not.toHaveBeenCalled();
  });

  it('writes a hostile code into the redirect safely encoded', async () => {
    arrange(OPEN);

    const response = await post('../../entrar?x=1#y');

    const location = new URL(response.headers.get('location') ?? '');
    expect(location.origin).toBe('http://localhost:3000');
    expect(location.pathname).toBe('/convite/..%2F..%2Fentrar%3Fx%3D1%23y');
    expect(response.cookies.get('hb_invite')).toBeUndefined();
  });

  it('fails, with no cookie, when the invite cannot be read', async () => {
    arrange(null, { message: 'connection refused' });

    await expect(post(CODE)).rejects.toThrow(/connection refused/);
  });
});
