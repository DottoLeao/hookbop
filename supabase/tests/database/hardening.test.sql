-- pgTAP tests for supabase/migrations/0004_hardening.sql (rulings R81 and R82)
-- Run with: npx supabase test db
--
-- One transaction, rolled back at the end. Users are simulated the way PostgREST does it: switch to the
-- `authenticated` role and set request.jwt.claims; `reset role` goes back to the superuser for fixtures and checks.

begin;

select plan(37);

-- ---------------------------------------------------------------------------
-- Fixtures (superuser)
-- ---------------------------------------------------------------------------

insert into public.app_config (key, value) values
  ('owner_email', 'owner@example.com'),
  ('member_cap', '50')
on conflict (key) do update set value = excluded.value;

-- owner = d0..01 (e-mail not confirmed yet), ana = d0..03 (member), rui = d0..04 (removed member),
-- bia = d0..05 and cal = d0..06 (newcomers with no profile)
insert into auth.users (id, email, email_confirmed_at) values
  ('d0000000-0000-0000-0000-000000000001', 'owner@example.com', null),
  ('d0000000-0000-0000-0000-000000000003', 'ana@example.com', now()),
  ('d0000000-0000-0000-0000-000000000004', 'rui@example.com', now()),
  ('d0000000-0000-0000-0000-000000000005', 'bia@example.com', now()),
  ('d0000000-0000-0000-0000-000000000006', 'cal@example.com', now());

insert into public.profiles (id, display_name, removed_at) values
  ('d0000000-0000-0000-0000-000000000003', 'Ana', null),
  ('d0000000-0000-0000-0000-000000000004', 'Rui', now());

insert into public.invites (code, created_by) values
  ('HARD-A', 'd0000000-0000-0000-0000-000000000003'),
  ('HARD-B', 'd0000000-0000-0000-0000-000000000003'),
  ('HARD-R', 'd0000000-0000-0000-0000-000000000004');

insert into public.videos (youtube_id, title, channel, duration_s, status)
values ('vidhard0001', 'Song', 'Band', 200, 'ok');

-- ---------------------------------------------------------------------------
-- videos: members read only (ruling R81)
-- ---------------------------------------------------------------------------

select table_privs_are('public', 'videos', 'authenticated', array['SELECT'],
  'a signed-in session may only read videos');
select table_privs_are('public', 'videos', 'anon', array[]::text[],
  'a signed-out visitor has no access to videos');
select policies_are('public', 'videos', array['members read videos'],
  'videos keeps only the read policy');

-- ---------------------------------------------------------------------------
-- set_offset_vote: at most 30 s either way (ruling R82)
-- ---------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims = '{"sub":"d0000000-0000-0000-0000-000000000003","email":"ana@example.com"}';

select is(public.set_offset_vote('vidhard0001', 30000), 30000,
  'a vote of +30 s is taken');
select is(public.set_offset_vote('vidhard0001', -30000), -30000,
  'so is a vote of -30 s');
select throws_ok(
  $$select public.set_offset_vote('vidhard0001', 30001)$$,
  '22023', null,
  'a vote past +30 s is refused');
select throws_ok(
  $$select public.set_offset_vote('vidhard0001', -30001)$$,
  '22023', null,
  'a vote past -30 s is refused');
select throws_ok(
  $$select public.set_offset_vote('vidhard0001', 2147483647)$$,
  '22023', null,
  'a huge vote is refused');
select throws_ok(
  $$select public.set_offset_vote('vidhard0001', null)$$,
  '22023', null,
  'a vote with no offset is refused');

reset role;

select is((select offset_ms from public.videos where youtube_id = 'vidhard0001'), -30000,
  'a refused vote leaves the offset as it was');
select is((select offset_ms from public.video_offset_votes where youtube_id = 'vidhard0001'), -30000,
  'and leaves the vote as it was');

-- ---------------------------------------------------------------------------
-- ensure_owner: only a confirmed e-mail (ruling R82)
-- ---------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims = '{"sub":"d0000000-0000-0000-0000-000000000001","email":"owner@example.com"}';

select is(public.ensure_owner(), false,
  'the owner e-mail does not make an owner while the address is not confirmed');

reset role;

select is((select count(*) from public.profiles where id = 'd0000000-0000-0000-0000-000000000001'), 0::bigint,
  'an unconfirmed owner e-mail creates no profile');

update auth.users set email_confirmed_at = now() where id = 'd0000000-0000-0000-0000-000000000001';

set local role authenticated;
set local request.jwt.claims = '{"sub":"d0000000-0000-0000-0000-000000000001","email":"owner@example.com"}';

select is(public.ensure_owner(), true,
  'once the address is confirmed, the owner e-mail makes the owner');

