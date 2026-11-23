-- The first profile-photo bucket was created by hand in the dashboard in June
-- 2026, so no migration ever created it: later migrations only update it, and
-- an empty project replayed from this directory ended up without it (#280,
-- SEC-018). Create it with the settings those migrations converge on. The
-- statement changes nothing where the bucket already exists.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'profile-photos',
  'profile-photos',
  false,
  52428800,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;
