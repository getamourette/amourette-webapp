-- #123 — durable venue-night lifecycle.
--
-- BEHAVIORAL: this replaces the inferred 06:00 "night" with an explicit,
-- durable state machine. It intentionally purges shared-development ephemeral
-- data. Apply only after founder approval; profiles and safety records survive.

create extension if not exists btree_gist;

create table public.venue_nights (
  id                    uuid primary key default gen_random_uuid(),
  venue_id              uuid not null references public.venues (id) on delete cascade,
  waiting_opens_at      timestamptz not null,
  guaranteed_launch_at  timestamptz not null,
  closes_at             timestamptz not null,
  launch_threshold      integer not null default 4 check (launch_threshold > 0),
  status                text not null default 'closed'
                          check (status in ('closed', 'waiting', 'live')),
  opened_at             timestamptz,
  launched_at           timestamptz,
  launch_reason         text check (launch_reason in ('threshold', 'guaranteed', 'manual')),
  terminal_at           timestamptz,
  terminal_reason       text check (terminal_reason in ('scheduled_end', 'cancelled')),
  created_by            uuid references auth.users (id) on delete set null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint venue_nights_time_order check (
    waiting_opens_at < guaranteed_launch_at and guaranteed_launch_at < closes_at
  ),
  constraint venue_nights_launch_metadata check (
    (launched_at is null and launch_reason is null)
    or (launched_at is not null and launch_reason is not null)
  ),
  constraint venue_nights_terminal_metadata check (
    (terminal_at is null and terminal_reason is null)
    or (terminal_at is not null and terminal_reason is not null and status = 'closed')
  ),
  constraint venue_nights_launch_before_close check (
    launched_at is null or launched_at < closes_at
  ),
  constraint venue_nights_no_overlapping_nonterminal exclude using gist (
    venue_id with =,
    tstzrange(waiting_opens_at, closes_at, '[)') with &&
  ) where (terminal_at is null)
);

comment on table public.venue_nights is
  'Authoritative scheduled soirée and lifecycle state. Times are absolute instants.';

create index venue_nights_engine_due
  on public.venue_nights (terminal_at, status, waiting_opens_at, guaranteed_launch_at, closes_at);
create index venue_nights_by_venue_time
  on public.venue_nights (venue_id, waiting_opens_at desc);

create trigger venue_nights_set_updated_at
  before update on public.venue_nights
  for each row execute function extensions.moddatetime (updated_at);

create table public.venue_night_transitions (
  id              bigint generated always as identity primary key,
  venue_night_id  uuid not null references public.venue_nights (id) on delete cascade,
  from_status     text not null check (from_status in ('closed', 'waiting', 'live')),
  to_status       text not null check (to_status in ('closed', 'waiting', 'live')),
  event           text not null check (
                    event in ('opened', 'launched', 'closed', 'reopened', 'ended', 'cancelled')
                  ),
  reason          text,
  actor_id        uuid references auth.users (id) on delete set null,
  created_at      timestamptz not null default now()
);

alter table public.venue_nights enable row level security;
alter table public.venue_night_transitions enable row level security;
revoke all on public.venue_nights, public.venue_night_transitions from anon, public;
grant select on public.venue_nights, public.venue_night_transitions to authenticated;

create policy venue_nights_select_admin on public.venue_nights
  for select to authenticated using (private.is_admin());
create policy venue_night_transitions_select_admin on public.venue_night_transitions
  for select to authenticated using (private.is_admin());

-- The old ephemeral rows cannot be assigned to an authoritative scheduled
-- night. Safety blocks/reports and all profile identity remain untouched.
delete from public.matches; -- messages cascade
delete from public.likes;
delete from public.presence;
delete from public.venue_ejections;

alter table public.presence
  add column venue_night_id uuid references public.venue_nights (id) on delete cascade;
alter table public.likes
  add column venue_night_id uuid references public.venue_nights (id) on delete cascade;
alter table public.matches
  add column venue_night_id uuid references public.venue_nights (id) on delete cascade;
alter table public.venue_ejections
  add column venue_night_id uuid references public.venue_nights (id) on delete cascade;

