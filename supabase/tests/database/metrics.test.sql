-- pgTAP tests for supabase/migrations/0006_metrics.sql (rulings S3, S39 and S40)
-- Run with: npx supabase test db
--
-- One transaction, rolled back at the end. Users are simulated the way PostgREST does it: switch to the
-- `authenticated` role and set request.jwt.claims; `reset role` goes back to the superuser for fixtures and checks.
-- The metrics tables are emptied inside the transaction first, so rows left by earlier local use do not change what
-- the views add up; the rollback gives them back.

begin;

select plan(97);

-- ---------------------------------------------------------------------------
-- Fixtures (superuser)
-- ---------------------------------------------------------------------------

delete from public.ai_usage;
delete from public.app_events;

-- owner = e0..01, ana = e0..02 (member), eve = e0..09 (signed in, never a member)
insert into auth.users (id, email, email_confirmed_at) values
  ('e0000000-0000-0000-0000-000000000001', 'owner@example.com', now()),
  ('e0000000-0000-0000-0000-000000000002', 'ana@example.com', now()),
  ('e0000000-0000-0000-0000-000000000009', 'eve@example.com', now());

insert into public.profiles (id, display_name, is_owner) values
  ('e0000000-0000-0000-0000-000000000001', 'Owner', true),
  ('e0000000-0000-0000-0000-000000000002', 'Ana', false);

-- ---------------------------------------------------------------------------
-- The tables
-- ---------------------------------------------------------------------------

select has_table('public', 'ai_usage', 'ai_usage exists');
select has_table('public', 'app_events', 'app_events exists');

select columns_are('public', 'ai_usage', array[
  'id', 'created_at', 'user_id', 'youtube_id', 'line_index', 'kind', 'source', 'model',
  'input_tokens', 'output_tokens', 'cost_usd', 'latency_ms', 'outcome'
], 'ai_usage has the columns the brief lists');
select columns_are('public', 'app_events', array[
  'id', 'created_at', 'user_id', 'session_id', 'name', 'youtube_id', 'mode', 'props'
], 'app_events has the columns the brief lists');

select is(
  (select array_agg(a.attname::text order by a.attname) from pg_attribute a
   where a.attrelid = 'public.ai_usage'::regclass and a.attnum > 0 and not a.attisdropped and a.attnotnull),
  array['cost_usd', 'created_at', 'id', 'input_tokens', 'line_index', 'output_tokens', 'user_id', 'youtube_id'],
  'ai_usage requires who, when, which song and line, and the tokens and cost');
select is(
  (select array_agg(a.attname::text order by a.attname) from pg_attribute a
   where a.attrelid = 'public.app_events'::regclass and a.attnum > 0 and not a.attisdropped and a.attnotnull),
  array['created_at', 'id', 'name', 'props', 'session_id', 'user_id'],
  'app_events requires who, when, which session, the action and its props');

select col_type_is('public', 'ai_usage', 'cost_usd', 'numeric(12,6)', 'the cost is kept to a millionth of a dollar');
select col_is_pk('public', 'ai_usage', 'id', 'ai_usage is keyed by its id');
select col_is_pk('public', 'app_events', 'id', 'app_events is keyed by its id');

select has_index('public', 'ai_usage', 'ai_usage_created_at_idx', array['created_at'],
  'AI use is found by time');
select has_index('public', 'ai_usage', 'ai_usage_user_id_created_at_idx', array['user_id', 'created_at'],
  'AI use is found by member and time');
select has_index('public', 'app_events', 'app_events_created_at_idx', array['created_at'],
  'events are found by time');
select has_index('public', 'app_events', 'app_events_name_created_at_idx', array['name', 'created_at'],
  'events are found by action and time');

-- ---------------------------------------------------------------------------
-- Access: the service key only
-- ---------------------------------------------------------------------------

select ok((select relrowsecurity from pg_class where oid = 'public.ai_usage'::regclass),
  'row level security is on for ai_usage');
select ok((select relrowsecurity from pg_class where oid = 'public.app_events'::regclass),
  'row level security is on for app_events');
select policies_are('public', 'ai_usage', array[]::name[],
  'ai_usage has no policy, so no browser session sees a row');
select policies_are('public', 'app_events', array[]::name[],
  'app_events has no policy, so no browser session sees a row');

