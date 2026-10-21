-- Hookbop core schema: tables, access rules (RLS) and the database functions
-- behind login, invites and offset calibration.
--
-- Access model: the app is invite only. A "member" is a user with a profile that
-- has not been removed (see is_member). Writes that must not come from a browser
-- (line_help, help_requests, app_config) have no policy at all and no grant for
-- anon/authenticated, so only the service key, which bypasses RLS, can touch them.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

-- Server-side settings. Read only by the security definer functions below and by
-- the service key; never exposed to members, because it holds the owner e-mail.
create table public.app_config (
  key text primary key,
  value text not null
);

create table public.profiles (
  id uuid primary key references auth.users (id),
  display_name text not null,
  is_owner boolean not null default false,
  created_at timestamptz not null default now(),
  removed_at timestamptz
);

create table public.invites (
  code text primary key,
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  used_by uuid references public.profiles (id),
  used_at timestamptz
);

create index invites_created_by_idx on public.invites (created_by);
create index invites_used_by_idx on public.invites (used_by);

create table public.videos (
  youtube_id text primary key,
  title text,
  channel text,
  duration_s int,
  yt_fetched_at timestamptz,
  status text check (status in ('ok', 'no_lyrics')),
  lyrics_source text,
  lyrics_ref text,
  lyrics_lrc text,
  lyrics_duration_s int,
  offset_ms int not null default 0,
  updated_at timestamptz not null default now()
);

create table public.video_offset_votes (
  youtube_id text not null references public.videos (youtube_id),
  user_id uuid not null references public.profiles (id),
  offset_ms int not null,
  created_at timestamptz not null default now(),
  primary key (youtube_id, user_id)
);

create index video_offset_votes_user_id_idx on public.video_offset_votes (user_id);

create table public.plays (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id),
  youtube_id text not null references public.videos (youtube_id),
  mode text,
  difficulty text,
  total_blanks int,
  first_try_correct int,
  pct int,
  max_combo int,
  xp int,
  double_xp_used boolean not null default false,
  time_to_ready_ms int,
  created_at timestamptz not null default now()
);

create index plays_user_id_idx on public.plays (user_id);
create index plays_youtube_id_idx on public.plays (youtube_id);

create table public.answers (
  play_id uuid not null references public.plays (id) on delete cascade,
  blank_id text not null,
  kind text not null check (kind in ('first', 'retry', 'helped')),
  correct boolean not null,
  before_line_end boolean
);

create index answers_play_id_idx on public.answers (play_id);

-- Cache of AI help, one row per line. Written only with the service key.
create table public.line_help (
  youtube_id text not null,
  lyrics_ref text not null,
  line_index int not null,
  kind text not null check (kind in ('explain', 'translate')),
  target text not null default '',
  content text not null,
  created_at timestamptz not null default now(),
  primary key (youtube_id, lyrics_ref, line_index, kind, target)
);

-- One row per AI help request, for rate limiting. Written only with the service key.
create table public.help_requests (
  id bigserial primary key,
  user_id uuid not null,
  created_at timestamptz not null default now()
);

create index help_requests_user_id_created_at_idx on public.help_requests (user_id, created_at);

-- ---------------------------------------------------------------------------
-- Functions (security definer: they read tables the caller has no access to)
-- ---------------------------------------------------------------------------

-- True when the signed-in user has a profile that was not removed.
create function public.is_member()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid() and p.removed_at is null
  );
$$;

-- Creates (or repairs) the owner profile when the signed-in e-mail is the
-- owner_email setting. Returns whether the caller is the owner.
create function public.ensure_owner()
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

  insert into public.profiles (id, display_name, is_owner)
  values (v_uid, split_part(v_email, '@', 1), true)
  on conflict (id) do update set is_owner = true, removed_at = null;

  return true;
end;
$$;

-- Turns an invite code into a profile.
-- Returns ok | already_member | removed | used | not_found | full.
-- Raises 28000 without a signed-in user and 22023 for a blank display name.
create function public.redeem_invite(p_code text, p_display_name text)
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
  v_uid uuid := auth.uid();
  v_removed_at timestamptz;
  v_invite public.invites%rowtype;
  v_cap int;
  v_name text := nullif(btrim(coalesce(p_display_name, '')), '');
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