alter table public.presence alter column venue_night_id set not null;
alter table public.likes alter column venue_night_id set not null;
alter table public.matches alter column venue_night_id set not null;
alter table public.venue_ejections alter column venue_night_id set not null;

alter table public.likes drop constraint if exists likes_unique;
alter table public.likes
  add constraint likes_unique unique (liker_id, liked_id, venue_night_id);
alter table public.matches drop constraint if exists matches_unique;
alter table public.matches
  add constraint matches_unique unique (profile_a, profile_b, venue_night_id);
alter table public.venue_ejections drop constraint if exists venue_ejections_unique;
alter table public.venue_ejections
  add constraint venue_ejections_unique unique (profile_id, venue_night_id);

create index presence_active_by_night on public.presence (venue_night_id) where left_at is null;
create index presence_visible_by_night on public.presence (venue_night_id) where left_at is null and is_visible;
create index likes_reciprocity_by_night on public.likes (liked_id, venue_night_id);
create index matches_by_night on public.matches (venue_night_id);

-- New analytics records use the durable identity. The old local-date key stays
-- nullable/available so existing dashboard shapes and historical rows survive.
alter table public.analytics_events add column venue_night_id uuid references public.venue_nights (id) on delete set null;
alter table public.venue_scan_events add column venue_night_id uuid references public.venue_nights (id) on delete set null;
alter table public.venue_match_events add column venue_night_id uuid references public.venue_nights (id) on delete set null;
alter table public.venue_chat_start_events add column venue_night_id uuid references public.venue_nights (id) on delete set null;
alter table public.venue_conversation_events add column venue_night_id uuid references public.venue_nights (id) on delete set null;

-- All state mutations funnel through this private primitive. The row lock makes
-- repeated cron/manual/threshold attempts idempotent and produces one audit row.
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

create or replace function public.run_venue_night_lifecycle()
  returns integer
  language plpgsql
  security definer
  set search_path = public, private
as $$
declare
  item record;
  transitions integer := 0;
  before_status text;
begin
  for item in
    select id, status from public.venue_nights
    where terminal_at is null and closes_at <= now()
    order by closes_at for update skip locked
  loop
    perform private.transition_venue_night(item.id, 'ended', 'scheduled_end', null);
    transitions := transitions + 1;
  end loop;
  for item in
    select id, status from public.venue_nights
    where terminal_at is null and status = 'closed' and opened_at is null
      and waiting_opens_at <= now() and now() < closes_at
    order by waiting_opens_at for update skip locked
  loop
    perform private.transition_venue_night(item.id, 'opened', 'scheduled', null);
    transitions := transitions + 1;
  end loop;
  for item in
    select id, status from public.venue_nights
    where terminal_at is null and status = 'waiting'
      and guaranteed_launch_at <= now() and now() < closes_at
    order by guaranteed_launch_at for update skip locked
  loop
    perform private.transition_venue_night(item.id, 'launched', 'guaranteed', null);
    transitions := transitions + 1;
  end loop;
  return transitions;
end;
$$;
revoke execute on function public.run_venue_night_lifecycle() from public, anon, authenticated;

-- Admin scheduling and explicit lifecycle controls (the #124 UI can consume
-- these without receiving direct table-write privileges).
create or replace function public.schedule_venue_night(
  p_venue_id uuid,
  p_waiting_opens_at timestamptz,
  p_guaranteed_launch_at timestamptz,
  p_closes_at timestamptz,
  p_launch_threshold integer default 4
)
  returns public.venue_nights
  language plpgsql security definer set search_path = public, private
as $$
declare result public.venue_nights;
begin
  if not private.is_admin() then raise exception 'not authorized'; end if;
  insert into public.venue_nights
    (venue_id, waiting_opens_at, guaranteed_launch_at, closes_at, launch_threshold, created_by)
  values
    (p_venue_id, p_waiting_opens_at, p_guaranteed_launch_at, p_closes_at, p_launch_threshold, auth.uid())
  returning * into result;
  return result;
end;
$$;

