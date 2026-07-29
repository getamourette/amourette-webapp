-- #131 / PR #149 review corrections.
-- BEHAVIORAL: do not apply to the shared development database without founder approval.

-- Fix the variable collision that made report submission fail at runtime.
create or replace function public.submit_report(
  p_reported_id uuid,
  p_venue_night_id uuid,
  p_reason text,
  p_note text default null
)
returns uuid language plpgsql security definer set search_path = public, private
as $$
declare
  me uuid := auth.uid();
  report_id uuid;
  case_id uuid;
  target_venue_id uuid;
  evidence text := 'shared_venue_night';
  matched_id uuid;
  participant_senders integer;
begin
  if me is null then raise exception 'not authenticated'; end if;
  if me = p_reported_id then raise exception 'cannot report yourself'; end if;
  if p_reason not in ('harassment','fake_profile','underage','unsafe_behavior','other') then
    raise exception 'report reason is required';
  end if;
  if p_reason = 'other' and nullif(trim(coalesce(p_note, '')), '') is null then
    raise exception 'a note is required for other reports';
  end if;

  select vn.venue_id into target_venue_id
  from public.venue_nights vn where vn.id = p_venue_night_id;
  if target_venue_id is null then raise exception 'venue night not found'; end if;

  if not exists (
    select 1 from public.presence mine
    where mine.profile_id = me and mine.venue_night_id = p_venue_night_id
  ) or not exists (
    select 1 from public.presence theirs
    where theirs.profile_id = p_reported_id and theirs.venue_night_id = p_venue_night_id
  ) then
    raise exception 'You can only report users you shared a venue night with.';
  end if;

  select m.id into matched_id from public.matches m
  where m.venue_night_id = p_venue_night_id
    and m.profile_a = least(me, p_reported_id)
    and m.profile_b = greatest(me, p_reported_id)
  limit 1;

  if matched_id is not null then
    evidence := 'mutual_match';
    select count(distinct msg.sender_id) into participant_senders
    from public.messages msg where msg.match_id = matched_id;
    if participant_senders >= 2 then evidence := 'two_way_conversation';
    elsif participant_senders = 1 then evidence := 'conversation_started';
    end if;
  end if;

  insert into public.moderation_cases (reported_id, venue_night_id)
  values (p_reported_id, p_venue_night_id)
  on conflict (reported_id, venue_night_id) do update set
    status = case when moderation_cases.status = 'reviewed' then 'pending_review' else moderation_cases.status end,
    reviewed_at = case when moderation_cases.status = 'reviewed' then null else moderation_cases.reviewed_at end,
    reviewed_by = case when moderation_cases.status = 'reviewed' then null else moderation_cases.reviewed_by end,
    updated_at = now()
  returning id into case_id;

  insert into public.reports (
    reporter_id, reported_id, venue_id, venue_night_id, case_id,
    reason, note, interaction_evidence, interaction_verified_at
  ) values (
    me, p_reported_id, target_venue_id, p_venue_night_id, case_id,
    p_reason, nullif(trim(coalesce(p_note, '')), ''), evidence, now()
  ) returning id into report_id;
  return report_id;
exception when unique_violation then
  raise exception 'You already reported this person for this venue night.';
end;
$$;

revoke execute on function public.submit_report(uuid,uuid,text,text) from anon,public;
grant execute on function public.submit_report(uuid,uuid,text,text) to authenticated;

-- Venue identity is permanent and must be editable independently of schedules.
create or replace function public.save_venue_details(
  p_venue_id uuid,
  p_name text,
  p_slug text,
  p_city text,
  p_timezone text
)
returns public.venues language plpgsql security definer set search_path=public,private
as $$
declare result public.venues;
begin
  if not private.is_admin() then raise exception 'not authorized'; end if;
  if nullif(trim(p_name),'') is null then raise exception 'venue name is required'; end if;
  if p_city not in ('Paris','New York') or p_timezone not in ('Europe/Paris','America/New_York') then
    raise exception 'unsupported rollout location';
  end if;
  if (p_city='Paris' and p_timezone<>'Europe/Paris')
    or (p_city='New York' and p_timezone<>'America/New_York') then
    raise exception 'city and timezone must describe the same rollout location';
  end if;

  if p_venue_id is null then
    if nullif(trim(p_slug),'') is null or p_slug !~ '^[a-z0-9-]+$' then
      raise exception 'valid slug is required';
    end if;
    insert into public.venues(name,slug,city,timezone)
    values(trim(p_name),trim(p_slug),p_city,p_timezone) returning * into result;
  else
    update public.venues set name=trim(p_name),city=p_city,timezone=p_timezone
    where id=p_venue_id and not is_test_venue returning * into result;
    if not found then raise exception 'venue not found or test fixture'; end if;
  end if;
  return result;
end;
$$;

revoke execute on function public.save_venue_details(uuid,text,text,text,text) from anon,public;
grant execute on function public.save_venue_details(uuid,text,text,text,text) to authenticated;

-- The temporary suspension policy is not approved. Keep historical rows readable,
-- but make new 30-minute restrictions impossible at the database boundary.
create or replace function public.moderate_case(p_case_id uuid, p_action text)
returns void language plpgsql security definer set search_path=public,private
as $$
declare
  target public.moderation_cases;
  target_venue_id uuid;
  top_reason text;
begin
  if not private.is_admin() then raise exception 'not authorized'; end if;
  if p_action not in ('review','remove_for_night','restore') then
    raise exception 'invalid moderation action';
  end if;
  select * into target from public.moderation_cases where id=p_case_id for update;
  if not found then raise exception 'moderation case not found'; end if;

  if p_action='review' then
    update public.moderation_cases set status='reviewed',action_expires_at=null,
      reviewed_at=now(),reviewed_by=auth.uid(),updated_at=now() where id=target.id;
    return;
  end if;
  if p_action='restore' then
    delete from public.venue_ejections where profile_id=target.reported_id and venue_night_id=target.venue_night_id;
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
  update public.presence set left_at=now()
  where profile_id=target.reported_id and venue_night_id=target.venue_night_id and left_at is null;
  update public.moderation_cases set status='removed_for_night',action_expires_at=null,
    reviewed_at=now(),reviewed_by=auth.uid(),updated_at=now() where id=target.id;
end;
$$;

revoke execute on function public.moderate_case(uuid,text) from anon,public;
grant execute on function public.moderate_case(uuid,text) to authenticated;
