// @vitest-environment node
import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import type { Database } from '@/lib/supabase/database.types';
import { completeSignIn } from './completeSignIn';

const MARIA = { email: 'maria.silva@gmail.com', user_metadata: { full_name: 'Maria Silva' } };

type Answer = { data: boolean | string | null; error: { message: string } | null };

function clientAnswering(answers: { ensure_owner?: Answer; redeem_invite?: Answer }) {
  const rpc = vi.fn(async (name: 'ensure_owner' | 'redeem_invite') => {
    const answer = answers[name];
    if (!answer) throw new Error(`unexpected rpc ${name}`);
    return answer;
  });
  return { supabase: { rpc } as unknown as SupabaseClient<Database>, rpc };
}

const notOwner: Answer = { data: false, error: null };
const owner: Answer = { data: true, error: null };

describe('completeSignIn', () => {
  it('lets the owner in and never touches an invite', async () => {
    const { supabase, rpc } = clientAnswering({ ensure_owner: owner });

    const outcome = await completeSignIn(supabase, MARIA, 'CODE123');

    expect(outcome).toEqual({ path: '/', clearInviteCookie: true });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('ensure_owner');
  });

  it('has nothing to clear for the owner who came without an invite', async () => {
    const { supabase } = clientAnswering({ ensure_owner: owner });

    expect(await completeSignIn(supabase, MARIA, undefined)).toEqual({ path: '/', clearInviteCookie: false });
  });

  it('sends a returning member without an invite to the app and redeems nothing', async () => {
    const { supabase, rpc } = clientAnswering({ ensure_owner: notOwner });

    const outcome = await completeSignIn(supabase, MARIA, undefined);

    expect(outcome).toEqual({ path: '/', clearInviteCookie: false });
    expect(rpc).not.toHaveBeenCalledWith('redeem_invite', expect.anything());
  });

  it('redeems the invite in the Google name and lets an ok through', async () => {
    const { supabase, rpc } = clientAnswering({ ensure_owner: notOwner, redeem_invite: { data: 'ok', error: null } });

    const outcome = await completeSignIn(supabase, MARIA, 'CODE123');

    expect(rpc).toHaveBeenCalledWith('redeem_invite', { p_code: 'CODE123', p_display_name: 'Maria Silva' });
    expect(outcome).toEqual({ path: '/', clearInviteCookie: true });
  });

  it('names a magic-link member after the part of the e-mail before the @', async () => {
    const { supabase, rpc } = clientAnswering({ ensure_owner: notOwner, redeem_invite: { data: 'ok', error: null } });

    await completeSignIn(supabase, { email: 'joao@x.com', user_metadata: {} }, 'CODE123');

    expect(rpc).toHaveBeenCalledWith('redeem_invite', { p_code: 'CODE123', p_display_name: 'joao' });
  });

  it('lets an already_member through', async () => {
    const { supabase } = clientAnswering({
      ensure_owner: notOwner,
      redeem_invite: { data: 'already_member', error: null },
    });

    expect((await completeSignIn(supabase, MARIA, 'CODE123')).path).toBe('/');
  });

  it.each(['used', 'full', 'removed', 'not_found'])('sends "%s" back to sign-in and spends the cookie', async (result) => {
    const { supabase } = clientAnswering({ ensure_owner: notOwner, redeem_invite: { data: result, error: null } });

    expect(await completeSignIn(supabase, MARIA, 'CODE123')).toEqual({
      path: `/entrar?estado=${result}`,
      clearInviteCookie: true,
    });
  });

  it('keeps the cookie when redeem_invite fails, so signing in again can retry, and the sign-in page says why', async () => {
    const { supabase } = clientAnswering({
      ensure_owner: notOwner,
      redeem_invite: { data: null, error: { message: 'connection reset' } },
    });

    expect(await completeSignIn(supabase, MARIA, 'CODE123')).toEqual({
      path: '/entrar?erro=servico',
      clearInviteCookie: false,
    });
  });

  it('keeps the cookie and stops when ensure_owner fails, and the sign-in page says why', async () => {
    const { supabase, rpc } = clientAnswering({ ensure_owner: { data: null, error: { message: 'boom' } } });

    expect(await completeSignIn(supabase, MARIA, 'CODE123')).toEqual({
      path: '/entrar?erro=servico',
      clearInviteCookie: false,
    });
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it('says the same when ensure_owner fails for someone who came without an invite', async () => {
    const { supabase } = clientAnswering({ ensure_owner: { data: null, error: { message: 'boom' } } });

    expect(await completeSignIn(supabase, MARIA, undefined)).toEqual({
      path: '/entrar?erro=servico',
      clearInviteCookie: false,
    });
  });
});
