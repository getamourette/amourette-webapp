-- #258: a founder deletes a guest's profile and account on a verified request.
--
-- The check and the deletion are one statement sequence under one lock, so a
-- report, case or removal written meanwhile can never be erased by the cascade:
-- `for update` on the profile row conflicts with the key-share lock every
-- foreign-key insert into reports, moderation_cases and venue_ejections takes.
-- Such a writer either committed first (and the check below sees it) or waits
-- and then fails because the profile is gone.
--
-- Deleting the auth.users row is what the Auth Admin API does; every
-- application table that references the account or the profile cascades or
-- sets the reference to null. What deliberately stays (bare ids, no foreign
-- key): the founder action history (private.moderation_events, #234), the
-- matching consent proof (private.matching_consent_events, 12 months after
-- account deletion per the data register) and the night report sources
-- (private.night_people, private.night_intervals, #257) until the night is
-- finalized. Reservation and payment records are not linked to any account
-- (docs/launch-reservation-policy.md). Photo files are Storage objects, not
-- rows: the route /api/admin/account-deletion removes them after this returns
-- 'deleted' or 'gone'.
--
-- Returns:
--   'deleted'      the account and every row naming it are gone
--   'gone'         no account has this id (already deleted, or never existed)
--   'self'         the founder's own account
--   'founder'      a founder account: never deleted from the console
--   'open_report'  a report this person made or received is not yet decided
--   'open_case'    a moderation case about this person awaits review
--   'removed'      removed from a night that has not ended: deleting would
--                  erase the removal and let a new account walk back in
create function public.admin_delete_guest_account(p_profile uuid)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if not private.is_admin() then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if p_profile is null then
    raise exception 'profile required' using errcode = '22023';
  end if;
  if p_profile = (select auth.uid()) then return 'self'; end if;
  if exists (select 1 from public.admins where user_id = p_profile) then return 'founder'; end if;
  perform 1 from auth.users where id = p_profile for update;
  if not found then return 'gone'; end if;
  perform 1 from public.profiles where id = p_profile for update;
  if exists (select 1 from public.reports
      where (reporter_id = p_profile or reported_id = p_profile) and reviewed_at is null) then
    return 'open_report';
  end if;
  if exists (select 1 from public.moderation_cases
      where reported_id = p_profile and status = 'pending_review') then
    return 'open_case';
  end if;
  if exists (select 1 from public.venue_ejections where profile_id = p_profile) then
    return 'removed';
  end if;
  delete from auth.users where id = p_profile;
  return 'deleted';
end $$;

revoke all on function public.admin_delete_guest_account(uuid) from public, anon, service_role;
grant execute on function public.admin_delete_guest_account(uuid) to authenticated;
