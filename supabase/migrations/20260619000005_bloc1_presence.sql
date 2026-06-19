-- Bloc 1 — QR check-in & live presence.
-- The presence table shipped in Bloc 0 but was never used: the room showed the
-- whole profiles table. This migration makes presence real and scopes the room
-- (and the profiles a user can read) to who is actually here, now.
--
-- Presence model (see docs/decisions.md, 2026-06-19): "the room of tonight".
-- You are present from check-in until you explicitly leave or the night rolls
-- over at a fixed local hour (the rollover cron lives in the next migration).
-- No short heartbeat timeout — a phone in a pocket must not drop you from a room
-- you are physically standing in.

-- ---------------------------------------------------------------------------
-- 1. venues.timezone — the local zone whose 06:00 ends the night. Derived from
--    city today; stored explicitly so the rollover does not hardcode a city map.
-- ---------------------------------------------------------------------------
alter table public.venues
  add column if not exists timezone text not null default 'UTC';

update public.venues set timezone = 'Europe/Paris'   where city = 'Paris';
update public.venues set timezone = 'America/New_York' where city = 'New York';

-- ---------------------------------------------------------------------------
-- 2. check_in(venue) — idempotent check-in. One room at a time: leaving any
--    other active presence, then either bumping an existing active row here or
--    inserting a fresh one. SECURITY INVOKER so it runs under the caller's RLS
--    (all rows it touches are the caller's own). Also serves as the heartbeat:
--    calling it again just bumps last_seen_at.
-- ---------------------------------------------------------------------------
create or replace function public.check_in(p_venue_id uuid)
  returns public.presence
  language plpgsql
  security invoker
  set search_path = public
as $$
declare
  me uuid := (select auth.uid());
  result public.presence;
begin
  if me is null then
    raise exception 'not authenticated';
  end if;

  -- One room at a time: leave any active presence in a different venue.
  update public.presence
    set left_at = now()
    where profile_id = me and left_at is null and venue_id <> p_venue_id;

  -- Already here? bump the heartbeat. Otherwise check in fresh.
  update public.presence
    set last_seen_at = now()
    where profile_id = me and left_at is null and venue_id = p_venue_id
    returning * into result;

  if not found then
    insert into public.presence (profile_id, venue_id)
      values (me, p_venue_id)
      returning * into result;
  end if;

  return result;
end;
$$;

revoke execute on function public.check_in(uuid) from anon, public;
grant  execute on function public.check_in(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Visibility helpers. RLS policies that reference the same table they protect
--    cause "infinite recursion detected in policy" in Postgres, so the set of
--    ids a user may see is computed in SECURITY DEFINER helpers (which bypass
--    RLS) and the policies just test membership against them.
-- ---------------------------------------------------------------------------

-- Venues the current user is currently checked into.
create or replace function public.my_active_venue_ids()
  returns setof uuid
  language sql
  security definer
  stable
  set search_path = public
as $$
  select venue_id
  from public.presence
  where profile_id = (select auth.uid())
    and left_at is null
$$;

revoke execute on function public.my_active_venue_ids() from anon, public;
grant  execute on function public.my_active_venue_ids() to authenticated;

-- Profiles the current user may read: self, anyone co-present in a venue they
-- are currently in, and anyone they have matched with (so a match stays
-- readable even after the other person leaves the room).
create or replace function public.visible_profile_ids()
  returns setof uuid
  language sql
  security definer
  stable
  set search_path = public
as $$
  select (select auth.uid())
  union
  select theirs.profile_id
  from public.presence mine
  join public.presence theirs on theirs.venue_id = mine.venue_id
  where mine.profile_id = (select auth.uid())
    and mine.left_at is null
    and theirs.left_at is null
  union
  select case
           when m.profile_a = (select auth.uid()) then m.profile_b
           else m.profile_a
         end
  from public.matches m
  where (select auth.uid()) in (m.profile_a, m.profile_b)
$$;

revoke execute on function public.visible_profile_ids() from anon, public;
grant  execute on function public.visible_profile_ids() to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Tighten presence SELECT to your own rows + the venues you are in. (Was
--    open to every authenticated user in Bloc 0; the live invariant means you
--    should only see who is in the room you are standing in.)
-- ---------------------------------------------------------------------------
drop policy if exists presence_select_authenticated on public.presence;

create policy presence_select_copresent on public.presence
  for select to authenticated
  using (
    profile_id = (select auth.uid())
    or venue_id in (select public.my_active_venue_ids())
  );

-- ---------------------------------------------------------------------------
-- 5. Tighten profiles SELECT to co-present (+ matched) users. This closes the
--    intentional Bloc 0 hole (profiles readable by any authenticated session)
--    now that presence exists. PII was never here — it lives in profile_private.
-- ---------------------------------------------------------------------------
drop policy if exists profiles_select_authenticated on public.profiles;

create policy profiles_select_copresent on public.profiles
  for select to authenticated
  using (id in (select public.visible_profile_ids()));

-- ---------------------------------------------------------------------------
-- 6. Realtime — the room should fill and empty live as people check in / leave.
-- ---------------------------------------------------------------------------
alter publication supabase_realtime add table public.presence;
