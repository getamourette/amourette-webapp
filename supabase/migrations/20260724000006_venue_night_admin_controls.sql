-- #124 — founder scheduling controls and configuration audit.
-- BEHAVIORAL: apply to the shared development database only after founder approval.

create table public.venue_night_configuration_audits (
  id bigint generated always as identity primary key,
  venue_night_id uuid not null references public.venue_nights(id) on delete cascade,
  action text not null check (action in ('created', 'imported', 'updated')),
  actor_id uuid references auth.users(id) on delete set null,
  before_values jsonb,
  after_values jsonb not null,
  created_at timestamptz not null default now()
);
comment on table public.venue_night_configuration_audits is
  'Admin-only audit of venue-night schedule configuration. Actor identity is an auth id, never an email.';
create index venue_night_configuration_audits_by_night
  on public.venue_night_configuration_audits (venue_night_id, created_at);
alter table public.venue_night_configuration_audits enable row level security;
revoke all on public.venue_night_configuration_audits from anon, public;
grant select on public.venue_night_configuration_audits to authenticated;
create policy venue_night_configuration_audits_select_admin
  on public.venue_night_configuration_audits for select to authenticated
  using (private.is_admin());

insert into public.venue_night_configuration_audits
  (venue_night_id, action, actor_id, after_values, created_at)
select vn.id, 'imported', vn.created_by,
  jsonb_build_object(
    'venue_id', vn.venue_id, 'waiting_opens_at', vn.waiting_opens_at,
    'guaranteed_launch_at', vn.guaranteed_launch_at, 'closes_at', vn.closes_at,
    'launch_threshold', vn.launch_threshold
  ), vn.created_at
from public.venue_nights vn;

create or replace function private.venue_night_configuration_snapshot(night public.venue_nights)
returns jsonb language sql immutable set search_path = public
as $$ select jsonb_build_object(
  'venue_id', night.venue_id, 'waiting_opens_at', night.waiting_opens_at,
  'guaranteed_launch_at', night.guaranteed_launch_at, 'closes_at', night.closes_at,
  'launch_threshold', night.launch_threshold
) $$;
revoke execute on function private.venue_night_configuration_snapshot(public.venue_nights)
  from public, anon, authenticated;

create or replace function public.schedule_venue_night(
  p_venue_id uuid, p_waiting_opens_at timestamptz,
  p_guaranteed_launch_at timestamptz, p_closes_at timestamptz,
  p_launch_threshold integer default 4
) returns public.venue_nights
language plpgsql security definer set search_path = public, private
as $$
declare result public.venue_nights;
begin
  if not private.is_admin() then raise exception 'not authorized'; end if;
  if p_closes_at <= now() then raise exception 'close time must be in the future'; end if;
  insert into public.venue_nights
    (venue_id, waiting_opens_at, guaranteed_launch_at, closes_at, launch_threshold, created_by)
  values (p_venue_id, p_waiting_opens_at, p_guaranteed_launch_at, p_closes_at, p_launch_threshold, auth.uid())
  returning * into result;
  insert into public.venue_night_configuration_audits
    (venue_night_id, action, actor_id, before_values, after_values)
  values (result.id, 'created', auth.uid(), null, private.venue_night_configuration_snapshot(result));
  return result;
end;
$$;

create function public.update_venue_night_schedule(
  p_venue_night_id uuid, p_waiting_opens_at timestamptz,
  p_guaranteed_launch_at timestamptz, p_closes_at timestamptz,
  p_launch_threshold integer
) returns public.venue_nights
language plpgsql security definer set search_path = public, private
as $$
declare before_night public.venue_nights; result public.venue_nights;
begin
  if not private.is_admin() then raise exception 'not authorized'; end if;
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
$$;
revoke execute on function public.update_venue_night_schedule(uuid,timestamptz,timestamptz,timestamptz,integer)
  from public, anon;
grant execute on function public.update_venue_night_schedule(uuid,timestamptz,timestamptz,timestamptz,integer)
  to authenticated;

create function public.admin_venue_night_participant_counts()
returns table (venue_night_id uuid, participant_count integer)
language plpgsql security definer stable set search_path = public, private
as $$
begin
  if not private.is_admin() then raise exception 'not authorized'; end if;
  return query select vn.id, (count(p.id) filter (where pp.id is not null))::integer
  from public.venue_nights vn
  left join public.presence p on p.venue_night_id = vn.id and p.left_at is null
  left join public.profiles pr on pr.id = p.profile_id
  left join public.profile_private pp on pp.id = p.profile_id and pp.adult_confirmed_at is not null
  group by vn.id;
end;
$$;
revoke execute on function public.admin_venue_night_participant_counts() from public, anon;
grant execute on function public.admin_venue_night_participant_counts() to authenticated;

-- The dedicated Nights surface is now the only lifecycle operator.
revoke execute on function public.set_venue_live(uuid, boolean) from authenticated;
