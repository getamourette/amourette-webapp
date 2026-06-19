-- Bloc 1 — move the RLS visibility helpers out of the API surface.
-- my_active_venue_ids() and visible_profile_ids() are SECURITY DEFINER helpers
-- that exist only to be called from RLS policies (they break the policy
-- self-recursion that referencing the protected table directly would cause).
-- In the `public` schema PostgREST exposes them as /rest/v1/rpc endpoints, which
-- is needless attack surface, so they move to a `private` schema PostgREST does
-- not expose. The data they return is non-sensitive (your own co-present room),
-- but women-first means we keep the callable surface as small as possible.

create schema if not exists private;
grant usage on schema private to authenticated;

create or replace function private.my_active_venue_ids()
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

revoke execute on function private.my_active_venue_ids() from public, anon;
grant  execute on function private.my_active_venue_ids() to authenticated;

create or replace function private.visible_profile_ids()
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

revoke execute on function private.visible_profile_ids() from public, anon;
grant  execute on function private.visible_profile_ids() to authenticated;

-- Re-point the policies at the private helpers, then drop the public copies.
drop policy if exists presence_select_copresent on public.presence;
create policy presence_select_copresent on public.presence
  for select to authenticated
  using (
    profile_id = (select auth.uid())
    or venue_id in (select private.my_active_venue_ids())
  );

drop policy if exists profiles_select_copresent on public.profiles;
create policy profiles_select_copresent on public.profiles
  for select to authenticated
  using (id in (select private.visible_profile_ids()));

drop function if exists public.my_active_venue_ids();
drop function if exists public.visible_profile_ids();
