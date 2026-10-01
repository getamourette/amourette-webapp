begin;
-- Keep migration backfill and collector replacement on one consistent boundary.
lock table public.venue_nights, public.presence, public.likes, public.matches,
 public.messages, public.profile_private, public.venue_scan_events,
 public.venue_match_events, public.venue_chat_start_events,
 public.venue_conversation_events, public.analytics_events in share row exclusive mode;

-- #257. Behavioral migration: founder approval is required before shared application.
-- Source identities live only until terminal finalization. Reports contain aggregates.
-- Removing identifiers does not guarantee anonymity in a small group.
alter table public.venue_nights add column stats_started_at timestamptz not null default now();

create table private.night_people (
  venue_night_id uuid not null references public.venue_nights(id) on delete cascade,
  person_id uuid not null, -- deliberately no account FK: deletion must not erase counters
  first_scan_at timestamptz,
  complete_at_scan boolean,
  completed_during boolean not null default false,
  entered_at timestamptz,
  gender text check (gender in ('woman','man','nonbinary')),
  likes_sent integer not null default 0 check (likes_sent >= 0),
  likes_received integer not null default 0 check (likes_received >= 0),
  matches integer not null default 0 check (matches >= 0),
  first_match_at timestamptz,
  arrival_count integer check (arrival_count between 0 and 2147483647),
  primary key (venue_night_id,person_id)
);
create table private.night_intervals (
  presence_id uuid primary key,
  venue_night_id uuid not null references public.venue_nights(id) on delete cascade,
  person_id uuid not null,
  entered_at timestamptz not null,
  left_at timestamptz
);
create index on private.night_intervals(venue_night_id);
create table private.night_conversations (
  match_id uuid primary key,
  venue_night_id uuid not null references public.venue_nights(id) on delete cascade,
  first_sender uuid,
  started boolean not null default false,
  replied boolean not null default false
);
create index on private.night_conversations(venue_night_id);

create table public.venue_night_reports (
  venue_night_id uuid primary key references public.venue_nights(id) on delete cascade,
  venue_id uuid not null references public.venues(id) on delete cascade,
  version integer not null default 1 check (version=1),
  finalized_at timestamptz,
  partial boolean not null,
  timezone text not null,
  scanners integer,
  preexisting_profiles integer,
  completed_profiles integer,
  incomplete_scanners integer,
  dropoffs integer,
  scan_entrants integer,
  participants integer not null,
  likes integer,
  like_senders integer,
  likes_distribution integer[],
  matches integer,
  matched_participants integer,
  matches_distribution integer[],
  conversations integer,
  replies integer,
  arrival_distribution integer[],
  arrival_observations integer,
  first_match_median_seconds double precision,
  first_match_sample integer,
  peak integer,
  attendance jsonb,
  gender_mix jsonb,
  likes_by_gender jsonb
);
alter table public.venue_night_reports enable row level security;
revoke all on public.venue_night_reports from public,anon,authenticated,service_role;
-- Only the founder RPC exposes reports. Private source tables have no client grants.
revoke all on private.night_people,private.night_intervals,private.night_conversations from public,anon,authenticated,service_role;

-- Serialize collection with the terminal transition's existing FOR UPDATE lock.
create function private.lock_stats_night(p_id uuid) returns boolean
language plpgsql security definer set search_path=public,private as $$
declare n public.venue_nights;
begin
  select * into n from public.venue_nights where id=p_id for update;
  return found and n.terminal_at is null and clock_timestamp()<n.closes_at;
end;
$$;

-- Deleting a night must delete its scoped analytics too, rather than turn them
-- into unassigned identifying rows with no remaining cleanup boundary.
alter table public.analytics_events drop constraint analytics_events_venue_night_id_fkey;
alter table public.analytics_events add constraint analytics_events_venue_night_id_fkey foreign key(venue_night_id) references public.venue_nights(id) on delete cascade;
alter table public.venue_scan_events drop constraint venue_scan_events_venue_night_id_fkey;
alter table public.venue_scan_events add constraint venue_scan_events_venue_night_id_fkey foreign key(venue_night_id) references public.venue_nights(id) on delete cascade;
alter table public.venue_match_events drop constraint venue_match_events_venue_night_id_fkey;
alter table public.venue_match_events add constraint venue_match_events_venue_night_id_fkey foreign key(venue_night_id) references public.venue_nights(id) on delete cascade;
alter table public.venue_chat_start_events drop constraint venue_chat_start_events_venue_night_id_fkey;
alter table public.venue_chat_start_events add constraint venue_chat_start_events_venue_night_id_fkey foreign key(venue_night_id) references public.venue_nights(id) on delete cascade;
alter table public.venue_conversation_events drop constraint venue_conversation_events_venue_night_id_fkey;
alter table public.venue_conversation_events add constraint venue_conversation_events_venue_night_id_fkey foreign key(venue_night_id) references public.venue_nights(id) on delete cascade;

