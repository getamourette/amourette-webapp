-- Participant-safe Realtime projection for the pre-launch waiting room.
-- Clients must never subscribe to other participants' presence rows while a
-- night is waiting. This one-row projection carries only lifecycle facts and
-- an aggregate eligible-participant count.

do $$
begin
  if exists (
    select 1
    from public.venues
    where slug = 'test-waiting'
      and not is_test_venue
  ) then
    raise exception 'test-waiting slug belongs to a non-test venue';
  end if;
end;
$$;

insert into public.venues (
  slug,
  name,
  city,
  timezone,
  is_live,
  is_test_venue,
  rollover_disabled
)
values (
  'test-waiting',
  'Test Lab · Waiting',
  'Paris',
  'Europe/Paris',
  false,
  true,
  false
)
on conflict (slug) do update set
  name = excluded.name,
  city = excluded.city,
  timezone = excluded.timezone,
  is_live = excluded.is_live,
  is_test_venue = excluded.is_test_venue,
  rollover_disabled = excluded.rollover_disabled
where public.venues.is_test_venue;

insert into public.venue_nights (
  venue_id,
  waiting_opens_at,
  guaranteed_launch_at,
  closes_at,
  launch_threshold,
  status,
  opened_at
)
select
  v.id,
  '2000-01-01 00:00:00+00',
  '9999-01-01 00:00:00+00',
  '9999-12-31 23:59:59.999+00',
  2147483647,
  'waiting',
  '2000-01-01 00:00:00+00'
from public.venues v
where v.slug = 'test-waiting'
  and v.is_test_venue
  and not exists (
    select 1
    from public.venue_nights vn
    where vn.venue_id = v.id
      and vn.terminal_at is null
  );

create table public.venue_night_public_state (
  venue_night_id uuid primary key references public.venue_nights (id) on delete cascade,
  venue_id uuid not null references public.venues (id) on delete cascade,
  status text not null check (status in ('closed', 'waiting', 'live')),
  participant_count integer not null default 0 check (participant_count >= 0),
  launch_threshold integer not null check (launch_threshold > 0),
  guaranteed_launch_at timestamptz not null,
  closes_at timestamptz not null,
  terminal_reason text,
  updated_at timestamptz not null default now()
);

comment on table public.venue_night_public_state is
  'Participant-safe Realtime projection: lifecycle schedule and aggregate attendance only; never participant identity.';

alter table public.venue_night_public_state enable row level security;
alter table public.venue_night_public_state replica identity full;

revoke all on public.venue_night_public_state from public, anon;
grant select on public.venue_night_public_state to authenticated;
grant select, insert, update, delete on public.venue_night_public_state to service_role;

create policy venue_night_public_state_select_participant
on public.venue_night_public_state
for select
to authenticated
using (
  exists (
    select 1
    from public.presence p
    where p.venue_night_id = venue_night_public_state.venue_night_id
      and p.profile_id = auth.uid()
  )
);

create or replace function private.refresh_venue_night_public_state(p_venue_night_id uuid)
returns void
language plpgsql
security definer
set search_path = public, private
as $$
begin
  insert into public.venue_night_public_state (
    venue_night_id,
    venue_id,
    status,
    participant_count,
    launch_threshold,
    guaranteed_launch_at,
    closes_at,
    terminal_reason,
    updated_at
  )
  select
    vn.id,
    vn.venue_id,
    vn.status,
    (count(p.id) filter (where pp.adult_confirmed_at is not null))::integer,
    vn.launch_threshold,
    vn.guaranteed_launch_at,
    vn.closes_at,
    vn.terminal_reason,
    now()
  from public.venue_nights vn
  left join public.presence p
    on p.venue_night_id = vn.id
   and p.left_at is null
  left join public.profile_private pp
    on pp.id = p.profile_id
  where vn.id = p_venue_night_id
  group by vn.id
  on conflict (venue_night_id) do update set
    venue_id = excluded.venue_id,
    status = excluded.status,
    participant_count = excluded.participant_count,
    launch_threshold = excluded.launch_threshold,
    guaranteed_launch_at = excluded.guaranteed_launch_at,
    closes_at = excluded.closes_at,
    terminal_reason = excluded.terminal_reason,
    updated_at = excluded.updated_at;
end;
$$;

revoke execute on function private.refresh_venue_night_public_state(uuid)
from public, anon, authenticated;
grant execute on function private.refresh_venue_night_public_state(uuid)
to service_role;

create or replace function private.refresh_venue_night_public_state_from_night()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
begin
  perform private.refresh_venue_night_public_state(new.id);
  return new;
end;
$$;

create or replace function private.refresh_venue_night_public_state_from_presence()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
begin
  if tg_op = 'DELETE' then
    perform private.refresh_venue_night_public_state(old.venue_night_id);
    return old;
  end if;

  perform private.refresh_venue_night_public_state(new.venue_night_id);
  if tg_op = 'UPDATE' and old.venue_night_id <> new.venue_night_id then
    perform private.refresh_venue_night_public_state(old.venue_night_id);
  end if;
  return new;
end;
$$;

revoke execute on function private.refresh_venue_night_public_state_from_night(),
  private.refresh_venue_night_public_state_from_presence()
from public, anon, authenticated;

create trigger venue_nights_insert_public_state
after insert on public.venue_nights
for each row execute function private.refresh_venue_night_public_state_from_night();

create trigger venue_nights_update_public_state
after update of status, launch_threshold, guaranteed_launch_at, closes_at,
  terminal_reason on public.venue_nights
for each row execute function private.refresh_venue_night_public_state_from_night();

create trigger presence_insert_delete_public_state
after insert or delete on public.presence
for each row execute function private.refresh_venue_night_public_state_from_presence();

create trigger presence_update_public_state
after update of venue_night_id, left_at on public.presence
for each row execute function private.refresh_venue_night_public_state_from_presence();

select private.refresh_venue_night_public_state(vn.id)
from public.venue_nights vn;

alter publication supabase_realtime add table public.venue_night_public_state;
