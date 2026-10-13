-- #186: opaque arrival QR delivery and night-bound verification. No regeneration.
-- Behavioral migration: apply to shared development only with founder approval.
create function private.launch_require_arrival(p_id uuid, p_night uuid)
returns private.launch_reservations
language plpgsql set search_path = '' as $$
declare r private.launch_reservations;
begin
  r := private.launch_lock_reservation(p_id);
  if p_night is null or r.night_id <> p_night or r.state <> 'confirmed'
    or not exists (
      select 1 from private.launch_credentials c
      join private.launch_payments p on p.reservation_id = c.reservation_id
      join private.launch_events e on e.night_id = r.night_id
      join public.venue_nights n on n.id = e.night_id
      where c.reservation_id = p_id and c.arrival_revoked_at is null
        and p.state = 'paid' and e.cancelled_at is null and n.terminal_at is null
        and clock_timestamp() < n.closes_at
    ) then raise exception 'arrival credential unavailable'; end if;
  return r;
end $$;

create function private.launch_arrival_delivery(p_id uuid) returns jsonb
language plpgsql set search_path = '' as $$
declare r private.launch_reservations; result jsonb;
begin
  r := private.launch_lock_reservation(p_id);
  perform private.launch_require_arrival(p_id, r.night_id);
  select jsonb_build_object(
    'reservation_id', r.id, 'night_id', r.night_id,
    'recipient_email', r.email, 'locale', r.locale,
    'starts_at', n.waiting_opens_at, 'ends_at', n.closes_at, 'timezone', v.timezone,
    'verified_at', a.verified_at, 'envelope', w.delivery_envelope
  ) into result
  from private.launch_checkout_work w
  join public.venue_nights n on n.id = r.night_id
  join public.venues v on v.id = n.venue_id
  left join private.launch_arrivals a on a.reservation_id = r.id
  where w.reservation_id = r.id;
  if result is null then raise exception 'arrival credential unavailable'; end if;
  return result;
end $$;

-- Guest ownership is checked under the same lock as eligibility. Neither UUID
-- nor email alone grants access. The envelope remains inside the server facade.
create function public.get_launch_arrival_delivery(p_id uuid, p_secret text) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  perform private.launch_lock_reservation(p_id);
  perform private.launch_authorize(p_id, p_secret);
  return private.launch_arrival_delivery(p_id);
end $$;

-- Trusted #189 email handoff only: deliver to the returned stored recipient.
create function public.read_launch_arrival_delivery(p_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  return private.launch_arrival_delivery(p_id);
end $$;

-- Remove the unscoped signatures; keeping them would bypass the new contract.
drop function public.admin_lookup_launch_arrival(text);
drop function public.admin_verify_launch_arrival(uuid, text, text);

create function public.admin_lookup_launch_arrival(p_night uuid, p_secret text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare id uuid;
begin
  if not private.is_admin() then raise exception 'not authorized' using errcode = '42501'; end if;
  select c.reservation_id into id
  from private.launch_credentials c join private.launch_reservations r on r.id = c.reservation_id
  where c.arrival_hash = private.launch_secret_hash(p_secret) and r.night_id = p_night;
  if id is null then raise exception 'arrival credential unavailable'; end if;
  perform private.launch_require_arrival(id, p_night);
  -- A read before event start is allowed; only explicit confirmation has effects.
  return private.launch_projection(id);
end $$;

create function public.admin_verify_launch_arrival(
  p_id uuid, p_night uuid, p_method text, p_secret text default null, p_note text default null
) returns jsonb
language plpgsql security definer set search_path = '' as $$
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
  if t < n.waiting_opens_at or t >= n.closes_at then raise exception 'arrival outside scheduled event'; end if;
  if exists(select 1 from private.launch_arrivals where reservation_id = p_id and outcome = 'verified') then
    return private.launch_projection(p_id);
  end if;
  insert into private.launch_arrivals(reservation_id, outcome, verified_at, verified_by, method, note)
    values(p_id, 'verified', t, auth.uid(), p_method, nullif(private.trim_input(p_note), ''));
  perform private.launch_queue_refund(p_id, 'arrival');
  perform private.launch_log(r.night_id, p_id, 'arrival_verified', jsonb_build_object('method', p_method));
  return private.launch_projection(p_id);
end $$;

revoke all on function private.launch_require_arrival(uuid, uuid), private.launch_arrival_delivery(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.get_launch_arrival_delivery(uuid, text), public.read_launch_arrival_delivery(uuid)
  from public, anon, authenticated;
grant execute on function public.get_launch_arrival_delivery(uuid, text), public.read_launch_arrival_delivery(uuid)
  to service_role;
revoke all on function public.admin_lookup_launch_arrival(uuid, text),
  public.admin_verify_launch_arrival(uuid, uuid, text, text, text) from public, anon, service_role;
grant execute on function public.admin_lookup_launch_arrival(uuid, text),
  public.admin_verify_launch_arrival(uuid, uuid, text, text, text) to authenticated;