-- Historical scans may have been deduplicated across two nights on one date.
-- Preserve only their explicit night binding; never infer a night from a date.
-- A multi-day old night could already have one scanner row per date. Collapse
-- only explicitly identical night/account keys before tightening uniqueness.
with scans as (
 select id,first_value(id) over(partition by user_id,venue_night_id order by first_seen_at,id) keep_id,
 min(first_seen_at) over(partition by user_id,venue_night_id) first_seen,
 max(last_seen_at) over(partition by user_id,venue_night_id) last_seen
 from public.venue_scan_events where venue_night_id is not null
)
update public.venue_scan_events e set first_seen_at=s.first_seen,last_seen_at=s.last_seen
from scans s where e.id=s.id and s.id=s.keep_id;
with scans as (
 select id,row_number() over(partition by user_id,venue_night_id order by first_seen_at,id) rn
 from public.venue_scan_events where venue_night_id is not null
)
delete from public.venue_scan_events e using scans s where e.id=s.id and s.rn>1;
alter table public.venue_scan_events drop constraint venue_scan_events_unique;
alter table public.venue_scan_events add constraint venue_scan_events_unique unique(user_id,venue_night_id);

insert into private.night_people(venue_night_id,person_id,first_scan_at)
select venue_night_id,user_id,min(first_seen_at) from public.venue_scan_events
where venue_night_id is not null group by venue_night_id,user_id;
insert into private.night_people(venue_night_id,person_id,entered_at)
select venue_night_id,profile_id,min(checked_in_at) from public.presence group by venue_night_id,profile_id
on conflict(venue_night_id,person_id) do update set entered_at=excluded.entered_at;
insert into private.night_intervals
select id,venue_night_id,profile_id,checked_in_at,left_at from public.presence;
insert into private.night_conversations(match_id,venue_night_id,started,replied)
select match_id,venue_night_id,bool_or(started),bool_or(replied) from (
 select id match_id,venue_night_id,false started,false replied from public.matches
 union all select match_id,venue_night_id,false,false from public.venue_match_events
 union all select match_id,venue_night_id,false,false from public.venue_chat_start_events
 union all select match_id,venue_night_id,true,replied_at is not null from public.venue_conversation_events
 union all select m.id,m.venue_night_id,true,count(distinct msg.sender_id)>1
 from public.messages msg join public.matches m on m.id=msg.match_id group by m.id,m.venue_night_id
) sources where venue_night_id is not null group by match_id,venue_night_id;

create or replace function public.record_venue_scan(p_venue_id uuid) returns void
language plpgsql security definer set search_path=public,private as $$
declare n public.venue_nights; me uuid:=auth.uid(); complete boolean;
begin
 if me is null then raise exception 'not authenticated'; end if;
 perform pg_advisory_xact_lock(hashtextextended('night-stats-person:'||me::text,0));
 if p_venue_id is null or not exists(select 1 from public.venues where id=p_venue_id) then raise exception 'venue not found'; end if;
 select * into n from public.venue_nights where venue_id=p_venue_id and terminal_at is null
   and status in ('waiting','live') and clock_timestamp()<closes_at for update;
 if not found then return; end if;
 select exists(select 1 from public.profile_private where id=me and adult_confirmed_at is not null) into complete;
 insert into private.night_people(venue_night_id,person_id,first_scan_at,complete_at_scan)
 values(n.id,me,clock_timestamp(),complete)
 on conflict(venue_night_id,person_id) do update
 set first_scan_at=coalesce(night_people.first_scan_at,excluded.first_scan_at),
 complete_at_scan=case when night_people.first_scan_at is null then excluded.complete_at_scan else night_people.complete_at_scan end;
 insert into public.venue_scan_events(user_id,venue_id,venue_night_id,night)
 values(me,p_venue_id,n.id,(n.waiting_opens_at at time zone (select timezone from venues where id=p_venue_id))::date)
 on conflict(user_id,venue_night_id) do update set last_seen_at=clock_timestamp();
