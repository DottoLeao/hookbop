-- Hookbop: an hourly budget for AI help, per member and per kind of help (ruling R73).
--
-- The help route used to count a member's requests and write the new one only after the model had answered, so
-- requests sent together all passed the count. Now each request first reserves its row, under a lock per member,
-- and the route gives the row back when the model fails. Explanations and translations have budgets of their own,
-- so the translations of Karaokê never use up "Não entendi". The limits themselves live in the app, which passes
-- them in.

alter table public.help_requests
  add column kind text not null default 'explain' check (kind in ('explain', 'translate'));

-- Every count is by member, kind and time. This index covers what the one on (user_id, created_at) did.
drop index public.help_requests_user_id_created_at_idx;
create index help_requests_user_id_kind_created_at_idx on public.help_requests (user_id, kind, created_at);

-- Takes one request from the member's budget for that kind in the last hour: the id of the row it wrote, or null
-- when `p_limit` requests of that kind were already made (or the limit is null or not positive). An unknown kind
-- raises 23514, the check on the column.
create function public.reserve_help_request(p_user_id uuid, p_kind text, p_limit int)
returns bigint
language plpgsql
set search_path = ''
as $$
declare
  v_id bigint;
begin
  -- One lock per member makes their reservations queue up, so two requests sent together cannot both take the
  -- last slot. Other members are not held up.
  perform pg_advisory_xact_lock(hashtext(p_user_id::text));

  if p_limit is null or (
    select count(*)
    from public.help_requests r
    where r.user_id = p_user_id
      and r.kind = p_kind
      and r.created_at >= now() - interval '1 hour'
  ) >= p_limit then
    return null;
  end if;

  insert into public.help_requests (user_id, kind)
  values (p_user_id, p_kind)
  returning id into v_id;

  return v_id;
end;
$$;

-- Gives a reservation back, when the model gave no answer. A row that is not there is no error.
create function public.release_help_request(p_id bigint)
returns void
language sql
set search_path = ''
as $$
  delete from public.help_requests where id = p_id;
$$;

-- The service key only, like the table itself: no member may spend or refund a budget.
revoke all on function public.reserve_help_request(uuid, text, int) from public, anon, authenticated;
revoke all on function public.release_help_request(bigint) from public, anon, authenticated;

grant execute on function public.reserve_help_request(uuid, text, int) to service_role;
grant execute on function public.release_help_request(bigint) to service_role;
