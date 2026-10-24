-- Hookbop: usage metrics for the owner (rulings S3, S39, S40 and S41).
--
-- Two tables record what the app does: ai_usage (one row per AI help request: where the answer came from, tokens,
-- estimated cost, time and outcome) and app_events (one row per action in the app, from a closed list). Five views
-- add them up by day, mode, song and kind of help, and metrics_active_people() counts the people and games of any
-- period, for the owner's panel and for an AI assistant that reads the database through the Supabase connector.
--
-- Access: the service key only, like help_requests. RLS is on and there is no policy, and anon and authenticated have
-- no privilege on the tables, their sequences or the views. The app writes the rows from its own routes and reads
-- the summaries on the server, after checking that the caller is the owner. No member ever reads them.
--
-- Rows are kept for 12 months. purge_old_metrics() deletes what is older, and pg_cron runs it once a day (ruling S40).
--
-- Days are counted in Brasília time (America/Sao_Paulo, UTC-3 all year since 2019): a game at 22:30 belongs to that
-- evening, not to the next day in UTC.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

-- One row per AI help request, whatever answered it. `kind` and `source` are always known, so every call lands in
-- exactly one bucket of the summaries (ruling S41). `source` is where the answer came from: the model (costs tokens),
-- the per-line cache or a reused chorus line (both free, with 0 tokens and a cost of 0). `outcome` is ok (what a row
-- that does not say is), a declined answer, or an error. The user and the song have no foreign key, so the log
-- outlives them.
create table public.ai_usage (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  user_id uuid not null,
  youtube_id text not null,
  line_index int not null,
  kind text not null check (kind in ('explain', 'translate')),
  source text not null check (source in ('model', 'cache', 'reuse')),
  model text,
  input_tokens int not null default 0,
  output_tokens int not null default 0,
  cost_usd numeric(12, 6) not null default 0,
  latency_ms int,
  outcome text not null default 'ok' check (outcome in ('ok', 'declined', 'error'))
);

create index ai_usage_created_at_idx on public.ai_usage (created_at);
create index ai_usage_user_id_created_at_idx on public.ai_usage (user_id, created_at);

-- One row per action in the app. `session_id` is one per opening of the app. `props` holds the few details of an
-- action (game_finished: pct, durationMs, totalBlanks; help_*: lineIndex) and is capped at 2048 bytes. The list of
-- names is closed: it is the one the events route accepts.
create table public.app_events (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  user_id uuid not null,
  session_id uuid not null,
  name text not null check (name in (
    'app_opened',
    'song_opened',
    'mode_selected',
    'game_started',
    'game_finished',
    'game_abandoned',
    'help_explain',
    'help_translate',
    'continue_after_leave',
    'install_prompt_shown',
    'install_accepted',
    'invite_created',
    'calibration_done'
  )),
  youtube_id text,
  mode text,
  props jsonb not null default '{}' check (octet_length(props::text) <= 2048)
);

create index app_events_created_at_idx on public.app_events (created_at);
create index app_events_name_created_at_idx on public.app_events (name, created_at);

comment on table public.ai_usage is
  'One row per AI help request: source (model, cache, reuse), tokens, estimated cost in USD, latency and outcome. Service key only.';
comment on table public.app_events is
  'One row per action in the app (closed list of names), with the session and a few props. Service key only.';

-- ---------------------------------------------------------------------------
-- Summaries (views)
-- ---------------------------------------------------------------------------

-- Every view is security invoker (ruling S39): it runs with the rights of whoever reads it, so it never opens a
-- table to a role that has no access, and Supabase's security definer view lint stays clean. The service key reads
-- them. Each row is a day, and the dimension of the view where it has one, so a period is the rows of its days:
-- counts add up across days. The averages do not: weigh them by games_finished.
--
-- `pct`, `durationMs`, `totalBlanks` and `lineIndex` come out of props only when they are JSON numbers, so one
-- odd row cannot make a summary fail.

-- AI calls by day: how many came from each source and with each outcome, the tokens and the cost in USD.
create view public.metrics_ai_daily
with (security_invoker = true) as
select
  (u.created_at at time zone 'America/Sao_Paulo')::date as day,
  count(*) as calls,
  count(*) filter (where u.source = 'model') as calls_model,
  count(*) filter (where u.source = 'cache') as calls_cache,
  count(*) filter (where u.source = 'reuse') as calls_reuse,
  count(*) filter (where u.outcome = 'declined') as calls_declined,
  count(*) filter (where u.outcome = 'error') as calls_error,
  sum(u.input_tokens) as input_tokens,
  sum(u.output_tokens) as output_tokens,
  sum(u.cost_usd) as cost_usd