end;
$$;

create function private.collect_profile_completion() returns trigger
language plpgsql security definer set search_path=public,private as $$
declare night_id uuid;
begin
 if new.adult_confirmed_at is null then return new; end if;
 perform pg_advisory_xact_lock(hashtextextended('night-stats-person:'||new.id::text,0));
 for night_id in select venue_night_id from private.night_people where person_id=new.id and complete_at_scan=false order by venue_night_id loop
   if private.lock_stats_night(night_id) then
     update private.night_people set completed_during=true where venue_night_id=night_id and person_id=new.id;
   end if;
 end loop;
 return new;
end;
$$;
create trigger stats_profile_completed after insert or update of adult_confirmed_at on public.profile_private
for each row execute function private.collect_profile_completion();

create function private.collect_presence() returns trigger
language plpgsql security definer set search_path=public,private as $$
begin
 -- Updates/deletes after terminal finalization must never recreate cleaned sources.
 if not private.lock_stats_night(new.venue_night_id) then return new; end if;
 insert into private.night_people(venue_night_id,person_id,entered_at,gender)
 select new.venue_night_id,new.profile_id,new.checked_in_at,p.gender from public.profiles p where p.id=new.profile_id
 on conflict(venue_night_id,person_id) do update
 set entered_at=coalesce(night_people.entered_at,excluded.entered_at),
 gender=case when night_people.entered_at is null then excluded.gender else night_people.gender end;
 insert into private.night_intervals values(new.id,new.venue_night_id,new.profile_id,new.checked_in_at,new.left_at)
 on conflict(presence_id) do update set left_at=excluded.left_at;
 return new;
end;
$$;
create trigger stats_presence after insert or update of left_at on public.presence
for each row execute function private.collect_presence();
-- Preserve a real departure if account or operational presence is deleted early.
create function private.collect_presence_delete() returns trigger
language plpgsql security definer set search_path=public,private as $$
begin
 if private.lock_stats_night(old.venue_night_id) then
   update private.night_intervals set left_at=coalesce(left_at,clock_timestamp()) where presence_id=old.id;
 end if;
 return old;
end;
$$;
create trigger stats_presence_delete before delete on public.presence for each row execute function private.collect_presence_delete();

create function private.guard_stats_interaction() returns trigger
language plpgsql security definer set search_path=public,private as $$
declare night_id uuid;
begin
 if tg_table_name='messages' then
   select venue_night_id into night_id from public.matches where id=new.match_id;
 else night_id:=new.venue_night_id; end if;
 if not private.lock_stats_night(night_id) then raise exception 'venue night ended'; end if;
 return new;
end;
$$;
-- Likes' existing scope/expiry trigger runs first and supplies the exact night ID.
create trigger z_stats_guard before insert on public.likes for each row execute function private.guard_stats_interaction();
create trigger z_stats_guard before insert on public.matches for each row execute function private.guard_stats_interaction();
create trigger z_stats_guard before insert on public.messages for each row execute function private.guard_stats_interaction();

create function private.collect_interaction() returns trigger
language plpgsql security definer set search_path=public,private as $$
declare night_id uuid;
begin
 if tg_table_name='likes' then
   update private.night_people set likes_sent=likes_sent+1 where venue_night_id=new.venue_night_id and person_id=new.liker_id;
   update private.night_people set likes_received=likes_received+1 where venue_night_id=new.venue_night_id and person_id=new.liked_id;
 elsif tg_table_name='matches' then
   insert into private.night_conversations(match_id,venue_night_id) values(new.id,new.venue_night_id);
   update private.night_people set matches=matches+1,first_match_at=coalesce(first_match_at,new.created_at)
   where venue_night_id=new.venue_night_id and person_id in(new.profile_a,new.profile_b);
 else
   select venue_night_id into night_id from public.matches where id=new.match_id;
   update private.night_conversations set started=true,
     replied=replied or (first_sender is not null and first_sender<>new.sender_id),
     first_sender=coalesce(first_sender,new.sender_id) where match_id=new.match_id and venue_night_id=night_id;
 end if;
 return new;
