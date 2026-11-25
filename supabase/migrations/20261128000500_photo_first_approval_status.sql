-- #483 (bug review finding Z5-M10): approving a photo that was already
-- displayed (a guest's first photo, shown unverified from the start) told the
-- guest "New photo approved / Your new photo is now visible to others" over the
-- room, although nothing they see changed. `last_action='approved'` now marks
-- only the approval of a pending replacement, the one decision that changes the
-- displayed photo. Approving the displayed version clears `last_action` and
-- `last_reason`, so no earlier sheet comes back on the new revision either.
-- The audit row still records the approval.
--
-- Same arguments, grants and lock order as the current definition (20260909000001,
-- with the eligibility lock 20260918000002 added, moved to `private` by
-- 20261003000001); only the final `photo_state` update changes.
create or replace function private.decide_profile_photo_foundation(p_owner uuid, p_version uuid, p_expected_revision integer, p_action text, p_reason text default null::text)
 returns void
 language plpgsql
 security definer
 set search_path to 'public', 'private'
as $function$
declare s public.photo_state; v public.photo_versions;
begin
  perform private.lock_like_eligibility();
  if auth.uid() is null or p_action is null or (p_action='cancelled' and auth.uid()<>p_owner)
    or (p_action in ('approved','rejected') and not private.is_admin())
    or p_action not in ('cancelled','approved','rejected') then raise exception 'not authorized' using errcode='42501'; end if;
  if p_action='rejected' and (p_reason is null or p_reason not in ('face_unclear','multiple_people','not_person','sexual','violent'))
    or (p_action<>'rejected' and p_reason is not null) then raise exception 'invalid reason'; end if;
  select * into s from public.photo_state where profile_id=p_owner for update;
  if not found or p_expected_revision is null or s.revision<>p_expected_revision or
    (p_version is distinct from s.displayed_id and p_version is distinct from s.pending_id) then
    raise exception 'stale photo decision' using errcode='PT409'; end if;
  select * into v from public.photo_versions where id=p_version and profile_id=p_owner;
  if not found or v.status in ('rejected','superseded') or
    (p_action='cancelled' and p_version is distinct from s.pending_id) or
    (p_action='approved' and v.status<>'unverified') then
    raise exception 'stale photo decision' using errcode='PT409'; end if;
  update public.photo_versions set status=case when p_action='cancelled' then 'superseded' else p_action end where id=p_version;
  if p_action='approved' then
    if p_version=s.pending_id then
      update public.photo_state set displayed_id=p_version,pending_id=null,correction_required=false,correction_since=null,reason=null where profile_id=p_owner;
      update public.profiles set photo_url=v.path where id=p_owner;
    end if;
  elsif p_action='rejected' and p_version=s.displayed_id then
    update public.photo_state set correction_required=true,correction_since=now(),reason=p_reason where profile_id=p_owner;
    update public.profiles set photo_url=null where id=p_owner;
    delete from public.likes l where p_owner in (l.liker_id,l.liked_id) and not exists(
      select 1 from public.matches m where m.venue_night_id=l.venue_night_id
        and m.profile_a=least(l.liker_id,l.liked_id) and m.profile_b=greatest(l.liker_id,l.liked_id));
  else
    update public.photo_state set pending_id=null,
      reason=case when correction_required then reason when p_action='rejected' then p_reason else null end
      where profile_id=p_owner;
  end if;
  update public.photo_state set revision=revision+1,
    last_action=case when p_action='approved' and p_version is distinct from s.pending_id then null else p_action end,
    last_reason=case when p_action='approved' and p_version is distinct from s.pending_id then null else p_reason end,
    reason=case when p_action='approved' and not correction_required then null else reason end,updated_at=now() where profile_id=p_owner;
  insert into public.photo_audit(profile_id,version_id,action,reason,actor_id)
    values(p_owner,p_version,p_action,p_reason,auth.uid());
  perform private.notify_photo_change(p_owner);
end $function$;
