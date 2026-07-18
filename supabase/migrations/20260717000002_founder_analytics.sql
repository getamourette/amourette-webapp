-- Founder analytics foundation.
-- Keep this first-party and aggregate-oriented: derive from business tables
-- where possible, record only the actions that otherwise leave no durable row,
-- and never store message content or private profile fields in analytics.

create table if not exists public.analytics_events (
  id           uuid primary key default gen_random_uuid(),
  event_name   text not null check (
    event_name in (
      'landing_viewed',
      'session_started',
      'venue_experience_opened',
      'discovery_opened',
      'profile_viewed',
      'chat_opened'
    )
  ),
  user_id      uuid references auth.users (id) on delete set null,
  session_id   text not null check (length(session_id) between 8 and 120),
  venue_id     uuid references public.venues (id) on delete set null,
  night        date,
  qr_code_id   text check (qr_code_id is null or length(qr_code_id) <= 120),
  occurred_at  timestamptz not null default now(),
  source       text check (source is null or length(source) <= 120),
  medium       text check (medium is null or length(medium) <= 120),
  campaign     text check (campaign is null or length(campaign) <= 160),
  content      text check (content is null or length(content) <= 160),
  referrer     text check (referrer is null or length(referrer) <= 500),
  properties   jsonb not null default '{}'::jsonb
);

alter table public.analytics_events enable row level security;

revoke all on public.analytics_events from anon, public;
grant insert on public.analytics_events to authenticated;

create index if not exists analytics_events_name_time
  on public.analytics_events (event_name, occurred_at);
create index if not exists analytics_events_venue_night
  on public.analytics_events (venue_id, night, event_name);
create index if not exists analytics_events_user_time
  on public.analytics_events (user_id, occurred_at);
create index if not exists analytics_events_qr
  on public.analytics_events (qr_code_id, occurred_at);

create or replace function public.track_analytics_event(
  p_event_name text,
  p_session_id text,
  p_venue_id uuid default null,
  p_qr_code_id text default null,
  p_source text default null,
  p_medium text default null,
  p_campaign text default null,
  p_content text default null,
  p_referrer text default null,
  p_properties jsonb default '{}'::jsonb
)
  returns void
  language plpgsql
  security definer
  set search_path = public, private
as $$
declare
  me uuid := auth.uid();
  event_night date;
  allowed_keys text[];
  property_keys text[];
begin
  if me is null then
    raise exception 'not authenticated';
  end if;

  if p_event_name not in (
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
    nullif(trim(coalesce(p_qr_code_id, '')), ''),
    nullif(trim(coalesce(p_source, '')), ''),
    nullif(trim(coalesce(p_medium, '')), ''),
    nullif(trim(coalesce(p_campaign, '')), ''),
    nullif(trim(coalesce(p_content, '')), ''),
    nullif(trim(coalesce(p_referrer, '')), ''),
    coalesce(p_properties, '{}'::jsonb)
  );
end;
$$;

revoke execute on function public.track_analytics_event(text, text, uuid, text, text, text, text, text, text, jsonb) from anon, public;
grant  execute on function public.track_analytics_event(text, text, uuid, text, text, text, text, text, text, jsonb) to authenticated;

create table if not exists public.venue_conversation_events (
  id                uuid primary key default gen_random_uuid(),
  match_id          uuid not null unique,
  venue_id          uuid not null references public.venues (id) on delete cascade,
  night             date not null,
  first_message_at  timestamptz not null,
  first_sender_id   uuid references auth.users (id) on delete set null,
  replied_at        timestamptz,
  reciprocal_at     timestamptz,
  engaged_at        timestamptz,
  message_count     integer not null default 0,
  participant_count integer not null default 0,
  updated_at        timestamptz not null default now()
);

alter table public.venue_conversation_events enable row level security;

revoke all on public.venue_conversation_events from anon, public;

create index if not exists venue_conversation_events_venue_night
  on public.venue_conversation_events (venue_id, night);
create index if not exists venue_conversation_events_first_sender
  on public.venue_conversation_events (first_sender_id, first_message_at);