-- Every table privilege there is, for every table and view, for the two roles a browser session can have.
select is(
  (select array_agg(r || ' ' || who || ' ' || p order by r, who, p)
   from unnest(array['ai_usage', 'app_events', 'metrics_ai_daily', 'metrics_usage_daily', 'metrics_modes',
                     'metrics_songs', 'metrics_help']) as r,
        unnest(array['anon']) as who,
        unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']) as p
   where has_table_privilege(who, format('public.%I', r), p)),
  null,
  'a signed-out visitor holds no privilege on any metrics table or summary');
select is(
  (select array_agg(r || ' ' || who || ' ' || p order by r, who, p)
   from unnest(array['ai_usage', 'app_events', 'metrics_ai_daily', 'metrics_usage_daily', 'metrics_modes',
                     'metrics_songs', 'metrics_help']) as r,
        unnest(array['authenticated']) as who,
        unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']) as p
   where has_table_privilege(who, format('public.%I', r), p)),
  null,
  'a signed-in session holds no privilege on any metrics table or summary');

select sequence_privs_are('public', 'ai_usage_id_seq', 'anon', array[]::text[],
  'anon has no privilege on the ai_usage sequence');
select sequence_privs_are('public', 'ai_usage_id_seq', 'authenticated', array[]::text[],
  'a signed-in session has no privilege on the ai_usage sequence');
select sequence_privs_are('public', 'app_events_id_seq', 'anon', array[]::text[],
  'anon has no privilege on the app_events sequence');
select sequence_privs_are('public', 'app_events_id_seq', 'authenticated', array[]::text[],
  'a signed-in session has no privilege on the app_events sequence');

select ok(
  has_table_privilege('service_role', 'public.ai_usage', 'select')
  and has_table_privilege('service_role', 'public.ai_usage', 'insert')
  and has_table_privilege('service_role', 'public.ai_usage', 'delete')
  and has_table_privilege('service_role', 'public.app_events', 'select')
  and has_table_privilege('service_role', 'public.app_events', 'insert')
  and has_table_privilege('service_role', 'public.app_events', 'delete'),
  'the service key may read, write and purge both tables');
select ok(
  has_table_privilege('service_role', 'public.metrics_ai_daily', 'select')
  and has_table_privilege('service_role', 'public.metrics_usage_daily', 'select')
  and has_table_privilege('service_role', 'public.metrics_modes', 'select')
  and has_table_privilege('service_role', 'public.metrics_songs', 'select')
  and has_table_privilege('service_role', 'public.metrics_help', 'select'),
  'the service key may read every summary');

-- Views run with the rights of whoever reads them (ruling S39), so they never open a table to a role without access.
select is(
  (select count(*) from pg_class c
   where c.relnamespace = 'public'::regnamespace and c.relkind = 'v' and c.relname like 'metrics\_%'),
  5::bigint,
  'there are five summaries');
select is(
  (select count(*) from pg_class c
   where c.relnamespace = 'public'::regnamespace and c.relkind = 'v' and c.relname like 'metrics\_%'
     and c.reloptions @> array['security_invoker=true']),
  5::bigint,
  'every summary is a security invoker view');

-- ---------------------------------------------------------------------------
-- purge_old_metrics: who may call it
-- ---------------------------------------------------------------------------

select function_privs_are('public', 'purge_old_metrics', array[]::text[], 'service_role', array['EXECUTE'],
  'the service key may purge old metrics');
select function_privs_are('public', 'purge_old_metrics', array[]::text[], 'authenticated', array[]::text[],
  'a signed-in session may not purge');
select function_privs_are('public', 'purge_old_metrics', array[]::text[], 'anon', array[]::text[],
  'anon may not purge');
select ok(not has_function_privilege('public', 'public.purge_old_metrics()', 'execute'),
  'the PUBLIC role may not purge');
select is((select proconfig from pg_proc where oid = 'public.purge_old_metrics()'::regprocedure),
  array['search_path=""'], 'purge_old_metrics runs with an empty search_path');
select isnt_definer('public', 'purge_old_metrics', array[]::text[],
  'purge_old_metrics runs with the rights of its caller, not its owner');

