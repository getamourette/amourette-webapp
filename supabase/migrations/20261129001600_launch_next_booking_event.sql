-- #603: the landing page sends its "book your place" button to the next night
-- whose registration is open, read from the data rather than a hardcoded id.
--
-- Additive only: a new function, nothing existing changes. It returns the same
-- public payload as launch_booking_event (date, venue name and address,
-- deposit, availability) for the earliest night that is open for booking right
-- now, or null when there is none, in which case the page shows the waitlist.
-- "Open" uses the exact rule of launch_event_availability: registration has
-- started, closes 30 minutes before the doors, and the night is neither
-- cancelled nor terminal. A full night stays the next night: its own page
-- handles the waitlist for it.
create function public.launch_next_booking_event() returns jsonb
language sql security definer set search_path = '' as $$
  select public.launch_booking_event(e.night_id)
  from private.launch_events e join public.venue_nights n on n.id = e.night_id
  where e.cancelled_at is null and n.terminal_at is null
    and clock_timestamp() >= e.registration_opens_at
    and clock_timestamp() < n.waiting_opens_at - interval '30 minutes'
  order by n.waiting_opens_at, e.night_id
  limit 1;
$$;
-- Server-only, like launch_booking_event: the landing page reads it on the server.
revoke all on function public.launch_next_booking_event() from public,anon,authenticated;
grant execute on function public.launch_next_booking_event() to service_role;
