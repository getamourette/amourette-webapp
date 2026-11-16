-- #365 (SEC-002): behavioral migration. Announce before applying to the shared database.
-- One request source may keep at most three unpaid holds per event, and a founder
-- can ask for an unpaid hold to be expired. Existing rows keep an unknown source.
alter table private.launch_checkout_work
  add column source text check (source ~ '^[a-f0-9]{64}$'),
  add column expire_requested_at timestamptz;

-- p_source is the server's HMAC of the request address, never a raw address.
-- It defaults to null (uncapped) only so the deployed application keeps working
-- between this migration and its own release; the checkout route always sends it.
-- Builds on #354's signature (p_gender), applied just before this migration.
drop function public.prepare_launch_checkout(uuid,uuid,text,text,text,text,boolean,text,text,text,text,text,text);
create function public.prepare_launch_checkout(p_id uuid,p_night uuid,p_email text,p_name text,p_locale text,p_policy text,
  p_late_ack boolean,p_management_secret text,p_arrival_secret text,p_envelope text,p_account text,p_origin text,
  p_gender text default null,p_source text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare until_at timestamptz; result jsonb;
begin
  if p_source is not null and p_source !~ '^[a-f0-9]{64}$' then raise exception 'invalid booking source'; end if;
  perform private.launch_lock(p_night);
  select hold_until into until_at from private.launch_reservations where id=p_id;
  if until_at is null then
    -- A replay of an existing attempt never reaches this branch. Paid, cancelled
    -- and released reservations are no longer 'holding', so they free the allowance.
    if p_source is not null and (select count(*) from private.launch_checkout_work w
        join private.launch_reservations r on r.id=w.reservation_id
        where w.source=p_source and r.night_id=p_night and r.state='holding') >= 3 then
      raise exception 'pending payment limit';
    end if;
    -- Stripe uses whole Unix seconds. Never round past admission start.
    until_at := date_trunc('second',clock_timestamp() + interval '30 minutes');
  end if;
  result := public.create_launch_reservation(p_id,p_night,p_email,p_name,p_locale,p_policy,p_late_ack,until_at,p_management_secret,p_arrival_secret,p_gender);
  if result ? 'access_required' then return result; end if;
  insert into private.launch_checkout_work(reservation_id,delivery_envelope,account_id,origin,source)
    values(p_id,p_envelope,p_account,p_origin,p_source) on conflict(reservation_id) do nothing;
  if not exists(select 1 from private.launch_checkout_work where reservation_id=p_id and account_id=p_account and origin=p_origin) then
    raise exception 'checkout configuration mismatch';
  end if;
  return result;
end $$;
revoke all on function public.prepare_launch_checkout(uuid,uuid,text,text,text,text,boolean,text,text,text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.prepare_launch_checkout(uuid,uuid,text,text,text,text,boolean,text,text,text,text,text,text,text) to service_role;

-- The worker and the guest route read this flag: an open Checkout is expired at
-- the provider, and capacity is released only by the existing verified path.
create or replace function private.launch_checkout_projection(p_id uuid) returns jsonb
language sql stable set search_path = '' as $$
 select jsonb_build_object('id',r.id,'email',r.email,'locale',r.locale,'amount_minor',p.amount_minor,'currency',p.currency,
   'hold_until',r.hold_until,'starts_at',n.waiting_opens_at,'ends_at',n.closes_at,'created_at',r.created_at,
   'state',r.state,'payment_state',p.state,'checkout_id',p.checkout_id,'account_id',w.account_id,'origin',w.origin,
   'checkout_state',w.state,'claim_id',w.claim_id,'claims',w.claims,'first_requested_at',w.first_requested_at,
   'cancelled',e.cancelled_at is not null or n.terminal_at is not null,
   'expire_requested',w.expire_requested_at is not null)
 from private.launch_checkout_work w join private.launch_reservations r on r.id=w.reservation_id
 join private.launch_payments p on p.reservation_id=r.id join public.venue_nights n on n.id=r.night_id
 join private.launch_events e on e.night_id=r.night_id where r.id=p_id;
$$;

-- Founder request, not a release: a payment already in flight still confirms.
-- If a worker holds the lease right now, the request is applied on its next run.
create function public.admin_expire_launch_hold(p_id uuid,p_note text) returns void
language plpgsql security definer set search_path = '' as $$
declare r private.launch_reservations;
begin
 if not private.is_admin() then raise exception 'not authorized' using errcode='42501'; end if;
 if not private.valid_input_text(p_note,500,true) then raise exception 'verification note required'; end if;
 r := private.launch_lock_reservation(p_id);
 if r.state<>'holding' then raise exception 'reservation is not an unpaid hold'; end if;
 update private.launch_checkout_work set expire_requested_at=clock_timestamp(),state='pending',
   next_run_at=clock_timestamp(),last_error=null
 where reservation_id=p_id and expire_requested_at is null;
 if found then perform private.launch_log(r.night_id,p_id,'hold_expiry_requested',jsonb_build_object('note',private.trim_input(p_note))); end if;
end $$;
revoke all on function public.admin_expire_launch_hold(uuid,text) from public,anon,service_role;
grant execute on function public.admin_expire_launch_hold(uuid,text) to authenticated;