-- ---------------------------------------------------------------------------
-- app_config: the exchange rate the owner edits
-- ---------------------------------------------------------------------------

select matches((select value from public.app_config where key = 'brl_rate'), '^[0-9]+(\.[0-9]+)?$',
  'app_config holds a brl_rate, a decimal number kept as text');

-- ---------------------------------------------------------------------------
-- The daily purge job (ruling S40)
-- ---------------------------------------------------------------------------

select has_extension('pg_cron', 'pg_cron is installed');
-- A role that cannot use the cron schema can neither read the jobs nor schedule one: scheduled SQL runs as postgres.
select ok(
  not has_schema_privilege('anon', 'cron', 'usage') and not has_schema_privilege('authenticated', 'cron', 'usage'),
  'neither anon nor a signed-in session can use the cron schema');
select is((select count(*) from cron.job where jobname = 'hookbop_purge_old_metrics'), 1::bigint,
  'one job is named hookbop_purge_old_metrics');
-- Compared as jsonb: the text columns of cron.job carry a collation of their own, which results_eq cannot compare.
select is(
  (select jsonb_build_object('schedule', j.schedule, 'command', j.command, 'active', j.active, 'database', j.database)
   from cron.job j where j.jobname = 'hookbop_purge_old_metrics'),
  jsonb_build_object('schedule', '17 6 * * *', 'command', 'select * from public.purge_old_metrics()',
                     'active', true, 'database', current_database()),
  'it runs purge_old_metrics every day at 06:17 UTC (03:17 in Brasilia), and is active');
-- The statement of the migration, run a second time: the job of that name is replaced, not added.
select lives_ok(
  $$select cron.schedule('hookbop_purge_old_metrics', '17 6 * * *', 'select * from public.purge_old_metrics()')$$,
  'the migration can schedule the job again');
select is((select count(*) from cron.job where jobname = 'hookbop_purge_old_metrics'), 1::bigint,
  'and still leaves one job');

-- ---------------------------------------------------------------------------
-- The checks (rows are written the way the server does: with the service key)
-- ---------------------------------------------------------------------------

set local role service_role;

select lives_ok(
  $$insert into public.ai_usage (user_id, youtube_id, line_index)
    values ('e0000000-0000-0000-0000-000000000011', 'vidmet00001', 1)$$,
  'the service key writes an AI use with only the required columns');
select lives_ok(
  $$insert into public.app_events (user_id, session_id, name)
    values ('e0000000-0000-0000-0000-000000000011', 'e1000000-0000-0000-0000-000000000001', 'app_opened')$$,
  'the service key writes an event with only the required columns');

reset role;

select ok(
  (select input_tokens = 0 and output_tokens = 0 and cost_usd = 0 and created_at is not null
   from public.ai_usage where user_id = 'e0000000-0000-0000-0000-000000000011'),
  'an AI use with no tokens or cost is zero, and is stamped with the time');
select ok(
  (select props = '{}'::jsonb and created_at is not null
   from public.app_events where user_id = 'e0000000-0000-0000-0000-000000000011'),
  'an event with no props has empty ones, and is stamped with the time');

select throws_ok(
  $$insert into public.ai_usage (user_id, youtube_id, line_index, kind)
    values ('e0000000-0000-0000-0000-000000000011', 'vidmet00001', 1, 'summarize')$$,
  '23514', null, 'an AI use of a kind other than explain or translate is refused');
select throws_ok(
  $$insert into public.ai_usage (user_id, youtube_id, line_index, source)
    values ('e0000000-0000-0000-0000-000000000011', 'vidmet00001', 1, 'internet')$$,
  '23514', null, 'an AI use from a source other than model, cache or reuse is refused');
select throws_ok(
  $$insert into public.ai_usage (user_id, youtube_id, line_index, outcome)
    values ('e0000000-0000-0000-0000-000000000011', 'vidmet00001', 1, 'timeout')$$,
  '23514', null, 'an AI use with an outcome other than ok, declined or error is refused');

select throws_ok(
  $$insert into public.app_events (user_id, session_id, name)
    values ('e0000000-0000-0000-0000-000000000011', 'e1000000-0000-0000-0000-000000000001', 'app_closed')$$,
  '23514', null, 'an action outside the closed list is refused');
