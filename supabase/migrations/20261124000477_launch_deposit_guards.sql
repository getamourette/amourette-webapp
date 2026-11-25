-- #477: two deposit guards.
--
-- 1. An organizer cancellation or postponement is refused once the night has
--    ended (its scheduled close has passed, or it is terminal). Before, a stale
--    founder tab, a direct RPC call or a `cancel_venue_night` between `closes_at`
--    and the next lifecycle tick cancelled the event and queued a refund of every
--    retained deposit (no-shows, late cancellations), and sent "event cancelled"
--    to guests who came. The guard sits in `private.launch_cancel_event`, the one
--    place both `admin_cancel_launch_event` and the night-cancellation trigger go
--    through. An event already cancelled stays a silent no-op.
-- 2. The late-cancellation acknowledgement is required whenever the payment hold
--    can end after the free-cancellation deadline, not only when the hold is
--    created after it: a guest who books ten minutes before the deadline and pays
--    ten minutes after it must have acknowledged that the deposit is no longer
--    refundable on cancellation (docs/launch-reservation-policy.md).
--
-- Both functions keep their arguments and grants. Existing reservations, payments
-- and refunds are not touched.

create or replace function private.launch_cancel_event(p_night uuid,p_reason text) returns void
language plpgsql set search_path = '' as $$
declare r private.launch_reservations;
begin
  perform private.launch_lock(p_night);
  -- The night-cancellation trigger runs after its own update marked the night
  -- terminal with reason 'cancelled'; only another terminal reason means ended.
  if exists(select 1 from private.launch_events where night_id = p_night and cancelled_at is null)
    and exists(select 1 from public.venue_nights where id = p_night
      and (clock_timestamp() >= closes_at or (terminal_at is not null and terminal_reason is distinct from 'cancelled'))) then
    raise exception 'event has ended';
  end if;
  update private.launch_events set cancelled_at = clock_timestamp(),cancellation_reason = p_reason
    where night_id = p_night and cancelled_at is null;
  if not found then return; end if;
  for r in select * from private.launch_reservations where night_id = p_night order by id loop
    if r.state in ('holding','confirmed') then
      update private.launch_reservations set state = 'cancelled',cancelled_at = clock_timestamp(),cancellation_refundable = true where id = r.id;
    end if;
    update private.launch_credentials set arrival_revoked_at = coalesce(arrival_revoked_at,clock_timestamp()) where reservation_id = r.id;
    perform private.launch_queue_refund(r.id,'organizer');
  end loop;
  perform private.launch_log(p_night,null,'event_cancelled',jsonb_build_object('reason',p_reason));
end $$;

-- Same body as 20261123000476, except the late check compares the hold deadline
-- (after the hold validation) instead of the creation instant.
create or replace function public.create_launch_reservation(p_id uuid,p_night uuid,p_email text,p_name text,p_locale text,
  p_policy text,p_late_ack boolean,p_hold_until timestamptz,p_management_secret text,p_arrival_secret text,
  p_gender text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare r private.launch_reservations; e private.launch_events; n public.venue_nights;
  email_value text; name_value text; management bytea; arrival bytea; t timestamptz;
begin
  if p_id is null or not private.valid_marketing_email(p_email) or not private.valid_input_text(p_name,30,true)
    or p_locale is null or p_locale not in ('en','fr','es') or p_late_ack is null
    or (p_gender is not null and p_gender not in ('woman','man','nonbinary')) then raise exception 'invalid reservation input' using errcode = '22023'; end if;
  email_value := lower(private.trim_input(p_email) collate "C"); name_value := private.trim_input(p_name);
  management := private.launch_secret_hash(p_management_secret); arrival := private.launch_secret_hash(p_arrival_secret);
  if management = arrival then raise exception 'credentials must differ'; end if;
  perform private.launch_lock(p_night);
  select * into r from private.launch_reservations where id = p_id;
  if found then
    if (r.night_id,r.email,r.first_name,r.locale,r.policy_version,r.late_cancellation_acknowledged,r.hold_until,r.gender)
      is distinct from (p_night,email_value,name_value,p_locale,p_policy,p_late_ack,p_hold_until,p_gender) then raise exception 'reservation identifier reused'; end if;
    perform private.launch_authorize(p_id,p_management_secret);
    if not exists(select 1 from private.launch_credentials where reservation_id = p_id and arrival_hash = arrival) then raise exception 'reservation identifier reused'; end if;
    return private.launch_projection(p_id);
  end if;
  -- Do not disclose the existing ID or a Checkout URL on this branch.
  if exists(select 1 from private.launch_reservations where night_id = p_night and email = email_value and state in ('holding','confirmed')) then
    return jsonb_build_object('access_required',true);
  end if;
  select * into e from private.launch_events where night_id = p_night;
  select * into n from public.venue_nights where id = p_night;
  t := clock_timestamp();
  if e.night_id is null or e.cancelled_at is not null or n.terminal_at is not null or t < e.registration_opens_at or t >= n.waiting_opens_at - interval '30 minutes' then raise exception 'registration closed'; end if;
  if p_policy is distinct from e.policy_version then raise exception 'reservation policy acceptance required'; end if;
  if p_hold_until is null or not isfinite(p_hold_until) or p_hold_until <= t or p_hold_until > n.waiting_opens_at then raise exception 'invalid payment hold deadline'; end if;
  -- The payment can land as late as the hold deadline (p_hold_until > t here).
  if not private.launch_cancellation_refundable(n.waiting_opens_at,p_hold_until) and not p_late_ack then raise exception 'late cancellation acknowledgement required'; end if;
  insert into private.launch_reservations(id,night_id,email,first_name,locale,policy_version,late_cancellation_acknowledged,hold_until,created_at,accepted_at,gender)
    values(p_id,p_night,email_value,name_value,p_locale,p_policy,p_late_ack,p_hold_until,t,t,p_gender);
  insert into private.launch_credentials values(p_id,management,private.launch_access_expires_at(p_id),arrival,null);
  insert into private.launch_payments(reservation_id,amount_minor,currency) values(p_id,e.deposit_minor,e.currency);
  perform private.launch_log(p_night,p_id,'hold_created');
  return private.launch_projection(p_id);
end $$;
