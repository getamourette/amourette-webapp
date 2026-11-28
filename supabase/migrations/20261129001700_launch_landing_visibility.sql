-- The landing page shows the next upcoming night (#603). A test night that starts
-- sooner than the real one (a Stripe rehearsal, for example) took its place on
-- getamourette.com. A founder can now hide a night from the landing page, at any
-- time, including after its bookings open. A hidden night keeps its own page,
-- reachable by its link, and nothing else about it changes.
--
-- Every night is shown by default: a row here means hidden. The founder's
-- command writes the change to the night's reservation audit log.
create table private.launch_landing_hidden (
  night_id uuid primary key references private.launch_events(night_id) on delete cascade,
  hidden_at timestamptz not null default clock_timestamp(),
  hidden_by uuid references auth.users(id) on delete set null
);
alter table private.launch_landing_hidden enable row level security;
revoke all on table private.launch_landing_hidden from public,anon,authenticated,service_role;

create function public.admin_set_launch_landing_visibility(p_night uuid,p_visible boolean) returns boolean
language plpgsql security definer set search_path='' as $$
begin
  if not private.is_admin() then raise exception 'not authorized' using errcode='42501'; end if;
  if p_night is null or p_visible is null or not exists(select 1 from private.launch_events where night_id=p_night) then
    raise exception 'unknown night';
  end if;
  if p_visible then
    if exists(select 1 from private.launch_landing_hidden where night_id=p_night) then
      delete from private.launch_landing_hidden where night_id=p_night;
      perform private.launch_log(p_night,null,'landing_shown');
    end if;
  elsif not exists(select 1 from private.launch_landing_hidden where night_id=p_night) then
    insert into private.launch_landing_hidden(night_id,hidden_by) values(p_night,auth.uid());
    perform private.launch_log(p_night,null,'landing_hidden');
  end if;
  return p_visible;
end $$;

create function public.admin_launch_landing_visible(p_night uuid) returns boolean
language plpgsql stable security definer set search_path='' as $$
begin
  if not private.is_admin() then raise exception 'not authorized' using errcode='42501'; end if;
  if p_night is null or not exists(select 1 from private.launch_events where night_id=p_night) then
    raise exception 'unknown night';
  end if;
  return not exists(select 1 from private.launch_landing_hidden where night_id=p_night);
end $$;

revoke all on function public.admin_set_launch_landing_visibility(uuid,boolean),public.admin_launch_landing_visible(uuid)
  from public,anon,service_role;
grant execute on function public.admin_set_launch_landing_visibility(uuid,boolean),public.admin_launch_landing_visible(uuid)
  to authenticated;

-- Same signature, grants and rule as 20261129001600, minus hidden nights.
create or replace function public.launch_next_booking_event() returns jsonb
language sql security definer set search_path = '' as $$
  select public.launch_booking_event(e.night_id)
  from private.launch_events e join public.venue_nights n on n.id = e.night_id
  where e.cancelled_at is null and n.terminal_at is null
    and clock_timestamp() < n.waiting_opens_at - interval '30 minutes'
    and not exists (select 1 from private.launch_landing_hidden h where h.night_id = e.night_id)
  order by n.waiting_opens_at, e.night_id
  limit 1;
$$;