select throws_ok(
  $$insert into public.app_events (user_id, session_id, name)
    values ('e0000000-0000-0000-0000-000000000011', 'e1000000-0000-0000-0000-000000000001', 'APP_OPENED')$$,
  '23514', null, 'the action names are exact: the same name in capitals is refused');
select throws_ok(
  $$insert into public.app_events (user_id, session_id, name)
    values ('e0000000-0000-0000-0000-000000000011', 'e1000000-0000-0000-0000-000000000001', '')$$,
  '23514', null, 'an empty action is refused');

select lives_ok(
  $$insert into public.app_events (user_id, session_id, name)
    select 'e0000000-0000-0000-0000-000000000012', 'e1000000-0000-0000-0000-000000000002', n
    from unnest(array[
      'app_opened', 'song_opened', 'mode_selected', 'game_started', 'game_finished', 'game_abandoned',
      'help_explain', 'help_translate', 'continue_after_leave', 'install_prompt_shown', 'install_accepted',
      'invite_created', 'calibration_done'
    ]) as n$$,
  'the thirteen actions of the list are accepted');
select is((select count(*) from public.app_events where user_id = 'e0000000-0000-0000-0000-000000000012'), 13::bigint,
  'and all thirteen were written');

-- {"x": "<2039 letters>"} is 2048 bytes as text: the limit.
select is(octet_length(jsonb_build_object('x', repeat('a', 2039))::text), 2048,
  'the props used as the limit are 2048 bytes');
select lives_ok(
  $$insert into public.app_events (user_id, session_id, name, props)
    values ('e0000000-0000-0000-0000-000000000011', 'e1000000-0000-0000-0000-000000000001', 'app_opened',
            jsonb_build_object('x', repeat('a', 2039)))$$,
  'props of 2048 bytes are accepted');
select throws_ok(
  $$insert into public.app_events (user_id, session_id, name, props)
    values ('e0000000-0000-0000-0000-000000000011', 'e1000000-0000-0000-0000-000000000001', 'app_opened',
            jsonb_build_object('x', repeat('a', 2040)))$$,
  '23514', null, 'props of 2049 bytes are refused');
-- 1100 letters of two bytes are 1100 characters but 2200 bytes: the limit counts bytes.
select throws_ok(
  $$insert into public.app_events (user_id, session_id, name, props)
    values ('e0000000-0000-0000-0000-000000000011', 'e1000000-0000-0000-0000-000000000001', 'app_opened',
            jsonb_build_object('x', repeat('ã', 1100)))$$,
  '23514', null, 'props are measured in bytes, not characters');

-- The rows above were only for the checks; the summaries below start from nothing.
delete from public.ai_usage;
delete from public.app_events;

-- ---------------------------------------------------------------------------
-- Nobody reads or writes through the browser: not a member, not the owner, not a visitor
-- ---------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims = '{"sub":"e0000000-0000-0000-0000-000000000002","email":"ana@example.com"}';

select throws_ok(format('select * from public.%I', r), '42501', null, 'a member cannot read ' || r)
from unnest(array['ai_usage', 'app_events', 'metrics_ai_daily', 'metrics_usage_daily', 'metrics_modes',
                  'metrics_songs', 'metrics_help']) as r;
select throws_ok(
  $$insert into public.ai_usage (user_id, youtube_id, line_index)
    values ('e0000000-0000-0000-0000-000000000002', 'vidmet00001', 1)$$,
  '42501', null, 'a member cannot write ai_usage, not even in their own name');
select throws_ok(
  $$insert into public.app_events (user_id, session_id, name)
    values ('e0000000-0000-0000-0000-000000000002', 'e1000000-0000-0000-0000-000000000001', 'app_opened')$$,
  '42501', null, 'a member cannot write app_events, not even in their own name');
select throws_ok($$select nextval('public.ai_usage_id_seq')$$, '42501', null,
  'a member cannot draw from the ai_usage sequence');
select throws_ok($$select nextval('public.app_events_id_seq')$$, '42501', null,
  'a member cannot draw from the app_events sequence');
select throws_ok($$select * from public.purge_old_metrics()$$, '42501', null,
  'a member cannot purge');

set local request.jwt.claims = '{"sub":"e0000000-0000-0000-0000-000000000001","email":"owner@example.com"}';