end;
$$;
create trigger stats_like after insert on public.likes for each row execute function private.collect_interaction();
create trigger stats_match after insert on public.matches for each row execute function private.collect_interaction();
create trigger stats_message after insert on public.messages for each row execute function private.collect_interaction();

create function public.record_room_arrival(p_venue_night_id uuid,p_visible_count integer) returns void
language plpgsql security definer set search_path=public,private as $$
begin
 if auth.uid() is null then raise exception 'not authenticated'; end if;
 if p_venue_night_id is null or p_visible_count is null or p_visible_count<0 then raise exception 'invalid room observation'; end if;
 if not private.lock_stats_night(p_venue_night_id) or not exists(
   select 1 from public.venue_nights n join public.presence p on p.venue_night_id=n.id
   where n.id=p_venue_night_id and n.status='live' and p.profile_id=auth.uid() and p.left_at is null and p.is_visible
 ) then raise exception 'active live entry required'; end if;
 update private.night_people set arrival_count=p_visible_count
 where venue_night_id=p_venue_night_id and person_id=auth.uid() and entered_at is not null and arrival_count is null;
end;
$$;
revoke all on function public.record_room_arrival(uuid,integer) from public,anon;
grant execute on function public.record_room_arrival(uuid,integer) to authenticated;

-- Legacy writes are night-scoped and take the same lock, including retries/upserts.
-- Global/unassignable analytics have no terminal retention boundary: stop collecting
-- them; migration below retains only their unassigned aggregate row counts.
create or replace function private.scope_analytics_to_venue_night() returns trigger
language plpgsql security definer set search_path=public,private as $$
begin
 if new.venue_night_id is null then
   select id into new.venue_night_id from public.venue_nights
   where venue_id=new.venue_id and terminal_at is null and status in ('waiting','live') and clock_timestamp()<closes_at;
 end if;
 if not private.lock_stats_night(new.venue_night_id) then return null; end if;
 return new;
end;
$$;
create or replace function private.scope_venue_event_to_night() returns trigger
language plpgsql security definer set search_path=public,private as $$
begin
 if new.venue_night_id is null and tg_table_name<>'venue_scan_events' then
   select venue_night_id into new.venue_night_id from public.matches where id=new.match_id;
 end if;
 if not private.lock_stats_night(new.venue_night_id) then return null; end if;
 return new;
end;
$$;