create or replace function public.open_venue_night(p_venue_night_id uuid)
  returns public.venue_nights language plpgsql security definer set search_path = public, private
as $$ begin
  if not private.is_admin() then raise exception 'not authorized'; end if;
  return private.transition_venue_night(p_venue_night_id, 'opened', 'manual', auth.uid());
end; $$;
create or replace function public.launch_venue_night(p_venue_night_id uuid)
  returns public.venue_nights language plpgsql security definer set search_path = public, private
as $$ begin
  if not private.is_admin() then raise exception 'not authorized'; end if;
  return private.transition_venue_night(p_venue_night_id, 'launched', 'manual', auth.uid());
end; $$;
create or replace function public.close_venue_night(p_venue_night_id uuid)
  returns public.venue_nights language plpgsql security definer set search_path = public, private
as $$ begin
  if not private.is_admin() then raise exception 'not authorized'; end if;
  return private.transition_venue_night(p_venue_night_id, 'closed', 'manual', auth.uid());
end; $$;
create or replace function public.cancel_venue_night(p_venue_night_id uuid)
  returns public.venue_nights language plpgsql security definer set search_path = public, private
as $$ begin
  if not private.is_admin() then raise exception 'not authorized'; end if;
  return private.transition_venue_night(p_venue_night_id, 'cancelled', 'manual', auth.uid());
end; $$;
create or replace function public.reopen_venue_night(p_venue_night_id uuid)
  returns public.venue_nights language plpgsql security definer set search_path = public, private
as $$ begin
  if not private.is_admin() then raise exception 'not authorized'; end if;
  return private.transition_venue_night(p_venue_night_id, 'reopened', 'manual', auth.uid());
end; $$;

revoke execute on function public.schedule_venue_night(uuid,timestamptz,timestamptz,timestamptz,integer) from anon, public;
grant execute on function public.schedule_venue_night(uuid,timestamptz,timestamptz,timestamptz,integer) to authenticated;
do $$ declare fn text; begin
  foreach fn in array array['open_venue_night','launch_venue_night','close_venue_night','cancel_venue_night','reopen_venue_night'] loop
    execute format('revoke execute on function public.%I(uuid) from anon, public', fn);
    execute format('grant execute on function public.%I(uuid) to authenticated', fn);
  end loop;
end $$;

-- Compatibility wrapper for the existing admin. It may act only on the one
-- currently scheduled night; opening launches it so the old boolean UI keeps
-- its exact meaning without bypassing the state machine.
create or replace function public.set_venue_live(p_venue_id uuid, p_live boolean)
  returns public.venues language plpgsql security definer set search_path = public, private
as $$
declare night public.venue_nights; result public.venues;
begin
  if not private.is_admin() then raise exception 'not authorized'; end if;
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
$$;
revoke execute on function public.set_venue_live(uuid, boolean) from anon, public;
grant execute on function public.set_venue_live(uuid, boolean) to authenticated;

-- Participant-safe state: no schedule inventory, attendance identities, or
-- transition audit. Count includes invisible, complete, adult-confirmed users.
create or replace function public.venue_night_state(p_venue_id uuid)
  returns table (
    venue_night_id uuid, status text, participant_count integer,
    launch_threshold integer, guaranteed_launch_at timestamptz, closes_at timestamptz
  )
  language plpgsql security definer stable set search_path = public, private
as $$
declare me uuid := auth.uid(); active_night public.venue_nights;
begin
  if me is null then raise exception 'not authenticated'; end if;
  select * into active_night from public.venue_nights
  where venue_id = p_venue_id and terminal_at is null
    and now() < closes_at
    and (status in ('waiting', 'live') or waiting_opens_at <= now())
  order by waiting_opens_at desc limit 1;
  if not found then return; end if;
  return query select active_night.id, active_night.status,
    (select count(*)::integer from public.presence p
      join public.profiles pr on pr.id = p.profile_id
      join public.profile_private pp on pp.id = p.profile_id
      where p.venue_night_id = active_night.id and p.left_at is null
        and pp.adult_confirmed_at is not null),
    active_night.launch_threshold, active_night.guaranteed_launch_at, active_night.closes_at;