select throws_ok(format('select * from public.%I', r), '42501', null, 'the owner cannot read ' || r || ' through the browser')
from unnest(array['ai_usage', 'app_events', 'metrics_ai_daily', 'metrics_usage_daily', 'metrics_modes',
                  'metrics_songs', 'metrics_help']) as r;
select throws_ok(
  $$insert into public.ai_usage (user_id, youtube_id, line_index)
    values ('e0000000-0000-0000-0000-000000000001', 'vidmet00001', 1)$$,
  '42501', null, 'the owner cannot write ai_usage through the browser');
select throws_ok(
  $$insert into public.app_events (user_id, session_id, name)
    values ('e0000000-0000-0000-0000-000000000001', 'e1000000-0000-0000-0000-000000000001', 'app_opened')$$,
  '42501', null, 'the owner cannot write app_events through the browser');

reset role;
set local role anon;

select throws_ok(format('select * from public.%I', r), '42501', null, 'anon cannot read ' || r)
from unnest(array['ai_usage', 'app_events', 'metrics_ai_daily', 'metrics_usage_daily', 'metrics_modes',
                  'metrics_songs', 'metrics_help']) as r;
select throws_ok(
  $$insert into public.ai_usage (user_id, youtube_id, line_index)
    values ('e0000000-0000-0000-0000-000000000009', 'vidmet00001', 1)$$,
  '42501', null, 'anon cannot write ai_usage');
select throws_ok(
  $$insert into public.app_events (user_id, session_id, name)
    values ('e0000000-0000-0000-0000-000000000009', 'e1000000-0000-0000-0000-000000000001', 'app_opened')$$,
  '42501', null, 'anon cannot write app_events');
select throws_ok($$select * from public.purge_old_metrics()$$, '42501', null,
  'anon cannot purge');

reset role;

-- ---------------------------------------------------------------------------
-- The summaries add up (invented data; days are counted in Brasília time, UTC-3)
-- ---------------------------------------------------------------------------

-- Two songs the app knows, and a third (vidmet00003) that it does not.
insert into public.videos (youtube_id, title, channel, duration_s, status) values
  ('vidmet00001', 'Neon Harbor', 'Test Band', 200, 'ok'),
  ('vidmet00002', 'Paper Lanterns', 'Test Band', 180, 'ok');

