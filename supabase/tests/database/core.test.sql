-- pgTAP tests for supabase/migrations/0001_core.sql
-- Run with: npx supabase test db
--
-- Everything happens inside one transaction that is rolled back, so the tests
-- leave no data behind. Users are simulated the way PostgREST does it: switch to
-- the `authenticated` role and set request.jwt.claims. `reset role` goes back to
-- the superuser, which bypasses RLS and is used for fixtures and for checking
-- what really landed in the tables.

begin;

select plan(76);

-- ---------------------------------------------------------------------------
-- Fixtures (superuser)
-- ---------------------------------------------------------------------------

insert into public.app_config (key, value) values
  ('owner_email', 'owner@example.com'),
  ('member_cap', '50')
on conflict (key) do update set value = excluded.value;

-- owner = a0..01, ana = a0..02, bia = a0..03, cris = a0..04 (removed), eve = a0..09 (never a member)
-- Every address is confirmed, as signing in requires (ensure_owner checks it since 0004).
insert into auth.users (id, email, email_confirmed_at) values
  ('a0000000-0000-0000-0000-000000000001', 'owner@example.com', now()),
  ('a0000000-0000-0000-0000-000000000002', 'ana@example.com', now()),
  ('a0000000-0000-0000-0000-000000000003', 'bia@example.com', now()),
  ('a0000000-0000-0000-0000-000000000004', 'cris@example.com', now()),
  ('a0000000-0000-0000-0000-000000000009', 'eve@example.com', now());

-- ---------------------------------------------------------------------------
-- ensure_owner and is_member
-- ---------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims = '{"sub":"a0000000-0000-0000-0000-000000000009","email":"eve@example.com"}';

select is(public.ensure_owner(), false,
  'ensure_owner is false when the e-mail is not the owner e-mail');
select is(public.is_member(), false,
  'is_member is false for a user without a profile');

set local request.jwt.claims = '{"sub":"a0000000-0000-0000-0000-000000000001","email":"Owner@Example.com"}';

select is(public.ensure_owner(), true,
  'ensure_owner is true for the owner e-mail, whatever its case');
select is(public.ensure_owner(), true,
  'ensure_owner can be called again');
select is(public.is_member(), true,
  'is_member is true once the owner profile exists');

reset role;

select is((select count(*) from public.profiles where id = 'a0000000-0000-0000-0000-000000000001' and is_owner and removed_at is null), 1::bigint,
  'ensure_owner created exactly one active owner profile');
select is((select count(*) from public.profiles where id = 'a0000000-0000-0000-0000-000000000009'), 0::bigint,
  'ensure_owner did not create a profile for anyone else');

-- ---------------------------------------------------------------------------
-- Invites: a member may only create invites in their own name
-- ---------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims = '{"sub":"a0000000-0000-0000-0000-000000000001","email":"owner@example.com"}';

select lives_ok(
  $$insert into public.invites (code, created_by) values
      ('CODE-A', 'a0000000-0000-0000-0000-000000000001'),
      ('CODE-B', 'a0000000-0000-0000-0000-000000000001'),
      ('CODE-C', 'a0000000-0000-0000-0000-000000000001')$$,
  'a member can create invites in their own name');
select throws_ok(
  $$insert into public.invites (code, created_by) values ('CODE-X', 'a0000000-0000-0000-0000-000000000002')$$,
  '42501', null,
  'a member cannot create an invite in someone else''s name');
select throws_ok(
  $$update public.invites set used_by = 'a0000000-0000-0000-0000-000000000001' where code = 'CODE-C'$$,
  '42501', null,
  'a member cannot mark an invite as used by hand');
select is((select count(*) from public.invites), 3::bigint,
  'a member reads the invites they created');

set local request.jwt.claims = '{"sub":"a0000000-0000-0000-0000-000000000009","email":"eve@example.com"}';

select throws_ok(
  $$insert into public.invites (code, created_by) values ('CODE-Y', 'a0000000-0000-0000-0000-000000000009')$$,
  '42501', null,
  'a non-member cannot create invites');
