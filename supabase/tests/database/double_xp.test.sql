-- pgTAP tests for supabase/migrations/0003_double_xp.sql
-- Run with: npx supabase test db
--
-- One transaction, rolled back at the end. Users are simulated the way PostgREST does it: switch to the
-- `authenticated` (or `anon`) role and set request.jwt.claims. `reset role` goes back to the superuser, which
-- bypasses RLS and is used for fixtures and for checking what really landed in the table.

begin;

select plan(30);

-- ---------------------------------------------------------------------------
-- Fixtures (superuser)
-- ---------------------------------------------------------------------------

-- ana = d0..01 and bia = d0..02 are members, cris = d0..03 was removed, eve = d0..09 never was one.
insert into auth.users (id, email) values
  ('d0000000-0000-0000-0000-000000000001', 'ana@example.com'),
  ('d0000000-0000-0000-0000-000000000002', 'bia@example.com'),
  ('d0000000-0000-0000-0000-000000000003', 'cris@example.com'),
  ('d0000000-0000-0000-0000-000000000009', 'eve@example.com');

insert into public.profiles (id, display_name, removed_at) values
  ('d0000000-0000-0000-0000-000000000001', 'Ana', null),
  ('d0000000-0000-0000-0000-000000000002', 'Bia', null),
  ('d0000000-0000-0000-0000-000000000003', 'Cris', now());

insert into public.videos (youtube_id, title, channel, duration_s, status)
values ('vid00000001', 'Invented Artist - Invented Song', 'Invented Artist', 200, 'ok');

-- Plays by number: p..01 and p..02 are ana's, p..03 is bia's, p..04 is cris's, p..05 is ana's karaoke play (0 XP),
-- p..06 is ana's with no XP recorded at all.
insert into public.plays (id, user_id, youtube_id, mode, difficulty, total_blanks, first_try_correct, pct, max_combo, xp)
values
  ('b0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001', 'vid00000001', 'escolha', 'facil', 12, 11, 92, 8, 120),
  ('b0000000-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-000000000001', 'vid00000001', 'escolha', 'facil', 12, 6, 50, 3, 35),
  ('b0000000-0000-0000-0000-000000000003', 'd0000000-0000-0000-0000-000000000002', 'vid00000001', 'escolha', 'facil', 12, 12, 100, 12, 200),
  ('b0000000-0000-0000-0000-000000000004', 'd0000000-0000-0000-0000-000000000003', 'vid00000001', 'escolha', 'facil', 12, 12, 100, 12, 50),
  ('b0000000-0000-0000-0000-000000000005', 'd0000000-0000-0000-0000-000000000001', 'vid00000001', 'karaoke', null, 0, 0, 0, 0, 0);
insert into public.plays (id, user_id, youtube_id, mode)
values ('b0000000-0000-0000-0000-000000000006', 'd0000000-0000-0000-0000-000000000001', 'vid00000001', 'escolha');

-- ---------------------------------------------------------------------------
-- The function itself
-- ---------------------------------------------------------------------------

select has_function('public', 'apply_double_xp', array['uuid'], 'apply_double_xp(uuid) exists');
select function_returns('public', 'apply_double_xp', array['uuid'], 'integer', 'it returns the XP the play ends up with');
select is_definer('public', 'apply_double_xp', array['uuid'], 'it runs with its owner''s rights, since members cannot update plays');
select ok(
  (select p.proconfig @> array['search_path=""']
   from pg_proc p
   where p.proname = 'apply_double_xp' and p.pronamespace = 'public'::regnamespace),
  'its search_path is pinned to nothing, so every name in it is schema-qualified');

-- ---------------------------------------------------------------------------
-- Who may run it: the privilege itself, not only the error a call happens to give
-- ---------------------------------------------------------------------------

select function_privs_are('public', 'apply_double_xp', array['uuid'], 'anon', array[]::text[],
  'anon has no privilege on it');
select function_privs_are('public', 'apply_double_xp', array['uuid'], 'authenticated', array['EXECUTE'],
  'authenticated may execute it');
select ok(not has_function_privilege('anon', 'public.apply_double_xp(uuid)', 'execute'),
  'anon cannot execute it, not even through the public role');
select ok(not has_function_privilege('public', 'public.apply_double_xp(uuid)', 'execute'),
  'the public role cannot execute it');

-- ---------------------------------------------------------------------------
-- A member doubles the XP of their own play, once
-- ---------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims = '{"sub":"d0000000-0000-0000-0000-000000000001","email":"ana@example.com"}';

select is(public.apply_double_xp('b0000000-0000-0000-0000-000000000001'), 240,
  'the first call doubles the XP and returns it');