create or replace function private.upsert_conversation_event(p_match_id uuid)
  returns void
  language plpgsql
  security definer
  set search_path = public, private
as $$
declare
  match_venue_id uuid;
  venue_timezone text;
  conversation_night date;
  first_message record;
  aggregate_row record;
begin
  select m.venue_id, v.timezone
    into match_venue_id, venue_timezone
  from public.matches m
  join public.venues v on v.id = m.venue_id
  where m.id = p_match_id;

  if match_venue_id is null then
    return;
  end if;

  select msg.sender_id, msg.created_at
    into first_message
  from public.messages msg
  where msg.match_id = p_match_id
  order by msg.created_at asc
  limit 1;

  if first_message.created_at is null then
    return;
  end if;

  select
    count(*)::integer as message_count,
    count(distinct msg.sender_id)::integer as participant_count,
    min(msg.created_at) filter (where msg.sender_id <> first_message.sender_id) as replied_at
    into aggregate_row
  from public.messages msg
  where msg.match_id = p_match_id;

  conversation_night := (private.night_ends_at(first_message.created_at, venue_timezone))::date;

  insert into public.venue_conversation_events (
    match_id,
    venue_id,
    night,
    first_message_at,
    first_sender_id,
    replied_at,
    reciprocal_at,
    engaged_at,
    message_count,
    participant_count
  )
  values (
    p_match_id,
    match_venue_id,
    conversation_night,
    first_message.created_at,
    first_message.sender_id,
    aggregate_row.replied_at,
    case when aggregate_row.participant_count >= 2 then aggregate_row.replied_at end,
    case
      when aggregate_row.participant_count >= 2 and aggregate_row.message_count >= 6
      then now()
    end,
    aggregate_row.message_count,
    aggregate_row.participant_count
  )
  on conflict (match_id) do update
    set replied_at = coalesce(public.venue_conversation_events.replied_at, excluded.replied_at),
        reciprocal_at = coalesce(public.venue_conversation_events.reciprocal_at, excluded.reciprocal_at),
        engaged_at = coalesce(public.venue_conversation_events.engaged_at, excluded.engaged_at),
        message_count = excluded.message_count,
        participant_count = excluded.participant_count,
        updated_at = now();
end;
$$;

revoke execute on function private.upsert_conversation_event(uuid) from public, anon, authenticated;

create or replace function public.record_message_analytics()
  returns trigger
  language plpgsql
  security definer
  set search_path = public, private
as $$
begin
  perform private.upsert_conversation_event(new.match_id);
  return new;
end;
$$;

revoke execute on function public.record_message_analytics() from anon, authenticated, public;

drop trigger if exists messages_record_analytics on public.messages;
create trigger messages_record_analytics
  after insert on public.messages
  for each row execute function public.record_message_analytics();

insert into public.venue_conversation_events (
  match_id,
  venue_id,
  night,
  first_message_at,
  first_sender_id,
  replied_at,
  reciprocal_at,
  engaged_at,
  message_count,
  participant_count
)
select
  m.id,
  m.venue_id,
  (private.night_ends_at(first_msg.created_at, v.timezone))::date,
  first_msg.created_at,
  first_msg.sender_id,
  agg.replied_at,
  case when agg.participant_count >= 2 then agg.replied_at end,
  case when agg.participant_count >= 2 and agg.message_count >= 6 then agg.last_message_at end,
  agg.message_count,
  agg.participant_count
from public.matches m
join public.venues v on v.id = m.venue_id
join lateral (
  select msg.sender_id, msg.created_at
  from public.messages msg
  where msg.match_id = m.id
  order by msg.created_at asc
  limit 1
) first_msg on true
join lateral (
  select
    count(*)::integer as message_count,
    count(distinct msg.sender_id)::integer as participant_count,
    min(msg.created_at) filter (where msg.sender_id <> first_msg.sender_id) as replied_at,
    max(msg.created_at) as last_message_at
  from public.messages msg
  where msg.match_id = m.id
) agg on true
on conflict (match_id) do nothing;

drop function if exists public.admin_founder_analytics();