create function private.build_night_report(p_id uuid) returns public.venue_night_reports
language plpgsql security definer set search_path=public,private as $$
declare n public.venue_nights; r public.venue_night_reports; cutoff timestamptz;
begin
 select * into n from public.venue_nights where id=p_id;
 if not found then raise exception 'venue night not found'; end if;
 r.venue_night_id:=n.id; r.venue_id:=n.venue_id; r.version:=1; r.finalized_at:=n.terminal_at;
 r.partial:=n.stats_started_at>least(n.waiting_opens_at,coalesce(n.opened_at,n.waiting_opens_at));
 select timezone into r.timezone from public.venues where id=n.venue_id;
 cutoff:=least(coalesce(n.terminal_at,clock_timestamp()),n.closes_at);
 select count(*) filter(where first_scan_at is not null), count(*) filter(where entered_at is not null),
 count(*) filter(where first_scan_at is not null and entered_at is not null)
 into r.scanners,r.participants,r.scan_entrants from private.night_people where venue_night_id=p_id;
 select count(*),count(*) filter(where started),count(*) filter(where replied)
 into r.matches,r.conversations,r.replies from private.night_conversations where venue_night_id=p_id;
 -- Everything below requires collection from the start. Unknown history stays NULL.
 if not r.partial then
   select count(*) filter(where complete_at_scan),count(*) filter(where completed_during),
     count(*) filter(where complete_at_scan=false),count(*) filter(where complete_at_scan=false and not completed_during)
   into r.preexisting_profiles,r.completed_profiles,r.incomplete_scanners,r.dropoffs
   from private.night_people where venue_night_id=p_id and first_scan_at is not null;
   select coalesce(sum(likes_sent),0),count(*) filter(where likes_sent>0),count(*) filter(where matches>0),
     array[count(*) filter(where likes_sent=0),count(*) filter(where likes_sent=1),count(*) filter(where likes_sent=2),count(*) filter(where likes_sent>=3)]::integer[],
     array[count(*) filter(where matches=0),count(*) filter(where matches=1),count(*) filter(where matches=2),count(*) filter(where matches>=3)]::integer[],
     array[count(*) filter(where arrival_count=0),count(*) filter(where arrival_count between 1 and 4),count(*) filter(where arrival_count>=5)]::integer[],
     count(arrival_count),count(first_match_at),
     percentile_cont(0.5) within group(order by greatest(0,extract(epoch from(first_match_at-entered_at)))) filter(where first_match_at is not null)
   into r.likes,r.like_senders,r.matched_participants,r.likes_distribution,r.matches_distribution,
     r.arrival_distribution,r.arrival_observations,r.first_match_sample,r.first_match_median_seconds
   from private.night_people where venue_night_id=p_id and entered_at is not null;
   select jsonb_agg(jsonb_build_object('gender',g.gender,'participants',g.people,
      'sent',g.sent,'received',g.received,'senders',g.senders,'receivers',g.receivers) order by g.gender)
   into r.likes_by_gender from (
     select genders.gender,count(p.person_id) people,coalesce(sum(p.likes_sent),0) sent,coalesce(sum(p.likes_received),0) received,
       count(*) filter(where p.likes_sent>0) senders,count(*) filter(where p.likes_received>0) receivers
     from unnest(array['woman','man','nonbinary']) genders(gender)
     left join private.night_people p on p.venue_night_id=p_id and p.entered_at is not null and p.gender=genders.gender
     group by genders.gender
   ) g;
   select jsonb_object_agg(g->>'gender',g->'participants') into r.gender_mix from jsonb_array_elements(r.likes_by_gender) g;
 end if;
 -- Presence intervals existed before this migration. Snapshot and merge overlapping
 -- intervals per account; half-open intervals count simultaneous departure correctly.
 with merged as (
   select person_id,range_agg(tstzrange(entered_at,least(coalesce(left_at,cutoff),cutoff),'[)')) spans
   from private.night_intervals where venue_night_id=p_id and entered_at<least(coalesce(left_at,cutoff),cutoff)
   group by person_id
 ), spans as (
   select person_id,unnest(spans) span from merged
 ), buckets as (
   select generate_series(
     date_bin(interval '30 minutes',(select min(lower(span)) from spans),
       date_trunc('day',n.waiting_opens_at at time zone r.timezone) at time zone r.timezone),
     cutoff,interval '30 minutes') at
 ), samples as (
   select at from buckets where at<cutoff
   union select lower(span) from spans
 ), levels as (
   select at,(select count(distinct person_id)::integer from spans where span @> samples.at) amount from samples
 ), curve as (
   select b.at,coalesce(max(l.amount),0)::integer amount from buckets b
   left join levels l on l.at>=b.at and l.at<b.at+interval '30 minutes'
   where b.at<cutoff group by b.at
 )
 select coalesce(max(amount),0),coalesce(jsonb_agg(jsonb_build_object('at',at,'count',amount) order by at),'[]'::jsonb)
 into r.peak,r.attendance from curve;
 return r;
end;
$$;

create function private.finalize_night_report(p_id uuid) returns void
language plpgsql security definer set search_path=public,private as $$
declare n public.venue_nights;
begin
 select * into n from public.venue_nights where id=p_id for update;
 if not found or n.terminal_at is null then raise exception 'terminal night required'; end if;
 insert into public.venue_night_reports select r.* from private.build_night_report(p_id) r
 on conflict(venue_night_id) do nothing;
 delete from public.analytics_events where venue_night_id=p_id;
 delete from public.venue_scan_events where venue_night_id=p_id;
 delete from public.venue_match_events where venue_night_id=p_id;
 delete from public.venue_chat_start_events where venue_night_id=p_id;
 delete from public.venue_conversation_events where venue_night_id=p_id;
 delete from private.night_people where venue_night_id=p_id;
 delete from private.night_intervals where venue_night_id=p_id;
 delete from private.night_conversations where venue_night_id=p_id;
end;
$$;