end;
$$;
revoke execute on function public.venue_night_state(uuid) from anon, public;
grant execute on function public.venue_night_state(uuid) to authenticated;

-- Check-in locks the selected night before modifying presence. The fourth
-- eligible concurrent transaction observes a count of four and uses the same
-- launch primitive as cron/manual launch.
create or replace function public.check_in(p_venue_id uuid)
  returns public.presence
  language plpgsql security definer set search_path = public, private
as $$
declare
  me uuid := auth.uid(); night public.venue_nights; result public.presence; eligible integer;
begin
  if me is null then raise exception 'not authenticated'; end if;
  select * into night from public.venue_nights
  where venue_id = p_venue_id and terminal_at is null
    and status in ('waiting', 'live') and now() < closes_at
  for update;
  if not found then raise exception 'venue not open'; end if;
  if not exists (select 1 from public.profiles p join public.profile_private pp on pp.id=p.id
                 where p.id=me and pp.adult_confirmed_at is not null) then
    raise exception 'complete adult-confirmed profile required';
  end if;
  if exists (select 1 from public.venue_ejections where profile_id=me and venue_night_id=night.id) then
    raise exception 'ejected from venue';
  end if;
  update public.presence set left_at=now() where profile_id=me and left_at is null
    and venue_night_id <> night.id;
  update public.presence set last_seen_at=now() where profile_id=me and left_at is null
    and venue_night_id=night.id returning * into result;
  if not found then
    insert into public.presence(profile_id, venue_id, venue_night_id)
    values(me, p_venue_id, night.id) returning * into result;
  end if;
  if night.status='waiting' then
    select count(*)::integer into eligible from public.presence p
    join public.profiles pr on pr.id=p.profile_id
    join public.profile_private pp on pp.id=p.profile_id
    where p.venue_night_id=night.id and p.left_at is null and pp.adult_confirmed_at is not null;
    if eligible >= night.launch_threshold then
      perform private.transition_venue_night(night.id, 'launched', 'threshold', null);
    end if;
  end if;
  return result;
end;
$$;
revoke execute on function public.check_in(uuid) from anon, public;
grant execute on function public.check_in(uuid) to authenticated;

-- Resolve like scope server-side so clients cannot forge cross-night rows.
create or replace function public.set_like_expires_at()
  returns trigger language plpgsql security definer set search_path = public, private
as $$
declare night public.venue_nights;
begin
  select vn.* into night from public.venue_nights vn
  join public.presence mine on mine.venue_night_id=vn.id and mine.profile_id=new.liker_id and mine.left_at is null and mine.is_visible
  join public.presence theirs on theirs.venue_night_id=vn.id and theirs.profile_id=new.liked_id and theirs.left_at is null and theirs.is_visible
  where vn.venue_id=new.venue_id and vn.status='live' and vn.terminal_at is null and now()<vn.closes_at;
  if not found then raise exception 'profiles are not visible in the same live venue night'; end if;
  new.venue_night_id := night.id;
  new.expires_at := night.closes_at;
  return new;
end;
$$;
revoke execute on function public.set_like_expires_at() from anon, authenticated, public;

create or replace function public.handle_new_like()
  returns trigger language plpgsql security definer set search_path = public, private
as $$
declare new_match_id uuid;
begin
  if exists (select 1 from public.blocks b where
    (b.blocker_id=new.liker_id and b.blocked_id=new.liked_id) or
    (b.blocker_id=new.liked_id and b.blocked_id=new.liker_id)) then return new; end if;
  if exists (select 1 from public.likes l where l.liker_id=new.liked_id
    and l.liked_id=new.liker_id and l.venue_night_id=new.venue_night_id) then
    insert into public.matches(profile_a,profile_b,venue_id,venue_night_id,expires_at)
    values(least(new.liker_id,new.liked_id),greatest(new.liker_id,new.liked_id),
           new.venue_id,new.venue_night_id,new.expires_at)
    on conflict (profile_a,profile_b,venue_night_id) do nothing
    returning id into new_match_id;
    if new_match_id is not null then perform private.record_match_event(new_match_id); end if;
  end if;
  return new;
