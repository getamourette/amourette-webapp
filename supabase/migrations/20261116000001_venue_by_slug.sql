-- SEC-001 (#364), step 1 of 2: additive slug lookup for participants.
--
-- The participant entry points (`/v/<slug>` and `/profile?venue=<slug>`) read
-- `public.venues` directly, which only works because every signed-in session
-- can select every venue. This RPC returns the one venue whose slug the caller
-- presents, so the next migration can close that listing.
--
-- Additive: nothing calls it before the application change ships, and it
-- exposes no more than the current `using (true)` policy already does.
create function public.venue_by_slug(p_slug text)
  returns table (id uuid, slug text, name text, city text, timezone text)
  language sql stable security definer set search_path = ''
as $$
  -- An unknown, malformed or null slug is simply "no such venue": the caller
  -- learns nothing beyond whether the slug it already holds exists.
  select v.id, v.slug, v.name, v.city, v.timezone
  from public.venues v
  where (select auth.uid()) is not null
    and p_slug collate "C" ~ '^[a-z0-9-]{1,80}$'
    and v.slug = p_slug;
$$;

comment on function public.venue_by_slug(text) is
  'Participant venue lookup: returns the venue whose exact slug is presented, never a list.';

revoke all on function public.venue_by_slug(text) from public, anon;
grant execute on function public.venue_by_slug(text) to authenticated;
