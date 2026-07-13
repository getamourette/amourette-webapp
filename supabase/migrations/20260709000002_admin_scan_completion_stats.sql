-- Admin stats: track QR scans and profile setup completion by venue/night.
--
-- This gives founders the top-of-funnel number: people who scanned the QR but
-- did not finish onboarding. The table stores one aggregate-able scan row per
-- user/venue/night, not nominative analytics for the browser.

create table if not exists public.venue_scan_events (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade,
  venue_id      uuid not null references public.venues (id) on delete cascade,
  night         date not null,
  first_seen_at timestamptz not null default now(),
  last_seen_at  timestamptz not null default now(),
  constraint venue_scan_events_unique unique (user_id, venue_id, night)
);

alter table public.venue_scan_events enable row level security;

revoke all on public.venue_scan_events from anon, public;
grant insert, update on public.venue_scan_events to authenticated;

create or replace function public.record_venue_scan(p_venue_id uuid)
  returns void
  language plpgsql
  security definer
  set search_path = public, private
as $$
declare
  me uuid := auth.uid();
  scan_night date;
begin
  if me is null then
    raise exception 'not authenticated';
  end if;

  select (private.night_ends_at(now(), v.timezone))::date
    into scan_night
  from public.venues v
  where v.id = p_venue_id;

  if scan_night is null then
    raise exception 'venue not found';
  end if;

  insert into public.venue_scan_events (user_id, venue_id, night)
  values (me, p_venue_id, scan_night)
  on conflict (user_id, venue_id, night)
  do update set last_seen_at = now();
end;
$$;

revoke execute on function public.record_venue_scan(uuid) from anon, public;
grant  execute on function public.record_venue_scan(uuid) to authenticated;

create table if not exists public.venue_chat_start_events (
  id            uuid primary key default gen_random_uuid(),
  match_id      uuid not null unique,
  venue_id      uuid not null references public.venues (id) on delete cascade,
  night         date not null,
  started_at    timestamptz not null default now()
);

alter table public.venue_chat_start_events enable row level security;

revoke all on public.venue_chat_start_events from anon, public;
grant insert on public.venue_chat_start_events to authenticated;

create or replace function public.record_chat_started(p_match_id uuid)
  returns void
  language plpgsql
  security definer
  set search_path = public, private
as $$
declare
  me uuid := auth.uid();
  match_venue_id uuid;
  match_night date;
begin
  if me is null then
    raise exception 'not authenticated';
  end if;

  select m.venue_id,
         (private.night_ends_at(now(), v.timezone))::date
    into match_venue_id, match_night
  from public.matches m
  join public.venues v on v.id = m.venue_id
  where m.id = p_match_id
    and me in (m.profile_a, m.profile_b);

  if match_venue_id is null then
    raise exception 'match not found';
  end if;

  insert into public.venue_chat_start_events (match_id, venue_id, night)
  values (p_match_id, match_venue_id, match_night)
  on conflict (match_id) do nothing;
end;
$$;

revoke execute on function public.record_chat_started(uuid) from anon, public;
grant  execute on function public.record_chat_started(uuid) to authenticated;

create table if not exists public.venue_match_events (
  id         uuid primary key default gen_random_uuid(),
  match_id   uuid not null unique,
  venue_id   uuid not null references public.venues (id) on delete cascade,
  night      date not null,
  matched_at timestamptz not null default now()
);

alter table public.venue_match_events enable row level security;

revoke all on public.venue_match_events from anon, public;

create or replace function private.record_match_event(p_match_id uuid)
  returns void
  language plpgsql
  security definer
  set search_path = public, private
as $$
declare
  match_venue_id uuid;
  match_created_at timestamptz;
  match_night date;
begin
  select m.venue_id,
         m.created_at,
         (private.night_ends_at(m.created_at, v.timezone))::date
    into match_venue_id, match_created_at, match_night
  from public.matches m
  join public.venues v on v.id = m.venue_id
  where m.id = p_match_id;

  if match_venue_id is null then
    return;
  end if;

  insert into public.venue_match_events (match_id, venue_id, night, matched_at)
  values (p_match_id, match_venue_id, match_night, match_created_at)
  on conflict (match_id) do nothing;
