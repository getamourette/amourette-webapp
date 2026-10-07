-- #182. Local, unapplied foundation. No Checkout, email delivery or public UI.
-- Financial records deliberately RESTRICT night deletion and outlive room cleanup.
-- All writes go through commands; even service_role has no direct table writes.

create table private.launch_events (
  night_id uuid primary key references public.venue_nights(id) on delete restrict,
  registration_opens_at timestamptz not null check (isfinite(registration_opens_at)),
  capacity integer not null check (capacity between 1 and 100000),
  deposit_minor integer not null check (deposit_minor between 1 and 99999999),
  currency text not null check (currency in ('eur','usd')),
  policy_version text not null check (policy_version ~ '^[a-zA-Z0-9._-]{1,80}$'),
  cancelled_at timestamptz,
  cancellation_reason text check (cancellation_reason in ('cancelled','postponed')),
  check ((cancelled_at is null) = (cancellation_reason is null))
);

create table private.launch_reservations (
  id uuid primary key,
  night_id uuid not null references private.launch_events(night_id) on delete restrict,
  email text not null check (private.valid_marketing_email(email) and email = lower(private.trim_input(email) collate "C")),
  first_name text not null check (private.valid_input_text(first_name,30,true) and first_name = private.trim_input(first_name)),
  locale text not null check (locale in ('en','fr','es')),
  policy_version text not null check (policy_version ~ '^[a-zA-Z0-9._-]{1,80}$'),
  accepted_at timestamptz not null default clock_timestamp(),
  late_cancellation_acknowledged boolean not null,
  state text not null default 'holding' check (state in ('holding','confirmed','cancelled','expired')),
  hold_until timestamptz not null check (isfinite(hold_until)),
  created_at timestamptz not null default clock_timestamp(),
  confirmed_at timestamptz,
  cancelled_at timestamptz,
  expired_at timestamptz,
  cancellation_refundable boolean,
  check (hold_until > created_at),
  check ((state = 'cancelled') = (cancelled_at is not null)),
  check ((state = 'expired') = (expired_at is not null)),
  check (state <> 'confirmed' or confirmed_at is not null),
  check ((cancelled_at is null) = (cancellation_refundable is null))
);
create unique index launch_reservations_active_email on private.launch_reservations(night_id,email)
  where state in ('holding','confirmed');
create index launch_reservations_night on private.launch_reservations(night_id,created_at,id);

-- Credentials are never returned in reservation projections or founder lists.
create table private.launch_credentials (
  reservation_id uuid primary key references private.launch_reservations(id) on delete restrict,
  management_hash bytea not null unique check (octet_length(management_hash) = 32),
  management_expires_at timestamptz not null check (isfinite(management_expires_at)),
  arrival_hash bytea not null unique check (octet_length(arrival_hash) = 32),
  arrival_revoked_at timestamptz,
  check (management_hash <> arrival_hash)
);

-- One durable attempt per reservation. A new purchase gets a new reservation.
create table private.launch_payments (
  reservation_id uuid primary key references private.launch_reservations(id) on delete restrict,
  amount_minor integer not null check (amount_minor between 1 and 99999999),
  currency text not null check (currency in ('eur','usd')),
  state text not null default 'pending' check (state in ('pending','unpaid','paid')),
  checkout_id text unique check (checkout_id ~ '^[A-Za-z0-9_]{1,255}$'),
  payment_id text unique check (payment_id ~ '^[A-Za-z0-9_]{1,255}$'),
  paid_at timestamptz,
  release_evidence text check (release_evidence ~ '^[A-Za-z0-9_]{1,255}$'),
  check ((state = 'paid') = (paid_at is not null)),
  check (state <> 'paid' or payment_id is not null),
  check (state <> 'unpaid' or release_evidence is not null)
);

create table private.launch_arrivals (
  reservation_id uuid primary key references private.launch_reservations(id) on delete restrict,
  outcome text not null check (outcome in ('verified','no_show')),
  verified_at timestamptz,
  verified_by uuid references auth.users(id) on delete set null,
  method text check (method in ('qr','manual')),
  note text check (note is null or (private.valid_input_text(note,500,true) and note = private.trim_input(note))),
  check ((outcome = 'verified') = (verified_at is not null)),
  check ((outcome = 'verified') = (method is not null)),
  check (method is distinct from 'manual' or note is not null)
);

create table private.launch_refunds (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid not null unique references private.launch_payments(reservation_id) on delete restrict,
  amount_minor integer not null check (amount_minor between 1 and 99999999),
  currency text not null check (currency in ('eur','usd')),
  reason text not null check (reason in ('arrival','timely_cancellation','organizer','exception','unallocated_payment')),
  state text not null default 'queued' check (state in ('queued','pending','succeeded','failed','review_needed')),
  provider_refund_id text unique check (provider_refund_id ~ '^[A-Za-z0-9_]{1,255}$'),
  operation_id uuid not null unique default gen_random_uuid(),
  operation_claims integer not null default 0 check (operation_claims >= 0),
  attempts integer not null default 0 check (attempts >= operation_claims),
  lease_until timestamptz,
  claim_id uuid,
  last_error text check (last_error ~ '^[A-Za-z0-9_.-]{1,80}$'),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  check ((lease_until is null) = (claim_id is null)),
  check (lease_until is null or isfinite(lease_until)),
  check (state <> 'succeeded' or provider_refund_id is not null)
);
create index launch_refunds_work on private.launch_refunds(state,lease_until,created_at);

