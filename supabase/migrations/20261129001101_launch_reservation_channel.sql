-- #561: record which posted reservation link a booking came from (street,
-- Instagram, venue flyer, venue story) and show founders the totals.
--
-- Additive only. The channel lives in its own table so the reservation row,
-- its immutability guard and the existing facade signatures stay unchanged:
-- the application already in production keeps working on this schema, and a
-- reservation without a row here simply has no recorded channel.
create table private.launch_reservation_channels (
  reservation_id uuid primary key references private.launch_reservations(id) on delete cascade,
  channel text not null check (channel in ('street','instagram','venue_flyer','venue_story')),
  recorded_at timestamptz not null default clock_timestamp()
);
-- Private schema, no API grants: only the two functions below read or write it.
revoke all on table private.launch_reservation_channels from public,anon,authenticated,service_role;

-- Called by the Checkout route right after prepare_launch_checkout, with the
-- attempt's management secret. Written once: the first known channel wins and a
-- replay never changes it. An unknown value is ignored rather than refused, so
-- attribution can never block a booking. Returns whether a row was written.
create function public.record_launch_reservation_channel(p_id uuid,p_secret text,p_channel text) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  if p_id is null then return false; end if;
  perform private.launch_authorize(p_id,p_secret);
  if p_channel is null or p_channel not in ('street','instagram','venue_flyer','venue_story') then return false; end if;
  insert into private.launch_reservation_channels(reservation_id,channel) values(p_id,p_channel)
    on conflict (reservation_id) do nothing;
  return found;
end $$;
revoke all on function public.record_launch_reservation_channel(uuid,text,text) from public,anon,authenticated;
grant execute on function public.record_launch_reservation_channel(uuid,text,text) to service_role;

-- Founder totals for confirmed bookings, like the gender totals of
-- admin_launch_overview (#354): payment holds are not counted and no
-- per-reservation value leaves the database.
create function public.admin_launch_channel_counts(p_night uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare result jsonb;
begin
  if not private.is_admin() then raise exception 'not authorized' using errcode='42501'; end if;
  if p_night is null or not exists(select 1 from public.venue_nights where id=p_night) then raise exception 'unknown night'; end if;
  select jsonb_build_object(
      'street',count(*) filter(where c.channel='street'),'instagram',count(*) filter(where c.channel='instagram'),
      'venue_flyer',count(*) filter(where c.channel='venue_flyer'),'venue_story',count(*) filter(where c.channel='venue_story'),
      'unspecified',count(*) filter(where c.channel is null))
    into result
    from private.launch_reservations r left join private.launch_reservation_channels c on c.reservation_id=r.id
    where r.night_id=p_night and r.state='confirmed';
  return result;
end $$;
revoke all on function public.admin_launch_channel_counts(uuid) from public,anon,service_role;
grant execute on function public.admin_launch_channel_counts(uuid) to authenticated;