select is((select count(*) from public.invites), 0::bigint,
  'a non-member reads no invites');

reset role;

-- ---------------------------------------------------------------------------
-- redeem_invite
-- ---------------------------------------------------------------------------

-- redeem_invite serializes every redemption with a transaction-level advisory
-- lock on one fixed key (7241022001 in the migration). pg_locks shows a bigint
-- key as two halves: classid = high 32 bits, objid = low 32 bits, objsubid = 1.
-- Concurrency cannot be exercised inside one transaction, so this guards the
-- lock itself: deleting the pg_advisory_xact_lock line makes the second
-- assertion fail. If the key in the migration changes, change it here too.
select ok(
  not exists (
    select 1 from pg_locks
    where locktype = 'advisory' and pid = pg_backend_pid()
      and classid = (7241022001 >> 32)::oid
      and objid = (7241022001 & 4294967295)::oid
      and objsubid = 1
  ),
  'no redemption lock is held before redeem_invite runs');

set local role authenticated;
set local request.jwt.claims = '{"sub":"a0000000-0000-0000-0000-000000000002","email":"ana@example.com"}';

select is(public.redeem_invite('CODE-A', '  Ana  '), 'ok',
  'redeem_invite returns ok for a new code');

reset role;

select ok(
  exists (
    select 1 from pg_locks
    where locktype = 'advisory' and pid = pg_backend_pid() and granted
      and classid = (7241022001 >> 32)::oid
      and objid = (7241022001 & 4294967295)::oid
      and objsubid = 1
  ),
  'redeem_invite holds the advisory lock that serializes redemptions');

select is((select display_name from public.profiles where id = 'a0000000-0000-0000-0000-000000000002'), 'Ana',
  'redeem_invite creates the profile with the trimmed display name');
select ok((select used_by = 'a0000000-0000-0000-0000-000000000002' and used_at is not null from public.invites where code = 'CODE-A'),
  'redeem_invite marks the invite as used by the new member');

set local role authenticated;
set local request.jwt.claims = '{"sub":"a0000000-0000-0000-0000-000000000003","email":"bia@example.com"}';

select is(public.redeem_invite('CODE-A', 'Bia'), 'used',
  'a second user with the same code gets used');
select is(public.redeem_invite('NOPE', 'Bia'), 'not_found',
  'redeem_invite returns not_found for a code that does not exist');
select throws_ok(
  $$select public.redeem_invite('CODE-B', '   ')$$,
  '22023', null,
  'redeem_invite refuses a blank display name');

set local request.jwt.claims = '{"sub":"a0000000-0000-0000-0000-000000000002","email":"ana@example.com"}';

select is(public.redeem_invite('CODE-B', 'Ana again'), 'already_member',
  'redeem_invite returns already_member for an active member');

reset role;

insert into public.profiles (id, display_name, removed_at)
values ('a0000000-0000-0000-0000-000000000004', 'Cris', now());

set local role authenticated;
set local request.jwt.claims = '{"sub":"a0000000-0000-0000-0000-000000000004","email":"cris@example.com"}';

select is(public.redeem_invite('CODE-B', 'Cris'), 'removed',
  'redeem_invite returns removed for a removed member');

reset role;

select is((select count(*) from public.profiles where id = 'a0000000-0000-0000-0000-000000000003'), 0::bigint,
  'used, not_found and a blank name create no profile');
select ok((select used_by is null and used_at is null from public.invites where code = 'CODE-B'),
  'already_member and removed do not burn the code');

-- ---------------------------------------------------------------------------
-- Member cap (owner + ana are active, cris is removed: 48 more make 50)
-- ---------------------------------------------------------------------------

insert into auth.users (id, email)
select ('b0000000-0000-0000-0000-' || lpad(g::text, 12, '0'))::uuid, 'filler' || g || '@example.com'
from generate_series(1, 48) g;