end;
$$;
revoke execute on function public.handle_new_like() from anon, authenticated, public;

-- Night-aware RLS. Waiting exposes only the caller and their own presence;
-- manual close also hides existing match/chat rows from direct URLs/realtime.
create or replace function private.my_active_venue_night_ids()
  returns setof uuid language sql security definer stable set search_path=public
as $$ select venue_night_id from public.presence where profile_id=auth.uid() and left_at is null $$;
create or replace function private.visible_profile_ids()
  returns setof uuid language sql security definer stable set search_path=public
as $$
  select auth.uid()
  union
  select theirs.profile_id from public.presence mine
  join public.presence theirs on theirs.venue_night_id=mine.venue_night_id
  join public.venue_nights vn on vn.id=mine.venue_night_id and vn.status='live' and vn.terminal_at is null and now()<vn.closes_at
  where mine.profile_id=auth.uid() and mine.left_at is null and mine.is_visible
    and theirs.left_at is null and theirs.is_visible
    and not exists(select 1 from public.blocks b where
      (b.blocker_id=mine.profile_id and b.blocked_id=theirs.profile_id) or
      (b.blocker_id=theirs.profile_id and b.blocked_id=mine.profile_id))
  union
  select case when m.profile_a=auth.uid() then m.profile_b else m.profile_a end
  from public.matches m join public.venue_nights vn on vn.id=m.venue_night_id
  where auth.uid() in (m.profile_a,m.profile_b) and vn.status='live' and vn.terminal_at is null and now()<vn.closes_at
    and not exists(select 1 from public.blocks b where
      (b.blocker_id=m.profile_a and b.blocked_id=m.profile_b) or
      (b.blocker_id=m.profile_b and b.blocked_id=m.profile_a))
$$;
revoke execute on function private.my_active_venue_night_ids() from public, anon;
grant execute on function private.my_active_venue_night_ids() to authenticated;