-- u1 = e0..11, u2 = e0..12, u3 = e0..13. Sessions s1 to s4 = e1..01 to e1..04.
-- Day 1 is 2026-03-10: u1 and u2 play at midday, and u3 at 01:30 UTC on the 11th, which is 22:30 on the 10th in
-- Brasília. Day 2 is 2026-03-11, with u1 only.
insert into public.app_events (created_at, user_id, session_id, name, youtube_id, mode, props) values
  ('2026-03-10 12:00:00-03', 'e0000000-0000-0000-0000-000000000011', 'e1000000-0000-0000-0000-000000000001', 'app_opened', null, null, '{}'),
  ('2026-03-10 12:01:00-03', 'e0000000-0000-0000-0000-000000000011', 'e1000000-0000-0000-0000-000000000001', 'song_opened', 'vidmet00001', null, '{}'),
  ('2026-03-10 12:02:00-03', 'e0000000-0000-0000-0000-000000000011', 'e1000000-0000-0000-0000-000000000001', 'mode_selected', 'vidmet00001', 'choice', '{}'),
  ('2026-03-10 12:03:00-03', 'e0000000-0000-0000-0000-000000000011', 'e1000000-0000-0000-0000-000000000001', 'game_started', 'vidmet00001', 'choice', '{}'),
  ('2026-03-10 12:05:00-03', 'e0000000-0000-0000-0000-000000000011', 'e1000000-0000-0000-0000-000000000001', 'help_explain', 'vidmet00001', 'choice', '{"lineIndex": 4}'),
  ('2026-03-10 12:06:00-03', 'e0000000-0000-0000-0000-000000000011', 'e1000000-0000-0000-0000-000000000001', 'help_translate', 'vidmet00001', 'choice', '{"lineIndex": 6}'),
  ('2026-03-10 12:10:00-03', 'e0000000-0000-0000-0000-000000000011', 'e1000000-0000-0000-0000-000000000001', 'game_finished', 'vidmet00001', 'choice', '{"pct": 80, "durationMs": 60000, "totalBlanks": 10}'),
  ('2026-03-10 13:00:00-03', 'e0000000-0000-0000-0000-000000000012', 'e1000000-0000-0000-0000-000000000002', 'app_opened', null, null, '{}'),
  ('2026-03-10 13:01:00-03', 'e0000000-0000-0000-0000-000000000012', 'e1000000-0000-0000-0000-000000000002', 'mode_selected', 'vidmet00001', 'type', '{}'),
  ('2026-03-10 13:02:00-03', 'e0000000-0000-0000-0000-000000000012', 'e1000000-0000-0000-0000-000000000002', 'game_started', 'vidmet00001', 'type', '{}'),
  ('2026-03-10 13:03:00-03', 'e0000000-0000-0000-0000-000000000012', 'e1000000-0000-0000-0000-000000000002', 'game_abandoned', 'vidmet00001', 'type', '{}'),
  ('2026-03-10 13:04:00-03', 'e0000000-0000-0000-0000-000000000012', 'e1000000-0000-0000-0000-000000000002', 'help_explain', 'vidmet00001', 'type', '{}'),
  ('2026-03-10 13:10:00-03', 'e0000000-0000-0000-0000-000000000012', 'e1000000-0000-0000-0000-000000000002', 'game_started', 'vidmet00002', 'choice', '{}'),
  ('2026-03-10 13:15:00-03', 'e0000000-0000-0000-0000-000000000012', 'e1000000-0000-0000-0000-000000000002', 'help_explain', 'vidmet00002', 'choice', '{"lineIndex": 10}'),
  ('2026-03-10 13:20:00-03', 'e0000000-0000-0000-0000-000000000012', 'e1000000-0000-0000-0000-000000000002', 'game_finished', 'vidmet00002', 'choice', '{"pct": 60, "durationMs": 40000, "totalBlanks": 8}'),
  ('2026-03-11 01:30:00+00', 'e0000000-0000-0000-0000-000000000013', 'e1000000-0000-0000-0000-000000000003', 'app_opened', null, null, '{}'),
  ('2026-03-11 01:31:00+00', 'e0000000-0000-0000-0000-000000000013', 'e1000000-0000-0000-0000-000000000003', 'game_started', 'vidmet00003', 'karaoke', '{}'),
  ('2026-03-11 01:40:00+00', 'e0000000-0000-0000-0000-000000000013', 'e1000000-0000-0000-0000-000000000003', 'game_finished', 'vidmet00003', 'karaoke', '{"pct": 0, "durationMs": 30000, "totalBlanks": 0}'),
  ('2026-03-11 12:00:00-03', 'e0000000-0000-0000-0000-000000000011', 'e1000000-0000-0000-0000-000000000004', 'app_opened', null, null, '{}'),
  ('2026-03-11 12:01:00-03', 'e0000000-0000-0000-0000-000000000011', 'e1000000-0000-0000-0000-000000000004', 'game_started', 'vidmet00001', 'choice', '{}'),
  ('2026-03-11 12:11:00-03', 'e0000000-0000-0000-0000-000000000011', 'e1000000-0000-0000-0000-000000000004', 'game_finished', 'vidmet00001', 'choice', '{"pct": 100, "durationMs": 50000, "totalBlanks": 10}'),
  ('2026-03-11 12:20:00-03', 'e0000000-0000-0000-0000-000000000011', 'e1000000-0000-0000-0000-000000000004', 'game_started', 'vidmet00001', 'type', '{}'),
  -- props that are not numbers must not break the summaries
  ('2026-03-11 12:30:00-03', 'e0000000-0000-0000-0000-000000000011', 'e1000000-0000-0000-0000-000000000004', 'game_finished', 'vidmet00001', 'type', '{"pct": "abc", "durationMs": null, "totalBlanks": 10}');

insert into public.ai_usage
  (created_at, user_id, youtube_id, line_index, kind, source, model, input_tokens, output_tokens, cost_usd, latency_ms, outcome)