-- Bind every provider object to exactly one operation, including replaced ones.
-- A verified terminal failure keeps its complete snapshot and recovery evidence.
create table private.launch_refund_attempts (
  operation_id uuid primary key,
  refund_id uuid not null references private.launch_refunds(id) on delete restrict,
  provider_refund_id text not null unique check (provider_refund_id ~ '^[A-Za-z0-9_]{1,255}$'),
  failure_snapshot jsonb,
  evidence text check (evidence ~ '^[A-Za-z0-9_]{1,255}$'),
  verification_note text check (verification_note is null or
    (private.valid_input_text(verification_note,500,true) and verification_note = private.trim_input(verification_note))),
  verified_by uuid references auth.users(id) on delete set null,
  verified_at timestamptz,
  check ((failure_snapshot is null and evidence is null and verification_note is null and verified_at is null)
    or (failure_snapshot is not null and evidence is not null and verification_note is not null and verified_at is not null)),
  check (failure_snapshot is null or (jsonb_typeof(failure_snapshot) = 'object'
    and failure_snapshot->>'state' = 'failed'))
);
create index launch_refund_attempts_refund on private.launch_refund_attempts(refund_id);

create table private.launch_waitlist (
  id bigint generated always as identity primary key,
  night_id uuid not null references private.launch_events(night_id) on delete restrict,
  email text not null check (private.valid_marketing_email(email) and email = lower(private.trim_input(email) collate "C")),
  locale text not null check (locale in ('en','fr','es')),
  state text not null default 'waiting' check (state in ('waiting','contacted','closed')),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  unique(night_id,email)
);
create index launch_waitlist_order on private.launch_waitlist(night_id,id);

create table private.launch_audit (
  id bigint generated always as identity primary key,
  night_id uuid not null references private.launch_events(night_id) on delete restrict,
  reservation_id uuid references private.launch_reservations(id) on delete restrict,
  action text not null check (action ~ '^[a-z_]{1,60}$'),
  actor_id uuid references auth.users(id) on delete set null,
  detail jsonb not null default '{}'::jsonb check (jsonb_typeof(detail) = 'object' and octet_length(detail::text) <= 4096),
  created_at timestamptz not null default clock_timestamp()
);
create index launch_audit_night on private.launch_audit(night_id,id);

-- Pure boundary predicate also covers the exact inclusive deadline across DST.
create function private.launch_cancellation_refundable(p_start timestamptz,p_at timestamptz) returns boolean
language sql immutable strict set search_path = '' as $$
  select p_at <= p_start - interval '48 hours';
$$;

create function private.launch_secret_hash(p_secret text) returns bytea
language plpgsql immutable set search_path = '' as $$
begin
  if p_secret is null or p_secret !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid reservation credential' using errcode = '22023';
  end if;
  return sha256(convert_to(p_secret,'UTF8'));
end $$;

create function private.launch_lock(p_night uuid) returns void
language plpgsql set search_path = '' as $$
begin
  -- Same order as lifecycle: night, booking settings, reservation/payment rows.
  perform 1 from public.venue_nights where id = p_night for update;
  if not found then raise exception 'unknown venue night' using errcode = '22023'; end if;
  perform 1 from private.launch_events where night_id = p_night for update;
end $$;

create function private.launch_lock_reservation(p_id uuid) returns private.launch_reservations
language plpgsql set search_path = '' as $$
declare r private.launch_reservations;
begin
  select * into r from private.launch_reservations where id = p_id;
  if not found then raise exception 'reservation unavailable' using errcode = '22023'; end if;
  perform private.launch_lock(r.night_id);
  select * into r from private.launch_reservations where id = p_id for update;
  return r;
end $$;

create function private.launch_log(p_night uuid,p_id uuid,p_action text,p_detail jsonb default '{}') returns void
language sql set search_path = '' as $$
  insert into private.launch_audit(night_id,reservation_id,action,actor_id,detail)
  values(p_night,p_id,p_action,auth.uid(),p_detail);
$$;

create function private.launch_event_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare n public.venue_nights; used integer;
begin
  select * into n from public.venue_nights where id = new.night_id for update;
  if not found or new.registration_opens_at >= n.waiting_opens_at
    or not isfinite(n.waiting_opens_at) or not isfinite(n.closes_at) then
    raise exception 'invalid registration schedule' using errcode = '22023';
  end if;
  if tg_op = 'UPDATE' then
    if new.night_id <> old.night_id then raise exception 'immutable booking night'; end if;
    if clock_timestamp() >= old.registration_opens_at and
      (new.deposit_minor,new.currency,new.registration_opens_at,new.policy_version)
      is distinct from (old.deposit_minor,old.currency,old.registration_opens_at,old.policy_version) then
      raise exception 'registration terms are frozen';
    end if;
    if old.cancelled_at is not null and
      (new.cancelled_at,new.cancellation_reason) is distinct from (old.cancelled_at,old.cancellation_reason) then
      raise exception 'organizer cancellation is final';
    end if;
  end if;
  select count(*) into used from private.launch_reservations
    where night_id = new.night_id and state in ('holding','confirmed');
  if new.capacity < used then raise exception 'quota below allocated places' using errcode = '23514'; end if;
  return new;
end $$;
create trigger launch_event_guard before insert or update on private.launch_events
  for each row execute function private.launch_event_guard();

create function private.launch_allocation_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare quota integer; used integer;
begin
  perform private.launch_lock(new.night_id);
  if tg_op = 'UPDATE' and (new.id,new.night_id,new.created_at,new.hold_until,new.accepted_at,new.policy_version,new.late_cancellation_acknowledged)
    is distinct from (old.id,old.night_id,old.created_at,old.hold_until,old.accepted_at,old.policy_version,old.late_cancellation_acknowledged) then
    raise exception 'immutable reservation attempt';
  end if;
  if tg_op = 'UPDATE' and old.state in ('cancelled','expired') and new.state <> old.state then
    raise exception 'terminal reservation cannot be revived';
  end if;
  if new.state in ('holding','confirmed') then
    select capacity into quota from private.launch_events where night_id = new.night_id;
    select count(*) into used from private.launch_reservations
      where night_id = new.night_id and id <> new.id and state in ('holding','confirmed');
    if used >= quota then raise exception 'event full' using errcode = '23514'; end if;
  end if;
  return new;
end $$;
create trigger launch_allocation_guard before insert or update on private.launch_reservations
  for each row execute function private.launch_allocation_guard();