create or replace function public.admin_founder_analytics()
  returns table (
    venue_id uuid,
    venue_name text,
    venue_city text,
    night date,
    scans integer,
    unique_scanners integer,
    landing_views integer,
    sessions integer,
    profiles_created integer,
    profile_completions integer,
    checkins integer,
    scan_checkins integer,
    venue_experience_openers integer,
    discovery_openers integer,
    profile_viewers integer,
    profile_views integer,
    chat_openers integer,
    chat_opens integer,
    conversations_started integer,
    first_message_senders integer,
    reciprocal_conversations integer,
    engaged_conversations integer,
    replied_conversations integer,
    returning_users integer,
    returning_same_venue_users integer,
    returning_other_venue_users integer,
    women_checkins integer,
    men_checkins integer,
    nonbinary_checkins integer,
    same_gender_interest_checkins integer,
    multi_gender_interest_checkins integer,
    interested_in_women_checkins integer,
    interested_in_men_checkins integer,
    interested_in_nonbinary_checkins integer,
    top_source text,
    top_medium text,
    top_campaign text,
    top_qr_code_id text,
    peak_scan_hour integer,
    peak_activity_hour integer
  )
  language plpgsql
  security definer
  set search_path = public, private
as $$
#variable_conflict use_column
begin
  if not private.is_admin() then
    raise exception 'not authorized';
  end if;

  return query
  with
  scan_base as (
    select
      vse.user_id,
      vse.venue_id,
      vse.night,
      vse.first_seen_at,
      vse.last_seen_at
    from public.venue_scan_events vse
  ),
  sc as (
    select
      venue_id as vid,
      night,
      count(*)::int as scans,
      count(distinct user_id)::int as unique_scanners
    from scan_base
    group by venue_id, night
  ),
  profile_by_scan as (
    select
      sb.venue_id as vid,
      sb.night,
      count(distinct sb.user_id) filter (where pr.created_at is not null)::int as profiles_created,
      count(distinct sb.user_id) filter (where pp.adult_confirmed_at is not null)::int as profile_completions
    from scan_base sb
    left join public.profiles pr on pr.id = sb.user_id
    left join public.profile_private pp on pp.id = sb.user_id
    group by sb.venue_id, sb.night
  ),
  scan_ci as (
    select
      sb.venue_id as vid,
      sb.night,
      count(distinct sb.user_id)::int as scan_checkins
    from scan_base sb
    join public.presence p
      on p.profile_id = sb.user_id
     and p.venue_id = sb.venue_id
    join public.venues v on v.id = p.venue_id
    where (private.night_ends_at(p.checked_in_at, v.timezone))::date = sb.night
    group by sb.venue_id, sb.night
  ),
  ci as (
    select
      p.venue_id as vid,
      (private.night_ends_at(p.checked_in_at, v.timezone))::date as night,
      count(distinct p.profile_id)::int as checkins,
      count(distinct p.profile_id) filter (where pr.gender = 'woman')::int as women,
      count(distinct p.profile_id) filter (where pr.gender = 'man')::int as men,
      count(distinct p.profile_id) filter (where pr.gender = 'nonbinary')::int as nonbinary,
      count(distinct p.profile_id) filter (where pr.gender = any(pr.interested_in))::int as same_gender_interest,
      count(distinct p.profile_id) filter (where cardinality(pr.interested_in) > 1)::int as multi_gender_interest,
      count(distinct p.profile_id) filter (where 'woman' = any(pr.interested_in))::int as interested_in_women,
      count(distinct p.profile_id) filter (where 'man' = any(pr.interested_in))::int as interested_in_men,
      count(distinct p.profile_id) filter (where 'nonbinary' = any(pr.interested_in))::int as interested_in_nonbinary
    from public.presence p
    join public.venues v on v.id = p.venue_id
    join public.profiles pr on pr.id = p.profile_id
    group by p.venue_id, (private.night_ends_at(p.checked_in_at, v.timezone))::date
  ),
  ev as (
    select
      ae.venue_id as vid,
      ae.night,
      count(*) filter (where ae.event_name = 'landing_viewed')::int as landing_views,
      count(distinct ae.session_id)::int as sessions,
      count(distinct ae.user_id) filter (where ae.event_name = 'venue_experience_opened')::int as venue_experience_openers,
      count(distinct ae.user_id) filter (where ae.event_name = 'discovery_opened')::int as discovery_openers,
      count(distinct ae.user_id) filter (where ae.event_name = 'profile_viewed')::int as profile_viewers,
      count(*) filter (where ae.event_name = 'profile_viewed')::int as profile_views,
      count(distinct ae.user_id) filter (where ae.event_name = 'chat_opened')::int as chat_openers,
      count(*) filter (where ae.event_name = 'chat_opened')::int as chat_opens
    from public.analytics_events ae
    where ae.venue_id is not null and ae.night is not null
    group by ae.venue_id, ae.night
  ),
  conv as (
    select
      vce.venue_id as vid,
      vce.night,
      count(*)::int as conversations_started,
      count(distinct vce.first_sender_id)::int as first_message_senders,
      count(*) filter (where vce.replied_at is not null)::int as replied_conversations,
      count(*) filter (where vce.reciprocal_at is not null)::int as reciprocal_conversations,
      count(*) filter (where vce.engaged_at is not null)::int as engaged_conversations
    from public.venue_conversation_events vce
    group by vce.venue_id, vce.night
  ),
  live_messages as (
    select
      m.venue_id as vid,
      (private.night_ends_at(msg.created_at, v.timezone))::date as night,
      count(distinct msg.match_id)::int as conversations_started,
      count(distinct msg.sender_id)::int as message_senders
    from public.messages msg
    join public.matches m on m.id = msg.match_id
    join public.venues v on v.id = m.venue_id
    group by m.venue_id, (private.night_ends_at(msg.created_at, v.timezone))::date
  ),
  legacy_chat as (
    select
      vcse.venue_id as vid,
      vcse.night,
      count(*)::int as chats_started
    from public.venue_chat_start_events vcse
    group by vcse.venue_id, vcse.night
  ),
  retention as (
    select
      current_scan.venue_id as vid,
      current_scan.night,
      count(distinct current_scan.user_id) filter (
        where previous_scan.user_id is not null
      )::int as returning_users,
      count(distinct current_scan.user_id) filter (
        where previous_scan.user_id is not null
          and previous_scan.venue_id = current_scan.venue_id
      )::int as returning_same_venue_users,
      count(distinct current_scan.user_id) filter (
        where previous_scan.user_id is not null
          and previous_scan.venue_id <> current_scan.venue_id
      )::int as returning_other_venue_users
    from scan_base current_scan
    left join scan_base previous_scan
      on previous_scan.user_id = current_scan.user_id
     and (
       previous_scan.night < current_scan.night
       or (
         previous_scan.night = current_scan.night
         and previous_scan.first_seen_at < current_scan.first_seen_at
       )
     )
    group by current_scan.venue_id, current_scan.night
  ),
  attribution as (
    select distinct on (ae.venue_id, ae.night)
      ae.venue_id as vid,
      ae.night,
      ae.source,
      ae.medium,
      ae.campaign,
      ae.qr_code_id
    from public.analytics_events ae
    where ae.venue_id is not null
      and ae.night is not null
      and (
        ae.source is not null
        or ae.medium is not null
        or ae.campaign is not null
        or ae.qr_code_id is not null
      )
    group by ae.venue_id, ae.night, ae.source, ae.medium, ae.campaign, ae.qr_code_id
    order by ae.venue_id, ae.night, count(*) desc
  ),
  scan_hours as (
    select distinct on (sb.venue_id, sb.night)
      sb.venue_id as vid,
      sb.night,
      extract(hour from (sb.first_seen_at at time zone v.timezone))::int as peak_scan_hour
    from scan_base sb
    join public.venues v on v.id = sb.venue_id
    group by sb.venue_id, sb.night, v.timezone, extract(hour from (sb.first_seen_at at time zone v.timezone))
    order by sb.venue_id, sb.night, count(*) desc
  ),
  activity_hours as (
    select distinct on (activity.venue_id, activity.night)
      activity.venue_id as vid,
      activity.night,
      activity.hour_of_day as peak_activity_hour
    from (
      select
        p.venue_id,
        (private.night_ends_at(p.checked_in_at, v.timezone))::date as night,
        extract(hour from (p.checked_in_at at time zone v.timezone))::int as hour_of_day
      from public.presence p
      join public.venues v on v.id = p.venue_id
      union all
      select
        vce.venue_id,
        vce.night,
        extract(hour from (vce.first_message_at at time zone v.timezone))::int
      from public.venue_conversation_events vce
      join public.venues v on v.id = vce.venue_id
    ) activity
    group by activity.venue_id, activity.night, activity.hour_of_day
    order by activity.venue_id, activity.night, count(*) desc
  ),
  spine as (
    select vid, night from sc
    union select vid, night from profile_by_scan
    union select vid, night from scan_ci
    union select vid, night from ci
    union select vid, night from ev
    union select vid, night from conv
    union select vid, night from live_messages
    union select vid, night from legacy_chat
    union select vid, night from retention
  )
  select
    s.vid,
    v.name,
    v.city,
    s.night,
    coalesce(sc.scans, 0),
    coalesce(sc.unique_scanners, 0),
    coalesce(ev.landing_views, 0),
    coalesce(ev.sessions, 0),
    coalesce(profile_by_scan.profiles_created, 0),
    coalesce(profile_by_scan.profile_completions, 0),
    coalesce(ci.checkins, 0),
    coalesce(scan_ci.scan_checkins, 0),
    coalesce(ev.venue_experience_openers, 0),
    coalesce(ev.discovery_openers, 0),
    coalesce(ev.profile_viewers, 0),
    coalesce(ev.profile_views, 0),
    coalesce(ev.chat_openers, 0),
    coalesce(ev.chat_opens, 0),
    greatest(
      coalesce(conv.conversations_started, 0),
      coalesce(live_messages.conversations_started, 0),
      coalesce(legacy_chat.chats_started, 0)
    ),
    greatest(coalesce(conv.first_message_senders, 0), coalesce(live_messages.message_senders, 0)),
    coalesce(conv.reciprocal_conversations, 0),
    coalesce(conv.engaged_conversations, 0),
    coalesce(conv.replied_conversations, 0),
    coalesce(retention.returning_users, 0),
    coalesce(retention.returning_same_venue_users, 0),
    coalesce(retention.returning_other_venue_users, 0),
    coalesce(ci.women, 0),
    coalesce(ci.men, 0),
    coalesce(ci.nonbinary, 0),
    coalesce(ci.same_gender_interest, 0),
    coalesce(ci.multi_gender_interest, 0),
    coalesce(ci.interested_in_women, 0),
    coalesce(ci.interested_in_men, 0),
    coalesce(ci.interested_in_nonbinary, 0),
    attribution.source,
    attribution.medium,
    attribution.campaign,
    attribution.qr_code_id,
    scan_hours.peak_scan_hour,
    activity_hours.peak_activity_hour
  from spine s
  join public.venues v on v.id = s.vid
  left join sc on sc.vid = s.vid and sc.night = s.night
  left join profile_by_scan on profile_by_scan.vid = s.vid and profile_by_scan.night = s.night
  left join scan_ci on scan_ci.vid = s.vid and scan_ci.night = s.night
  left join ci on ci.vid = s.vid and ci.night = s.night
  left join ev on ev.vid = s.vid and ev.night = s.night
  left join conv on conv.vid = s.vid and conv.night = s.night
  left join live_messages on live_messages.vid = s.vid and live_messages.night = s.night
  left join legacy_chat on legacy_chat.vid = s.vid and legacy_chat.night = s.night
  left join retention on retention.vid = s.vid and retention.night = s.night
  left join attribution on attribution.vid = s.vid and attribution.night = s.night
  left join scan_hours on scan_hours.vid = s.vid and scan_hours.night = s.night
  left join activity_hours on activity_hours.vid = s.vid and activity_hours.night = s.night
  order by s.night desc, v.name;
end;
$$;

revoke execute on function public.admin_founder_analytics() from anon, public;
grant  execute on function public.admin_founder_analytics() to authenticated;
