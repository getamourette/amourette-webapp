CREATE OR REPLACE FUNCTION public.track_analytics_event(p_event_name text, p_session_id text, p_venue_id uuid DEFAULT NULL::uuid, p_qr_code_id text DEFAULT NULL::text, p_source text DEFAULT NULL::text, p_medium text DEFAULT NULL::text, p_campaign text DEFAULT NULL::text, p_content text DEFAULT NULL::text, p_referrer text DEFAULT NULL::text, p_properties jsonb DEFAULT '{}'::jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private'
AS $function$
declare
  me uuid := auth.uid();
  event_night date;
  allowed_keys text[];
  property_keys text[];
begin
  if me is null then
    raise exception 'not authenticated';
  end if;

  if not private.valid_input_text(p_qr_code_id,120,false) or not private.valid_input_text(p_source,120,false) or not private.valid_input_text(p_medium,120,false) or not private.valid_input_text(p_campaign,160,false) or not private.valid_input_text(p_content,160,false) or not private.valid_input_text(p_referrer,500,false) or not private.valid_analytics_properties(p_event_name,coalesce(p_properties,'{}'::jsonb)) then raise exception 'invalid analytics input'; end if;

  if p_event_name is null or p_event_name not in (
    'landing_viewed',
    'session_started',
    'venue_experience_opened',
    'discovery_opened',
    'profile_viewed',
    'chat_opened'
  ) then
    raise exception 'unsupported analytics event';
  end if;

  if length(coalesce(p_session_id, '')) < 8 or length(p_session_id) > 120 then
    raise exception 'invalid session id';
  end if;

  allowed_keys := case p_event_name
    when 'profile_viewed' then array['viewedProfileId', 'source']
    when 'chat_opened' then array['matchId']
    when 'venue_experience_opened' then array['status']
    when 'discovery_opened' then array['visibleCount']
    else array[]::text[]
  end;

  select coalesce(array_agg(key), array[]::text[])
    into property_keys
  from jsonb_object_keys(coalesce(p_properties, '{}'::jsonb)) as key;

  if exists (
    select 1
    from unnest(property_keys) as key
    where not (key = any(allowed_keys))
  ) then
    raise exception 'unsupported analytics properties';
  end if;

  if p_venue_id is not null then
    select (private.night_ends_at(now(), v.timezone))::date
      into event_night
    from public.venues v
    where v.id = p_venue_id;
  end if;

  insert into public.analytics_events (
    event_name,
    user_id,
    session_id,
    venue_id,
    night,
    qr_code_id,
    source,
    medium,
    campaign,
    content,
    referrer,
    properties
  )
  values (
    p_event_name,
    me,
    p_session_id,
    p_venue_id,
    event_night,
    nullif(private.trim_input(coalesce(p_qr_code_id, '')), ''),
    nullif(private.trim_input(coalesce(p_source, '')), ''),
    nullif(private.trim_input(coalesce(p_medium, '')), ''),
    nullif(private.trim_input(coalesce(p_campaign, '')), ''),
    nullif(private.trim_input(coalesce(p_content, '')), ''),
    nullif(private.trim_input(coalesce(p_referrer, '')), ''),
    coalesce(p_properties, '{}'::jsonb)
  );
end;
$function$
;
