-- Local development data. `npx supabase db reset` loads this file.
--
-- owner_email is a placeholder: the owner replaces it with their real e-mail at
-- deploy time (update public.app_config with the service key). The first sign-in
-- with that e-mail becomes the owner profile through ensure_owner().
-- member_cap is the most active members the app accepts.
insert into public.app_config (key, value) values
  ('owner_email', 'owner@example.com'),
  ('member_cap', '50')
on conflict (key) do nothing;
