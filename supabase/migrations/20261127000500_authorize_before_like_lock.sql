-- SEC-006 (#369): founder and reviewer commands authorize before they ask for the
-- database-wide like-eligibility lock (private.lock_like_eligibility, advisory
-- lock 231/0, exclusive). write_like and room_candidates take its shared form, so
-- a participant session calling these commands in a loop could queue every like
-- in every venue, although each call was then refused.
--
-- 1. Five commands asked for the lock first and authorized second. The three
--    founder venue commands now authorize first. The two review commands run
--    their authorization before the lock and again under it (check, lock,
--    check), as the profile review commands already do.
-- 2. eject_from_venue and moderate_case (rewritten by #234) already authorize
--    first but no longer take the lock explicitly: statement triggers on
--    venue_ejections and presence take it after the night or case row is locked,
--    while the night lifecycle takes the like lock first and that row second.
--    The lock goes back right after authorization, where #231 placed it.
--
-- Every body is the current catalog definition with only those lines moved or
-- added. Signatures, security, search paths and grants are unchanged.

create or replace function public.delete_venue_configuration(p_venue_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private'
AS $function$
begin
  if not private.is_admin() then raise exception 'not authorized'; end if;
  perform private.lock_like_eligibility();
  if exists(select 1 from public.venues where id=p_venue_id and is_test_venue) then
    raise exception 'test venues cannot be deleted';
  end if;
  delete from public.venues where id=p_venue_id;
  if not found then raise exception 'venue not found'; end if;
end;
$function$;

create or replace function public.save_venue_configuration(p_venue_id uuid, p_night_id uuid, p_name text, p_slug text, p_city text, p_timezone text, p_waiting_opens_at timestamptz, p_guaranteed_launch_at timestamptz, p_closes_at timestamptz, p_launch_threshold integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private'
AS $function$
declare venue_id uuid:=p_venue_id; night public.venue_nights;
begin
  if not private.is_admin() then raise exception 'not authorized'; end if;
  perform private.lock_like_eligibility();
if p_city is null or p_timezone is null or not ((p_city='Paris' and p_timezone='Europe/Paris') or (p_city='New York' and p_timezone='America/New_York')) then raise exception 'unsupported rollout location'; end if;
if p_venue_id is null and (p_slug is null or p_slug collate "C" !~ '^[a-z0-9-]{1,80}$') then raise exception 'valid slug is required'; end if;
  if not private.valid_input_text(p_name,120,true) then raise exception 'venue name is required'; end if;
  if p_launch_threshold is null or p_launch_threshold<1 then raise exception 'launch threshold must be positive'; end if;
  if p_waiting_opens_at is null or p_guaranteed_launch_at is null or p_closes_at is null or not (isfinite(p_waiting_opens_at) and isfinite(p_guaranteed_launch_at) and isfinite(p_closes_at)) or not (p_waiting_opens_at<p_guaranteed_launch_at and p_guaranteed_launch_at<p_closes_at) then
    raise exception 'times must be ordered: entry, guaranteed launch, close';
  end if;

  if venue_id is null then
    if nullif(trim(p_slug),'') is null or p_slug !~ '^[a-z0-9-]+$' then raise exception 'valid slug is required'; end if;
    insert into public.venues(name,slug,city,timezone)
      values(private.trim_input(p_name),trim(p_slug),nullif(trim(coalesce(p_city,'')),''),p_timezone)
      returning id into venue_id;
  else
    update public.venues set name=private.trim_input(p_name),city=nullif(trim(coalesce(p_city,'')),'')
      where id=venue_id and not is_test_venue;
    if not found then raise exception 'venue not found or test fixture'; end if;
  end if;

  if p_night_id is null then
    select * into night from public.schedule_venue_night(
      venue_id,p_waiting_opens_at,p_guaranteed_launch_at,p_closes_at,p_launch_threshold
    );
  else
    select * into night from public.update_venue_night_schedule(
      p_night_id,p_waiting_opens_at,p_guaranteed_launch_at,p_closes_at,p_launch_threshold
    );
  end if;
  return jsonb_build_object('venue_id',venue_id,'venue_night_id',night.id);
end;
$function$;

create or replace function public.update_venue_night_schedule(p_venue_night_id uuid, p_waiting_opens_at timestamptz, p_guaranteed_launch_at timestamptz, p_closes_at timestamptz, p_launch_threshold integer)
 RETURNS venue_nights
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private'
AS $function$
declare before_night public.venue_nights; result public.venue_nights;
begin
  if not private.is_admin() then raise exception 'not authorized'; end if;
  perform private.lock_like_eligibility();
  select * into before_night from public.venue_nights where id = p_venue_night_id for update;
  if not found then raise exception 'venue night not found'; end if;
  if before_night.terminal_at is not null then raise exception 'terminal nights cannot be edited'; end if;
  if before_night.opened_at is not null or before_night.waiting_opens_at <= now() then
    raise exception 'schedule cannot be edited after waiting has opened';
  end if;
  if p_closes_at <= now() then raise exception 'close time must be in the future'; end if;
  update public.venue_nights set
    waiting_opens_at = p_waiting_opens_at,
    guaranteed_launch_at = p_guaranteed_launch_at,
    closes_at = p_closes_at,
    launch_threshold = p_launch_threshold
  where id = p_venue_night_id returning * into result;
  insert into public.venue_night_configuration_audits
    (venue_night_id, action, actor_id, before_values, after_values)
  values (result.id, 'updated', auth.uid(),
    private.venue_night_configuration_snapshot(before_night),
    private.venue_night_configuration_snapshot(result));
  return result;
end;
$function$;

create or replace function public.require_profile_text_correction(p_profile uuid, p_field text, p_revision uuid, p_reason text, p_night uuid DEFAULT NULL::uuid, p_report uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare original jsonb;
begin
  -- Refuse before the lock; the same test runs again under it.
  if not private.can_review_profile_text(p_profile,p_night,p_report) then raise exception 'not authorized' using errcode='42501'; end if;
  perform private.lock_like_eligibility();
  if not private.can_review_profile_text(p_profile,p_night,p_report) then raise exception 'not authorized' using errcode='42501'; end if;
  perform 1 from public.profiles where id=p_profile for update;
  original:=private.profile_review_snapshot(p_profile);
  perform private.require_profile_text_foundation(p_profile,p_field,p_revision,p_reason,p_night,p_report);
  perform private.begin_profile_correction(p_profile,jsonb_build_array(jsonb_build_object('field',p_field,'reason',p_reason)),original,true);
end $function$;

create or replace function public.decide_profile_photo(p_owner uuid, p_version uuid, p_expected_revision integer, p_action text, p_reason text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare original jsonb;
begin
  -- The authorization of private.decide_profile_photo_foundation, which still
  -- runs it again under the lock: refuse here before asking for the lock.
  if auth.uid() is null or p_action is null or (p_action='cancelled' and auth.uid()<>p_owner)
    or (p_action in ('approved','rejected') and not private.is_admin())
    or p_action not in ('cancelled','approved','rejected') then raise exception 'not authorized' using errcode='42501'; end if;
  perform private.lock_like_eligibility();
  if p_action='rejected' and private.is_admin() then
    perform 1 from public.profiles where id=p_owner for update;
    original:=private.profile_review_snapshot(p_owner);
  end if;
  perform private.decide_profile_photo_foundation(p_owner,p_version,p_expected_revision,p_action,p_reason);
  if p_action='rejected' and exists(select 1 from public.photo_state where profile_id=p_owner and correction_required) then
    perform private.begin_profile_correction(p_owner,jsonb_build_array(jsonb_build_object('field','photo','reason',p_reason)),original,true);
  end if;
end $function$;

create or replace function public.eject_from_venue(p_profile_id uuid, p_venue_id uuid, p_reason text, p_note text DEFAULT NULL::text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private'
AS $function$
declare night_id uuid; closed_count integer;
begin
  if not private.is_admin() then raise exception 'not authorized'; end if;
  -- Before the night row lock below, in the order the night lifecycle uses.
  perform private.lock_like_eligibility();
  if p_profile_id is null or p_venue_id is null then raise exception 'ejection target and venue are required'; end if;
  if p_reason is null or p_reason not in ('harassment','fake_profile','underage','unsafe_behavior','other') then raise exception 'invalid ejection reason'; end if;
  if not private.valid_input_text(p_note,500,false) then raise exception 'invalid safety note'; end if;
  select id into night_id from public.venue_nights where venue_id=p_venue_id and terminal_at is null
    and status in ('waiting','live') and now()<closes_at for update;
  if night_id is null then raise exception 'no active venue night'; end if;
  insert into public.venue_ejections(profile_id,venue_id,venue_night_id,night,reason,note,created_by)
  select p_profile_id,p_venue_id,night_id,(vn.closes_at at time zone v.timezone)::date,p_reason,
    nullif(private.trim_input(coalesce(p_note,'')),''),auth.uid()
  from public.venue_nights vn join public.venues v on v.id=vn.venue_id where vn.id=night_id
  on conflict(profile_id,venue_night_id) do update set reason=excluded.reason,note=excluded.note,created_by=excluded.created_by,created_at=now();
  insert into private.moderation_events(action,actor_id,target_profile_id,venue_night_id,reason)
  values('removed_for_night',auth.uid(),p_profile_id,night_id,p_reason);
  update public.presence set left_at=now() where profile_id=p_profile_id and venue_night_id=night_id and left_at is null;
  get diagnostics closed_count=row_count; return closed_count;
end;
$function$;

create or replace function public.moderate_case(p_case_id uuid, p_action text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private'
AS $function$
declare
  target public.moderation_cases;
  target_venue_id uuid;
  top_reason text;
begin
  if not private.is_admin() then raise exception 'not authorized'; end if;
  -- Before the case row lock and the writes below, in the order the night lifecycle uses.
  perform private.lock_like_eligibility();
  if p_case_id is null then raise exception 'moderation case is required'; end if;
  if p_action is null or p_action not in ('review','remove_for_night','restore') then
    raise exception 'invalid moderation action';
  end if;
  select * into target from public.moderation_cases where id=p_case_id for update;
  if not found then raise exception 'moderation case not found'; end if;

  if p_action='review' then
    update public.moderation_cases set status='reviewed',action_expires_at=null,
      reviewed_at=now(),reviewed_by=auth.uid(),updated_at=now() where id=target.id;
    insert into private.moderation_events(action,actor_id,target_profile_id,venue_night_id,case_id)
    values('case_reviewed',auth.uid(),target.reported_id,target.venue_night_id,target.id);
    return;
  end if;
  if p_action='restore' then
    delete from public.venue_ejections where profile_id=target.reported_id and venue_night_id=target.venue_night_id;
    -- Without a removal to lift (already lifted, or the night ended), the action
    -- only reopens the case: say so rather than claim access was restored.
    insert into private.moderation_events(action,actor_id,target_profile_id,venue_night_id,case_id)
    values(case when found then 'access_restored' else 'case_reopened' end,auth.uid(),target.reported_id,target.venue_night_id,target.id);
    update public.moderation_cases set status='pending_review',action_expires_at=null,
      reviewed_at=null,reviewed_by=null,updated_at=now() where id=target.id;
    return;
  end if;

  select vn.venue_id into target_venue_id from public.venue_nights vn where vn.id=target.venue_night_id;
  select r.reason into top_reason from public.reports r where r.case_id=target.id
    order by case r.reason when 'underage' then 1 when 'unsafe_behavior' then 2 when 'harassment' then 3 else 4 end,
      r.created_at desc limit 1;
  insert into public.venue_ejections(profile_id,venue_id,venue_night_id,night,reason,note,created_by,expires_at)
  select target.reported_id,target_venue_id,target.venue_night_id,
    (vn.closes_at at time zone v.timezone)::date,coalesce(top_reason,'other'),
    'Admin action from moderation case',auth.uid(),null
  from public.venue_nights vn join public.venues v on v.id=vn.venue_id
  where vn.id=target.venue_night_id
  on conflict(profile_id,venue_night_id) do update set
    reason=excluded.reason,note=excluded.note,created_by=excluded.created_by,
    created_at=now(),expires_at=null;
  insert into private.moderation_events(action,actor_id,target_profile_id,venue_night_id,case_id,reason)
  values('removed_for_night',auth.uid(),target.reported_id,target.venue_night_id,target.id,coalesce(top_reason,'other'));
  update public.presence set left_at=now()
  where profile_id=target.reported_id and venue_night_id=target.venue_night_id and left_at is null;
  update public.moderation_cases set status='removed_for_night',action_expires_at=null,
    reviewed_at=now(),reviewed_by=auth.uid(),updated_at=now() where id=target.id;
end;
$function$;
