import type { SupabaseClient } from '@supabase/supabase-js';
import { t } from '@/i18n/t';
import type { Database } from './database.types';

/** No 0/O, 1/I or L: the code is read off a screen and typed by hand now and then. */
export const INVITE_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const INVITE_CODE_LENGTH = 10;

// A random byte is 0..255, and 256 is not a multiple of the alphabet size, so `byte % size`
// alone would pick the first characters a little more often. Bytes from this value up are
// thrown away (rejection sampling); every byte below it maps to each character equally often.
const FIRST_REJECTED_BYTE = 256 - (256 % INVITE_CODE_ALPHABET.length);

export function generateInviteCode(): string {
  let code = '';
  while (code.length < INVITE_CODE_LENGTH) {
    for (const byte of crypto.getRandomValues(new Uint8Array(INVITE_CODE_LENGTH * 2))) {
      if (byte >= FIRST_REJECTED_BYTE) continue;
      code += INVITE_CODE_ALPHABET[byte % INVITE_CODE_ALPHABET.length];
      if (code.length === INVITE_CODE_LENGTH) break;
    }
  }
  return code;
}

const INVITE_CODE_PATTERN = new RegExp(`^[${INVITE_CODE_ALPHABET}]{${INVITE_CODE_LENGTH}}$`);

/** Whether `value` could be a code made by generateInviteCode. */
export function isInviteCode(value: string): boolean {
  return INVITE_CODE_PATTERN.test(value);
}

export function inviteUrl(code: string, baseUrl: string): string {
  return `${baseUrl}/convite/${code}`;
}

export function whatsappInviteUrl(code: string, baseUrl: string): string {
  const text = t('convidar.whatsappText', { url: inviteUrl(code, baseUrl) });
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

type Client = SupabaseClient<Database>;

const UNIQUE_VIOLATION = '23505';
// After the first try, a clash is tried again this many times. With 31^10 possible codes
// a single clash is already a freak event, so a few more tries are plenty.
const MAX_RETRIES_ON_CLASH = 3;

/**
 * Inserts a new, unused invite in the name of `userId` and returns its code, or null when it
 * could not be created. `supabase` must carry the member's own session: the insert is allowed
 * by row-level security only for a member creating an invite as themselves.
 */
export async function createInvite(supabase: Client, userId: string): Promise<string | null> {
  for (let attempt = 0; attempt <= MAX_RETRIES_ON_CLASH; attempt++) {
    const code = generateInviteCode();
    const { error } = await supabase.from('invites').insert({ code, created_by: userId });
    if (!error) return code;
    // Only a clash on the primary key is worth another try with a new code.
    if (error.code !== UNIQUE_VIOLATION) return null;
  }
  return null;
}

export type InviteLookup =
  | { state: 'valid'; inviterName: string }
  | { state: 'used' }
  | { state: 'not_found' };

/**
 * What the invite page may know about a code: its state and, while it is still open, the name
 * of who sent it. Nothing else leaves this function. Needs the service client, because
 * the person opening the link has no session and no right to read the table.
 *
 * An open invite whose sender was removed is "not found", as redeem_invite treats it (migration 0004): the link
 * cannot be redeemed, and the name of a member who is gone is not shown to a visitor. A used invite stays "used"
 * whoever sent it, since redeem_invite checks that first.
 */
export async function lookupInvite(admin: Client, code: string): Promise<InviteLookup> {
  // Anything that could not have been issued is "not found" without bothering the database.
  if (!isInviteCode(code)) return { state: 'not_found' };

  const { data, error } = await admin
    .from('invites')
    .select('used_by, used_at, inviter:profiles!invites_created_by_fkey(display_name, removed_at)')
    .eq('code', code)
    .maybeSingle();
  // A failed read is not a missing invite: let it surface instead of telling a friend their link is dead.
  if (error) throw new Error(`Could not read the invite: ${error.message}`);
  if (!data) return { state: 'not_found' };
  if (data.used_by !== null || data.used_at !== null) return { state: 'used' };
  if (data.inviter.removed_at !== null) return { state: 'not_found' };

  return { state: 'valid', inviterName: data.inviter.display_name };
}

export interface MyInvite {
  code: string;
  /** Name of the member who used it, or null while it is still waiting. */
  usedByName: string | null;
}

/**
 * The invites `userId` made, newest first. `supabase` carries that member's own session; the
 * row-level rules already show a member only their own invites, and the filter keeps that
 * true even if those rules are ever loosened.
 */
export async function listMyInvites(supabase: Client, userId: string): Promise<MyInvite[]> {
  const { data, error } = await supabase
    .from('invites')
    .select('code, used_by, used:profiles!invites_used_by_fkey(display_name)')
    .eq('created_by', userId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(`Could not read the invites: ${error.message}`);

  return data.map((row) => ({ code: row.code, usedByName: row.used?.display_name ?? null }));
}