create function public.admin_venue_night_report(p_venue_night_id uuid) returns setof public.venue_night_reports
language plpgsql security definer set search_path=public,private as $$
begin
 if not private.is_admin() then raise exception 'not authorized'; end if;
 if p_venue_night_id is null then raise exception 'venue night required'; end if;
 -- Serialize provisional reads too: a READ COMMITTED call must not mix a source
 -- snapshot before cleanup with source queries after cleanup.
 perform 1 from public.venue_nights where id=p_venue_night_id for update;
 if not found then raise exception 'venue night not found'; end if;
 if exists(select 1 from public.venue_night_reports where venue_night_id=p_venue_night_id) then
   return query select * from public.venue_night_reports where venue_night_id=p_venue_night_id;
 else return next private.build_night_report(p_venue_night_id); end if;
end;
$$;
revoke all on function public.admin_venue_night_report(uuid) from public,anon;
grant execute on function public.admin_venue_night_report(uuid) to authenticated;

-- Preserve the existing state machine; finalize before interaction deletion.
create or replace function private.transition_venue_night(
  p_venue_night_id uuid,
  p_event text,
  p_reason text default null,
  p_actor_id uuid default null
)
  returns public.venue_nights
  language plpgsql
  security definer
  set search_path = public, private
as $$
declare
  night public.venue_nights;
  old_status text;
  next_status text;
begin
  -- Preserve #231's eligibility barrier before locking the night row.
  perform private.lock_like_eligibility();
  select * into night from public.venue_nights
  where id = p_venue_night_id for update;
  if not found then raise exception 'venue night not found'; end if;
  old_status := night.status;

  if p_event = 'opened' then
    if night.terminal_at is not null or night.status <> 'closed' or now() >= night.closes_at then return night; end if;
    next_status := 'waiting';
  elsif p_event = 'launched' then
    if night.terminal_at is not null or night.status <> 'waiting' or now() >= night.closes_at then return night; end if;
    next_status := 'live';
  elsif p_event = 'closed' then
    if night.terminal_at is not null or night.status = 'closed' then return night; end if;
    next_status := 'closed';
  elsif p_event = 'reopened' then
    if night.terminal_at is not null or night.status <> 'closed' or now() >= night.closes_at then return night; end if;
    next_status := case when night.launched_at is null then 'waiting' else 'live' end;
  elsif p_event in ('ended', 'cancelled') then
    if night.terminal_at is not null then return night; end if;
    next_status := 'closed';
  else
    raise exception 'invalid venue night event';
  end if;

  update public.venue_nights vn
  set status = next_status,
      opened_at = case when p_event in ('opened', 'reopened') then coalesce(vn.opened_at, now()) else vn.opened_at end,
      launched_at = case when p_event = 'launched' then now() else vn.launched_at end,
      launch_reason = case when p_event = 'launched' then p_reason else vn.launch_reason end,
      terminal_at = case when p_event in ('ended', 'cancelled') then now() else vn.terminal_at end,
      terminal_reason = case
        when p_event = 'ended' then 'scheduled_end'
        when p_event = 'cancelled' then 'cancelled'
        else vn.terminal_reason
      end
  where vn.id = night.id
  returning * into night;

  update public.venues
  set is_live = (next_status = 'live'),
      profile_preview_enabled = case when next_status = 'live' then profile_preview_enabled else false end
  where id = night.venue_id;

  if p_event in ('closed', 'ended', 'cancelled') then
    update public.presence set left_at = now()
    where venue_night_id = night.id and left_at is null;
  end if;
  if p_event in ('ended', 'cancelled') then
    perform private.finalize_night_report(night.id);
    delete from public.likes where venue_night_id = night.id;
    delete from public.matches where venue_night_id = night.id;
    delete from public.venue_ejections where venue_night_id = night.id;
  end if;

  insert into public.venue_night_transitions
    (venue_night_id, from_status, to_status, event, reason, actor_id)
  values (night.id, old_status, next_status, p_event, p_reason, p_actor_id);
  return night;
end;
$$;
revoke execute on function private.transition_venue_night(uuid, text, text, uuid)
  from public, anon, authenticated;