end;
$$;

revoke execute on function private.record_match_event(uuid) from public, anon, authenticated;

create or replace function public.record_existing_match_events()
  returns integer
  language plpgsql
  security definer
  set search_path = public, private
as $$
declare
  inserted_count integer;
begin
  if not private.is_admin() then
    raise exception 'not authorized';
  end if;

  insert into public.venue_match_events (match_id, venue_id, night, matched_at)
  select m.id,
         m.venue_id,
         (private.night_ends_at(m.created_at, v.timezone))::date,
         m.created_at
  from public.matches m
  join public.venues v on v.id = m.venue_id
  on conflict (match_id) do nothing;

  get diagnostics inserted_count = row_count;
  return inserted_count;
end;
$$;

revoke execute on function public.record_existing_match_events() from anon, public;
grant  execute on function public.record_existing_match_events() to authenticated;

create or replace function public.handle_new_like()
  returns trigger
  language plpgsql
  security definer
  set search_path = public, private
as $$
declare
  venue_timezone text;
  new_match_id uuid;
begin
  if exists (
    select 1 from public.likes l
    where l.liker_id = new.liked_id
      and l.liked_id = new.liker_id
      and l.venue_id = new.venue_id
  ) then
    select v.timezone into venue_timezone
    from public.venues v
    where v.id = new.venue_id;

    insert into public.matches (profile_a, profile_b, venue_id, expires_at)
    values (
      least(new.liker_id, new.liked_id),
      greatest(new.liker_id, new.liked_id),
      new.venue_id,
      private.night_ends_at(now(), venue_timezone)
    )
    on conflict (profile_a, profile_b, venue_id) do nothing
    returning id into new_match_id;

    if new_match_id is not null then
      perform private.record_match_event(new_match_id);
    end if;
  end if;
  return new;
end;
$$;

revoke execute on function public.handle_new_like() from anon, authenticated, public;

drop function if exists public.admin_night_stats();

