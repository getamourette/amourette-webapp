-- #227: authorize discovery before returning cards or private photo bytes.
-- Behavioral cutover: old clients requesting preferences will fail closed.
-- Coordinate application release with the founders; never restore broad SELECT.
begin;

-- Return presence IDs, not just profile IDs: permission in one live night must
-- never expose that person's historical attendance or attendance elsewhere.
create function private.discoverable_presence_ids()
returns setof uuid
language sql stable security definer set search_path = '' as $$
  select theirs.id
  from public.presence mine
  join public.presence theirs on theirs.venue_night_id = mine.venue_night_id
  join public.venue_nights night on night.id = mine.venue_night_id
  join public.profiles viewer on viewer.id = mine.profile_id
  join public.profiles candidate on candidate.id = theirs.profile_id
  where mine.profile_id = (select auth.uid())
    and theirs.profile_id <> mine.profile_id
    and mine.left_at is null and mine.is_visible
    and theirs.left_at is null and theirs.is_visible
    and night.status = 'live' and night.terminal_at is null and now() < night.closes_at
    and candidate.gender = any(viewer.interested_in)
    and viewer.gender = any(candidate.interested_in)
    and private.photo_allowed(mine.profile_id) and private.photo_allowed(theirs.profile_id)
    and not exists (
      select 1 from public.blocks b
      where (b.blocker_id = mine.profile_id and b.blocked_id = theirs.profile_id)
         or (b.blocker_id = theirs.profile_id and b.blocked_id = mine.profile_id)
    )
$$;
revoke all on function private.discoverable_presence_ids() from public, anon;
grant execute on function private.discoverable_presence_ids() to authenticated;

create or replace function private.visible_profile_ids()
returns setof uuid
language sql stable security definer set search_path = '' as $$
  select auth.uid()
  union
  select p.profile_id from public.presence p
  where p.id in (select private.discoverable_presence_ids())
  union
  -- Established chat access deliberately does not depend on current discovery
  -- preferences, visibility, departure or the viewer's photo correction state.
  -- Keep the existing night and block boundary; rejected photos remain hidden.
  select case when m.profile_a = auth.uid() then m.profile_b else m.profile_a end
  from public.matches m join public.venue_nights night on night.id = m.venue_night_id
  where auth.uid() in (m.profile_a, m.profile_b)
    and night.status = 'live' and night.terminal_at is null and now() < night.closes_at
    and not exists (
      select 1 from public.blocks b
      where (b.blocker_id = m.profile_a and b.blocked_id = m.profile_b)
         or (b.blocker_id = m.profile_b and b.blocked_id = m.profile_a)
    )
$$;

drop policy presence_select_copresent on public.presence;
create policy presence_select_copresent on public.presence
for select to authenticated using (
  profile_id = (select auth.uid())
  or id in (select private.discoverable_presence_ids())
);

-- Table grants override column grants; remove both possible sources of SELECT.
revoke select on public.profiles from public, anon, authenticated;
revoke select (gender, interested_in) on public.profiles from public, anon, authenticated;
grant select (id, first_name, bio, photo_url, created_at, updated_at)
  on public.profiles to authenticated;

-- No caller-supplied identity, and an explicit projection rather than a row
-- type that would expose future private columns automatically.
create function public.get_my_profile()
returns table (id uuid, first_name text, bio text, photo_url text, gender text, interested_in text[])
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  return query select p.id, p.first_name, p.bio, p.photo_url, p.gender, p.interested_in
    from public.profiles p where p.id = auth.uid();
end
$$;
revoke all on function public.get_my_profile() from public, anon;
grant execute on function public.get_my_profile() to authenticated;

create or replace function private.can_view_public_photo(p_profile uuid)
returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and (
    p_profile = auth.uid() or private.is_admin() or (
      private.photo_allowed(p_profile)
      and p_profile in (select private.visible_profile_ids())
    )
  )
$$;

drop function public.preview_room_profiles(uuid);
drop function public.set_venue_profile_preview(uuid, boolean);
drop function private.can_like_preview_profile(uuid, uuid, uuid);
-- Retain the field in historical venue composite results until a later cleanup.
update public.venues set profile_preview_enabled = false where profile_preview_enabled;
alter table public.venues add constraint venues_profile_preview_disabled check (not profile_preview_enabled);

-- Profiles must not reach Postgres Changes, including UPDATE old values and
-- DELETE payloads (which cannot be authorized by RLS). Assert a safe publication
-- shape and remove any explicit profile membership left by schema drift.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime' and puballtables)
    or exists (select 1 from pg_publication_namespace pn
      join pg_publication pub on pub.oid = pn.pnpubid
      join pg_namespace ns on ns.oid = pn.pnnspid
      where pub.pubname = 'supabase_realtime' and ns.nspname = 'public') then
    raise exception 'supabase_realtime must use explicit safe table membership';
  end if;
  if exists (select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'profiles') then
    alter publication supabase_realtime drop table public.profiles;
  end if;
end
$$;

commit;
