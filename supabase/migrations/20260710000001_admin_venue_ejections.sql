-- Admin moderation: eject a user from a venue for the current night.
--
-- The public match/message objects remain ephemeral. This is a founder-only
-- safety action: it closes the user's active presence and prevents re-entry to
-- the same venue for that venue night. The ejection row is an audit event, not a
-- public user-facing profile flag.

create table if not exists public.venue_ejections (
  id         uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  venue_id   uuid not null references public.venues (id) on delete cascade,
  night      date not null,
  reason     text not null check (
    reason in ('harassment', 'fake_profile', 'underage', 'unsafe_behavior', 'other')
  ),
  note       text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint venue_ejections_unique unique (profile_id, venue_id, night)
);

alter table public.venue_ejections enable row level security;

revoke all on public.venue_ejections from anon, public;
grant select on public.venue_ejections to authenticated;

drop policy if exists venue_ejections_select_admin on public.venue_ejections;
create policy venue_ejections_select_admin on public.venue_ejections
  for select to authenticated using (private.is_admin());

create or replace function public.eject_from_venue(
  p_profile_id uuid,
  p_venue_id uuid,
  p_reason text,
  p_note text default null
)
  returns integer
  language plpgsql
  security definer
  set search_path = public, private
as $$
declare
  actor uuid := auth.uid();
  venue_timezone text;
  current_night date;
  closed_count integer;
begin
  if not private.is_admin() then
    raise exception 'not authorized';
  end if;

  if p_reason not in ('harassment', 'fake_profile', 'underage', 'unsafe_behavior', 'other') then
    raise exception 'invalid ejection reason';
  end if;

  select v.timezone into venue_timezone
  from public.venues v
  where v.id = p_venue_id;

  if venue_timezone is null then
    raise exception 'venue not found';
  end if;

  current_night := (private.night_ends_at(now(), venue_timezone))::date;

  insert into public.venue_ejections (
    profile_id,
    venue_id,
    night,
    reason,
    note,
    created_by
  )
  values (
    p_profile_id,
    p_venue_id,
    current_night,
    p_reason,
    nullif(trim(coalesce(p_note, '')), ''),
    actor
  )
  on conflict (profile_id, venue_id, night) do update
    set reason = excluded.reason,
        note = excluded.note,
        created_by = excluded.created_by,
        created_at = now();

  update public.presence
    set left_at = now()
    where profile_id = p_profile_id
      and venue_id = p_venue_id
      and left_at is null;
  get diagnostics closed_count = row_count;

  return closed_count;
end;
$$;

revoke execute on function public.eject_from_venue(uuid, uuid, text, text) from anon, public;
grant  execute on function public.eject_from_venue(uuid, uuid, text, text) to authenticated;

create or replace function public.restore_to_venue(
  p_profile_id uuid,
  p_venue_id uuid
)
  returns void
  language plpgsql
  security definer
  set search_path = public, private
as $$
declare
  venue_timezone text;
  current_night date;
begin
  if not private.is_admin() then
    raise exception 'not authorized';
  end if;

  select v.timezone into venue_timezone
  from public.venues v
  where v.id = p_venue_id;

  if venue_timezone is null then
    raise exception 'venue not found';
  end if;

  current_night := (private.night_ends_at(now(), venue_timezone))::date;

  delete from public.venue_ejections
    where profile_id = p_profile_id
      and venue_id = p_venue_id
      and night = current_night;
end;
$$;

revoke execute on function public.restore_to_venue(uuid, uuid) from anon, public;
grant  execute on function public.restore_to_venue(uuid, uuid) to authenticated;

create or replace function public.check_in(p_venue_id uuid)
  returns public.presence
  language plpgsql
  security invoker
  set search_path = public, private
as $$
declare
  me uuid := (select auth.uid());
  v_live boolean;
  venue_timezone text;
  current_night date;
  result public.presence;
begin
  if me is null then
    raise exception 'not authenticated';
  end if;

  select is_live, timezone into v_live, venue_timezone
  from public.venues
  where id = p_venue_id;

  if not coalesce(v_live, false) then
    raise exception 'venue not live';
  end if;

  current_night := (private.night_ends_at(now(), venue_timezone))::date;

  if exists (
    select 1
    from public.venue_ejections ve
    where ve.profile_id = me
      and ve.venue_id = p_venue_id
      and ve.night = current_night
  ) then
    raise exception 'ejected from venue';
  end if;

  update public.presence
    set left_at = now()
    where profile_id = me and left_at is null and venue_id <> p_venue_id;

  update public.presence
    set last_seen_at = now()
    where profile_id = me and left_at is null and venue_id = p_venue_id
    returning * into result;

  if not found then
    insert into public.presence (profile_id, venue_id)
      values (me, p_venue_id)
      returning * into result;
  end if;

  return result;
end;
$$;

revoke execute on function public.check_in(uuid) from anon, public;
grant  execute on function public.check_in(uuid) to authenticated;