-- Records the caller's vote for a video's lyrics offset, then stores the median of
-- all votes in videos.offset_ms and returns it. With an even number of votes the
-- median is the mean of the two middle ones; the result is rounded to a whole ms.
create function public.set_offset_vote(p_youtube_id text, p_offset_ms int)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_median int;
begin
  if not public.is_member() then
    raise exception 'only members can vote' using errcode = '42501';
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

-- Owner only. Marks a member as removed, which frees one of the member slots.
create function public.remove_member(p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.profiles p
    where p.id = auth.uid() and p.is_owner and p.removed_at is null
  ) then
    raise exception 'only the owner can remove members' using errcode = '42501';
  end if;

  if exists (select 1 from public.profiles p where p.id = p_user and p.is_owner) then
    raise exception 'the owner cannot be removed' using errcode = '22023';
  end if;

  update public.profiles
  set removed_at = now()
  where id = p_user and removed_at is null;
end;
$$;

-- Only signed-in users call these; anon and the public role must not.
revoke all on function public.is_member() from public, anon;
revoke all on function public.ensure_owner() from public, anon;
revoke all on function public.redeem_invite(text, text) from public, anon;
revoke all on function public.set_offset_vote(text, int) from public, anon;
revoke all on function public.remove_member(uuid) from public, anon;

grant execute on function public.is_member() to authenticated;
grant execute on function public.ensure_owner() to authenticated;
grant execute on function public.redeem_invite(text, text) to authenticated;
grant execute on function public.set_offset_vote(text, int) to authenticated;
grant execute on function public.remove_member(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Table privileges: least privilege on top of RLS
-- ---------------------------------------------------------------------------

-- Supabase grants everything on new tables to anon and authenticated by default.
-- Start from nothing and give back only what the policies below use.
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;

grant select on public.profiles, public.line_help to authenticated;
grant select, insert on public.invites, public.plays, public.answers to authenticated;
grant select, insert, update on public.videos to authenticated;
-- app_config, video_offset_votes and help_requests: no direct access. Votes go
-- through set_offset_vote; the other two are service key only.

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table public.app_config enable row level security;
alter table public.profiles enable row level security;
alter table public.invites enable row level security;
alter table public.videos enable row level security;
alter table public.video_offset_votes enable row level security;
alter table public.plays enable row level security;
alter table public.answers enable row level security;
alter table public.line_help enable row level security;
alter table public.help_requests enable row level security;

-- app_config, video_offset_votes and help_requests: RLS on and no policy, so a
-- browser session sees nothing. Profiles and line_help are read-only here: they
-- change through the functions above or with the service key.

create policy "members read profiles" on public.profiles
  for select to authenticated
  using ((select public.is_member()));

create policy "members read their own invites" on public.invites
  for select to authenticated
  using ((select public.is_member()) and created_by = (select auth.uid()));

create policy "members create invites in their own name" on public.invites
  for insert to authenticated
  with check (
    (select public.is_member())
    and created_by = (select auth.uid())
    and used_by is null
    and used_at is null
  );

create policy "members read videos" on public.videos
  for select to authenticated
  using ((select public.is_member()));

create policy "members add videos" on public.videos
  for insert to authenticated
  with check ((select public.is_member()));

create policy "members update videos" on public.videos
  for update to authenticated
  using ((select public.is_member()))
  with check ((select public.is_member()));

create policy "members read plays" on public.plays
  for select to authenticated
  using ((select public.is_member()));

create policy "members save their own plays" on public.plays
  for insert to authenticated
  with check ((select public.is_member()) and user_id = (select auth.uid()));

create policy "members read answers of their own plays" on public.answers
  for select to authenticated
  using (
    (select public.is_member())
    and exists (
      select 1 from public.plays p
      where p.id = answers.play_id and p.user_id = (select auth.uid())
    )
  );

create policy "members save answers for their own plays" on public.answers
  for insert to authenticated
  with check (
    (select public.is_member())
    and exists (
      select 1 from public.plays p
      where p.id = answers.play_id and p.user_id = (select auth.uid())
    )
  );

create policy "members read line help" on public.line_help
  for select to authenticated
  using ((select public.is_member()));