drop policy if exists presence_select_copresent on public.presence;
create policy presence_select_copresent on public.presence for select to authenticated using (
  profile_id=auth.uid() or (
    venue_night_id in (select private.my_active_venue_night_ids()) and left_at is null and is_visible
    and exists(select 1 from public.venue_nights vn where vn.id=venue_night_id and vn.status='live' and vn.terminal_at is null and now()<vn.closes_at)
    and not exists(select 1 from public.blocks b where
      (b.blocker_id=auth.uid() and b.blocked_id=profile_id) or (b.blocked_id=auth.uid() and b.blocker_id=profile_id))
  )
);
drop policy if exists presence_insert_own on public.presence;
drop policy if exists presence_delete_own on public.presence;
drop policy if exists presence_update_own on public.presence;
create policy presence_update_own on public.presence for update to authenticated
using (profile_id=auth.uid())
with check (
  profile_id=auth.uid() and (
    left_at is not null or (
      exists(select 1 from public.venue_nights vn where vn.id=venue_night_id
        and vn.status in ('waiting','live') and vn.terminal_at is null and now()<vn.closes_at)
      and not exists(select 1 from public.venue_ejections ve
        where ve.profile_id=auth.uid() and ve.venue_night_id=presence.venue_night_id)
    )
  )
);
drop policy if exists likes_select_own on public.likes;
create policy likes_select_own on public.likes for select to authenticated using (
  liker_id=auth.uid() and exists(select 1 from public.venue_nights vn where vn.id=venue_night_id and vn.status='live' and vn.terminal_at is null and now()<vn.closes_at)
);
drop policy if exists likes_insert_own on public.likes;
create policy likes_insert_own on public.likes for insert to authenticated with check (
  liker_id=auth.uid() and exists(select 1 from public.venue_nights vn where vn.id=venue_night_id and vn.status='live' and vn.terminal_at is null and now()<vn.closes_at)
  and not exists(select 1 from public.blocks b where
    (b.blocker_id=liker_id and b.blocked_id=liked_id) or (b.blocker_id=liked_id and b.blocked_id=liker_id))
);
drop policy if exists likes_delete_own on public.likes;
create policy likes_delete_own on public.likes for delete to authenticated using (
  liker_id=auth.uid() and exists(select 1 from public.venue_nights vn
    where vn.id=venue_night_id and vn.status='live' and vn.terminal_at is null and now()<vn.closes_at)
);
drop policy if exists matches_select_member on public.matches;
create policy matches_select_member on public.matches for select to authenticated using (
  auth.uid() in (profile_a,profile_b) and exists(select 1 from public.venue_nights vn where vn.id=venue_night_id and vn.status='live' and vn.terminal_at is null and now()<vn.closes_at)
  and not exists(select 1 from public.blocks b where
    (b.blocker_id=profile_a and b.blocked_id=profile_b) or (b.blocker_id=profile_b and b.blocked_id=profile_a))
);
drop policy if exists messages_select_member on public.messages;
create policy messages_select_member on public.messages for select to authenticated using (
  exists(select 1 from public.matches m join public.venue_nights vn on vn.id=m.venue_night_id
    where m.id=messages.match_id and auth.uid() in (m.profile_a,m.profile_b)
      and vn.status='live' and vn.terminal_at is null and now()<vn.closes_at
      and not exists(select 1 from public.blocks b where
        (b.blocker_id=m.profile_a and b.blocked_id=m.profile_b) or (b.blocker_id=m.profile_b and b.blocked_id=m.profile_a)))
);
drop policy if exists messages_insert_member on public.messages;
create policy messages_insert_member on public.messages for insert to authenticated with check (
  sender_id=auth.uid() and exists(select 1 from public.matches m join public.venue_nights vn on vn.id=m.venue_night_id
    where m.id=messages.match_id and auth.uid() in (m.profile_a,m.profile_b)
      and vn.status='live' and vn.terminal_at is null and now()<vn.closes_at
      and not exists(select 1 from public.blocks b where
        (b.blocker_id=m.profile_a and b.blocked_id=m.profile_b) or (b.blocker_id=m.profile_b and b.blocked_id=m.profile_a)))
);

-- Ejection operations bind to the current authoritative night.
create or replace function public.eject_from_venue(p_profile_id uuid,p_venue_id uuid,p_reason text,p_note text default null)
  returns integer language plpgsql security definer set search_path=public,private
as $$
declare night_id uuid; closed_count integer;
begin
  if not private.is_admin() then raise exception 'not authorized'; end if;
  if p_reason not in ('harassment','fake_profile','underage','unsafe_behavior','other') then raise exception 'invalid ejection reason'; end if;
  select id into night_id from public.venue_nights where venue_id=p_venue_id and terminal_at is null
    and status in ('waiting','live') and now()<closes_at for update;
  if night_id is null then raise exception 'no active venue night'; end if;
  insert into public.venue_ejections(profile_id,venue_id,venue_night_id,night,reason,note,created_by)
  select p_profile_id,p_venue_id,night_id,(vn.closes_at at time zone v.timezone)::date,p_reason,
    nullif(trim(coalesce(p_note,'')),''),auth.uid()
  from public.venue_nights vn join public.venues v on v.id=vn.venue_id where vn.id=night_id
  on conflict(profile_id,venue_night_id) do update set reason=excluded.reason,note=excluded.note,created_by=excluded.created_by,created_at=now();
  update public.presence set left_at=now() where profile_id=p_profile_id and venue_night_id=night_id and left_at is null;
  get diagnostics closed_count=row_count; return closed_count;
end;
$$;
create or replace function public.restore_to_venue(p_profile_id uuid,p_venue_id uuid)
  returns void language plpgsql security definer set search_path=public,private
as $$
declare night_id uuid;
begin
  if not private.is_admin() then raise exception 'not authorized'; end if;
  select id into night_id from public.venue_nights where venue_id=p_venue_id and terminal_at is null
    and status in ('waiting','live') and now()<closes_at;
  if night_id is null then raise exception 'no active venue night'; end if;
  delete from public.venue_ejections where profile_id=p_profile_id and venue_night_id=night_id;
