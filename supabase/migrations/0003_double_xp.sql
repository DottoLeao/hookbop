-- Hookbop: "Dobrar o XP" at the end of a song goes through the database (ruling R67).
--
-- A member may insert their own plays but not update them (0001 grants only select and insert on plays), and
-- that stays so: an update grant would let a client write any XP into its own play. Doubling is the one change
-- a play is allowed after it is saved, so it is a function that does exactly that and nothing else. The row is
-- changed by a single atomic update, so two taps on the button, or two devices, double the XP once.

-- Doubles the XP of the caller's own play, once, and returns the XP the play ends up with. When the XP was
-- already doubled it returns the current XP and changes nothing, so asking again is harmless. A play that is
-- not the caller's, or does not exist, raises P0002 (the same answer for both, so it does not say which plays
-- exist), and a caller who is not a member raises 42501.
create function public.apply_double_xp(p_play_id uuid)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_xp int;
begin
  if not public.is_member() then
    raise exception 'only members can double their XP' using errcode = '42501';
  end if;

  -- A play with no XP recorded counts as 0, which stays 0 once doubled.
  update public.plays p
  set xp = coalesce(p.xp, 0) * 2, double_xp_used = true
  where p.id = p_play_id and p.user_id = auth.uid() and not p.double_xp_used
  returning p.xp into v_xp;
  if found then
    return v_xp;
  end if;

  -- Nothing was updated: either the XP was doubled before (give it back as it is) or the play is not theirs.
  -- A second call that waited for the first one's lock lands here too, and reads the doubled value.
  select coalesce(p.xp, 0) into v_xp
  from public.plays p
  where p.id = p_play_id and p.user_id = auth.uid();
  if not found then
    raise exception 'unknown play' using errcode = 'P0002';
  end if;

  return v_xp;
end;
$$;

-- Only signed-in members call it; anon and the public role must not.
revoke all on function public.apply_double_xp(uuid) from public, anon;
grant execute on function public.apply_double_xp(uuid) to authenticated;
