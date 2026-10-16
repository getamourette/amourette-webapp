-- #191. Behavioral migration: shared application requires founder approval.
-- Corrections retain two 500-code-point notes plus the prior evidence. JSON
-- escaping can use six bytes per code point, so reserve 8 KiB for this action.
-- Keep the existing 4 KiB bound for every other audit action.
alter table private.launch_audit drop constraint launch_audit_detail_check,
  add constraint launch_audit_detail_check check (
    jsonb_typeof(detail) = 'object' and octet_length(detail::text) <=
      case when action = 'arrival_corrected' then 8192 else 4096 end
  );

-- The revision fences stale corrections, including undo/reverify ABA races.
alter table private.launch_reservations add column arrival_revision integer not null default 0
  check (arrival_revision >= 0);
update private.launch_reservations r set arrival_revision = 1
  where exists(select 1 from private.launch_arrivals a where a.reservation_id = r.id);

create function private.launch_arrival_revision() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update private.launch_reservations set arrival_revision = arrival_revision + 1
    where id = case when tg_op = 'DELETE' then old.reservation_id else new.reservation_id end;
  return null;
end $$;
create trigger launch_arrival_revision after insert or update or delete on private.launch_arrivals
  for each row execute function private.launch_arrival_revision();
revoke all on function private.launch_arrival_revision() from public, anon, authenticated, service_role;

-- Founder-only, minimal arrival projection. Verification time is not arrival time.
create function private.launch_staff_arrival(p_id uuid) returns jsonb
language sql stable set search_path = '' as $$
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
      when clock_timestamp() < n.waiting_opens_at then 'not_started'
      else 'open' end,
    'can_correct',p.state = 'paid' and clock_timestamp() >= n.waiting_opens_at and
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
revoke all on function private.launch_staff_arrival(uuid) from public, anon, authenticated, service_role;

-- History lookup may identify a cancelled/expired booking, but never authorizes
-- confirmation. #186's command still checks the credential and night under lock.
create function public.admin_inspect_launch_arrival(p_night uuid, p_id uuid default null, p_secret text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare id uuid;
begin
  if not private.is_admin() then raise exception 'not authorized' using errcode = '42501'; end if;
  if p_night is null or (p_id is null) = (p_secret is null) then raise exception 'invalid arrival lookup' using errcode = '22023'; end if;
  if p_secret is not null then
    select r.id into id from private.launch_reservations r join private.launch_credentials c on c.reservation_id = r.id
      where r.night_id = p_night and c.arrival_hash = private.launch_secret_hash(p_secret);
  else
    select r.id into id from private.launch_reservations r where r.id = p_id and r.night_id = p_night;
  end if;
  if id is null then raise exception 'arrival credential unavailable'; end if;
  return private.launch_staff_arrival(id);
end $$;

create function public.admin_launch_arrival_summary(p_night uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare result jsonb;
begin
  if not private.is_admin() then raise exception 'not authorized' using errcode = '42501'; end if;
  if p_night is null then raise exception 'invalid arrival night' using errcode = '22023'; end if;
  select jsonb_build_object('now',clock_timestamp(),'starts_at',n.waiting_opens_at,'ends_at',n.closes_at,
    'ended',clock_timestamp() >= n.closes_at or n.terminal_at is not null,
    'cancelled',e.cancelled_at is not null,
    'verified',count(*) filter(where a.outcome = 'verified'),
    'remaining',count(*) filter(where r.state = 'confirmed' and p.state = 'paid' and a.outcome is distinct from 'verified'
      and clock_timestamp() < n.closes_at and n.terminal_at is null and e.cancelled_at is null),
    'absent',count(*) filter(where r.state = 'confirmed' and p.state = 'paid' and a.outcome is distinct from 'verified'
      and clock_timestamp() >= n.closes_at and e.cancelled_at is null),
    'cancelled_count',count(*) filter(where r.state = 'cancelled' and p.state = 'paid')) into result
  from private.launch_events e join public.venue_nights n on n.id = e.night_id
  left join private.launch_reservations r on r.night_id = e.night_id
  left join private.launch_payments p on p.reservation_id = r.id
  left join private.launch_arrivals a on a.reservation_id = r.id
  where e.night_id = p_night group by e.night_id,n.id;
  if result is null then raise exception 'booking event unavailable'; end if;
  return result;
end $$;

create function public.admin_correct_launch_arrival(p_id uuid, p_night uuid, p_expected_revision integer, p_verified boolean, p_note text)
returns jsonb language plpgsql security definer set search_path = '' as $$
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
  if t < n.waiting_opens_at or not exists(select 1 from private.launch_payments where reservation_id = p_id and state = 'paid') then
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

-- A scan opened before an undo cannot silently reinstate the mistaken arrival.
-- Ordinary duplicate scans still return the original verification via #186.
create function public.admin_confirm_launch_arrival(p_id uuid, p_night uuid, p_expected_revision integer,
  p_method text, p_secret text default null, p_note text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare r private.launch_reservations;
begin
  if not private.is_admin() then raise exception 'not authorized' using errcode = '42501'; end if;
  if p_id is null or p_night is null or p_expected_revision is null or p_expected_revision < 0 then
    raise exception 'invalid arrival confirmation' using errcode = '22023';
  end if;
  r := private.launch_lock_reservation(p_id);
  if r.night_id <> p_night then raise exception 'arrival credential unavailable'; end if;
  if r.arrival_revision <> p_expected_revision and not exists(
    select 1 from private.launch_arrivals where reservation_id = p_id and outcome = 'verified'
  ) then raise exception 'arrival changed; reload before confirming' using errcode = '40001'; end if;
  perform public.admin_verify_launch_arrival(p_id,p_night,p_method,p_secret,p_note);
  return private.launch_staff_arrival(p_id);
end $$;

revoke all on function public.admin_inspect_launch_arrival(uuid,uuid,text), public.admin_launch_arrival_summary(uuid),
  public.admin_correct_launch_arrival(uuid,uuid,integer,boolean,text), public.admin_confirm_launch_arrival(uuid,uuid,integer,text,text,text) from public, anon, service_role;
grant execute on function public.admin_inspect_launch_arrival(uuid,uuid,text), public.admin_launch_arrival_summary(uuid),
  public.admin_correct_launch_arrival(uuid,uuid,integer,boolean,text), public.admin_confirm_launch_arrival(uuid,uuid,integer,text,text,text) to authenticated;