create function public.admin_night_stats()
  returns table (
    venue_id             uuid,
    venue_name           text,
    night                date,
    scans                integer,
    profile_completions  integer,
    profile_dropoffs     integer,
    checkins             integer,
    likes                integer,
    matches              integer,
    chats_started        integer,
    women_checkins       integer,
    men_checkins         integer,
    nonbinary_checkins   integer,
    same_gender_interest_checkins integer,
    multi_gender_interest_checkins integer,
    interested_in_women_checkins integer,
    interested_in_men_checkins integer,
    interested_in_nonbinary_checkins integer,
    likes_from_women integer,
    likes_from_men integer,
    likes_from_nonbinary integer
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
  sc as (
    select vse.venue_id as vid,
           vse.night,
           count(*)::int as scans,
           count(*) filter (
             where pp.adult_confirmed_at is not null
           )::int as completions
    from public.venue_scan_events vse
    left join public.profile_private pp on pp.id = vse.user_id
    group by vse.venue_id, vse.night
  ),
  ci as (
    select p.venue_id as vid,
           (private.night_ends_at(p.checked_in_at, v.timezone))::date as night,
           count(*)::int as c,
           count(*) filter (where pr.gender = 'woman')::int as women,
           count(*) filter (where pr.gender = 'man')::int as men,
           count(*) filter (where pr.gender = 'nonbinary')::int as nonbinary,
           count(*) filter (where pr.gender = any(pr.interested_in))::int as same_gender_interest,
           count(*) filter (where cardinality(pr.interested_in) > 1)::int as multi_gender_interest,
           count(*) filter (where 'woman' = any(pr.interested_in))::int as interested_in_women,
           count(*) filter (where 'man' = any(pr.interested_in))::int as interested_in_men,
           count(*) filter (where 'nonbinary' = any(pr.interested_in))::int as interested_in_nonbinary
    from public.presence p
    join public.venues v on v.id = p.venue_id
    join public.profiles pr on pr.id = p.profile_id
    group by p.venue_id, (private.night_ends_at(p.checked_in_at, v.timezone))::date
  ),
  lk as (
    select l.venue_id as vid,
           (private.night_ends_at(l.created_at, v.timezone))::date as night,
           count(*)::int as c,
           count(*) filter (where pr.gender = 'woman')::int as from_women,
           count(*) filter (where pr.gender = 'man')::int as from_men,
           count(*) filter (where pr.gender = 'nonbinary')::int as from_nonbinary
    from public.likes l
    join public.venues v on v.id = l.venue_id
    join public.profiles pr on pr.id = l.liker_id
    group by l.venue_id, (private.night_ends_at(l.created_at, v.timezone))::date
  ),
  mt as (
    select vme.venue_id as vid,
           vme.night,
           count(*)::int as c
    from public.venue_match_events vme
    group by vme.venue_id, vme.night
  ),
  live_mt as (
    select m.venue_id as vid,
           (private.night_ends_at(m.created_at, v.timezone))::date as night,
           count(*)::int as c
    from public.matches m
    join public.venues v on v.id = m.venue_id
    group by m.venue_id, (private.night_ends_at(m.created_at, v.timezone))::date
  ),
  ch as (
    select vcse.venue_id as vid,
           vcse.night,
           count(*)::int as c
    from public.venue_chat_start_events vcse
    group by vcse.venue_id, vcse.night
  ),
  live_ch as (
    select m.venue_id as vid,
           (private.night_ends_at(msg.created_at, v.timezone))::date as night,
           count(distinct msg.match_id)::int as c
    from public.messages msg
    join public.matches m on m.id = msg.match_id
    join public.venues v on v.id = m.venue_id
    group by m.venue_id, (private.night_ends_at(msg.created_at, v.timezone))::date
  ),
  spine as (
    select vid, night from sc
    union select vid, night from ci
    union select vid, night from lk
    union select vid, night from mt
    union select vid, night from live_mt
    union select vid, night from ch
    union select vid, night from live_ch
  )
  select s.vid,
         v.name,
         s.night,
         coalesce(sc.scans, 0),
         coalesce(sc.completions, 0),
         greatest(coalesce(sc.scans, 0) - coalesce(sc.completions, 0), 0),
         coalesce(ci.c, 0),
         coalesce(lk.c, 0),
         greatest(coalesce(mt.c, 0), coalesce(live_mt.c, 0)),
         greatest(coalesce(ch.c, 0), coalesce(live_ch.c, 0)),
         coalesce(ci.women, 0),
         coalesce(ci.men, 0),
         coalesce(ci.nonbinary, 0),
         coalesce(ci.same_gender_interest, 0),
         coalesce(ci.multi_gender_interest, 0),
         coalesce(ci.interested_in_women, 0),
         coalesce(ci.interested_in_men, 0),
         coalesce(ci.interested_in_nonbinary, 0),
         coalesce(lk.from_women, 0),
         coalesce(lk.from_men, 0),
         coalesce(lk.from_nonbinary, 0)
  from spine s
  join public.venues v on v.id = s.vid
  left join sc on sc.vid = s.vid and sc.night = s.night
  left join ci on ci.vid = s.vid and ci.night = s.night
  left join lk on lk.vid = s.vid and lk.night = s.night
  left join mt on mt.vid = s.vid and mt.night = s.night
  left join live_mt on live_mt.vid = s.vid and live_mt.night = s.night
  left join ch on ch.vid = s.vid and ch.night = s.night
  left join live_ch on live_ch.vid = s.vid and live_ch.night = s.night
  order by s.night desc, v.name;
end;
$$;

revoke execute on function public.admin_night_stats() from anon, public;
grant  execute on function public.admin_night_stats() to authenticated;
