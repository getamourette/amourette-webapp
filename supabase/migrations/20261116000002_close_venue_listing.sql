-- SEC-001 (#364), step 2 of 2: participants can no longer list venues.
--
-- BEHAVIORAL. Apply only after the application that calls
-- `public.venue_by_slug` is deployed: the previous client resolves the slug by
-- selecting `public.venues` and would show "venue not found" to everyone.
--
-- Before: `venues_select_authenticated using (true)` let any signed-in session
-- (including a free anonymous one) enumerate every venue with its id, slug and
-- address, then read any night's live count through `venue_night_state` and
-- check in remotely.
--
-- After: a session reads a venue row only when it is a founder admin, or when
-- it already attended that venue (its own presence row, which is what the chat
-- header and the profile-correction return join on). Everyone else reaches a
-- venue only through `public.venue_by_slug`, by presenting its slug. Venue ids
-- are random UUIDs, so `venue_night_state` and `check_in` are reachable only
-- with an id obtained from that lookup.
--
-- Not changed here (decision of 2026-11-16 in docs/decisions.md): someone who
-- knows the slug can still check in remotely; proof of presence (rotating or
-- signed QR) is deferred until after the pilot.

-- Policies on `venues` must not read `presence` under the caller's RLS; the
-- helper lives in `private` so PostgREST does not expose it as an RPC.
create function private.my_attended_venue_ids()
  returns setof uuid
  language sql stable security definer set search_path = ''
as $$
  select p.venue_id from public.presence p where p.profile_id = (select auth.uid());
$$;

revoke all on function private.my_attended_venue_ids() from public, anon;
grant execute on function private.my_attended_venue_ids() to authenticated;

drop policy venues_select_authenticated on public.venues;

create policy venues_select_admin_or_attended on public.venues
  for select to authenticated
  using (
    (select private.is_admin())
    or id in (select private.my_attended_venue_ids())
  );
