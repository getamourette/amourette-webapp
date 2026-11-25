-- #258: a founder deletes a guest's profile and account on a verified request.
--
-- The deletion itself is the Auth Admin API's user deletion, run by the
-- server route /api/admin/account-deletion after it has removed the guest's
-- photo files (Storage objects are not database rows and no cascade reaches
-- them). Every application table that references the account or the profile
-- already cascades or sets the reference to null. What deliberately stays:
-- the founder action history (private.moderation_events, #234) and the
-- matching consent proof (private.matching_consent_events, kept 12 months
-- after account deletion per the data register), both bare ids with no
-- foreign key; reservation and payment records, which are not linked to any
-- account (docs/launch-reservation-policy.md).
--
-- This function answers the one question the route cannot answer with its own
-- grants: may this account be deleted now? It deletes nothing.
--   'ready'        nothing stands in the way
--   'gone'         no account has this id (already deleted, or never existed)
--   'self'         the founder's own account
--   'founder'      a founder account: never deleted from the console
--   'open_report'  a report this person made or received is not yet decided:
--                  deleting would erase it (reports cascade with the profile)
--   'open_case'    a moderation case about this person awaits review
--   'removed'      removed from a night that has not ended: deleting would
--                  erase the removal and let a new account walk back in
create function public.admin_account_deletion_check(p_profile uuid)
returns text
language plpgsql
stable
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
  if not exists (select 1 from auth.users where id = p_profile) then return 'gone'; end if;
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
  return 'ready';
end $$;

revoke all on function public.admin_account_deletion_check(uuid) from public, anon, service_role;
grant execute on function public.admin_account_deletion_check(uuid) to authenticated;
