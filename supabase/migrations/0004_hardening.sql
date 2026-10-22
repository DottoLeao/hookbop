-- Hookbop: hardening before the closed beta (rulings R81 and R82).

-- ---------------------------------------------------------------------------
-- videos: written by the server only (ruling R81)
-- ---------------------------------------------------------------------------

-- 0001 let every member add and update videos, so any member could rewrite the lyrics, the status or the title of
-- a song for everyone, and the help route's line check (ruling R61) would then trust what they planted. Songs are
-- now resolved by POST /api/song, which writes these rows with the service key. Members keep reading them through
-- the select policy, and the offset still changes through set_offset_vote, a security definer function.

drop policy "members add videos" on public.videos;
drop policy "members update videos" on public.videos;

revoke insert, update on public.videos from authenticated;