insert into public.profiles (id, display_name)
select ('b0000000-0000-0000-0000-' || lpad(g::text, 12, '0'))::uuid, 'Filler ' || g
from generate_series(1, 48) g;

select is((select count(*) from public.profiles where removed_at is null), 50::bigint,
  'fixture: 50 active profiles (the removed one does not count)');

set local role authenticated;
set local request.jwt.claims = '{"sub":"a0000000-0000-0000-0000-000000000003","email":"bia@example.com"}';

select is(public.redeem_invite('CODE-B', 'Bia'), 'full',
  'redeem_invite returns full when 50 profiles are active');

reset role;

select is((select count(*) from public.profiles where id = 'a0000000-0000-0000-0000-000000000003'), 0::bigint,
  'full creates no profile');
select ok((select used_by is null and used_at is null from public.invites where code = 'CODE-B'),
  'full does not burn the code');

-- ---------------------------------------------------------------------------
-- remove_member frees a slot
-- ---------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims = '{"sub":"a0000000-0000-0000-0000-000000000002","email":"ana@example.com"}';

select throws_ok(
  $$select public.remove_member('b0000000-0000-0000-0000-000000000001')$$,
  '42501', null,
  'a member who is not the owner cannot remove anyone');

set local request.jwt.claims = '{"sub":"a0000000-0000-0000-0000-000000000001","email":"owner@example.com"}';

select throws_ok(
  $$select public.remove_member('a0000000-0000-0000-0000-000000000001')$$,
  '22023', null,
  'the owner cannot be removed');
select lives_ok(
  $$select public.remove_member('b0000000-0000-0000-0000-000000000001')$$,
  'the owner can remove a member');

reset role;

select ok((select removed_at is not null from public.profiles where id = 'b0000000-0000-0000-0000-000000000001'),
  'remove_member sets removed_at');

set local role authenticated;
set local request.jwt.claims = '{"sub":"b0000000-0000-0000-0000-000000000001","email":"filler1@example.com"}';

select is(public.is_member(), false,
  'a removed member is not a member');

set local request.jwt.claims = '{"sub":"a0000000-0000-0000-0000-000000000003","email":"bia@example.com"}';

select is(public.redeem_invite('CODE-B', 'Bia'), 'ok',
  'the slot freed by remove_member can be taken, back to 50 active');
select is(public.redeem_invite('CODE-C', 'Bia again'), 'already_member',
  'bia is now a member');

reset role;

-- ---------------------------------------------------------------------------
-- videos: members read; only the service key writes (0004, ruling R81); non-members see nothing
-- ---------------------------------------------------------------------------

-- The server writes videos with the service key, which bypasses RLS like the superuser does here.
insert into public.videos (youtube_id, title, channel, duration_s, status)
values ('vid00000001', 'Song', 'Band', 200, 'ok'), ('vid00000002', 'Other', 'Band', 180, 'no_lyrics');

select throws_ok(
  $$insert into public.videos (youtube_id, status) values ('vid00000003', 'broken')$$,
  '23514', null,
  'videos.status only accepts ok or no_lyrics');

set local role authenticated;
set local request.jwt.claims = '{"sub":"a0000000-0000-0000-0000-000000000002","email":"ana@example.com"}';

select is((select count(*) from public.videos), 2::bigint,
  'a member can read videos');
select throws_ok(
  $$insert into public.videos (youtube_id, title, channel, duration_s, status) values ('vid00000005', 'Planted', 'Band', 200, 'ok')$$,
  '42501', null,
  'a member cannot add videos (ruling R81)');
select throws_ok(
  $$update public.videos set lyrics_lrc = '[00:01.00]planted' where youtube_id = 'vid00000001'$$,
  '42501', null,
  'a member cannot update videos, so no member can rewrite the lyrics for everyone (ruling R81)');

set local request.jwt.claims = '{"sub":"a0000000-0000-0000-0000-000000000009","email":"eve@example.com"}';