end;
$$;

-- Attach durable identity to new analytics while leaving the legacy local-date
-- dimensions intact for historical dashboard queries.
create or replace function private.scope_analytics_to_venue_night()
  returns trigger language plpgsql security definer set search_path=public
as $$
begin
  if new.venue_night_id is null and new.venue_id is not null then
    select vn.id into new.venue_night_id
    from public.venue_nights vn
    where vn.venue_id=new.venue_id
      and coalesce(new.occurred_at, now()) >= vn.waiting_opens_at
      and coalesce(new.occurred_at, now()) < vn.closes_at
    order by vn.waiting_opens_at desc limit 1;
  end if;
  return new;
end;
$$;
revoke execute on function private.scope_analytics_to_venue_night() from public,anon,authenticated;
create trigger analytics_events_scope_night before insert on public.analytics_events
  for each row execute function private.scope_analytics_to_venue_night();

create or replace function private.scope_venue_event_to_night()
  returns trigger language plpgsql security definer set search_path=public
as $$
begin
  if new.venue_night_id is null then
    if tg_table_name = 'venue_scan_events' then
      select vn.id into new.venue_night_id from public.venue_nights vn
      where vn.venue_id=new.venue_id and new.first_seen_at>=vn.waiting_opens_at and new.first_seen_at<vn.closes_at
      order by vn.waiting_opens_at desc limit 1;
    else
      select m.venue_night_id into new.venue_night_id from public.matches m where m.id=new.match_id;
    end if;
  end if;
  return new;
end;
$$;
revoke execute on function private.scope_venue_event_to_night() from public,anon,authenticated;
create trigger venue_scan_events_scope_night before insert on public.venue_scan_events
  for each row execute function private.scope_venue_event_to_night();
create trigger venue_match_events_scope_night before insert on public.venue_match_events
  for each row execute function private.scope_venue_event_to_night();
create trigger venue_chat_start_events_scope_night before insert on public.venue_chat_start_events
  for each row execute function private.scope_venue_event_to_night();
create trigger venue_conversation_events_scope_night before insert on public.venue_conversation_events
  for each row execute function private.scope_venue_event_to_night();

-- QA venues use ordinary state-machine rows with explicit far-future closure.
-- No runtime function branches on is_test_venue/rollover_disabled anymore.
insert into public.venue_nights
  (venue_id,waiting_opens_at,guaranteed_launch_at,closes_at,launch_threshold,status,opened_at,launched_at,launch_reason)
select v.id,'2000-01-01 00:00:00+00','2000-01-01 00:01:00+00','9999-12-31 23:59:59.999+00',4,
       'live','2000-01-01 00:00:00+00','2000-01-01 00:01:00+00','manual'
from public.venues v where v.is_test_venue
  and not exists(select 1 from public.venue_nights vn where vn.venue_id=v.id and vn.terminal_at is null);
update public.venues v set is_live=exists(
  select 1 from public.venue_nights vn where vn.venue_id=v.id and vn.status='live' and vn.terminal_at is null
);

-- Keep the old cron entry name for operational continuity, now at one-minute precision.
select cron.schedule('bartap-close-ended-nights','* * * * *',$$select public.run_venue_night_lifecycle();$$);

revoke insert, update, delete on public.presence from authenticated;
grant select on public.presence to authenticated;
grant update (is_visible, left_at, last_seen_at) on public.presence to authenticated;
revoke update on public.likes from authenticated;
grant select, insert, delete on public.likes to authenticated;
revoke insert, update, delete on public.matches from authenticated;
grant select on public.matches to authenticated;
revoke update, delete on public.messages from authenticated;
grant select, insert on public.messages to authenticated;
grant select on public.venue_ejections to authenticated;
grant select, insert, update, delete on public.venue_nights, public.venue_night_transitions to service_role;
grant usage, select on sequence public.venue_night_transitions_id_seq to service_role;
grant select, insert, update, delete on public.presence, public.likes, public.matches, public.messages, public.venue_ejections to service_role;
grant execute on function public.run_venue_night_lifecycle() to service_role;
