-- #560: the durable night report (#257) already keeps the room's totals after
-- the end-of-night purge: scanners, participants, gender at entry, likes (also
-- by gender), matches, conversations, replies and the attendance curve. It did
-- not keep the booking side: booked, arrived, absent, door arrival times and
-- the gender given at reservation, which #388 erases 30 days after the night.
-- This adds those totals to the same report row, written by the same function
-- that writes the room totals, so every path that ends a night (the scheduled
-- end, a cancellation, a founder ending it early) stores them in the
-- transaction that deletes likes, matches and messages.
--
-- Totals only: no reservation, guest or account identifier is copied. Small
-- counts can still point at a person on a 15 to 20 seat night, so the columns
-- stay behind the founder-only RPC like the rest of the report (the table has
-- no client grant).
--
-- Behaviour: four nullable columns, one new private helper, one replaced
-- private function (same arguments) and a backfill of reports already stored.
-- The live code reads the report through admin_venue_night_report, which now
-- returns four more fields it ignores.
alter table public.venue_night_reports
  add column booked integer check (booked >= 0),
  add column arrived integer check (arrived >= 0 and arrived <= booked),
  add column absent integer check (absent >= 0 and absent <= booked),
  add column arrival_times jsonb,
  add column bookings_by_gender jsonb;

-- Booking totals of one night, null when the night had no booking event or was
-- cancelled (attendance means nothing then). Same definitions as the founder
-- arrivals summary: a booking is a confirmed, paid reservation; an arrival is
-- a verified one; the rest of the bookings are absent once the night is over.
-- Arrival times are verified arrivals in 30-minute buckets aligned on the
-- venue's local midnight, empty buckets left out.
create function private.night_booking_totals(p_id uuid,
  out booked integer, out arrived integer, out absent integer,
  out arrival_times jsonb, out bookings_by_gender jsonb)
language plpgsql security definer set search_path = '' as $$
declare n public.venue_nights; e private.launch_events; tz text; origin timestamptz;
begin
  select * into n from public.venue_nights where id = p_id;
  select * into e from private.launch_events where night_id = p_id;
  if n.id is null or e.night_id is null or e.cancelled_at is not null
    or n.terminal_reason is not distinct from 'cancelled' then return; end if;
  select timezone into tz from public.venues where id = n.venue_id;
  origin := date_trunc('day', n.waiting_opens_at at time zone tz) at time zone tz;
  with bookings as (
    select coalesce(r.gender, 'unspecified') gender, a.verified_at
    from private.launch_reservations r
    join private.launch_payments p on p.reservation_id = r.id and p.state = 'paid'
    left join private.launch_arrivals a on a.reservation_id = r.id and a.outcome = 'verified'
    where r.night_id = p_id and r.state = 'confirmed'
  )
  select (select count(*) from bookings), (select count(verified_at) from bookings),
    (select coalesce(jsonb_agg(jsonb_build_object('at', b.at, 'count', b.amount) order by b.at), '[]'::jsonb)
     from (select date_bin(interval '30 minutes', verified_at, origin) at, count(*)::integer amount
           from bookings where verified_at is not null group by 1) b),
    (select jsonb_agg(jsonb_build_object('gender', g.gender,
        'booked', (select count(*) from bookings x where x.gender = g.gender),
        'arrived', (select count(x.verified_at) from bookings x where x.gender = g.gender)) order by g.position)
     from unnest(array['woman','man','nonbinary','unspecified']) with ordinality g(gender, position))
  into booked, arrived, arrival_times, bookings_by_gender;
  absent := case when n.terminal_at is not null or clock_timestamp() >= n.closes_at then booked - arrived end;
end $$;
revoke all on function private.night_booking_totals(uuid) from public, anon, authenticated, service_role;

-- Same function as #257 plus the booking totals, set on the row before it is
-- stored. A report already stored is never rewritten (on conflict do nothing).
create or replace function private.finalize_night_report(p_id uuid) returns void
language plpgsql security definer set search_path=public,private as $$
declare n public.venue_nights; r public.venue_night_reports;
begin
 select * into n from public.venue_nights where id=p_id for update;
 if not found or n.terminal_at is null then raise exception 'terminal night required'; end if;
 r := private.build_night_report(p_id);
 select t.booked,t.arrived,t.absent,t.arrival_times,t.bookings_by_gender
 into r.booked,r.arrived,r.absent,r.arrival_times,r.bookings_by_gender from private.night_booking_totals(p_id) t;
 insert into public.venue_night_reports select r.* on conflict(venue_night_id) do nothing;
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
revoke all on function private.finalize_night_report(uuid) from public, anon, authenticated, service_role;

-- Existing data: reports stored before this migration get the booking totals
-- from the reservation records, which outlive the room cleanup. For a night
-- more than 30 days old the gender answers are already erased and count as
-- unspecified. Nights without a booking event keep nulls.
update public.venue_night_reports v
set booked=t.booked, arrived=t.arrived, absent=t.absent,
  arrival_times=t.arrival_times, bookings_by_gender=t.bookings_by_gender
from public.venue_night_reports s
cross join lateral private.night_booking_totals(s.venue_night_id) t
where v.venue_night_id=s.venue_night_id and t.booked is not null;