select is((select count(*) from public.videos), 0::bigint,
  'a non-member cannot select videos');
select throws_ok(
  $$insert into public.videos (youtube_id, status) values ('vid00000004', 'ok')$$,
  '42501', null,
  'a non-member cannot add videos');
select throws_ok(
  $$update public.videos set title = 'hacked'$$,
  '42501', null,
  'a non-member cannot update videos');

set local request.jwt.claims = '{"sub":"a0000000-0000-0000-0000-000000000004","email":"cris@example.com"}';

select is((select count(*) from public.videos), 0::bigint,
  'a removed member cannot select videos');

reset role;

select is((select title || ' ' || coalesce(lyrics_lrc, '-') from public.videos where youtube_id = 'vid00000001'), 'Song -',
  'no edit from a browser session reached the row');

-- ---------------------------------------------------------------------------
-- set_offset_vote
-- ---------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims = '{"sub":"a0000000-0000-0000-0000-000000000001","email":"owner@example.com"}';

select is(public.set_offset_vote('vid00000001', 26000), 26000,
  'one vote is its own median');

set local request.jwt.claims = '{"sub":"a0000000-0000-0000-0000-000000000002","email":"ana@example.com"}';

select is(public.set_offset_vote('vid00000001', 25500), 25750,
  'with an even number of votes the median is the mean of the two middle ones');

set local request.jwt.claims = '{"sub":"a0000000-0000-0000-0000-000000000003","email":"bia@example.com"}';

select is(public.set_offset_vote('vid00000001', 30000), 26000,
  'after votes 26000, 25500 and 30000 the median is 26000');

reset role;

select is((select offset_ms from public.videos where youtube_id = 'vid00000001'), 26000,
  'set_offset_vote stores the median in videos.offset_ms');

set local role authenticated;
set local request.jwt.claims = '{"sub":"a0000000-0000-0000-0000-000000000001","email":"owner@example.com"}';

select is(public.set_offset_vote('vid00000001', 29000), 29000,
  'a member who votes again replaces their vote (29000, 25500, 30000)');

reset role;

select is((select count(*) from public.video_offset_votes where youtube_id = 'vid00000001'), 3::bigint,
  'a repeated vote does not add a row');

set local role authenticated;
set local request.jwt.claims = '{"sub":"a0000000-0000-0000-0000-000000000001","email":"owner@example.com"}';

select is(public.set_offset_vote('vid00000002', 100), 100,
  'the first vote on another video is its own median');

set local request.jwt.claims = '{"sub":"a0000000-0000-0000-0000-000000000002","email":"ana@example.com"}';

select is(public.set_offset_vote('vid00000002', 101), 101,
  'an even-count median that ends in .5 is rounded to the next integer (100.5 becomes 101)');
select throws_ok(
  $$select public.set_offset_vote('missing-video', 0)$$,
  'P0002', null,
  'set_offset_vote refuses a video that does not exist');
select throws_ok(
  $$select count(*) from public.video_offset_votes$$,
  '42501', null,
  'votes are not readable directly');

set local request.jwt.claims = '{"sub":"a0000000-0000-0000-0000-000000000009","email":"eve@example.com"}';

select throws_ok(
  $$select public.set_offset_vote('vid00000001', 1)$$,
  '42501', null,
  'a non-member cannot vote');

reset role;

-- ---------------------------------------------------------------------------
-- plays and answers
-- ---------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims = '{"sub":"a0000000-0000-0000-0000-000000000002","email":"ana@example.com"}';

select lives_ok(
  $$insert into public.plays (id, user_id, youtube_id, mode, difficulty, total_blanks, first_try_correct, pct, max_combo, xp)
    values ('c0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000002', 'vid00000001', 'choice', 'easy', 10, 8, 80, 5, 80)$$,
  'a member can save their own play');
select throws_ok(
  $$insert into public.plays (user_id, youtube_id, mode, difficulty)
    values ('a0000000-0000-0000-0000-000000000001', 'vid00000001', 'choice', 'easy')$$,
  '42501', null,
  'a member cannot save a play in someone else''s name');
