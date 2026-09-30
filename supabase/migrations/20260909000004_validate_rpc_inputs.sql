-- #77: targeted replacements based on remote definitions inspected 2026-09-09.
-- Preserve existing authorization, grants and photo workflows.
CREATE OR REPLACE FUNCTION public.save_venue_configuration(p_venue_id uuid, p_night_id uuid, p_name text, p_slug text, p_city text, p_timezone text, p_waiting_opens_at timestamp with time zone, p_guaranteed_launch_at timestamp with time zone, p_closes_at timestamp with time zone, p_launch_threshold integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private'
AS $function$
declare venue_id uuid:=p_venue_id; night public.venue_nights;
begin
  if not private.is_admin() then raise exception 'not authorized'; end if;
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
$function$
;

CREATE OR REPLACE FUNCTION public.save_venue_details(p_venue_id uuid, p_name text, p_slug text, p_city text, p_timezone text)
 RETURNS venues
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private'
AS $function$
declare result public.venues;
begin
if not private.is_admin() then raise exception 'not authorized'; end if;
if p_city is null or p_timezone is null or not ((p_city='Paris' and p_timezone='Europe/Paris') or (p_city='New York' and p_timezone='America/New_York')) then raise exception 'unsupported rollout location'; end if;
if p_venue_id is null and (p_slug is null or p_slug collate "C" !~ '^[a-z0-9-]{1,80}$') then raise exception 'valid slug is required'; end if;
if not private.valid_input_text(p_name,120,true) then raise exception 'venue name is required'; end if;
if p_city not in ('Paris','New York') or p_timezone not in ('Europe/Paris','America/New_York') then raise exception 'unsupported rollout location'; end if;
if (p_city='Paris' and p_timezone<>'Europe/Paris') or (p_city='New York' and p_timezone<>'America/New_York') then raise exception 'city and timezone must describe the same rollout location'; end if;
if p_venue_id is null then
if nullif(trim(p_slug),'') is null or p_slug !~ '^[a-z0-9-]+$' then raise exception 'valid slug is required'; end if;
insert into public.venues(name,slug,city,timezone) values(private.trim_input(p_name),trim(p_slug),p_city,p_timezone) returning * into result;
else update public.venues set name=private.trim_input(p_name),city=p_city,timezone=p_timezone where id=p_venue_id and not is_test_venue returning * into result;
if not found then raise exception 'venue not found or test fixture'; end if; end if;
return result;
end $function$
;

CREATE OR REPLACE FUNCTION public.set_venue_live(p_venue_id uuid, p_live boolean)
 RETURNS venues
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private'
AS $function$
declare night public.venue_nights; result public.venues;
begin
  if not private.is_admin() then raise exception 'not authorized'; end if;
  if p_venue_id is null or p_live is null then raise exception 'venue and live state are required'; end if;
  select * into night from public.venue_nights
  where venue_id = p_venue_id and terminal_at is null
    and waiting_opens_at <= now() and now() < closes_at
  for update;
  if not found then raise exception 'no current scheduled venue night'; end if;
  if p_live then
    if night.status = 'closed' then
      night := private.transition_venue_night(night.id, 'opened', 'manual', auth.uid());
    end if;
    if night.status = 'waiting' then
      perform private.transition_venue_night(night.id, 'launched', 'manual', auth.uid());
    end if;
  else
    perform private.transition_venue_night(night.id, 'closed', 'manual', auth.uid());
  end if;
  select * into result from public.venues where id = p_venue_id;
  return result;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.set_venue_profile_preview(p_venue_id uuid, p_enabled boolean)
 RETURNS venues
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private'
AS $function$
declare
  result public.venues;
begin
  if not private.is_admin() then
    raise exception 'not authorized';
  end if;

  if p_venue_id is null or p_enabled is null then raise exception 'venue and preview state are required'; end if;
  update public.venues
    set profile_preview_enabled = p_enabled
    where id = p_venue_id
    returning * into result;

  if not found then
    raise exception 'venue not found';
  end if;

  return result;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.submit_report(p_reported_id uuid, p_venue_night_id uuid, p_reason text, p_note text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private'
AS $function$
declare me uuid:=auth.uid(); report_id uuid; case_id uuid; target_venue_id uuid; evidence text:='shared_venue_night'; matched_id uuid; participant_senders integer;
begin
if me is null then raise exception 'not authenticated'; end if;
if me=p_reported_id then raise exception 'cannot report yourself'; end if;
if p_reported_id is null or p_venue_night_id is null then raise exception 'report target and night are required'; end if;
if not private.valid_input_text(p_note,500,false) then raise exception 'invalid safety note'; end if;
if p_reason is null or p_reason not in ('harassment','fake_profile','underage','unsafe_behavior','other') then raise exception 'report reason is required'; end if;
if p_reason='other' and nullif(private.trim_input(coalesce(p_note,'')),'') is null then raise exception 'a note is required for other reports'; end if;
select vn.venue_id into target_venue_id from public.venue_nights vn where vn.id=p_venue_night_id;
if target_venue_id is null then raise exception 'venue night not found'; end if;
if not exists(select 1 from public.presence mine where mine.profile_id=me and mine.venue_night_id=p_venue_night_id)
or not exists(select 1 from public.presence theirs where theirs.profile_id=p_reported_id and theirs.venue_night_id=p_venue_night_id)
then raise exception 'You can only report users you shared a venue night with.'; end if;
select m.id into matched_id from public.matches m where m.venue_night_id=p_venue_night_id and m.profile_a=least(me,p_reported_id) and m.profile_b=greatest(me,p_reported_id) limit 1;
if matched_id is not null then evidence:='mutual_match'; select count(distinct msg.sender_id) into participant_senders from public.messages msg where msg.match_id=matched_id;
if participant_senders>=2 then evidence:='two_way_conversation'; elsif participant_senders=1 then evidence:='conversation_started'; end if; end if;
insert into public.moderation_cases(reported_id,venue_night_id) values(p_reported_id,p_venue_night_id)
on conflict(reported_id,venue_night_id) do update set status=case when moderation_cases.status='reviewed' then 'pending_review' else moderation_cases.status end,
reviewed_at=case when moderation_cases.status='reviewed' then null else moderation_cases.reviewed_at end,
reviewed_by=case when moderation_cases.status='reviewed' then null else moderation_cases.reviewed_by end,updated_at=now() returning id into case_id;
insert into public.reports(reporter_id,reported_id,venue_id,venue_night_id,case_id,reason,note,interaction_evidence,interaction_verified_at)
values(me,p_reported_id,target_venue_id,p_venue_night_id,case_id,p_reason,nullif(private.trim_input(coalesce(p_note,'')),''),evidence,now()) returning id into report_id;
return report_id;
exception when unique_violation then raise exception 'You already reported this person for this venue night.';
end $function$
;

CREATE OR REPLACE FUNCTION public.subscribe_to_marketing_email(p_user_id uuid, p_email text, p_locale text, p_source text, p_consent_version text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  owner_id uuid := p_user_id;
  normalized_email text := lower(private.trim_input(p_email) collate "C");
  previous public.email_subscriptions%rowtype;
  delivery_id uuid;
  is_identical boolean;
begin
  if owner_id is null then raise exception 'Authentication required'; end if;
  if not private.valid_marketing_email(p_email) then
    raise exception 'Invalid email';
  end if;
  if p_locale is null or p_locale not in ('en','fr','es') or p_source is null or p_source not in ('landing','room_popup','waiting_room','empty_room','subscription_management') or p_consent_version is distinct from (case p_source when 'landing' then '2026-07-24' when 'subscription_management' then 'email-preferences-v1' else 'global-live-night-email-v1' end) then raise exception 'Invalid subscription input'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(owner_id::text, 0));
  select * into previous from public.email_subscriptions where user_id = owner_id;
  is_identical := previous.user_id is not null
    and previous.status = 'subscribed' and previous.email = normalized_email;

  if is_identical then
    return jsonb_build_object('already_subscribed', true, 'email', normalized_email);
  end if;
  if (select count(*) from public.email_deliveries
      where payload ->> 'user_id' = owner_id::text and created_at > now() - interval '1 hour') >= 5 then
    raise exception 'Subscription rate limit exceeded';
  end if;

  insert into public.email_subscriptions (
    user_id, email, locale, source, consent_version, status, subscribed_at, unsubscribed_at
  ) values (
    owner_id, normalized_email, p_locale, p_source, p_consent_version,
    'subscribed', now(), null
  ) on conflict (user_id) do update set
    email = excluded.email, locale = excluded.locale, source = excluded.source,
    consent_version = excluded.consent_version, status = 'subscribed',
    subscribed_at = excluded.subscribed_at, unsubscribed_at = null;

  insert into public.email_deliveries (
    kind, recipient_email, locale, payload, idempotency_key, status
  ) values (
    'welcome', normalized_email, p_locale,
    jsonb_build_object('user_id', owner_id),
    'welcome:' || owner_id::text || ':' || extract(epoch from now())::text,
    case when exists (
      select 1 from public.email_suppressions where email = normalized_email
    ) then 'suppressed' else 'queued' end
  ) returning id into delivery_id;

  return jsonb_build_object(
    'already_subscribed', false, 'email', normalized_email, 'delivery_id', delivery_id
  );
end;
$function$
;


-- The legacy admin entry point must validate before selecting/locking a night too.
create or replace function public.eject_from_venue(p_profile_id uuid,p_venue_id uuid,p_reason text,p_note text default null)
returns integer language plpgsql security definer set search_path=public,private as $$
declare night_id uuid; closed_count integer;
begin
  if not private.is_admin() then raise exception 'not authorized'; end if;
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
  update public.presence set left_at=now() where profile_id=p_profile_id and venue_night_id=night_id and left_at is null;
  get diagnostics closed_count=row_count; return closed_count;
end;
$$;
