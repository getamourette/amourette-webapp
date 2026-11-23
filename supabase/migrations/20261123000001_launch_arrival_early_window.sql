-- Guests arrive before the scheduled start, and a founder who cannot confirm
-- them on the spot must find them again later or the deposit refund is never
-- requested (#435). Arrival confirmation, and the founder correction that
-- shares its window, now open 60 minutes before the start. The end of the
-- window (closes_at) and every other rule are unchanged.

create function private.launch_arrival_opens_at(p_starts_at timestamptz) returns timestamptz
  language sql immutable set search_path = '' as $$ select p_starts_at - interval '60 minutes' $$;
revoke all on function private.launch_arrival_opens_at(timestamptz) from public,anon,authenticated,service_role;

create or replace function private.launch_staff_arrival(p_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $$
  select jsonb_build_object(
    'id',r.id,'night_id',r.night_id,'first_name',r.first_name,'email',r.email,
    'state',r.state,'payment_state',p.state,'arrival',a.outcome,
    'verified_at',a.verified_at,'verified_by',a.verified_by,'method',a.method,'note',a.note,
    'revision',r.arrival_revision,'refund_state',f.state,
    'availability',case
      when r.state = 'cancelled' then 'cancelled'
      when e.cancelled_at is not null then 'event_cancelled'
      when r.state <> 'confirmed' or p.state <> 'paid' then 'unpaid'
      when clock_timestamp() >= n.closes_at or n.terminal_at is not null then 'ended'
      when c.arrival_revoked_at is not null then 'revoked'
      when clock_timestamp() < private.launch_arrival_opens_at(n.waiting_opens_at) then 'not_started'
      else 'open' end,
    'can_correct',p.state = 'paid' and clock_timestamp() >= private.launch_arrival_opens_at(n.waiting_opens_at) and
      (coalesce(a.outcome = 'verified',false) or (r.state = 'confirmed' and e.cancelled_at is null)),
    'history',coalesce((select jsonb_agg(to_jsonb(h) order by h.id desc) from (
      select id,action,actor_id,created_at,detail from private.launch_audit
      where reservation_id = r.id and action in ('arrival_verified','arrival_corrected')
      order by id desc limit 20
    ) h),'[]'::jsonb))
  from private.launch_reservations r join private.launch_payments p on p.reservation_id = r.id
  join private.launch_events e on e.night_id = r.night_id
  join public.venue_nights n on n.id = r.night_id
  join private.launch_credentials c on c.reservation_id = r.id
  left join private.launch_arrivals a on a.reservation_id = r.id
  left join private.launch_refunds f on f.reservation_id = r.id where r.id = p_id;
$$;

create or replace function public.admin_verify_launch_arrival(p_id uuid, p_night uuid, p_method text, p_secret text DEFAULT NULL::text, p_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $$
declare r private.launch_reservations; n public.venue_nights; t timestamptz;
begin
  if not private.is_admin() then raise exception 'not authorized' using errcode = '42501'; end if;
  if p_method is null or p_method not in ('qr', 'manual')
    or not private.valid_input_text(p_note, 500, p_method = 'manual')
    or (p_method = 'manual' and p_secret is not null) then
    raise exception 'invalid arrival verification';
  end if;
  if p_method = 'qr' then
    -- Validate shape before taking locks, then recheck the binding under lock.
    perform private.launch_secret_hash(p_secret);
  end if;
  r := private.launch_require_arrival(p_id, p_night);
  if p_method = 'qr' and not exists (
    select 1 from private.launch_credentials c
    where c.reservation_id = p_id and c.arrival_hash = private.launch_secret_hash(p_secret)
      and c.arrival_revoked_at is null
  ) then raise exception 'arrival credential unavailable'; end if;
  select * into n from public.venue_nights where id = r.night_id;
  t := clock_timestamp();
  if t < private.launch_arrival_opens_at(n.waiting_opens_at) or t >= n.closes_at then raise exception 'arrival outside scheduled event'; end if;
  if exists(select 1 from private.launch_arrivals where reservation_id = p_id and outcome = 'verified') then
    return private.launch_projection(p_id);
  end if;
  insert into private.launch_arrivals(reservation_id, outcome, verified_at, verified_by, method, note)
    values(p_id, 'verified', t, auth.uid(), p_method, nullif(private.trim_input(p_note), ''));
  perform private.launch_queue_refund(p_id, 'arrival');
  perform private.launch_log(r.night_id, p_id, 'arrival_verified', jsonb_build_object('method', p_method));
  return private.launch_projection(p_id);
end $$;

create or replace function public.admin_correct_launch_arrival(p_id uuid, p_night uuid, p_expected_revision integer, p_verified boolean, p_note text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $$
declare r private.launch_reservations; n public.venue_nights; previous private.launch_arrivals; t timestamptz;
begin
  if not private.is_admin() then raise exception 'not authorized' using errcode = '42501'; end if;
  if p_id is null or p_night is null or p_expected_revision is null or p_expected_revision < 0
    or p_verified is null or not private.valid_input_text(p_note,500,true) then
    raise exception 'invalid arrival correction' using errcode = '22023';
  end if;
  r := private.launch_lock_reservation(p_id);
  if r.night_id <> p_night then raise exception 'arrival credential unavailable'; end if;
  if r.arrival_revision <> p_expected_revision then raise exception 'arrival changed; reload before correcting' using errcode = '40001'; end if;
  select * into n from public.venue_nights where id = p_night;
  select * into previous from private.launch_arrivals where reservation_id = p_id;
  t := clock_timestamp();
  if t < private.launch_arrival_opens_at(n.waiting_opens_at) or not exists(select 1 from private.launch_payments where reservation_id = p_id and state = 'paid') then
    raise exception 'arrival correction unavailable';
  end if;
  if p_verified then
    if r.state <> 'confirmed' or exists(select 1 from private.launch_events where night_id = p_night and cancelled_at is not null) then
      raise exception 'arrival correction unavailable';
    end if;
    if previous.outcome = 'verified' then raise exception 'arrival already verified'; end if;
    insert into private.launch_arrivals(reservation_id,outcome,verified_at,verified_by,method,note)
      values(p_id,'verified',t,auth.uid(),'manual',private.trim_input(p_note))
      on conflict(reservation_id) do update set outcome = 'verified',verified_at = excluded.verified_at,
        verified_by = excluded.verified_by,method = excluded.method,note = excluded.note;
    perform private.launch_queue_refund(p_id,'arrival');
  else
    if previous.outcome is distinct from 'verified' then raise exception 'arrival is not verified'; end if;
    if t >= n.closes_at then
      update private.launch_arrivals set outcome = 'no_show',verified_at = null,verified_by = null,method = null,note = null where reservation_id = p_id;
    else
      -- Do not classify an absence before arrivals end. Original evidence is
      -- copied to the audit before returning; the transaction is atomic.
      delete from private.launch_arrivals where reservation_id = p_id;
    end if;
    -- Approved policy: every already-triggered refund continues unchanged.
  end if;
  perform private.launch_log(p_night,p_id,'arrival_corrected',jsonb_build_object(
    'note',private.trim_input(p_note),'verified',p_verified,'previous',to_jsonb(previous),
    'previous_revision',p_expected_revision,'refund_preserved',not p_verified));
  return private.launch_staff_arrival(p_id);
end $$;