reset role;

select is((select xp from public.plays where id = 'b0000000-0000-0000-0000-000000000001'), 240,
  'the play holds the doubled XP');
select ok((select double_xp_used from public.plays where id = 'b0000000-0000-0000-0000-000000000001'),
  'and is marked as doubled');

set local role authenticated;
set local request.jwt.claims = '{"sub":"d0000000-0000-0000-0000-000000000001","email":"ana@example.com"}';

select is(public.apply_double_xp('b0000000-0000-0000-0000-000000000001'), 240,
  'a second call gives back the same XP');
select is(public.apply_double_xp('b0000000-0000-0000-0000-000000000001'), 240,
  'and so does a third');

reset role;

select is((select xp from public.plays where id = 'b0000000-0000-0000-0000-000000000001'), 240,
  'the XP was doubled once and only once');

-- The other plays of the same member are left alone.
select is((select xp from public.plays where id = 'b0000000-0000-0000-0000-000000000002'), 35,
  'another play of the same member keeps its XP');
select ok(not (select double_xp_used from public.plays where id = 'b0000000-0000-0000-0000-000000000002'),
  'and is not marked as doubled');

-- ---------------------------------------------------------------------------
-- Edge cases of the number
-- ---------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims = '{"sub":"d0000000-0000-0000-0000-000000000001","email":"ana@example.com"}';

select is(public.apply_double_xp('b0000000-0000-0000-0000-000000000005'), 0,
  'a play with 0 XP (Karaokê) stays at 0');
select is(public.apply_double_xp('b0000000-0000-0000-0000-000000000006'), 0,
  'a play with no XP recorded counts as 0');

reset role;

select ok((select double_xp_used from public.plays where id = 'b0000000-0000-0000-0000-000000000006'),
  'and is marked as doubled, so it cannot be doubled again');

-- ---------------------------------------------------------------------------
-- Not someone else's play, not without being a member
-- ---------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims = '{"sub":"d0000000-0000-0000-0000-000000000001","email":"ana@example.com"}';

select throws_ok(
  $$select public.apply_double_xp('b0000000-0000-0000-0000-000000000003')$$,
  'P0002', null,
  'a member cannot double the XP of another member''s play');
select throws_ok(
  $$select public.apply_double_xp('b0000000-0000-0000-0000-0000000000ff')$$,
  'P0002', null,
  'a play that does not exist raises the same way');

reset role;

select is((select xp from public.plays where id = 'b0000000-0000-0000-0000-000000000003'), 200,
  'the other member''s XP is untouched');
select ok(not (select double_xp_used from public.plays where id = 'b0000000-0000-0000-0000-000000000003'),
  'and so is the flag');

set local role authenticated;
set local request.jwt.claims = '{"sub":"d0000000-0000-0000-0000-000000000009","email":"eve@example.com"}';

select throws_ok(
  $$select public.apply_double_xp('b0000000-0000-0000-0000-000000000003')$$,
  '42501', null,
  'a signed-in user who is not a member is refused');

set local request.jwt.claims = '{"sub":"d0000000-0000-0000-0000-000000000003","email":"cris@example.com"}';

select throws_ok(
  $$select public.apply_double_xp('b0000000-0000-0000-0000-000000000004')$$,
  '42501', null,
  'a removed member is refused, even for their own play');

reset role;

select is((select xp from public.plays where id = 'b0000000-0000-0000-0000-000000000004'), 50,
  'the removed member''s play keeps its XP');

-- ---------------------------------------------------------------------------
-- Signed out
-- ---------------------------------------------------------------------------

set local role anon;

select throws_ok(
  $$select public.apply_double_xp('b0000000-0000-0000-0000-000000000003')$$,
  '42501', null,
  'anon cannot call it');

reset role;

-- ---------------------------------------------------------------------------
-- The door it replaces stays shut: a client still cannot write any XP by hand
-- ---------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims = '{"sub":"d0000000-0000-0000-0000-000000000002","email":"bia@example.com"}';

select throws_ok(
  $$update public.plays set xp = 99999 where id = 'b0000000-0000-0000-0000-000000000003'$$,
  '42501', null,
  'a member still has no update on plays');
select throws_ok(
  $$update public.plays set double_xp_used = false where id = 'b0000000-0000-0000-0000-000000000003'$$,
  '42501', null,
  'and cannot clear the flag by hand either');

reset role;

select is((select xp from public.plays where id = 'b0000000-0000-0000-0000-000000000003'), 200,
  'so the XP stays what the game saved');

select * from finish();

rollback;
