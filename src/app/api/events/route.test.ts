// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createServiceSupabase } from '@/lib/supabase/admin';
import { createServerSupabase } from '@/lib/supabase/server';
import { POST } from './route';

vi.mock('@/lib/supabase/server', () => ({ createServerSupabase: vi.fn() }));
vi.mock('@/lib/supabase/admin', () => ({ createServiceSupabase: vi.fn() }));

const SESSION = '4f0c2a9e-7b1d-4c35-9a6e-0d2b8f5e1c77';

const insert = vi.fn();
const from = vi.fn(() => ({ insert }));

/** The member's own session client: who is signed in, and what is_member says for them. */
function sessionAs(userId: string | null, member: boolean) {
  const rpc = vi.fn(async () => ({ data: member, error: null }));
  const client = {
    auth: { getClaims: vi.fn(async () => ({ data: userId ? { claims: { sub: userId } } : null })) },
    rpc,
  };
  vi.mocked(createServerSupabase).mockResolvedValue(client as never);
  return { rpc };
}

function post(body: unknown = { sessionId: SESSION, events: [{ name: 'app_opened' }] }) {
  return POST(
    new Request('http://localhost:3000/api/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  insert.mockReset();
  insert.mockResolvedValue({ error: null });
  vi.mocked(createServiceSupabase).mockReturnValue({ from } as never);
});

describe('POST /api/events', () => {
  it('answers 204 for a member, writing app_events through the service key with the member’s own id', async () => {
    const { rpc } = sessionAs('user-1', true);

    const response = await post({
      sessionId: SESSION,
      user_id: 'attacker',
      events: [{ name: 'help_explain', youtubeId: 'aaaaaaaaaaa', mode: 'karaoke', props: { lineIndex: 2, user_id: 'attacker' } }],
    });

    expect(response.status).toBe(204);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(rpc).toHaveBeenCalledExactlyOnceWith('is_member');
    expect(createServiceSupabase).toHaveBeenCalledOnce();
    expect(from).toHaveBeenCalledExactlyOnceWith('app_events');
    expect(insert).toHaveBeenCalledExactlyOnceWith([
      { user_id: 'user-1', session_id: SESSION, name: 'help_explain', youtube_id: 'aaaaaaaaaaa', mode: 'karaoke', props: { lineIndex: 2 } },
    ]);
  });

  it('asks for the session once, for both the user and the membership', async () => {
    sessionAs('user-1', true);

    await post();

    expect(createServerSupabase).toHaveBeenCalledOnce();
  });

  it('answers 401 with no session, and never makes the service client', async () => {
    sessionAs(null, false);

    const response = await post();

    expect(response.status).toBe(401);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(createServiceSupabase).not.toHaveBeenCalled();
  });

  it('answers 403 when is_member, asked with the session, says no, and never makes the service client', async () => {
    sessionAs('user-2', false);

    const response = await post();

    expect(response.status).toBe(403);
    expect(createServiceSupabase).not.toHaveBeenCalled();
    expect(insert).not.toHaveBeenCalled();
  });

  it('answers 400 for an invalid request without making the service client', async () => {
    sessionAs('user-1', true);

    const response = await post({ sessionId: SESSION, events: [{ name: 'page_view' }] });

    expect(response.status).toBe(400);
    expect(createServiceSupabase).not.toHaveBeenCalled();
  });

  it('answers 503 with no-store when the database refuses the rows', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    sessionAs('user-1', true);
    insert.mockResolvedValue({ error: { message: 'permission denied' } });

    const response = await post();

    expect(response.status).toBe(503);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    warn.mockRestore();
  });

  it('answers 503 when the membership check fails', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { rpc } = sessionAs('user-1', true);
    rpc.mockResolvedValue({ data: null, error: { message: 'timeout' } } as never);

    expect((await post()).status).toBe(503);
    expect(createServiceSupabase).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('answers 503 with no-store when the session client cannot be made', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.mocked(createServerSupabase).mockRejectedValue(new Error('cookies() outside a request'));

    const response = await post();

    expect(response.status).toBe(503);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    warn.mockRestore();
  });
});