select lives_ok(
  $$insert into public.answers (play_id, blank_id, kind, correct, before_line_end)
    values ('c0000000-0000-0000-0000-000000000001', 'b1', 'first', true, true)$$,
  'a member can save answers for their own play');
select throws_ok(
  $$insert into public.answers (play_id, blank_id, kind, correct, before_line_end)
    values ('c0000000-0000-0000-0000-000000000001', 'b2', 'guess', true, true)$$,
  '23514', null,
  'answers.kind only accepts first, retry or helped');
select is((select count(*) from public.answers), 1::bigint,
  'a member reads the answers of their own plays');

set local request.jwt.claims = '{"sub":"a0000000-0000-0000-0000-000000000001","email":"owner@example.com"}';

select is((select count(*) from public.plays), 1::bigint,
  'members read each other''s plays');
select is((select count(*) from public.answers), 0::bigint,
  'a member does not read other members'' answers');
select throws_ok(
  $$insert into public.answers (play_id, blank_id, kind, correct, before_line_end)
    values ('c0000000-0000-0000-0000-000000000001', 'b3', 'first', true, true)$$,
  '42501', null,
  'a member cannot add answers to someone else''s play');

set local request.jwt.claims = '{"sub":"a0000000-0000-0000-0000-000000000009","email":"eve@example.com"}';

select is((select count(*) from public.plays), 0::bigint,
  'a non-member reads no plays');
select throws_ok(
  $$insert into public.plays (user_id, youtube_id, mode, difficulty)
    values ('a0000000-0000-0000-0000-000000000009', 'vid00000001', 'choice', 'easy')$$,
  '42501', null,
  'a non-member cannot save a play');

reset role;

-- ---------------------------------------------------------------------------
-- profiles, line_help, help_requests, app_config
-- ---------------------------------------------------------------------------

insert into public.line_help (youtube_id, lyrics_ref, line_index, kind, content)
values ('vid00000001', 'ref-1', 0, 'explain', 'cached explanation');

set local role authenticated;
set local request.jwt.claims = '{"sub":"a0000000-0000-0000-0000-000000000002","email":"ana@example.com"}';

select is((select count(*) from public.profiles where id in ('a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000002')), 2::bigint,
  'members read profiles');
select throws_ok(
  $$update public.profiles set is_owner = true where id = 'a0000000-0000-0000-0000-000000000002'$$,
  '42501', null,
  'a member cannot promote themselves to owner');
select is((select count(*) from public.line_help), 1::bigint,
  'members read line_help');
select throws_ok(
  $$insert into public.line_help (youtube_id, lyrics_ref, line_index, kind, content) values ('vid00000001', 'ref-1', 1, 'explain', 'x')$$,
  '42501', null,
  'members cannot write line_help (service key only)');
select throws_ok(
  $$insert into public.help_requests (user_id) values ('a0000000-0000-0000-0000-000000000002')$$,
  '42501', null,
  'members cannot write help_requests (service key only)');
select throws_ok(
  $$select * from public.app_config$$,
  '42501', null,
  'members cannot read app_config, which holds the owner e-mail');

set local request.jwt.claims = '{"sub":"a0000000-0000-0000-0000-000000000009","email":"eve@example.com"}';

select is((select count(*) from public.profiles), 0::bigint,
  'a non-member reads no profiles');
select is((select count(*) from public.line_help), 0::bigint,
  'a non-member reads no line_help');

reset role;

-- ---------------------------------------------------------------------------
-- Signed-out visitors (anon)
-- ---------------------------------------------------------------------------

set local role anon;

select throws_ok(
  $$select count(*) from public.videos$$,
  '42501', null,
  'anon cannot read videos');
select throws_ok(
  $$select public.redeem_invite('CODE-C', 'Nobody')$$,
  '42501', null,
  'anon cannot call redeem_invite');

reset role;

select * from finish();

rollback;
