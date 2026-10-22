-- pgTAP tests for supabase/migrations/0002_help_budget.sql
-- Run with: npx supabase test db
--
-- One transaction, rolled back at the end. now() is the same all through it, so every row written here is "now",
-- and rows from earlier are written with an explicit created_at.

begin;

select plan(35);

-- Members by number: c0..01 to c0..06. help_requests has no foreign key, so no profile is needed.

-- ---------------------------------------------------------------------------
-- The table
-- ---------------------------------------------------------------------------

select has_column('public', 'help_requests', 'kind', 'help_requests has a kind');
select col_not_null('public', 'help_requests', 'kind', 'the kind of a request is always known');
select col_default_is('public', 'help_requests', 'kind', 'explain', 'a request written before kinds existed is an explanation');
select has_index('public', 'help_requests', 'help_requests_user_id_kind_created_at_idx', array['user_id', 'kind', 'created_at'],
  'requests are found by member, kind and time');
select throws_ok(
  $$insert into public.help_requests (user_id, kind) values ('c0000000-0000-0000-0000-000000000006', 'summarize')$$,
  '23514', null,
  'a request of an unknown kind cannot be written');

-- ---------------------------------------------------------------------------
-- reserve_help_request: the limit
-- ---------------------------------------------------------------------------

select isnt(public.reserve_help_request('c0000000-0000-0000-0000-000000000001', 'explain', 2), null,
  'the first reservation under the limit gets a row');
select isnt(public.reserve_help_request('c0000000-0000-0000-0000-000000000001', 'explain', 2), null,
  'so does the second');
select is(public.reserve_help_request('c0000000-0000-0000-0000-000000000001', 'explain', 2), null,
  'the third is refused: the member is at the limit');
select is((select count(*) from public.help_requests
           where user_id = 'c0000000-0000-0000-0000-000000000001' and kind = 'explain'), 2::bigint,
  'a refused reservation writes nothing');

-- Kept in a table of its own: the row the function writes is not seen by the statement that called it.
create temp table reserved as
  select public.reserve_help_request('c0000000-0000-0000-0000-000000000005', 'translate', 1) as id;
select is(
  (select r.user_id::text || ' ' || r.kind from public.help_requests r join reserved using (id)),
  'c0000000-0000-0000-0000-000000000005 translate',
  'the id given back is the row written, for that member and kind');

-- ---------------------------------------------------------------------------
-- Budgets of their own
-- ---------------------------------------------------------------------------

select isnt(public.reserve_help_request('c0000000-0000-0000-0000-000000000001', 'translate', 2), null,
  'translations have a budget of their own: a member out of explanations can still translate');
select isnt(public.reserve_help_request('c0000000-0000-0000-0000-000000000002', 'explain', 2), null,
  'every member has a budget of their own');

insert into public.help_requests (user_id, kind, created_at) values
  ('c0000000-0000-0000-0000-000000000003', 'explain', now() - interval '2 hours'),
  ('c0000000-0000-0000-0000-000000000003', 'explain', now() - interval '61 minutes');
select isnt(public.reserve_help_request('c0000000-0000-0000-0000-000000000003', 'explain', 1), null,
  'requests older than an hour do not count');
select is(public.reserve_help_request('c0000000-0000-0000-0000-000000000003', 'explain', 1), null,
  'the one of this hour does');

select is(public.reserve_help_request('c0000000-0000-0000-0000-000000000004', 'explain', 0), null,
  'a limit of 0 gives nothing');
select is(public.reserve_help_request('c0000000-0000-0000-0000-000000000004', 'explain', null), null,
  'no limit gives nothing either');
select throws_ok(
  $$select public.reserve_help_request('c0000000-0000-0000-0000-000000000004', 'summarize', 10)$$,
  '23514', null,
  'an unknown kind cannot be reserved');

-- ---------------------------------------------------------------------------
-- release_help_request
-- ---------------------------------------------------------------------------

select lives_ok(
  $$select public.release_help_request(
      (select max(id) from public.help_requests
       where user_id = 'c0000000-0000-0000-0000-000000000001' and kind = 'explain'))$$,
  'a reservation can be released');