from public.ai_usage u
group by 1;

-- Use by day: people with any action that day, sessions (one per opening of the app) and games. A game is
-- abandoned when a game_abandoned event says so. `active_users` and `sessions` do not add up across days.
create view public.metrics_usage_daily
with (security_invoker = true) as
select
  (e.created_at at time zone 'America/Sao_Paulo')::date as day,
  count(distinct e.user_id) as active_users,
  count(distinct e.session_id) as sessions,
  count(*) filter (where e.name = 'game_started') as games_started,
  count(*) filter (where e.name = 'game_finished') as games_finished,
  count(*) filter (where e.name = 'game_abandoned') as games_abandoned
from public.app_events e
group by 1;

-- Games by mode and day. `avg_pct` is the average score of the finished games that had blanks to answer (Karaokê
-- has none and always ends at 0, so it is left out), and `avg_duration_ms` the average length of the finished
-- games. Both are null when no finished game of the row carries the number.
create view public.metrics_modes
with (security_invoker = true) as
with events as (
  select
    (e.created_at at time zone 'America/Sao_Paulo')::date as day,
    e.mode,
    e.name,
    case when jsonb_typeof(e.props -> 'pct') = 'number' then (e.props ->> 'pct')::numeric end as pct,
    case when jsonb_typeof(e.props -> 'durationMs') = 'number' then (e.props ->> 'durationMs')::numeric end as duration_ms,
    case when jsonb_typeof(e.props -> 'totalBlanks') = 'number' then (e.props ->> 'totalBlanks')::numeric end as total_blanks
  from public.app_events e
  where e.mode is not null
    and e.name in ('mode_selected', 'game_started', 'game_finished', 'game_abandoned')
)
select
  day,
  mode,
  count(*) filter (where name = 'mode_selected') as mode_selections,
  count(*) filter (where name = 'game_started') as games_started,
  count(*) filter (where name = 'game_finished') as games_finished,
  count(*) filter (where name = 'game_abandoned') as games_abandoned,
  round(avg(pct) filter (where name = 'game_finished' and total_blanks > 0), 1) as avg_pct,
  round(avg(duration_ms) filter (where name = 'game_finished')) as avg_duration_ms
from events
group by day, mode;

-- Songs by day: how often each was opened and played, and by how many people. The title comes from videos and is
-- null for a song that table does not have.
create view public.metrics_songs
with (security_invoker = true) as
select
  (e.created_at at time zone 'America/Sao_Paulo')::date as day,
  e.youtube_id,
  v.title,
  count(*) filter (where e.name = 'song_opened') as song_opens,
  count(*) filter (where e.name = 'game_started') as games_started,
  count(*) filter (where e.name = 'game_finished') as games_finished,
  count(*) filter (where e.name = 'game_abandoned') as games_abandoned,
  count(distinct e.user_id) filter (where e.name = 'game_started') as players
from public.app_events e
left join public.videos v on v.youtube_id = e.youtube_id
where e.youtube_id is not null
  and e.name in ('song_opened', 'game_started', 'game_finished', 'game_abandoned')
group by 1, e.youtube_id, v.title;

-- Help requests by mode, kind (explain or translate, as in ai_usage) and day, from the help_* events, which carry
-- the mode that ai_usage does not. `avg_line_index` is the average line they were asked on (null when no event
-- carries it).
create view public.metrics_help
with (security_invoker = true) as
select
  (e.created_at at time zone 'America/Sao_Paulo')::date as day,
  e.mode,
  case e.name when 'help_explain' then 'explain' when 'help_translate' then 'translate' end as kind,
  count(*) as requests,
  count(distinct e.user_id) as users,
  count(distinct e.youtube_id) as songs,
  round(avg(case when jsonb_typeof(e.props -> 'lineIndex') = 'number' then (e.props ->> 'lineIndex')::numeric end), 1) as avg_line_index
from public.app_events e
where e.name in ('help_explain', 'help_translate')
group by 1, 2, 3;

comment on view public.metrics_ai_daily is
  'AI help by day (Brasilia time): calls by source and outcome, tokens and cost in USD. Counts add up across days.';
comment on view public.metrics_usage_daily is
  'Use by day: active people, sessions and games started, finished and abandoned. Active people and sessions do not add up across days: for the people of a period use metrics_active_people().';
comment on view public.metrics_modes is
  'Games by day and mode: selected, started, finished, abandoned; average score and duration of finished games (weigh by games_finished).';
comment on view public.metrics_songs is
  'Songs by day: opens, games started, finished and abandoned, and players. The title comes from videos.';
