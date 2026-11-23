-- #472: the public booking event (GET /api/launch/checkout, relayed by
-- launch_booking_event) returned the venue id to anyone without a session.
-- With it, check_in lets someone at home enter tonight's room. The guest page
-- stopped requiring the field first (#497); this removes it from the payload.
-- Same signature and body otherwise, so grants are kept.
-- Apply only after the client of #497 is deployed: an older client refuses an
-- event without venue_id and its booking page shows "could not load".
create or replace function public.launch_event_availability(p_night uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare result jsonb; t timestamptz := clock_timestamp();
begin
  select jsonb_build_object('night_id',e.night_id,'timezone',v.timezone,
    'opens_at',e.registration_opens_at,'closes_at',n.waiting_opens_at - interval '30 minutes',
    'starts_at',n.waiting_opens_at,'ends_at',n.closes_at,'cancellation_deadline',n.waiting_opens_at - interval '48 hours',
    'amount_minor',e.deposit_minor,'currency',e.currency,'policy_version',e.policy_version,
    'available',greatest(0,e.capacity - (select count(*) from private.launch_reservations r where r.night_id=e.night_id and r.state in ('holding','confirmed'))),
    'registration_open',t >= e.registration_opens_at and t < n.waiting_opens_at - interval '30 minutes' and n.terminal_at is null and e.cancelled_at is null,
    'status',case when e.cancelled_at is not null or n.terminal_reason in ('cancelled','postponed') then 'cancelled'
      when n.terminal_at is not null or t >= n.closes_at then 'ended'
      when t < e.registration_opens_at then 'not_open'
      when t >= n.waiting_opens_at - interval '30 minutes' then 'closed' else 'open' end,
    'walk_ins_possible',e.cancelled_at is null and n.terminal_at is null and t < n.closes_at and t >= n.waiting_opens_at - interval '30 minutes')
    into result from private.launch_events e join public.venue_nights n on n.id=e.night_id
    join public.venues v on v.id=n.venue_id where e.night_id=p_night;
  if result is null then raise exception 'booking event unavailable'; end if;
  return result;
end $$;

-- A service command, never direct client/service DML. Ciphertext is an outbox