-- Legacy date-shaped API: covered metrics come from the same durable report.
-- Unsupported individual/attribution measurements are explicitly unavailable.
create or replace function public.admin_founder_analytics()
returns table(venue_id uuid, venue_name text, venue_city text, night date, scans integer, unique_scanners integer, landing_views integer, sessions integer, profiles_created integer, profile_completions integer, checkins integer, scan_checkins integer, venue_experience_openers integer, discovery_openers integer, profile_viewers integer, profile_views integer, chat_openers integer, chat_opens integer, conversations_started integer, first_message_senders integer, reciprocal_conversations integer, engaged_conversations integer, replied_conversations integer, returning_users integer, returning_same_venue_users integer, returning_other_venue_users integer, women_checkins integer, men_checkins integer, nonbinary_checkins integer, same_gender_interest_checkins integer, multi_gender_interest_checkins integer, interested_in_women_checkins integer, interested_in_men_checkins integer, interested_in_nonbinary_checkins integer, top_source text, top_medium text, top_campaign text, top_qr_code_id text, peak_scan_hour integer, peak_activity_hour integer)
language plpgsql security definer set search_path=public,private as $$
begin
 if not private.is_admin() then raise exception 'not authorized'; end if;
 return query select
 v.id,
 v.name,
 v.city,
 (n.waiting_opens_at at time zone v.timezone)::date,
 case when count(r.scanners)=count(*) then sum(r.scanners)::integer end,
 case when count(r.scanners)=count(*) then sum(r.scanners)::integer end,
 null::integer,
 null::integer,
 null::integer,
 case when count(r.completed_profiles)=count(*) then sum(r.completed_profiles)::integer end,
 case when count(r.participants)=count(*) then sum(r.participants)::integer end,
 case when count(r.scan_entrants)=count(*) then sum(r.scan_entrants)::integer end,
 null::integer,
 null::integer,
 null::integer,
 null::integer,
 null::integer,
 null::integer,
 case when count(r.conversations)=count(*) then sum(r.conversations)::integer end,
 null::integer,
 case when count(r.replies)=count(*) then sum(r.replies)::integer end,
 null::integer,
 case when count(r.replies)=count(*) then sum(r.replies)::integer end,
 null::integer,
 null::integer,
 null::integer,
 case when count((r.gender_mix->>'woman')::integer)=count(*) then sum((r.gender_mix->>'woman')::integer)::integer end,
 case when count((r.gender_mix->>'man')::integer)=count(*) then sum((r.gender_mix->>'man')::integer)::integer end,
 case when count((r.gender_mix->>'nonbinary')::integer)=count(*) then sum((r.gender_mix->>'nonbinary')::integer)::integer end,
 null::integer,
 null::integer,
 null::integer,
 null::integer,
 null::integer,
 null::text,
 null::text,
 null::text,
 null::text,
 null::integer,
 null::integer
 from public.venue_nights n join public.venues v on v.id=n.venue_id
 cross join lateral public.admin_venue_night_report(n.id) r
 where not v.is_test_venue
 group by v.id,v.name,v.city,v.timezone,(n.waiting_opens_at at time zone v.timezone)::date
 order by (n.waiting_opens_at at time zone v.timezone)::date desc,v.name;
end;
$$;

