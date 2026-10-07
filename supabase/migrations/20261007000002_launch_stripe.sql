-- #185. Prepared locally; applying this behavioral migration requires founder approval.
-- Refuse an incompatible later deployment instead of silently rewriting frozen terms.
do $$ begin
 if exists(select 1 from private.launch_events e join public.venue_nights n on n.id=e.night_id
   where e.registration_opens_at >= n.waiting_opens_at - interval '30 minutes') then
   raise exception 'launch booking openings require review before cutoff migration';
 end if;
end $$;


create or replace function private.launch_event_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare n public.venue_nights; used integer;
begin
  select * into n from public.venue_nights where id = new.night_id for update;
  if not found or new.registration_opens_at >= n.waiting_opens_at - interval '30 minutes'
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

create or replace function private.launch_night_guard() returns trigger
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
  if new.waiting_opens_at - interval '30 minutes' <= e.registration_opens_at then raise exception 'invalid registration schedule'; end if;
  return new;
end $$;

create or replace function public.create_launch_reservation(p_id uuid,p_night uuid,p_email text,p_name text,p_locale text,
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
  if e.night_id is null or e.cancelled_at is not null or n.terminal_at is not null or t < e.registration_opens_at or t >= n.waiting_opens_at - interval '30 minutes' then raise exception 'registration closed'; end if;
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

create or replace function public.join_launch_waitlist(p_night uuid,p_email text,p_locale text) returns void
language plpgsql security definer set search_path = '' as $$
declare inserted_id bigint;
begin
  if not private.valid_marketing_email(p_email) or p_locale is null or p_locale not in ('en','fr','es') then raise exception 'invalid waitlist input'; end if;
  perform private.launch_lock(p_night);
  if not exists(select 1 from private.launch_events e join public.venue_nights n on n.id = e.night_id
    where e.night_id = p_night and e.cancelled_at is null and n.terminal_at is null
    and clock_timestamp() >= e.registration_opens_at and clock_timestamp() < n.waiting_opens_at - interval '30 minutes'
    and e.capacity <= (select count(*) from private.launch_reservations where night_id = p_night and state in ('holding','confirmed'))) then raise exception 'waitlist unavailable'; end if;
  insert into private.launch_waitlist(night_id,email,locale) values(p_night,lower(private.trim_input(p_email) collate "C"),p_locale)
    on conflict(night_id,email) do nothing returning id into inserted_id;
  if inserted_id is not null then perform private.launch_log(p_night,null,'waitlist_joined',jsonb_build_object('waitlist_id',inserted_id)); end if;
end $$;

create or replace function public.launch_event_availability(p_night uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare result jsonb; t timestamptz := clock_timestamp();
begin
  select jsonb_build_object('night_id',e.night_id,'venue_id',n.venue_id,'timezone',v.timezone,
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
-- handoff for #186/#189, independent of credential digests and browser delivery.
create table private.launch_checkout_work (
  reservation_id uuid primary key references private.launch_reservations(id) on delete restrict,
  delivery_envelope text not null check (length(delivery_envelope) between 103 and 1503 and delivery_envelope ~ '^v1\.[A-Za-z0-9_-]+$'),
  account_id text not null check (account_id ~ '^acct_[A-Za-z0-9]{1,100}$'),
  origin text not null check (length(origin) <= 255 and origin ~ '^https?://[A-Za-z0-9.:-]+$'),
  state text not null default 'pending' check (state in ('pending','done','review_needed')),
  next_run_at timestamptz not null default clock_timestamp(),
  claim_id uuid, lease_until timestamptz, claims integer not null default 0 check (claims >= 0),
  first_requested_at timestamptz,
  last_error text check (last_error ~ '^[A-Za-z0-9_.-]{1,80}$'),
  check ((claim_id is null) = (lease_until is null))
);
create index launch_checkout_due on private.launch_checkout_work(next_run_at) where state='pending';
create table private.launch_refund_operations (
  operation_id uuid primary key,
  first_requested_at timestamptz not null default clock_timestamp()
);
create table private.launch_http_limits (
  bucket text primary key check (bucket ~ '^[a-f0-9]{64}$'),
  started_at timestamptz not null,
  requests integer not null check(requests > 0)
);
alter table private.launch_checkout_work enable row level security;
alter table private.launch_refund_operations enable row level security;
alter table private.launch_http_limits enable row level security;
revoke all on private.launch_checkout_work,private.launch_refund_operations,private.launch_http_limits from public,anon,authenticated,service_role;

create function public.prepare_launch_checkout(p_id uuid,p_night uuid,p_email text,p_name text,p_locale text,p_policy text,
  p_late_ack boolean,p_management_secret text,p_arrival_secret text,p_envelope text,p_account text,p_origin text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare until_at timestamptz; result jsonb;
begin
  perform private.launch_lock(p_night);
  select hold_until into until_at from private.launch_reservations where id=p_id;
  if until_at is null then
    -- Stripe uses whole Unix seconds. Never round past admission start.
    until_at := date_trunc('second',clock_timestamp() + interval '30 minutes');
  end if;
  result := public.create_launch_reservation(p_id,p_night,p_email,p_name,p_locale,p_policy,p_late_ack,until_at,p_management_secret,p_arrival_secret);
  if result ? 'access_required' then return result; end if;
  insert into private.launch_checkout_work(reservation_id,delivery_envelope,account_id,origin)
    values(p_id,p_envelope,p_account,p_origin) on conflict(reservation_id) do nothing;
  if not exists(select 1 from private.launch_checkout_work where reservation_id=p_id and account_id=p_account and origin=p_origin) then
    raise exception 'checkout configuration mismatch';
  end if;
  return result;
end $$;

create function private.launch_checkout_projection(p_id uuid) returns jsonb
language sql stable set search_path = '' as $$
 select jsonb_build_object('id',r.id,'email',r.email,'locale',r.locale,'amount_minor',p.amount_minor,'currency',p.currency,
   'hold_until',r.hold_until,'starts_at',n.waiting_opens_at,'ends_at',n.closes_at,'created_at',r.created_at,
   'state',r.state,'payment_state',p.state,'checkout_id',p.checkout_id,'account_id',w.account_id,'origin',w.origin,
   'checkout_state',w.state,'claim_id',w.claim_id,'claims',w.claims,'first_requested_at',w.first_requested_at,
   'cancelled',e.cancelled_at is not null or n.terminal_at is not null)
 from private.launch_checkout_work w join private.launch_reservations r on r.id=w.reservation_id
 join private.launch_payments p on p.reservation_id=r.id join public.venue_nights n on n.id=r.night_id
 join private.launch_events e on e.night_id=r.night_id where r.id=p_id;
$$;
create function public.inspect_launch_checkout(p_id uuid) returns jsonb
language sql security definer set search_path = '' as $$ select private.launch_checkout_projection(p_id); $$;

-- Targeted guest resumption and scheduled workers share the same lease.
create function public.claim_launch_checkout(p_id uuid default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare id_value uuid;
begin
  select reservation_id into id_value from private.launch_checkout_work
    where state='pending' and (p_id is null or reservation_id=p_id)
      and (lease_until is null or lease_until <= clock_timestamp())
      and (p_id is not null or next_run_at <= clock_timestamp() or exists(
        select 1 from private.launch_reservations r where r.id=reservation_id and r.state<>'holding'))
    order by next_run_at,reservation_id for update skip locked limit 1;
  if id_value is null then return null; end if;
  update private.launch_checkout_work set claim_id=gen_random_uuid(),lease_until=clock_timestamp()+interval '120 seconds',
    claims=claims+1 where reservation_id=id_value;
  return private.launch_checkout_projection(id_value);
end $$;
create function public.start_launch_checkout_request(p_id uuid,p_claim uuid) returns timestamptz
language plpgsql security definer set search_path = '' as $$
declare started timestamptz;
begin
 update private.launch_checkout_work set first_requested_at=coalesce(first_requested_at,clock_timestamp())
 where reservation_id=p_id and claim_id=p_claim and lease_until>clock_timestamp() and state='pending'
 returning first_requested_at into started;
 if started is null then raise exception 'stale checkout claim'; end if;
 return started;
end $$;
create function public.finish_launch_checkout(p_id uuid,p_claim uuid,p_state text,p_error text default null) returns void
language plpgsql security definer set search_path = '' as $$
begin
 if p_state is null or p_state not in ('pending','done','review_needed') or
   (p_error is not null and p_error !~ '^[A-Za-z0-9_.-]{1,80}$') then raise exception 'invalid checkout outcome'; end if;
 update private.launch_checkout_work set state=p_state,last_error=p_error,
   next_run_at=case when p_state='pending' and p_error is null then
     greatest(clock_timestamp()+interval '30 seconds',
       (select r.hold_until from private.launch_reservations r where r.id=p_id and r.state='holding'))
     else clock_timestamp()+interval '30 seconds' end,claim_id=null,lease_until=null
 where reservation_id=p_id and claim_id=p_claim and lease_until>clock_timestamp();
 if not found then raise exception 'stale checkout claim'; end if;
end $$;

-- ONLY a definite rejection of the very first provider call permits this path.
-- An ambiguous timeout, replay error, local deadline or empty search never does.
create function public.reject_launch_checkout_creation(p_id uuid,p_claim uuid,p_evidence text) returns void
language plpgsql security definer set search_path = '' as $$
declare r private.launch_reservations;
begin
 r := private.launch_lock_reservation(p_id);
 perform 1 from private.launch_checkout_work where reservation_id=p_id and claim_id=p_claim
   and lease_until>clock_timestamp() and claims=1 and first_requested_at is not null for update;
 if not found or p_evidence is null or p_evidence !~ '^req_[A-Za-z0-9]{1,240}$' or
   exists(select 1 from private.launch_payments where reservation_id=p_id and (checkout_id is not null or state<>'pending')) then
   raise exception 'definitive creation rejection required';
 end if;
 -- No Checkout exists in this exceptional provider-validation branch. Keep the
 -- evidence on the payment record without inventing a provider Checkout ID.
 update private.launch_payments set state='unpaid',release_evidence=p_evidence where reservation_id=p_id;
 if r.state='holding' then
   update private.launch_reservations set state='expired',expired_at=clock_timestamp() where id=p_id;
   update private.launch_credentials set arrival_revoked_at=clock_timestamp() where reservation_id=p_id;
 end if;
 perform private.launch_log(r.night_id,p_id,'checkout_rejected',jsonb_build_object('evidence',p_evidence));
end $$;

create function public.launch_http_allow(p_bucket text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare total integer;
begin
 if p_bucket is null or p_bucket !~ '^[a-f0-9]{64}$' then raise exception 'invalid rate bucket'; end if;
 insert into private.launch_http_limits values(p_bucket,clock_timestamp(),1)
 on conflict(bucket) do update set
 requests=case when private.launch_http_limits.started_at <= clock_timestamp()-interval '10 minutes' then 1 else private.launch_http_limits.requests+1 end,
 started_at=case when private.launch_http_limits.started_at <= clock_timestamp()-interval '10 minutes' then clock_timestamp() else private.launch_http_limits.started_at end
 returning requests into total;
 return total <= 30;
end $$;

-- Keep #182's fencing/replacement contracts; add the durable replay horizon and
-- provider account binding needed to safely operate outside a request lifetime.
create or replace function public.claim_launch_refund(p_lease_seconds integer default 60) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare f private.launch_refunds; claim uuid := gen_random_uuid();
begin
  if p_lease_seconds is null or p_lease_seconds not between 10 and 300 then raise exception 'invalid refund lease'; end if;
  select * into f from private.launch_refunds where state in ('queued','pending') and (lease_until is null or lease_until <= clock_timestamp())
    order by created_at,id for update skip locked limit 1;
  if not found then return null; end if;
  update private.launch_refunds set state = 'pending',attempts = attempts + 1,operation_claims = operation_claims + 1,claim_id = claim,
    lease_until = clock_timestamp() + make_interval(secs => p_lease_seconds),updated_at = clock_timestamp() where id = f.id;
  insert into private.launch_refund_operations(operation_id) values(f.operation_id) on conflict do nothing;
  return jsonb_build_object('account_id',(select account_id from private.launch_checkout_work where reservation_id=f.reservation_id),
    'first_requested_at',(select first_requested_at from private.launch_refund_operations where operation_id=f.operation_id),'id',f.id,'reservation_id',f.reservation_id,'claim_id',claim,'amount_minor',f.amount_minor,'currency',f.currency,
    'payment_id',(select payment_id from private.launch_payments where reservation_id = f.reservation_id),
    'provider_refund_id',f.provider_refund_id,'operation_id',f.operation_id,'reconcile_first',f.operation_claims > 0);
end $$;

create function public.maintain_launch_checkout() returns void
language plpgsql security definer set search_path = '' as $$
declare item record;
begin
 delete from private.launch_http_limits where started_at < clock_timestamp()-interval '1 day';
 for item in select e.night_id from private.launch_events e join public.venue_nights n on n.id=e.night_id
   where n.closes_at <= clock_timestamp() and exists(select 1 from private.launch_reservations r
     where r.night_id=e.night_id and r.state='confirmed' and not exists(select 1 from private.launch_arrivals a where a.reservation_id=r.id))
   limit 100
 loop perform public.finalize_launch_no_shows(item.night_id); end loop;
end $$;

-- Explicit function ACLs; service-only facade, no public RPC access.
revoke all on function private.launch_checkout_projection(uuid) from public,anon,authenticated,service_role;
revoke all on function public.prepare_launch_checkout(uuid,uuid,text,text,text,text,boolean,text,text,text,text,text),
 public.inspect_launch_checkout(uuid),public.claim_launch_checkout(uuid),public.start_launch_checkout_request(uuid,uuid),
 public.finish_launch_checkout(uuid,uuid,text,text),public.reject_launch_checkout_creation(uuid,uuid,text),
 public.launch_http_allow(text),public.maintain_launch_checkout() from public,anon,authenticated;
grant execute on function public.prepare_launch_checkout(uuid,uuid,text,text,text,text,boolean,text,text,text,text,text),
 public.inspect_launch_checkout(uuid),public.claim_launch_checkout(uuid),public.start_launch_checkout_request(uuid,uuid),
 public.finish_launch_checkout(uuid,uuid,text,text),public.reject_launch_checkout_creation(uuid,uuid,text),
 public.launch_http_allow(text),public.maintain_launch_checkout() to service_role;

-- Encrypted initial-credential handoff only. #189 owns recipient verification,
-- renewed access and the actual send; #186 consumes the separate arrival secret.
create function public.read_launch_delivery(p_id uuid) returns jsonb
language sql security definer set search_path = '' as $$
 select jsonb_build_object('reservation_id',r.id,'recipient_email',r.email,'locale',r.locale,
   'envelope',w.delivery_envelope,'state',r.state,'payment_state',p.state)
 from private.launch_checkout_work w join private.launch_reservations r on r.id=w.reservation_id
 join private.launch_payments p on p.reservation_id=r.id where r.id=p_id;
$$;
create function public.admin_retry_launch_checkout(p_id uuid,p_note text) returns void
language plpgsql security definer set search_path = '' as $$
declare r private.launch_reservations;
begin
 if not private.is_admin() then raise exception 'not authorized' using errcode='42501'; end if;
 if not private.valid_input_text(p_note,500,true) then raise exception 'reconciliation note required'; end if;
 r := private.launch_lock_reservation(p_id);
 update private.launch_checkout_work set state='pending',next_run_at=clock_timestamp(),last_error=null
 where reservation_id=p_id and state='review_needed';
 if found then perform private.launch_log(r.night_id,p_id,'checkout_reconciliation_requested',jsonb_build_object('note',private.trim_input(p_note))); end if;
end $$;
revoke all on function public.read_launch_delivery(uuid) from public,anon,authenticated;
grant execute on function public.read_launch_delivery(uuid) to service_role;
revoke all on function public.admin_retry_launch_checkout(uuid,text) from public,anon,service_role;
grant execute on function public.admin_retry_launch_checkout(uuid,text) to authenticated;

create or replace function public.admin_launch_reservation(p_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_admin() then raise exception 'not authorized' using errcode = '42501'; end if;
  return private.launch_projection(p_id) || jsonb_build_object('checkout_work',
    (select jsonb_build_object('state',w.state,'attempts',w.claims,'next_run_at',w.next_run_at,
      'first_requested_at',w.first_requested_at,'last_error',w.last_error,'account_id',w.account_id)
      from private.launch_checkout_work w where w.reservation_id=p_id),'payment',
    (select to_jsonb(p) from private.launch_payments p where reservation_id = p_id),'refund',
    (select to_jsonb(f) - 'claim_id' from private.launch_refunds f where reservation_id = p_id),
    'failed_refund_attempts',(select coalesce(jsonb_agg(to_jsonb(a) - 'failure_snapshot' ||
      jsonb_build_object('failure_snapshot',a.failure_snapshot - 'claim_id') order by a.verified_at),'[]')
      from private.launch_refund_attempts a join private.launch_refunds f on f.id = a.refund_id
      where f.reservation_id = p_id and a.failure_snapshot is not null));
end $$;