values
  ('2026-03-10 12:05:00-03', 'e0000000-0000-0000-0000-000000000011', 'vidmet00001', 4, 'explain', 'model', 'test-model-a', 1000, 200, 0.000200, 800, 'ok'),
  ('2026-03-10 13:15:00-03', 'e0000000-0000-0000-0000-000000000012', 'vidmet00002', 10, 'explain', 'model', 'test-model-a', 500, 100, 0.000100, 600, 'ok'),
  ('2026-03-10 13:16:00-03', 'e0000000-0000-0000-0000-000000000011', 'vidmet00001', 4, 'explain', 'cache', null, 0, 0, 0, null, 'ok'),
  ('2026-03-10 13:17:00-03', 'e0000000-0000-0000-0000-000000000012', 'vidmet00002', 3, 'translate', 'reuse', null, 0, 0, 0, null, 'ok'),
  ('2026-03-10 13:18:00-03', 'e0000000-0000-0000-0000-000000000011', 'vidmet00001', 6, 'translate', 'model', 'test-model-a', 300, 20, 0.000040, 400, 'declined'),
  ('2026-03-10 13:19:00-03', 'e0000000-0000-0000-0000-000000000012', 'vidmet00001', 7, 'explain', 'model', 'test-model-a', 0, 0, 0, 1500, 'error'),
  ('2026-03-11 01:35:00+00', 'e0000000-0000-0000-0000-000000000013', 'vidmet00003', 1, 'explain', 'model', 'test-model-a', 100, 10, 0.000015, 500, 'ok'),
  ('2026-03-11 12:05:00-03', 'e0000000-0000-0000-0000-000000000011', 'vidmet00001', 4, 'translate', 'model', 'test-model-a', 2000, 400, 0.000400, 900, 'ok');

-- The summaries are read the way the server reads them: with the service key.
set local role service_role;

select results_eq(
  $$select day, calls, calls_model, calls_cache, calls_reuse, calls_declined, calls_error,
           input_tokens, output_tokens, cost_usd
    from public.metrics_ai_daily order by day$$,
  $$values
    ('2026-03-10'::date, 7::bigint, 5::bigint, 1::bigint, 1::bigint, 1::bigint, 1::bigint, 1900::bigint, 330::bigint, 0.000355::numeric),
    ('2026-03-11'::date, 1::bigint, 1::bigint, 0::bigint, 0::bigint, 0::bigint, 0::bigint, 2000::bigint, 400::bigint, 0.000400::numeric)$$,
  'metrics_ai_daily counts calls by source, outcome and day, and adds tokens and cost');

select results_eq(
  $$select day, active_users, sessions, games_started, games_finished, games_abandoned
    from public.metrics_usage_daily order by day$$,
  $$values
    ('2026-03-10'::date, 3::bigint, 3::bigint, 4::bigint, 3::bigint, 1::bigint),
    ('2026-03-11'::date, 1::bigint, 1::bigint, 2::bigint, 2::bigint, 0::bigint)$$,
  'metrics_usage_daily counts people, sessions and games by day, with the evening in Brasília on its own day');

select results_eq(
  $$select day, mode, mode_selections, games_started, games_finished, games_abandoned, avg_pct, avg_duration_ms
    from public.metrics_modes order by day, mode$$,
  $$values
    ('2026-03-10'::date, 'choice', 1::bigint, 2::bigint, 2::bigint, 0::bigint, 70.0::numeric, 50000::numeric),
    ('2026-03-10'::date, 'karaoke', 0::bigint, 1::bigint, 1::bigint, 0::bigint, null::numeric, 30000::numeric),
    ('2026-03-10'::date, 'type', 1::bigint, 1::bigint, 0::bigint, 1::bigint, null::numeric, null::numeric),
    ('2026-03-11'::date, 'choice', 0::bigint, 1::bigint, 1::bigint, 0::bigint, 100.0::numeric, 50000::numeric),
    ('2026-03-11'::date, 'type', 0::bigint, 1::bigint, 1::bigint, 0::bigint, null::numeric, null::numeric)$$,
  'metrics_modes counts games by mode and day; the average score leaves out Karaokê and props that are not numbers');