-- Legacy date-shaped API: covered metrics come from the same durable report.
-- Unsupported individual/attribution measurements are explicitly unavailable.
create or replace function public.admin_night_stats()
returns table(venue_id uuid, venue_name text, night date, scans integer, profile_completions integer, profile_dropoffs integer, checkins integer, likes integer, matches integer, chats_started integer, women_checkins integer, men_checkins integer, nonbinary_checkins integer, same_gender_interest_checkins integer, multi_gender_interest_checkins integer, interested_in_women_checkins integer, interested_in_men_checkins integer, interested_in_nonbinary_checkins integer, likes_from_women integer, likes_from_men integer, likes_from_nonbinary integer)
language plpgsql security definer set search_path=public,private as $$
begin
 if not private.is_admin() then raise exception 'not authorized'; end if;
 return query select
 v.id,
 v.name,
 (n.waiting_opens_at at time zone v.timezone)::date,
 case when count(r.scanners)=count(*) then sum(r.scanners)::integer end,
 case when count(r.completed_profiles)=count(*) then sum(r.completed_profiles)::integer end,
 case when count(r.dropoffs)=count(*) then sum(r.dropoffs)::integer end,
 case when count(r.participants)=count(*) then sum(r.participants)::integer end,
 case when count(r.likes)=count(*) then sum(r.likes)::integer end,
 case when count(r.matches)=count(*) then sum(r.matches)::integer end,
 case when count(r.conversations)=count(*) then sum(r.conversations)::integer end,
 case when count((r.gender_mix->>'woman')::integer)=count(*) then sum((r.gender_mix->>'woman')::integer)::integer end,
 case when count((r.gender_mix->>'man')::integer)=count(*) then sum((r.gender_mix->>'man')::integer)::integer end,
 case when count((r.gender_mix->>'nonbinary')::integer)=count(*) then sum((r.gender_mix->>'nonbinary')::integer)::integer end,
 null::integer,
 null::integer,
 null::integer,
 null::integer,
 null::integer,
 case when count((select (g->>'sent')::integer from jsonb_array_elements(r.likes_by_gender) g where g->>'gender'='woman'))=count(*) then sum((select (g->>'sent')::integer from jsonb_array_elements(r.likes_by_gender) g where g->>'gender'='woman'))::integer end,
 case when count((select (g->>'sent')::integer from jsonb_array_elements(r.likes_by_gender) g where g->>'gender'='man'))=count(*) then sum((select (g->>'sent')::integer from jsonb_array_elements(r.likes_by_gender) g where g->>'gender'='man'))::integer end,
 case when count((select (g->>'sent')::integer from jsonb_array_elements(r.likes_by_gender) g where g->>'gender'='nonbinary'))=count(*) then sum((select (g->>'sent')::integer from jsonb_array_elements(r.likes_by_gender) g where g->>'gender'='nonbinary'))::integer end
 from public.venue_nights n join public.venues v on v.id=n.venue_id
 cross join lateral public.admin_venue_night_report(n.id) r

 group by v.id,v.name,v.city,v.timezone,(n.waiting_opens_at at time zone v.timezone)::date
 order by (n.waiting_opens_at at time zone v.timezone)::date desc,v.name;
end;
$$;


create or replace function public.admin_venue_night_outcomes()
returns table(venue_night_id uuid,profile_completions integer,likes integer,matches integer,conversations integer)
language plpgsql security definer set search_path=public,private as $$
begin
 if not private.is_admin() then raise exception 'not authorized'; end if;
 return query select r.venue_night_id,r.completed_profiles,r.likes,r.matches,r.conversations
 from public.venue_nights n cross join lateral public.admin_venue_night_report(n.id) r;
end;
$$;

-- No client may call collectors or read source identities directly.
revoke all on function private.lock_stats_night(uuid),private.collect_profile_completion(),
 private.collect_presence(),private.collect_presence_delete(),private.guard_stats_interaction(),
 private.collect_interaction(),private.build_night_report(uuid),private.finalize_night_report(uuid)
 from public,anon,authenticated,service_role;

-- Also guard UPDATE (including old clients retrying an upsert).
create trigger stats_analytics_update before update on public.analytics_events
for each row execute function private.scope_analytics_to_venue_night();
create trigger stats_scan_update before update on public.venue_scan_events
for each row execute function private.scope_venue_event_to_night();
create trigger stats_match_event_update before update on public.venue_match_events
for each row execute function private.scope_venue_event_to_night();
create trigger stats_chat_event_update before update on public.venue_chat_start_events
for each row execute function private.scope_venue_event_to_night();
create trigger stats_conversation_update before update on public.venue_conversation_events
for each row execute function private.scope_venue_event_to_night();

-- Old unassigned events are accounted for separately, without guessing attribution.
create table private.unassigned_analytics_cleanup (
 source_table text primary key,
 deleted_rows bigint not null check(deleted_rows>=0)
);
revoke all on private.unassigned_analytics_cleanup from public,anon,authenticated,service_role;
do $$
declare t text; n uuid;
begin
 for n in select id from public.venue_nights where terminal_at is not null order by id loop
   perform private.finalize_night_report(n);
 end loop;
 foreach t in array array['analytics_events','venue_scan_events','venue_match_events','venue_chat_start_events','venue_conversation_events'] loop
   execute format('insert into private.unassigned_analytics_cleanup select %L,count(*) from public.%I where venue_night_id is null',t,t);
   execute format('delete from public.%I where venue_night_id is null',t);
 end loop;
end;
$$;

commit;
