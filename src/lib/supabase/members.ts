import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

type Client = SupabaseClient<Database>;

export interface Member {
  id: string;
  displayName: string;
  joinedAt: string;
  isOwner: boolean;
}

/**
 * Everyone with access: the profiles that were not removed, oldest first. This is the same
 * count redeem_invite checks against the cap. Members may read every profile, so any
 * member's client works.
 */
export async function listActiveMembers(supabase: Client): Promise<Member[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, display_name, created_at, is_owner')
    .is('removed_at', null)
    .order('created_at', { ascending: true });
  if (error) throw new Error(`Could not read the members: ${error.message}`);

  return data.map((row) => ({
    id: row.id,
    displayName: row.display_name,
    joinedAt: row.created_at,
    isOwner: row.is_owner,
  }));
}

/** What redeem_invite assumes when the member_cap setting does not exist. */
export const DEFAULT_MEMBER_CAP = 50;

/**
 * How many members the app accepts. The setting lives in app_config, which no member may
 * read, so this takes the service client. Only the number leaves it.
 */
export async function memberCap(admin: Client): Promise<number> {
  const { data, error } = await admin.from('app_config').select('value').eq('key', 'member_cap').maybeSingle();
  if (error) throw new Error(`Could not read the member cap: ${error.message}`);

  const cap = Number(data?.value);
  return Number.isInteger(cap) && cap > 0 ? cap : DEFAULT_MEMBER_CAP;
}

/**
 * Whether `userId` is the owner among the active members. A removed owner is not in the list, so is not the owner
 * here. The owner's page (/admin) and the home page's "Admin" link both ask this, so they never disagree.
 */
export function isActiveOwner(members: Member[], userId: string | null): boolean {
  return members.some((member) => member.id === userId && member.isOwner);
}