-- Preserve money snapshots even if a future privileged writer bypasses RPCs.
create function private.launch_payment_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if not exists(select 1 from private.launch_reservations r join private.launch_events e on e.night_id = r.night_id
      where r.id = new.reservation_id and (e.deposit_minor,e.currency) = (new.amount_minor,new.currency)) then
      raise exception 'payment must snapshot event price';
    end if;
  else
    if (new.reservation_id,new.amount_minor,new.currency) is distinct from (old.reservation_id,old.amount_minor,old.currency)
      or (old.checkout_id is not null and new.checkout_id is distinct from old.checkout_id)
      or (old.payment_id is not null and new.payment_id is distinct from old.payment_id)
      or (old.paid_at is not null and new.paid_at is distinct from old.paid_at)
      or (old.release_evidence is not null and new.release_evidence is distinct from old.release_evidence)
      or (old.state = 'paid' and new.state <> 'paid') or (old.state = 'unpaid' and new.state = 'pending') then
      raise exception 'immutable payment history';
    end if;
  end if;
  return new;
end $$;
create trigger launch_payment_guard before insert or update on private.launch_payments
  for each row execute function private.launch_payment_guard();

create function private.launch_refund_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not exists(select 1 from private.launch_payments where reservation_id = new.reservation_id
    and state = 'paid' and (amount_minor,currency) = (new.amount_minor,new.currency)) then
    raise exception 'refund must equal paid deposit';
  end if;
  if tg_op = 'UPDATE' and (
    (new.id,new.reservation_id,new.amount_minor,new.currency,new.reason,new.created_at)
      is distinct from (old.id,old.reservation_id,old.amount_minor,old.currency,old.reason,old.created_at)
    or (new.operation_id = old.operation_id and old.provider_refund_id is not null and new.provider_refund_id is distinct from old.provider_refund_id)
    or (old.state = 'succeeded' and new.state <> 'succeeded')) then
    raise exception 'immutable refund history';
  end if;
  if tg_op = 'UPDATE' and new.operation_id <> old.operation_id then
    if old.state <> 'failed' or old.provider_refund_id is null or new.state <> 'queued'
      or new.provider_refund_id is not null or new.claim_id is not null or new.lease_until is not null
      or new.operation_claims <> 0 or new.attempts <> old.attempts
      or not exists(select 1 from private.launch_refund_attempts where operation_id = old.operation_id
        and refund_id = old.id and provider_refund_id = old.provider_refund_id and failure_snapshot = to_jsonb(old)) then
      raise exception 'verified terminal failure required for replacement';
    end if;
  end if;
  if new.provider_refund_id is not null then
    insert into private.launch_refund_attempts(operation_id,refund_id,provider_refund_id)
      values(new.operation_id,new.id,new.provider_refund_id) on conflict(operation_id) do nothing;
    if not exists(select 1 from private.launch_refund_attempts where operation_id = new.operation_id
      and refund_id = new.id and provider_refund_id = new.provider_refund_id) then
      raise exception 'immutable refund provider binding';
    end if;
  end if;
  return new;
end $$;
create trigger launch_refund_guard before insert or update on private.launch_refunds
  for each row execute function private.launch_refund_guard();

create function private.launch_queue_refund(p_id uuid,p_reason text) returns void
language plpgsql set search_path = '' as $$
declare inserted_id uuid; n uuid;
begin
  insert into private.launch_refunds(reservation_id,amount_minor,currency,reason)
  select reservation_id,amount_minor,currency,p_reason from private.launch_payments
  where reservation_id = p_id and state = 'paid'
  on conflict(reservation_id) do nothing returning id into inserted_id;
  if inserted_id is not null then
    select night_id into n from private.launch_reservations where id = p_id;
    perform private.launch_log(n,p_id,'refund_queued',jsonb_build_object('refund_id',inserted_id,'reason',p_reason));
  end if;
end $$;

create function private.launch_cancel_event(p_night uuid,p_reason text) returns void
language plpgsql set search_path = '' as $$
declare r private.launch_reservations;
begin
  perform private.launch_lock(p_night);
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

create function private.launch_night_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare e private.launch_events;
begin
  select * into e from private.launch_events where night_id = old.id;
  if not found then return new; end if;
  if new.venue_id <> old.venue_id or
    (clock_timestamp() >= e.registration_opens_at and
      (new.waiting_opens_at,new.guaranteed_launch_at,new.closes_at) is distinct from
      (old.waiting_opens_at,old.guaranteed_launch_at,old.closes_at)) then
    raise exception 'booking schedule is frozen; cancel or postpone and create a new night';
  end if;
  if new.waiting_opens_at <= e.registration_opens_at then raise exception 'invalid registration schedule'; end if;
  return new;
end $$;
create trigger launch_night_guard before update on public.venue_nights
  for each row execute function private.launch_night_guard();

create function private.launch_night_cancelled() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.terminal_reason = 'cancelled' and old.terminal_reason is distinct from 'cancelled' then
    perform private.launch_cancel_event(new.id,'cancelled');
  end if;
  return new;
end $$;
create trigger launch_night_cancelled after update on public.venue_nights
  for each row execute function private.launch_night_cancelled();