select is((select count(*) from public.help_requests
           where user_id = 'c0000000-0000-0000-0000-000000000001' and kind = 'explain'), 1::bigint,
  'releasing deletes that row');
select isnt(public.reserve_help_request('c0000000-0000-0000-0000-000000000001', 'explain', 2), null,
  'and frees its slot');
select lives_ok($$select public.release_help_request(-1)$$,
  'releasing a row that is not there does nothing');

-- ---------------------------------------------------------------------------
-- The lock per member
-- ---------------------------------------------------------------------------

-- reserve_help_request takes a transaction-level advisory lock on hashtext(user_id), so two reservations of the same
-- member queue up and cannot both take the last slot. Concurrency cannot be exercised inside one transaction, so this
-- guards the lock itself, with the pg_locks pattern of core.test.sql: a bigint key shows as classid = its high 32 bits
-- and objid = its low 32 bits, with objsubid = 1. hashtext gives an int that can be negative, so both halves are
-- masked to 32 bits. The lock lasts until the end of the transaction, so the member is one with no reservation yet.
create temp table member_lock as
  select hashtext('c0000000-0000-0000-0000-000000000007')::bigint as k;

select ok(
  not exists (
    select 1 from pg_locks, member_lock
    where locktype = 'advisory' and pid = pg_backend_pid()
      and classid = ((k >> 32) & 4294967295)::oid
      and objid = (k & 4294967295)::oid
      and objsubid = 1
  ),
  'no lock is held for a member before their first reservation');
select isnt(public.reserve_help_request('c0000000-0000-0000-0000-000000000007', 'explain', 1), null,
  'their first reservation gets a row');
select ok(
  exists (
    select 1 from pg_locks, member_lock
    where locktype = 'advisory' and pid = pg_backend_pid() and granted
      and classid = ((k >> 32) & 4294967295)::oid
      and objid = (k & 4294967295)::oid
      and objsubid = 1
  ),
  'reserve_help_request holds the advisory lock of that member');

-- ---------------------------------------------------------------------------
-- Who may call them: the privileges themselves
-- ---------------------------------------------------------------------------

-- These tell a missing revoke on the functions apart from the missing grant on the table, which the 42501 tests
-- below cannot.
select function_privs_are('public', 'reserve_help_request', array['uuid', 'text', 'integer'], 'service_role', array['EXECUTE'],
  'the service key may reserve a request');
select function_privs_are('public', 'release_help_request', array['bigint'], 'service_role', array['EXECUTE'],
  'the service key may release a request');
select function_privs_are('public', 'reserve_help_request', array['uuid', 'text', 'integer'], 'authenticated', array[]::text[],
  'a signed-in session may not reserve a request');
select function_privs_are('public', 'release_help_request', array['bigint'], 'authenticated', array[]::text[],
  'a signed-in session may not release a request');
select function_privs_are('public', 'reserve_help_request', array['uuid', 'text', 'integer'], 'anon', array[]::text[],
  'anon may not reserve a request');
select function_privs_are('public', 'release_help_request', array['bigint'], 'anon', array[]::text[],
  'anon may not release a request');
select ok(not has_function_privilege('public', 'public.reserve_help_request(uuid, text, integer)', 'execute')
      and not has_function_privilege('public', 'public.release_help_request(bigint)', 'execute'),
  'the PUBLIC role may call neither');

-- ---------------------------------------------------------------------------
-- Only the service key may call them
-- ---------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims = '{"sub":"c0000000-0000-0000-0000-000000000001","email":"member@example.com"}';

select throws_ok(
  $$select public.reserve_help_request('c0000000-0000-0000-0000-000000000001', 'explain', 1000)$$,
  '42501', null,
  'a signed-in member cannot reserve a request, not even for themselves');
select throws_ok(
  $$select public.release_help_request(1)$$,
  '42501', null,
  'a signed-in member cannot release a request');

reset role;
set local role anon;

select throws_ok(
  $$select public.reserve_help_request('c0000000-0000-0000-0000-000000000001', 'explain', 1000)$$,
  '42501', null,
  'anon cannot reserve a request');
select throws_ok(
  $$select public.release_help_request(1)$$,
  '42501', null,
  'anon cannot release a request');

reset role;

select * from finish();

rollback;
