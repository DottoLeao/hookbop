-- Hookbop: a wider range for the lyrics offset (ruling R87).

-- 0004 limited an offset vote to 30 s either way. Music videos with a long intro (a cinematic opening, a spoken
-- scene) start their first sung line well past that, and a player calibrating one of them was refused. The limit is
-- now 120 s either way: still far from any number a member could type to drag the median, and enough for the longest
-- intros. Only the bound changes; the function is recreated whole from 0004, and it stays security definer with an
-- empty search_path and fully qualified names.

-- Records the caller's vote for a video's lyrics offset, then stores the median of all votes in videos.offset_ms and
-- returns it. With an even number of votes the median is the mean of the two middle ones; the result is rounded to a
-- whole ms. A vote must be within 120 s either way (22023 otherwise, and for no vote at all).
create or replace function public.set_offset_vote(p_youtube_id text, p_offset_ms int)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  c_max_offset_ms constant int := 120000;
  v_median int;
begin
  if not public.is_member() then
    raise exception 'only members can vote' using errcode = '42501';
  end if;

  if p_offset_ms is null or p_offset_ms not between -c_max_offset_ms and c_max_offset_ms then
    raise exception 'an offset vote must be within 120 s either way' using errcode = '22023';
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

-- The same grants as 0001 and 0004: signed-in users only.
revoke all on function public.set_offset_vote(text, int) from public, anon;

grant execute on function public.set_offset_vote(text, int) to authenticated;