create function public.admin_configure_launch_event(p_night uuid,p_opens timestamptz,p_capacity integer,p_amount integer,p_currency text,p_policy text)
returns void language plpgsql security definer set search_path = '' as $$
declare n public.venue_nights;
begin
  if not private.is_admin() then raise exception 'not authorized' using errcode = '42501'; end if;
  perform private.launch_lock(p_night);
  select * into n from public.venue_nights where id = p_night;
  if n.terminal_at is not null or clock_timestamp() >= n.waiting_opens_at then raise exception 'registration closed'; end if;
  if not exists(select 1 from private.launch_events where night_id = p_night) and
    (p_opens is null or p_opens < clock_timestamp()) then raise exception 'opening must not be in the past'; end if;
  if exists(select 1 from private.launch_events where night_id = p_night and
    (registration_opens_at,capacity,deposit_minor,currency,policy_version) = (p_opens,p_capacity,p_amount,p_currency,p_policy)) then return; end if;
  insert into private.launch_events(night_id,registration_opens_at,capacity,deposit_minor,currency,policy_version)
  values(p_night,p_opens,p_capacity,p_amount,p_currency,p_policy)
  on conflict(night_id) do update set registration_opens_at = excluded.registration_opens_at,
    capacity = excluded.capacity,deposit_minor = excluded.deposit_minor,currency = excluded.currency,policy_version = excluded.policy_version;
  perform private.launch_log(p_night,null,'configured',jsonb_build_object('opens',p_opens,'capacity',p_capacity,'amount',p_amount,'currency',p_currency,'policy',p_policy));
end $$;

