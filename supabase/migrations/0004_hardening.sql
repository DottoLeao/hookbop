-- Hookbop: hardening before the closed beta (rulings R81 and R82).

-- ---------------------------------------------------------------------------
-- videos: written by the server only (ruling R81)
-- ---------------------------------------------------------------------------

-- 0001 let every member add and update videos, so any member could rewrite the lyrics, the status or the title of
-- a song for everyone, and the help route's line check (ruling R61) would then trust what they planted. Songs are
-- now resolved by POST /api/song, which writes these rows with the service key. Members keep reading them through
-- the select policy, and the offset still changes through set_offset_vote, a security definer function.

drop policy "members add videos" on public.videos;
drop policy "members update videos" on public.videos;

revoke insert, update on public.videos from authenticated;

-- ---------------------------------------------------------------------------
-- Functions: defense in depth (ruling R82)
-- ---------------------------------------------------------------------------
-- Each one is recreated whole from 0001 with its changes: one for set_offset_vote and for ensure_owner, two for
-- redeem_invite (see "New in 0004" above each). They stay security definer with an empty search_path and fully
-- qualified names, and their grants are restated at the end (create or replace keeps them anyway).

-- Records the caller's vote for a video's lyrics offset, then stores the median of all votes in videos.offset_ms and
-- returns it. With an even number of votes the median is the mean of the two middle ones; the result is rounded to a
-- whole ms.
--
-- New in 0004: a vote must be within 30 s either way (22023 otherwise, and for no vote at all). The median keeps one
-- wild vote from moving the offset, but nothing kept a member from voting any number, and a few such votes could.
create or replace function public.set_offset_vote(p_youtube_id text, p_offset_ms int)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  c_max_offset_ms constant int := 30000;
  v_median int;
begin
  if not public.is_member() then
    raise exception 'only members can vote' using errcode = '42501';
  end if;

  if p_offset_ms is null or p_offset_ms not between -c_max_offset_ms and c_max_offset_ms then
    raise exception 'an offset vote must be within 30 s either way' using errcode = '22023';
  end if;

  -- Locking the video row makes concurrent votes on it queue up, so the last one
  -- to commit also computes its median from every earlier vote.
  perform 1 from public.videos v where v.youtube_id = p_youtube_id for update;
  if not found then
    raise exception 'unknown video' using errcode = 'P0002';
  end if;

  insert into public.video_offset_votes (youtube_id, user_id, offset_ms)
  values (p_youtube_id, auth.uid(), p_offset_ms)
  on conflict (youtube_id, user_id) do update set offset_ms = excluded.offset_ms;

  -- numeric so that a .5 tie rounds away from zero instead of depending on the platform
  select round((percentile_cont(0.5) within group (order by o.offset_ms))::numeric)::int
  into v_median
  from public.video_offset_votes o
  where o.youtube_id = p_youtube_id;

  update public.videos
  set offset_ms = v_median, updated_at = now()
  where youtube_id = p_youtube_id;

  return v_median;
end;
$$;

-- Creates (or repairs) the owner profile when the signed-in e-mail is the owner_email setting. Returns whether the
-- caller is the owner.
--
-- New in 0004: the e-mail of the token is trusted only when the caller's own row in auth.users has that address and
-- it is confirmed (email_confirmed_at). Until now this relied on "Confirm email" (enable_confirmations in
-- supabase/config.toml) staying on in every project: with it off, anyone could sign up with the owner's address and
-- become owner. That setting should still stay on; this check no longer depends on it.
create or replace function public.ensure_owner()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_email text := lower(auth.jwt() ->> 'email');
  v_owner_email text;
begin
  if v_uid is null or v_email is null then
    return false;
  end if;

  select lower(c.value) into v_owner_email
  from public.app_config c
  where c.key = 'owner_email';

  if v_owner_email is null or v_owner_email <> v_email then
    return false;
  end if;

  if not exists (
    select 1
    from auth.users u
    where u.id = v_uid and lower(u.email) = v_owner_email and u.email_confirmed_at is not null
  ) then
    return false;
  end if;

  insert into public.profiles (id, display_name, is_owner)
  values (v_uid, split_part(v_email, '@', 1), true)
  on conflict (id) do update set is_owner = true, removed_at = null;

  return true;
end;
$$;

-- Turns an invite code into a profile.
-- Returns ok | already_member | removed | used | not_found | full.
-- Raises 28000 without a signed-in user and 22023 for a blank display name.
--
-- New in 0004:
--  - the display name is trimmed, cut to 40 characters and trimmed again;
--  - a code whose inviter is no longer an active member is refused as not_found, and is not burnt. Removing a member
--    takes their unused invites with them, without saying to whoever holds one why.
create or replace function public.redeem_invite(p_code text, p_display_name text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  -- One fixed key serializes every redemption. Without it two people could claim
  -- the same code, or take the last two slots at once, because each would count
  -- members and read the invite before the other one committed.
  c_lock_key constant bigint := 7241022001;
  c_max_name_length constant int := 40;
  v_uid uuid := auth.uid();
  v_removed_at timestamptz;
  v_invite public.invites%rowtype;
  v_cap int;
  v_name text := nullif(btrim(left(btrim(coalesce(p_display_name, '')), c_max_name_length)), '');
begin
  if v_uid is null then
    raise exception 'redeem_invite needs a signed-in user' using errcode = '28000';
  end if;

  perform pg_advisory_xact_lock(c_lock_key);

  select p.removed_at into v_removed_at
  from public.profiles p
  where p.id = v_uid;
  if found then
    return case when v_removed_at is null then 'already_member' else 'removed' end;
  end if;

  select * into v_invite
  from public.invites i
  where i.code = p_code;
  if not found then
    return 'not_found';
  end if;
  if v_invite.used_by is not null or v_invite.used_at is not null then
    return 'used';
  end if;

  if not exists (
    select 1
    from public.profiles p
    where p.id = v_invite.created_by and p.removed_at is null
  ) then
    return 'not_found';
  end if;

  select coalesce(
    (select c.value::int from public.app_config c where c.key = 'member_cap'),
    50
  ) into v_cap;
  if (select count(*) from public.profiles p where p.removed_at is null) >= v_cap then
    return 'full';
  end if;

  if v_name is null then
    raise exception 'display name is required' using errcode = '22023';
  end if;

  insert into public.profiles (id, display_name) values (v_uid, v_name);
  update public.invites set used_by = v_uid, used_at = now() where code = p_code;

  return 'ok';
end;
$$;

-- The same grants as 0001: signed-in users only.
revoke all on function public.set_offset_vote(text, int) from public, anon;
revoke all on function public.ensure_owner() from public, anon;
revoke all on function public.redeem_invite(text, text) from public, anon;

grant execute on function public.set_offset_vote(text, int) to authenticated;
grant execute on function public.ensure_owner() to authenticated;
grant execute on function public.redeem_invite(text, text) to authenticated;