select results_eq(
  $$select day, youtube_id, title, song_opens, games_started, games_finished, games_abandoned, players
    from public.metrics_songs order by day, youtube_id$$,
  $$values
    ('2026-03-10'::date, 'vidmet00001', 'Neon Harbor', 1::bigint, 2::bigint, 1::bigint, 1::bigint, 2::bigint),
    ('2026-03-10'::date, 'vidmet00002', 'Paper Lanterns', 0::bigint, 1::bigint, 1::bigint, 0::bigint, 1::bigint),
    ('2026-03-10'::date, 'vidmet00003', null::text, 0::bigint, 1::bigint, 1::bigint, 0::bigint, 1::bigint),
    ('2026-03-11'::date, 'vidmet00001', 'Neon Harbor', 0::bigint, 2::bigint, 2::bigint, 0::bigint, 1::bigint)$$,
  'metrics_songs counts games by song and day, with the title from videos (none for a song the app does not know)');

select results_eq(
  $$select day, mode, kind, requests, users, songs, avg_line_index
    from public.metrics_help order by day, mode, kind$$,
  $$values
    ('2026-03-10'::date, 'choice', 'explain', 2::bigint, 2::bigint, 2::bigint, 7.0::numeric),
    ('2026-03-10'::date, 'choice', 'translate', 1::bigint, 1::bigint, 1::bigint, 6.0::numeric),
    ('2026-03-10'::date, 'type', 'explain', 1::bigint, 1::bigint, 1::bigint, null::numeric)$$,
  'metrics_help counts help requests by mode, kind and day, and averages the line they were asked on');

reset role;

-- ---------------------------------------------------------------------------
-- purge_old_metrics: only what is more than 12 months old
-- ---------------------------------------------------------------------------

delete from public.ai_usage;
delete from public.app_events;

-- now() is the same all through the transaction, so a row at exactly 12 months is not "more than 12 months".
insert into public.ai_usage (created_at, user_id, youtube_id, line_index) values
  (now() - interval '13 months', 'e0000000-0000-0000-0000-000000000011', 'vidmet00001', 1),
  (now() - interval '12 months' - interval '1 second', 'e0000000-0000-0000-0000-000000000011', 'vidmet00001', 2),
  (now() - interval '12 months', 'e0000000-0000-0000-0000-000000000011', 'vidmet00001', 3),
  (now() - interval '11 months', 'e0000000-0000-0000-0000-000000000011', 'vidmet00001', 4),
  (now(), 'e0000000-0000-0000-0000-000000000011', 'vidmet00001', 5);

insert into public.app_events (created_at, user_id, session_id, name, mode) values
  (now() - interval '13 months', 'e0000000-0000-0000-0000-000000000011', 'e1000000-0000-0000-0000-000000000001', 'app_opened', 'old'),
  (now() - interval '12 months' - interval '1 second', 'e0000000-0000-0000-0000-000000000011', 'e1000000-0000-0000-0000-000000000001', 'app_opened', 'just_past'),
  (now() - interval '12 months', 'e0000000-0000-0000-0000-000000000011', 'e1000000-0000-0000-0000-000000000001', 'app_opened', 'exact'),
  (now() - interval '11 months', 'e0000000-0000-0000-0000-000000000011', 'e1000000-0000-0000-0000-000000000001', 'app_opened', 'recent'),
  (now(), 'e0000000-0000-0000-0000-000000000011', 'e1000000-0000-0000-0000-000000000001', 'app_opened', 'now');

set local role service_role;

select results_eq(
  $$select ai_usage_deleted, app_events_deleted from public.purge_old_metrics()$$,
  $$values (2::bigint, 2::bigint)$$,
  'the service key purges the rows older than 12 months and is told how many went from each table');

reset role;

select is((select array_agg(line_index order by line_index) from public.ai_usage), array[3, 4, 5],
  'purging left the AI uses of 12 months or less');
select is((select array_agg(mode order by mode) from public.app_events), array['exact', 'now', 'recent'],
  'and the events of 12 months or less');

set local role service_role;

select results_eq(
  $$select ai_usage_deleted, app_events_deleted from public.purge_old_metrics()$$,
  $$values (0::bigint, 0::bigint)$$,
  'purging again finds nothing more');

reset role;

-- The job runs the command stored with it; it must be one that works.
select lives_ok((select command from cron.job where jobname = 'hookbop_purge_old_metrics'),
  'the command of the daily job runs');

select * from finish();

rollback;