create function public.launch_event_availability(p_night uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare result jsonb;
begin
  select jsonb_build_object('night_id',e.night_id,'venue_id',n.venue_id,'timezone',v.timezone,'opens_at',e.registration_opens_at,'starts_at',n.waiting_opens_at,
    'ends_at',n.closes_at,'cancellation_deadline',n.waiting_opens_at - interval '48 hours',
    'amount_minor',e.deposit_minor,'currency',e.currency,'policy_version',e.policy_version,
    'available',greatest(0,e.capacity - (select count(*) from private.launch_reservations r where r.night_id = e.night_id and r.state in ('holding','confirmed'))),
    'registration_open',clock_timestamp() >= e.registration_opens_at and clock_timestamp() < n.waiting_opens_at and n.terminal_at is null and e.cancelled_at is null)
  into result from private.launch_events e join public.venue_nights n on n.id = e.night_id join public.venues v on v.id = n.venue_id where e.night_id = p_night;
  if result is null then raise exception 'booking event unavailable'; end if;
  return result;
end $$;

create function private.launch_projection(p_id uuid) returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object('id',r.id,'night_id',r.night_id,'email',r.email,'first_name',r.first_name,'locale',r.locale,
    'state',r.state,'hold_until',r.hold_until,'policy_version',r.policy_version,'accepted_at',r.accepted_at,
    'starts_at',n.waiting_opens_at,'ends_at',n.closes_at,'cancellation_deadline',n.waiting_opens_at - interval '48 hours',
    'cancelled_at',r.cancelled_at,'cancellation_refundable',r.cancellation_refundable,
    'amount_minor',p.amount_minor,'currency',p.currency,'payment_state',p.state,
    'arrival',a.outcome,'verified_at',a.verified_at,'refund_state',f.state)
  from private.launch_reservations r join public.venue_nights n on n.id = r.night_id
  join private.launch_payments p on p.reservation_id = r.id
  left join private.launch_arrivals a on a.reservation_id = r.id
  left join private.launch_refunds f on f.reservation_id = r.id where r.id = p_id;
$$;

create function private.launch_authorize(p_id uuid,p_secret text) returns void
language plpgsql set search_path = '' as $$
begin
  if not exists(select 1 from private.launch_credentials where reservation_id = p_id
    and management_hash = private.launch_secret_hash(p_secret) and management_expires_at > clock_timestamp()) then
    raise exception 'reservation access denied' using errcode = '42501';
  end if;
end $$;

-- Service facade generates independent 32-byte cryptographic secrets. The raw
-- management secret goes only to the initiating browser / booking email, never
-- to someone merely typing an already-used email. Hashes are persisted only.
create function public.create_launch_reservation(p_id uuid,p_night uuid,p_email text,p_name text,p_locale text,
  p_policy text,p_late_ack boolean,p_hold_until timestamptz,p_management_secret text,p_arrival_secret text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare r private.launch_reservations; e private.launch_events; n public.venue_nights;
  email_value text; name_value text; management bytea; arrival bytea; t timestamptz;
begin
  if p_id is null or not private.valid_marketing_email(p_email) or not private.valid_input_text(p_name,30,true)
    or p_locale is null or p_locale not in ('en','fr','es') or p_late_ack is null then raise exception 'invalid reservation input' using errcode = '22023'; end if;
  email_value := lower(private.trim_input(p_email) collate "C"); name_value := private.trim_input(p_name);
  management := private.launch_secret_hash(p_management_secret); arrival := private.launch_secret_hash(p_arrival_secret);
  if management = arrival then raise exception 'credentials must differ'; end if;
  perform private.launch_lock(p_night);
  select * into r from private.launch_reservations where id = p_id;
  if found then
    if (r.night_id,r.email,r.first_name,r.locale,r.policy_version,r.late_cancellation_acknowledged,r.hold_until)
      is distinct from (p_night,email_value,name_value,p_locale,p_policy,p_late_ack,p_hold_until) then raise exception 'reservation identifier reused'; end if;
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
  if e.night_id is null or e.cancelled_at is not null or n.terminal_at is not null or t < e.registration_opens_at or t >= n.waiting_opens_at then raise exception 'registration closed'; end if;
  if p_policy is distinct from e.policy_version then raise exception 'reservation policy acceptance required'; end if;
  if not private.launch_cancellation_refundable(n.waiting_opens_at,t) and not p_late_ack then raise exception 'late cancellation acknowledgement required'; end if;
  if p_hold_until is null or not isfinite(p_hold_until) or p_hold_until <= t or p_hold_until > n.waiting_opens_at then raise exception 'invalid payment hold deadline'; end if;
  insert into private.launch_reservations(id,night_id,email,first_name,locale,policy_version,late_cancellation_acknowledged,hold_until,created_at,accepted_at)
    values(p_id,p_night,email_value,name_value,p_locale,p_policy,p_late_ack,p_hold_until,t,t);
  insert into private.launch_credentials values(p_id,management,t + interval '168 hours',arrival,null);
  insert into private.launch_payments(reservation_id,amount_minor,currency) values(p_id,e.deposit_minor,e.currency);
  perform private.launch_log(p_night,p_id,'hold_created');
  return private.launch_projection(p_id);
end $$;

create function public.get_launch_reservation(p_id uuid,p_secret text) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  perform private.launch_authorize(p_id,p_secret);
  return private.launch_projection(p_id);
end $$;

create function public.bind_launch_checkout(p_id uuid,p_checkout text) returns void
language plpgsql security definer set search_path = '' as $$
declare r private.launch_reservations; p private.launch_payments;
begin
  r := private.launch_lock_reservation(p_id);
  if p_checkout is null or p_checkout !~ '^[A-Za-z0-9_]{1,255}$' then raise exception 'invalid checkout reference'; end if;
  select * into p from private.launch_payments where reservation_id = p_id;
  if p.checkout_id = p_checkout then return; end if;
  -- A provider creation may finish after guest cancellation. Bind that same
  -- attempt for reconciliation without reopening it or permitting a new charge.
  if p.checkout_id is not null or p.state <> 'pending' then raise exception 'checkout cannot be replaced'; end if;
  update private.launch_payments set checkout_id = p_checkout where reservation_id = p_id;
  perform private.launch_log(r.night_id,p_id,'checkout_bound');
end $$;

-- Only #185 may assert provider terminal-unpaid evidence. Clock expiry alone is
-- deliberately insufficient. A success received afterward is recorded/refunded.
create function public.release_launch_hold(p_id uuid,p_checkout text,p_evidence text) returns void
language plpgsql security definer set search_path = '' as $$
declare r private.launch_reservations; p private.launch_payments;
begin
  r := private.launch_lock_reservation(p_id);
  select * into p from private.launch_payments where reservation_id = p_id;
  if p_evidence is null or p_evidence !~ '^[A-Za-z0-9_]{1,255}$' or p_checkout is distinct from p.checkout_id or p_checkout is null then raise exception 'verified checkout evidence required'; end if;
  if p.state <> 'pending' then return; end if;
  update private.launch_payments set state = 'unpaid',release_evidence = p_evidence where reservation_id = p_id;
  if r.state = 'holding' then
    update private.launch_reservations set state = 'expired',expired_at = clock_timestamp() where id = p_id;
    update private.launch_credentials set arrival_revoked_at = clock_timestamp() where reservation_id = p_id;
  end if;
  perform private.launch_log(r.night_id,p_id,'hold_released',jsonb_build_object('evidence',p_evidence));
end $$;

create function public.record_launch_payment(p_id uuid,p_checkout text,p_payment text,p_amount integer,p_currency text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r private.launch_reservations; p private.launch_payments; e private.launch_events; n public.venue_nights;
begin
  r := private.launch_lock_reservation(p_id);
  select * into p from private.launch_payments where reservation_id = p_id;
  if p_checkout is null or p_checkout is distinct from p.checkout_id or p_payment is null or p_payment !~ '^[A-Za-z0-9_]{1,255}$'
    or p_amount is distinct from p.amount_minor or p_currency is distinct from p.currency then raise exception 'payment evidence mismatch'; end if;
  if p.state = 'paid' then
    if p.payment_id <> p_payment then raise exception 'payment identifier mismatch'; end if;
    return private.launch_projection(p_id);
  end if;
  select * into e from private.launch_events where night_id = r.night_id;
  select * into n from public.venue_nights where id = r.night_id;
  update private.launch_payments set state = 'paid',payment_id = p_payment,paid_at = clock_timestamp() where reservation_id = p_id;
  -- The hold remains allocated beyond its advisory deadline until reconciliation.
  -- A delayed webhook during the night can still consume that existing hold.
  if r.state = 'holding' and e.cancelled_at is null and n.terminal_at is null and clock_timestamp() < n.closes_at then
    update private.launch_reservations set state = 'confirmed',confirmed_at = clock_timestamp() where id = p_id;
  else
    if r.state = 'holding' then
      update private.launch_reservations set state = 'expired',expired_at = clock_timestamp() where id = p_id;
      update private.launch_credentials set arrival_revoked_at = clock_timestamp() where reservation_id = p_id;
    end if;
    perform private.launch_queue_refund(p_id,'unallocated_payment');
  end if;
  perform private.launch_log(r.night_id,p_id,'payment_recorded');
  return private.launch_projection(p_id);
end $$;

create function public.cancel_launch_reservation(p_id uuid,p_secret text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r private.launch_reservations; refundable boolean; n public.venue_nights; t timestamptz;
begin
  r := private.launch_lock_reservation(p_id);
  perform private.launch_authorize(p_id,p_secret);
  if r.state in ('cancelled','expired') then return private.launch_projection(p_id); end if;
  select * into n from public.venue_nights where id = r.night_id;
  t := clock_timestamp();
  if t >= n.closes_at or exists(select 1 from private.launch_arrivals where reservation_id = p_id) then raise exception 'reservation can no longer be cancelled'; end if;
  refundable := private.launch_cancellation_refundable(n.waiting_opens_at,t);
  update private.launch_reservations set state = 'cancelled',cancelled_at = t,cancellation_refundable = refundable where id = p_id;
  update private.launch_credentials set arrival_revoked_at = coalesce(arrival_revoked_at,clock_timestamp()) where reservation_id = p_id;
  if refundable then perform private.launch_queue_refund(p_id,'timely_cancellation'); end if;
  perform private.launch_log(r.night_id,p_id,'participant_cancelled',jsonb_build_object('refundable',refundable));
  return private.launch_projection(p_id);
end $$;

-- This command is an email-delivery handoff, NOT a browser response. Delivery
-- goes only to the returned stored address. #189 owns the retryable outbox.
create function public.renew_launch_access(p_id uuid,p_secret text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r private.launch_reservations; h bytea;
begin
  h := private.launch_secret_hash(p_secret); r := private.launch_lock_reservation(p_id);
  update private.launch_credentials set management_hash = h,management_expires_at = clock_timestamp() + interval '168 hours'
    where reservation_id = p_id and management_hash <> h;
  if found then perform private.launch_log(r.night_id,p_id,'access_renewed'); end if;
  return jsonb_build_object('reservation_id',p_id,'recipient_email',r.email,'locale',r.locale);
end $$;

create function public.find_launch_reservations_for_delivery(p_night uuid,p_email text) returns table(reservation_id uuid)
language plpgsql security definer set search_path = '' as $$
begin
  if p_night is null or not private.valid_marketing_email(p_email) then raise exception 'invalid recovery input'; end if;
  return query select id from private.launch_reservations where night_id = p_night
    and email = lower(private.trim_input(p_email) collate "C") order by created_at desc,id;
end $$;

create function public.admin_launch_reservation(p_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_admin() then raise exception 'not authorized' using errcode = '42501'; end if;
  return private.launch_projection(p_id) || jsonb_build_object('payment',
    (select to_jsonb(p) from private.launch_payments p where reservation_id = p_id),'refund',
    (select to_jsonb(f) - 'claim_id' from private.launch_refunds f where reservation_id = p_id),
    'failed_refund_attempts',(select coalesce(jsonb_agg(to_jsonb(a) - 'failure_snapshot' ||
      jsonb_build_object('failure_snapshot',a.failure_snapshot - 'claim_id') order by a.verified_at),'[]')
      from private.launch_refund_attempts a join private.launch_refunds f on f.id = a.refund_id
      where f.reservation_id = p_id and a.failure_snapshot is not null));
end $$;

create function public.admin_lookup_launch_arrival(p_secret text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r uuid;
begin
  if not private.is_admin() then raise exception 'not authorized' using errcode = '42501'; end if;
  select c.reservation_id into r from private.launch_credentials c join private.launch_reservations b on b.id = c.reservation_id
    where c.arrival_hash = private.launch_secret_hash(p_secret) and c.arrival_revoked_at is null and b.state = 'confirmed';
  if r is null then raise exception 'arrival credential unavailable'; end if;
  return private.launch_projection(r);
end $$;

create function public.admin_verify_launch_arrival(p_id uuid,p_method text,p_note text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r private.launch_reservations; n public.venue_nights; t timestamptz;
begin
  if not private.is_admin() then raise exception 'not authorized' using errcode = '42501'; end if;
  if p_method is null or p_method not in ('qr','manual') or not private.valid_input_text(p_note,500,p_method = 'manual') then raise exception 'invalid arrival verification'; end if;
  r := private.launch_lock_reservation(p_id);
  if exists(select 1 from private.launch_arrivals where reservation_id = p_id and outcome = 'verified') then return private.launch_projection(p_id); end if;
  select * into n from public.venue_nights where id = r.night_id;
  t := clock_timestamp();
  if r.state <> 'confirmed' or n.terminal_at is not null or t < n.waiting_opens_at or t >= n.closes_at then raise exception 'arrival outside scheduled event'; end if;
  insert into private.launch_arrivals(reservation_id,outcome,verified_at,verified_by,method,note)
    values(p_id,'verified',t,auth.uid(),p_method,nullif(private.trim_input(p_note),''));
  perform private.launch_queue_refund(p_id,'arrival');
  perform private.launch_log(r.night_id,p_id,'arrival_verified',jsonb_build_object('method',p_method));
  return private.launch_projection(p_id);
end $$;

create function public.finalize_launch_no_shows(p_night uuid) returns integer
language plpgsql security definer set search_path = '' as $$
declare total integer;
begin
  perform private.launch_lock(p_night);
  if not exists(select 1 from public.venue_nights where id = p_night and clock_timestamp() >= closes_at) then raise exception 'event has not ended'; end if;
  insert into private.launch_arrivals(reservation_id,outcome)
    select id,'no_show' from private.launch_reservations where night_id = p_night and state = 'confirmed'
    on conflict(reservation_id) do nothing;
  get diagnostics total = row_count;
  if total > 0 then perform private.launch_log(p_night,null,'no_shows_finalized',jsonb_build_object('count',total)); end if;
  return total;
end $$;

create function public.admin_cancel_launch_event(p_night uuid,p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_admin() then raise exception 'not authorized' using errcode = '42501'; end if;
  if p_reason is null or p_reason not in ('cancelled','postponed') then raise exception 'invalid cancellation reason'; end if;
  -- Acquire the established eligibility barrier before the night lock.
  perform private.lock_like_eligibility();
  perform private.launch_cancel_event(p_night,p_reason);
  perform private.transition_venue_night(p_night,'cancelled',p_reason,auth.uid());
end $$;

create function public.admin_refund_launch_reservation(p_id uuid,p_note text) returns void
language plpgsql security definer set search_path = '' as $$
declare r private.launch_reservations;
begin
  if not private.is_admin() then raise exception 'not authorized' using errcode = '42501'; end if;
  if not private.valid_input_text(p_note,500,true) then raise exception 'verification note required'; end if;
  r := private.launch_lock_reservation(p_id);
  if not exists(select 1 from private.launch_payments where reservation_id = p_id and state = 'paid') then raise exception 'paid deposit required'; end if;
  if exists(select 1 from private.launch_refunds where reservation_id = p_id) then return; end if;
  perform private.launch_queue_refund(p_id,'exception');
  perform private.launch_log(r.night_id,p_id,'exception_approved',jsonb_build_object('note',private.trim_input(p_note)));
end $$;

create function public.admin_correct_launch_email(p_id uuid,p_email text,p_note text) returns void
language plpgsql security definer set search_path = '' as $$
declare r private.launch_reservations; email_value text;
begin
  if not private.is_admin() then raise exception 'not authorized' using errcode = '42501'; end if;
  if not private.valid_marketing_email(p_email) or not private.valid_input_text(p_note,500,true) then raise exception 'verified support correction required'; end if;
  r := private.launch_lock_reservation(p_id); email_value := lower(private.trim_input(p_email) collate "C");
  if r.email = email_value then return; end if;
  if not exists(select 1 from private.launch_payments where reservation_id = p_id and state = 'paid') then raise exception 'verify paid reservation first'; end if;
  update private.launch_reservations set email = email_value where id = p_id;
  update private.launch_credentials set management_expires_at = clock_timestamp() where reservation_id = p_id;
  perform private.launch_log(r.night_id,p_id,'email_corrected',jsonb_build_object('note',private.trim_input(p_note)));
end $$;

create function public.join_launch_waitlist(p_night uuid,p_email text,p_locale text) returns void
language plpgsql security definer set search_path = '' as $$
declare inserted_id bigint;
begin
  if not private.valid_marketing_email(p_email) or p_locale is null or p_locale not in ('en','fr','es') then raise exception 'invalid waitlist input'; end if;
  perform private.launch_lock(p_night);
  if not exists(select 1 from private.launch_events e join public.venue_nights n on n.id = e.night_id
    where e.night_id = p_night and e.cancelled_at is null and n.terminal_at is null
    and clock_timestamp() >= e.registration_opens_at and clock_timestamp() < n.waiting_opens_at
    and e.capacity <= (select count(*) from private.launch_reservations where night_id = p_night and state in ('holding','confirmed'))) then raise exception 'waitlist unavailable'; end if;
  insert into private.launch_waitlist(night_id,email,locale) values(p_night,lower(private.trim_input(p_email) collate "C"),p_locale)
    on conflict(night_id,email) do nothing returning id into inserted_id;
  if inserted_id is not null then perform private.launch_log(p_night,null,'waitlist_joined',jsonb_build_object('waitlist_id',inserted_id)); end if;
end $$;

create function public.admin_update_launch_waitlist(p_id bigint,p_state text) returns void
language plpgsql security definer set search_path = '' as $$
declare n uuid;
begin
  if not private.is_admin() then raise exception 'not authorized' using errcode = '42501'; end if;
  if p_state is null or p_state not in ('waiting','contacted','closed') then raise exception 'invalid waitlist state'; end if;
  select night_id into n from private.launch_waitlist where id = p_id;
  if n is null then raise exception 'unknown waitlist entry'; end if;
  perform private.launch_lock(n);
  update private.launch_waitlist set state = p_state,updated_at = clock_timestamp() where id = p_id and state <> p_state;
  if found then perform private.launch_log(n,null,'waitlist_updated',jsonb_build_object('waitlist_id',p_id,'state',p_state)); end if;
end $$;

create function public.admin_launch_reservations(p_night uuid,p_after uuid default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare result jsonb;
begin
  if not private.is_admin() then raise exception 'not authorized' using errcode = '42501'; end if;
  if p_night is null then raise exception 'night required'; end if;
  select coalesce(jsonb_agg(private.launch_projection(t.id) order by t.id),'[]') into result
  from (select id from private.launch_reservations where night_id = p_night and (p_after is null or id > p_after) order by id limit 100) t;
  return result;
end $$;

-- Paginated founder projections; hashes and raw secrets stay private.
create function public.admin_launch_list(p_night uuid,p_kind text,p_after bigint default 0) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare result jsonb;
begin
  if not private.is_admin() then raise exception 'not authorized' using errcode = '42501'; end if;
  if p_after is null or p_after < 0 or p_kind is null or p_kind not in ('waitlist','audit') then raise exception 'invalid list cursor'; end if;
  if p_kind = 'waitlist' then
    select coalesce(jsonb_agg(to_jsonb(t) order by t.id),'[]') into result from
      (select id,email,locale,state,created_at from private.launch_waitlist where night_id = p_night and id > p_after order by id limit 100) t;
  else
    select coalesce(jsonb_agg(to_jsonb(t) order by t.id),'[]') into result from
      (select id,reservation_id,action,actor_id,detail,created_at from private.launch_audit where night_id = p_night and id > p_after order by id limit 100) t;
  end if;
  return result;
end $$;

-- The operation UUID is stable across uncertain retries. Only verified terminal
-- failure permits a replacement operation under the same refund obligation.
create function public.claim_launch_refund(p_lease_seconds integer default 60) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare f private.launch_refunds; claim uuid := gen_random_uuid();
begin
  if p_lease_seconds is null or p_lease_seconds not between 10 and 300 then raise exception 'invalid refund lease'; end if;
  select * into f from private.launch_refunds where state in ('queued','pending') and (lease_until is null or lease_until <= clock_timestamp())
    order by created_at,id for update skip locked limit 1;
  if not found then return null; end if;
  update private.launch_refunds set state = 'pending',attempts = attempts + 1,operation_claims = operation_claims + 1,claim_id = claim,
    lease_until = clock_timestamp() + make_interval(secs => p_lease_seconds),updated_at = clock_timestamp() where id = f.id;
  return jsonb_build_object('id',f.id,'reservation_id',f.reservation_id,'claim_id',claim,'amount_minor',f.amount_minor,'currency',f.currency,
    'payment_id',(select payment_id from private.launch_payments where reservation_id = f.reservation_id),
    'provider_refund_id',f.provider_refund_id,'operation_id',f.operation_id,'reconcile_first',f.operation_claims > 0);
end $$;

create function public.complete_launch_refund(p_id uuid,p_claim uuid,p_state text,p_provider_id text,p_error text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare f private.launch_refunds; r private.launch_reservations;
begin
  if p_claim is null or p_state is null or p_state not in ('pending','succeeded','failed','review_needed')
    or (p_provider_id is not null and p_provider_id !~ '^[A-Za-z0-9_]{1,255}$')
    or (p_state = 'succeeded' and p_provider_id is null)
    or (p_error is not null and p_error !~ '^[A-Za-z0-9_.-]{1,80}$') then raise exception 'invalid refund outcome'; end if;
  select * into f from private.launch_refunds where id = p_id;
  if not found then raise exception 'unknown refund'; end if;
  r := private.launch_lock_reservation(f.reservation_id);
  select * into f from private.launch_refunds where id = p_id for update;
  if f.provider_refund_id is not null and p_provider_id is distinct from f.provider_refund_id then raise exception 'refund provider identifier mismatch'; end if;
  if f.state = 'succeeded' then return; end if;
  if p_claim is distinct from f.claim_id or f.lease_until <= clock_timestamp() then raise exception 'stale refund claim'; end if;
  if (f.state,f.provider_refund_id,f.last_error) is not distinct from (p_state,p_provider_id,p_error) then return; end if;
  if f.state <> 'pending' then raise exception 'refund requires reconciliation and a new claim'; end if;
  update private.launch_refunds set state = p_state,provider_refund_id = coalesce(provider_refund_id,p_provider_id),last_error = p_error,
    updated_at = clock_timestamp() where id = p_id;
  perform private.launch_log(r.night_id,r.id,'refund_outcome',jsonb_build_object('refund_id',p_id,'operation_id',f.operation_id,'provider_refund_id',p_provider_id,'state',p_state,'error',p_error));
end $$;

create function public.admin_retry_launch_refund(p_id uuid,p_note text) returns void
language plpgsql security definer set search_path = '' as $$
declare f private.launch_refunds; r private.launch_reservations;
begin
  if not private.is_admin() then raise exception 'not authorized' using errcode = '42501'; end if;
  if not private.valid_input_text(p_note,500,true) then raise exception 'reconciliation note required'; end if;
  select * into f from private.launch_refunds where id = p_id;
  if not found then raise exception 'unknown refund'; end if;
  r := private.launch_lock_reservation(f.reservation_id);
  select * into f from private.launch_refunds where id = p_id for update;
  if f.state not in ('failed','review_needed') then return; end if;
  update private.launch_refunds set state = 'queued',lease_until = null,claim_id = null,updated_at = clock_timestamp() where id = p_id;
  perform private.launch_log(r.night_id,r.id,'refund_retry',jsonb_build_object('refund_id',p_id,'note',private.trim_input(p_note)));
end $$;

-- Explicit founder attestation: the identified provider refund is terminally
-- failed, funds are returned and a replacement is permitted. Never use for an
-- unknown network result. Expected operation identity makes retries harmless.
create function public.admin_replace_failed_launch_refund(
  p_id uuid,p_operation uuid,p_provider_id text,p_evidence text,p_note text
) returns void language plpgsql security definer set search_path = '' as $$
declare f private.launch_refunds; r private.launch_reservations; replacement uuid := gen_random_uuid();
begin
  if not private.is_admin() then raise exception 'not authorized' using errcode = '42501'; end if;
  if p_operation is null or p_provider_id is null or p_provider_id !~ '^[A-Za-z0-9_]{1,255}$'
    or p_evidence is null or p_evidence !~ '^[A-Za-z0-9_]{1,255}$'
    or not private.valid_input_text(p_note,500,true) then raise exception 'terminal failure verification required'; end if;
  select * into f from private.launch_refunds where id = p_id;
  if not found then raise exception 'unknown refund'; end if;
  r := private.launch_lock_reservation(f.reservation_id);
  select * into f from private.launch_refunds where id = p_id for update;
  if p_operation <> f.operation_id then
    if exists(select 1 from private.launch_refund_attempts where operation_id = p_operation and refund_id = p_id
      and provider_refund_id = p_provider_id and evidence = p_evidence and verification_note = private.trim_input(p_note)) then return; end if;
    raise exception 'stale refund operation';
  end if;
  if f.state <> 'failed' or f.provider_refund_id is distinct from p_provider_id then
    raise exception 'verified terminal failure required for replacement';
  end if;
  update private.launch_refund_attempts set failure_snapshot = to_jsonb(f),evidence = p_evidence,
    verification_note = private.trim_input(p_note),verified_by = auth.uid(),verified_at = clock_timestamp()
    where operation_id = p_operation and refund_id = p_id and failure_snapshot is null;
  if not found then raise exception 'refund attempt history unavailable'; end if;
  update private.launch_refunds set operation_id = replacement,operation_claims = 0,state = 'queued',
    provider_refund_id = null,claim_id = null,lease_until = null,last_error = null,updated_at = clock_timestamp() where id = p_id;
  perform private.launch_log(r.night_id,r.id,'refund_replacement',jsonb_build_object('refund_id',p_id,
    'failed_operation_id',p_operation,'operation_id',replacement,'provider_refund_id',p_provider_id,'evidence',p_evidence));
end $$;

-- Revoke Supabase's potentially broad default privileges explicitly. RLS without
-- grants is intentional: guest ownership is checked by the service-only facade,
-- founder authorization by auth.uid()/private.is_admin() inside founder RPCs.
do $$
declare obj record;
begin
  for obj in select c.oid::regclass as name from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'private' and c.relname like 'launch_%' and c.relkind = 'r' loop
    execute format('alter table %s enable row level security',obj.name);
    execute format('revoke all on %s from public, anon, authenticated, service_role',obj.name);
  end loop;
  for obj in select c.oid::regclass as name from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'private' and c.relname like 'launch_%' and c.relkind = 'S' loop
    execute format('revoke all on sequence %s from public, anon, authenticated, service_role',obj.name);
  end loop;
  for obj in select p.oid::regprocedure as name,n.nspname,p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where (n.nspname = 'private' and p.proname like 'launch_%')
      or (n.nspname = 'public' and p.proname ~ '^(admin_.*launch|create_launch|launch_event|get_launch|bind_launch|release_launch|record_launch|cancel_launch|renew_launch|find_launch|finalize_launch|join_launch|claim_launch|complete_launch)') loop
    execute format('revoke all on function %s from public, anon, authenticated, service_role',obj.name);
    if obj.nspname = 'public' then
      if obj.proname like 'admin_%' then
        execute format('grant execute on function %s to authenticated',obj.name);
      else
        execute format('grant execute on function %s to service_role',obj.name);
      end if;
    end if;
  end loop;
end $$;
