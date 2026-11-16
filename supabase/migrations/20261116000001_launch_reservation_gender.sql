-- #354: record the participant's gender with a launch reservation so founders
-- can follow the balance of registrations before a night.
--
-- Same vocabulary as public.profiles.gender. The column is nullable: rows
-- created before this migration have no answer, and the trailing optional
-- argument keeps the previously deployed Checkout facade working while this
-- change rolls out. The HTTP boundary requires a value for every new booking.
-- The value stays out of private.launch_projection: guests and per-reservation
-- founder reads never receive it; only the aggregate below leaves the database.
alter table private.launch_reservations
  add column gender text check (gender in ('woman','man','nonbinary'));

drop function public.prepare_launch_checkout(uuid,uuid,text,text,text,text,boolean,text,text,text,text,text);
drop function public.create_launch_reservation(uuid,uuid,text,text,text,text,boolean,timestamptz,text,text);

create function public.create_launch_reservation(p_id uuid,p_night uuid,p_email text,p_name text,p_locale text,
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
  if not private.launch_cancellation_refundable(n.waiting_opens_at,t) and not p_late_ack then raise exception 'late cancellation acknowledgement required'; end if;
  if p_hold_until is null or not isfinite(p_hold_until) or p_hold_until <= t or p_hold_until > n.waiting_opens_at then raise exception 'invalid payment hold deadline'; end if;
  insert into private.launch_reservations(id,night_id,email,first_name,locale,policy_version,late_cancellation_acknowledged,hold_until,created_at,accepted_at,gender)
    values(p_id,p_night,email_value,name_value,p_locale,p_policy,p_late_ack,p_hold_until,t,t,p_gender);
  insert into private.launch_credentials values(p_id,management,t + interval '168 hours',arrival,null);
  insert into private.launch_payments(reservation_id,amount_minor,currency) values(p_id,e.deposit_minor,e.currency);
  perform private.launch_log(p_night,p_id,'hold_created');
  return private.launch_projection(p_id);
end $$;

create function public.prepare_launch_checkout(p_id uuid,p_night uuid,p_email text,p_name text,p_locale text,p_policy text,
  p_late_ack boolean,p_management_secret text,p_arrival_secret text,p_envelope text,p_account text,p_origin text,
  p_gender text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare until_at timestamptz; result jsonb;
begin
  perform private.launch_lock(p_night);
  select hold_until into until_at from private.launch_reservations where id=p_id;
  if until_at is null then
    -- Stripe uses whole Unix seconds. Never round past admission start.
    until_at := date_trunc('second',clock_timestamp() + interval '30 minutes');
  end if;
  result := public.create_launch_reservation(p_id,p_night,p_email,p_name,p_locale,p_policy,p_late_ack,until_at,p_management_secret,p_arrival_secret,p_gender);
  if result ? 'access_required' then return result; end if;
  insert into private.launch_checkout_work(reservation_id,delivery_envelope,account_id,origin)
    values(p_id,p_envelope,p_account,p_origin) on conflict(reservation_id) do nothing;
  if not exists(select 1 from private.launch_checkout_work where reservation_id=p_id and account_id=p_account and origin=p_origin) then
    raise exception 'checkout configuration mismatch';
  end if;
  return result;
end $$;

-- Recreated functions lose their ACLs: service-only facade, no public RPC access.
revoke all on function public.create_launch_reservation(uuid,uuid,text,text,text,text,boolean,timestamptz,text,text,text),
  public.prepare_launch_checkout(uuid,uuid,text,text,text,text,boolean,text,text,text,text,text,text)
  from public,anon,authenticated,service_role;
grant execute on function public.create_launch_reservation(uuid,uuid,text,text,text,text,boolean,timestamptz,text,text,text),
  public.prepare_launch_checkout(uuid,uuid,text,text,text,text,boolean,text,text,text,text,text,text)
  to service_role;

-- Founder overview gains aggregate totals by gender for confirmed bookings.
-- Payment holds are excluded: they are unpaid attempts that expire on their own.
-- No per-reservation gender is returned.
create or replace function public.admin_launch_overview(p_night uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare result jsonb;
begin
  if not private.is_admin() then raise exception 'not authorized' using errcode='42501'; end if;
  if p_night is null or not exists(select 1 from public.venue_nights where id=p_night) then raise exception 'unknown night'; end if;
  select jsonb_build_object('event',to_jsonb(e),'now',clock_timestamp(),
    'allocations',(select count(*) from private.launch_reservations where night_id=p_night and state in ('holding','confirmed')),
    'gender_counts',(select jsonb_build_object(
        'woman',count(*) filter(where gender='woman'),'man',count(*) filter(where gender='man'),
        'nonbinary',count(*) filter(where gender='nonbinary'),'unspecified',count(*) filter(where gender is null))
      from private.launch_reservations where night_id=p_night and state='confirmed'),
    'finance',coalesce((select jsonb_agg(to_jsonb(t)) from (
      select p.currency,count(*) filter(where p.state='paid') as paid_count,
        coalesce(sum(p.amount_minor) filter(where p.state='paid'),0) as charged,
        coalesce(sum(p.amount_minor) filter(where f.state='succeeded'),0) as refunded,
        coalesce(sum(p.amount_minor) filter(where f.state in ('queued','pending','failed','review_needed')),0) as outstanding,
        coalesce(sum(p.amount_minor) filter(where p.state='paid' and f.id is null and
          (r.cancellation_refundable=false or a.outcome='no_show')),0) as retained,
        coalesce(sum(p.amount_minor) filter(where p.state='paid' and f.id is null and
          r.cancellation_refundable is distinct from false and a.outcome is distinct from 'no_show'),0) as held,
        count(*) filter(where f.state in ('failed','review_needed') or w.state='review_needed') as anomalies,
        count(*) filter(where f.last_error='insufficient_funds' and f.state='pending') as awaiting_funds,
        min(f.updated_at) filter(where f.state in ('queued','pending')) as oldest_unresolved_update
      from private.launch_reservations r join private.launch_payments p on p.reservation_id=r.id
      left join private.launch_refunds f on f.reservation_id=r.id
      left join private.launch_arrivals a on a.reservation_id=r.id
      left join private.launch_checkout_work w on w.reservation_id=r.id
      where r.night_id=p_night group by p.currency order by p.currency
    ) t),'[]'::jsonb)) into result from private.launch_events e where e.night_id=p_night;
  return coalesce(result,jsonb_build_object('event',null,'now',clock_timestamp(),'allocations',0,
    'gender_counts',jsonb_build_object('woman',0,'man',0,'nonbinary',0,'unspecified',0),'finance','[]'::jsonb));
end $$;