comment on view public.metrics_help is
  'Help requests by day, mode and kind (explain, translate), with the average line asked on.';

-- ---------------------------------------------------------------------------
-- People over a period (ruling S41)
-- ---------------------------------------------------------------------------

-- The people active in a period, and the games started and finished in it, counted over app_events from p_from
-- (included) to p_to (excluded). `people` is distinct users, so a person active on several days counts once: the
-- daily `active_users` of metrics_usage_daily cannot be added up to get this. The caller chooses the bounds; for whole
-- days in Brasília time they are midnight there. It always returns one row, of zeros for a period with no event (or
-- with a null bound). It only reads, and runs with the rights of its caller.
create function public.metrics_active_people(p_from timestamptz, p_to timestamptz)
returns table (people bigint, games_started bigint, games_finished bigint)
language sql
stable
set search_path = ''
as $$
  select
    count(distinct e.user_id),
    count(*) filter (where e.name = 'game_started'),
    count(*) filter (where e.name = 'game_finished')
  from public.app_events e
  where e.created_at >= p_from and e.created_at < p_to;
$$;

comment on function public.metrics_active_people(timestamptz, timestamptz) is
  'People active (distinct users) and games started and finished in [p_from, p_to). Service key only.';

-- ---------------------------------------------------------------------------
-- The exchange rate
-- ---------------------------------------------------------------------------

-- Reais per US dollar, as text, for the panel's estimate in reais. The owner sets the real value; a value that is
-- already there stays.
insert into public.app_config (key, value) values ('brl_rate', '5.50')
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- Retention
-- ---------------------------------------------------------------------------

-- Deletes the rows of ai_usage and app_events that are more than 12 months old and says how many went from each.
-- It runs with the rights of its caller, which has the privileges on both tables: the service key, or postgres when
-- the daily job below calls it.
create function public.purge_old_metrics()
returns table (ai_usage_deleted bigint, app_events_deleted bigint)
language plpgsql
set search_path = ''
as $$
declare
  v_cutoff constant timestamptz := now() - interval '12 months';
  v_ai_usage bigint;
  v_app_events bigint;
begin
  delete from public.ai_usage where created_at < v_cutoff;
  get diagnostics v_ai_usage = row_count;

  delete from public.app_events where created_at < v_cutoff;
  get diagnostics v_app_events = row_count;

  return query select v_ai_usage, v_app_events;
end;
$$;

-- ---------------------------------------------------------------------------
-- Access: the service key only
-- ---------------------------------------------------------------------------

-- Supabase grants everything on a new table, sequence, view and function to anon and authenticated by default.
-- Take it all back, then give the service key what it uses.
revoke all on public.ai_usage, public.app_events from public, anon, authenticated;
revoke all on sequence public.ai_usage_id_seq, public.app_events_id_seq from public, anon, authenticated;
revoke all on public.metrics_ai_daily, public.metrics_usage_daily, public.metrics_modes, public.metrics_songs,
  public.metrics_help from public, anon, authenticated;
revoke all on function public.purge_old_metrics() from public, anon, authenticated;
revoke all on function public.metrics_active_people(timestamptz, timestamptz) from public, anon, authenticated;

grant select, insert, delete on public.ai_usage, public.app_events to service_role;
grant usage on sequence public.ai_usage_id_seq, public.app_events_id_seq to service_role;
grant select on public.metrics_ai_daily, public.metrics_usage_daily, public.metrics_modes, public.metrics_songs,
  public.metrics_help to service_role;
grant execute on function public.purge_old_metrics() to service_role;
grant execute on function public.metrics_active_people(timestamptz, timestamptz) to service_role;

-- RLS on and no policy: even a role that was given a grant by mistake would read and write nothing.
alter table public.ai_usage enable row level security;
alter table public.app_events enable row level security;

-- ---------------------------------------------------------------------------
-- Daily purge (rulings S40 and S41)
-- ---------------------------------------------------------------------------

-- This block is last on purpose: everything above, the lockdown included, is already in place if creating the
-- extension ever fails on its own, and the block can be cut off clean.
--
-- Runs the purge once a day at 06:17 UTC (03:17 in Brasília), when nobody is playing. The job has a fixed name, and
-- cron.schedule replaces the job of the same name instead of adding one, so applying this migration again leaves a
-- single job. It runs as the role that scheduled it (postgres), which owns the function and both tables, so it does not
-- depend on the grants above. Only that role can use the cron schema: no browser role can read or change the job.
create extension if not exists pg_cron;

select cron.schedule('hookbop_purge_old_metrics', '17 6 * * *', 'select * from public.purge_old_metrics()');