-- A token can carry the owner e-mail while its user row says otherwise: the row is what counts.
set local request.jwt.claims = '{"sub":"d0000000-0000-0000-0000-000000000005","email":"owner@example.com"}';

select is(public.ensure_owner(), false,
  'a token with the owner e-mail does not make an owner of a user whose own address is another one');

reset role;

select is((select count(*) from public.profiles where id = 'd0000000-0000-0000-0000-000000000005'), 0::bigint,
  'that user got no profile');

-- ---------------------------------------------------------------------------
-- redeem_invite: an active inviter, and a name of at most 40 characters (ruling R82)
-- ---------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims = '{"sub":"d0000000-0000-0000-0000-000000000005","email":"bia@example.com"}';

select is(public.redeem_invite('HARD-R', 'Bia'), 'not_found',
  'a code whose inviter was removed is refused like a code that does not exist');

reset role;

select ok((select used_by is null and used_at is null from public.invites where code = 'HARD-R'),
  'the refused code is not burnt');
select is((select count(*) from public.profiles where id = 'd0000000-0000-0000-0000-000000000005'), 0::bigint,
  'the refused code creates no profile');

set local role authenticated;
set local request.jwt.claims = '{"sub":"d0000000-0000-0000-0000-000000000005","email":"bia@example.com"}';

select is(public.redeem_invite('HARD-A', repeat('B', 55)), 'ok',
  'a code of an active member works with a long name');

reset role;

select is((select display_name from public.profiles where id = 'd0000000-0000-0000-0000-000000000005'), repeat('B', 40),
  'the name is cut to 40 characters');

-- The redemption lock (key 7241022001, see core.test.sql) is still taken.
select ok(
  exists (
    select 1 from pg_locks
    where locktype = 'advisory' and pid = pg_backend_pid() and granted
      and classid = (7241022001 >> 32)::oid
      and objid = (7241022001 & 4294967295)::oid
      and objsubid = 1
  ),
  'redeem_invite still takes the advisory lock that serializes redemptions');

set local role authenticated;
set local request.jwt.claims = '{"sub":"d0000000-0000-0000-0000-000000000006","email":"cal@example.com"}';

select is(public.redeem_invite('HARD-B', '  ' || repeat('c', 39) || ' tail  '), 'ok',
  'a name with spaces around it works');

reset role;

select is((select display_name from public.profiles where id = 'd0000000-0000-0000-0000-000000000006'), repeat('c', 39),
  'the name is trimmed, cut to 40 and trimmed again, so it never ends in a space');

-- ---------------------------------------------------------------------------
-- The recreated functions keep what 0001 gave them
-- ---------------------------------------------------------------------------

select is_definer('public', 'set_offset_vote', array['text', 'integer'], 'set_offset_vote is still security definer');
select is_definer('public', 'ensure_owner', array[]::text[], 'ensure_owner is still security definer');
select is_definer('public', 'redeem_invite', array['text', 'text'], 'redeem_invite is still security definer');

select is((select proconfig from pg_proc where oid = 'public.set_offset_vote(text, integer)'::regprocedure),
  array['search_path=""'], 'set_offset_vote still runs with an empty search_path');
select is((select proconfig from pg_proc where oid = 'public.ensure_owner()'::regprocedure),
  array['search_path=""'], 'ensure_owner still runs with an empty search_path');
select is((select proconfig from pg_proc where oid = 'public.redeem_invite(text, text)'::regprocedure),
  array['search_path=""'], 'redeem_invite still runs with an empty search_path');

select function_privs_are('public', 'set_offset_vote', array['text', 'integer'], 'authenticated', array['EXECUTE'],
  'signed-in users may call set_offset_vote');
select function_privs_are('public', 'ensure_owner', array[]::text[], 'authenticated', array['EXECUTE'],
  'signed-in users may call ensure_owner');
select function_privs_are('public', 'redeem_invite', array['text', 'text'], 'authenticated', array['EXECUTE'],
  'signed-in users may call redeem_invite');

select function_privs_are('public', 'set_offset_vote', array['text', 'integer'], 'anon', array[]::text[],
  'anon may not call set_offset_vote');
select function_privs_are('public', 'ensure_owner', array[]::text[], 'anon', array[]::text[],
  'anon may not call ensure_owner');
select function_privs_are('public', 'redeem_invite', array['text', 'text'], 'anon', array[]::text[],
  'anon may not call redeem_invite');

select ok(not has_function_privilege('public', 'public.set_offset_vote(text, integer)', 'execute')
      and not has_function_privilege('public', 'public.ensure_owner()', 'execute')
      and not has_function_privilege('public', 'public.redeem_invite(text, text)', 'execute'),
  'the PUBLIC role may call none of them');

select * from finish();

rollback;
