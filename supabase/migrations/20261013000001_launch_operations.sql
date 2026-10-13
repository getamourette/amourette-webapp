-- #187. Behavioral migration; shared application requires founder approval.
-- External provider bindings are created only by verified server recovery.
alter table private.launch_refunds add column provider_source text not null default 'integration'
  check (provider_source in ('integration','external'));
alter table private.launch_refunds add constraint launch_external_refund_bound
  check (provider_source <> 'external' or provider_refund_id is not null);

-- Do not starve newer obligations behind an insufficient-balance pending refund.
create or replace function public.claim_launch_refund(p_lease_seconds integer default 60) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare f private.launch_refunds; claim uuid := gen_random_uuid();
begin
  if p_lease_seconds is null or p_lease_seconds not between 10 and 300 then raise exception 'invalid refund lease'; end if;
  select * into f from private.launch_refunds where state in ('queued','pending') and (lease_until is null or lease_until <= clock_timestamp())
    order by updated_at,id for update skip locked limit 1;
  if not found then return null; end if;
  update private.launch_refunds set state = 'pending',attempts = attempts + 1,operation_claims = operation_claims + 1,claim_id = claim,
    lease_until = clock_timestamp() + make_interval(secs => p_lease_seconds),updated_at = clock_timestamp() where id = f.id;
  insert into private.launch_refund_operations(operation_id) values(f.operation_id) on conflict do nothing;
  return jsonb_build_object('provider_source',f.provider_source,'account_id',(select account_id from private.launch_checkout_work where reservation_id=f.reservation_id),
    'first_requested_at',(select first_requested_at from private.launch_refund_operations where operation_id=f.operation_id),'id',f.id,'reservation_id',f.reservation_id,'claim_id',claim,'amount_minor',f.amount_minor,'currency',f.currency,
    'payment_id',(select payment_id from private.launch_payments where reservation_id = f.reservation_id),
    'provider_refund_id',f.provider_refund_id,'operation_id',f.operation_id,'reconcile_first',f.operation_claims > 0);
end $$;

create function public.admin_launch_overview(p_night uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare result jsonb;
begin
  if not private.is_admin() then raise exception 'not authorized' using errcode='42501'; end if;
  if p_night is null or not exists(select 1 from public.venue_nights where id=p_night) then raise exception 'unknown night'; end if;
  select jsonb_build_object('event',to_jsonb(e),'now',clock_timestamp(),
    'allocations',(select count(*) from private.launch_reservations where night_id=p_night and state in ('holding','confirmed')),
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
  return coalesce(result,jsonb_build_object('event',null,'now',clock_timestamp(),'allocations',0,'finance','[]'::jsonb));
end $$;

-- Search the entire event before pagination, with literal substring matching.
create function public.admin_search_launch_reservations(p_night uuid,p_query text default '',p_filter text default 'all',p_after uuid default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare result jsonb;
begin
  if not private.is_admin() then raise exception 'not authorized' using errcode='42501'; end if;
  if p_night is null or p_query is null or not private.valid_input_text(p_query,254,false) or p_filter is null or
    p_filter not in ('all','confirmed','holding','cancelled','expired','paid','unpaid','verified','no_show','refund_due','refunded','attention') then
    raise exception 'invalid reservation search' using errcode='22023'; end if;
  select coalesce(jsonb_agg(private.launch_projection(t.id) order by t.id),'[]') into result from (
    select r.id from private.launch_reservations r join private.launch_payments p on p.reservation_id=r.id
    left join private.launch_arrivals a on a.reservation_id=r.id
    left join private.launch_refunds f on f.reservation_id=r.id
    left join private.launch_checkout_work w on w.reservation_id=r.id
    where r.night_id=p_night and (p_after is null or r.id>p_after)
    and (position(lower(private.trim_input(p_query)) in lower(r.email || ' ' || r.first_name || ' ' || r.id::text))>0)
    and (p_filter='all' or (p_filter in ('confirmed','holding','cancelled','expired') and r.state=p_filter)
      or (p_filter in ('paid','unpaid') and p.state=p_filter)
      or (p_filter in ('verified','no_show') and a.outcome=p_filter)
      or (p_filter='refund_due' and f.state in ('queued','pending','failed','review_needed'))
      or (p_filter='refunded' and f.state='succeeded')
      or (p_filter='attention' and (f.state in ('failed','review_needed') or w.state='review_needed' or f.last_error='insufficient_funds')))
    order by r.id limit 100
  ) t;
  return result;
end $$;

-- Service reads only the evidence necessary for provider checks. No guest secrets.
create function public.inspect_launch_refund_recovery(p_id uuid) returns jsonb
language sql security definer set search_path = '' as $$
  select jsonb_build_object('reservation_id',r.id,'payment_id',p.payment_id,'amount_minor',p.amount_minor,
    'currency',p.currency,'account_id',w.account_id,'refund',to_jsonb(f)-'claim_id')
  from private.launch_reservations r join private.launch_payments p on p.reservation_id=r.id
  join private.launch_checkout_work w on w.reservation_id=r.id
  left join private.launch_refunds f on f.reservation_id=r.id where r.id=p_id and p.state='paid';
$$;

-- A full external refund can satisfy an obligation, but it never creates a
-- provider request. CAS and existing provider/operation uniqueness fence races.
create function public.adopt_launch_refund(p_id uuid,p_operation uuid,p_provider text,p_state text,p_actor uuid,p_note text)
returns void language plpgsql security definer set search_path = '' as $$
declare r private.launch_reservations; f private.launch_refunds;
begin
  if p_actor is null or not exists(select 1 from public.admins where user_id=p_actor) then raise exception 'not authorized' using errcode='42501'; end if;
  if p_provider is null or p_provider !~ '^re_[A-Za-z0-9]{1,252}$' or p_state is null or p_state not in ('pending','succeeded')
    or not private.valid_input_text(p_note,500,true) then raise exception 'invalid external refund evidence'; end if;
  r:=private.launch_lock_reservation(p_id);
  if not exists(select 1 from private.launch_payments where reservation_id=p_id and state='paid') then raise exception 'paid deposit required'; end if;
  select * into f from private.launch_refunds where reservation_id=p_id for update;
  if found then
    if f.provider_source='external' and f.provider_refund_id=p_provider then return; end if;
    if f.operation_id is distinct from p_operation or f.provider_refund_id is not null
      or f.state='succeeded' or f.lease_until>clock_timestamp() then raise exception 'refund changed or busy; refresh before recovery'; end if;
  else
    if p_operation is not null then raise exception 'stale refund operation'; end if;
    perform private.launch_queue_refund(p_id,'exception');
    select * into f from private.launch_refunds where reservation_id=p_id for update;
  end if;
  update private.launch_refunds set provider_refund_id=p_provider,provider_source='external',state=p_state,
    claim_id=null,lease_until=null,last_error=null,updated_at=clock_timestamp() where id=f.id;
  insert into private.launch_audit(night_id,reservation_id,action,actor_id,detail) values(r.night_id,r.id,'external_refund_linked',p_actor,
    jsonb_build_object('refund_id',f.id,'operation_id',f.operation_id,'provider_refund_id',p_provider,'state',p_state,'note',private.trim_input(p_note)));
end $$;

-- Founder text alone must not authorize a new Stripe operation. Only the server
-- may replace after retrieving terminal failure and returned-balance evidence.
revoke all on function public.admin_replace_failed_launch_refund(uuid,uuid,text,text,text) from public,anon,authenticated,service_role;
create function public.replace_launch_refund(
  p_id uuid,p_operation uuid,p_provider_id text,p_evidence text,p_note text,p_actor uuid
) returns void language plpgsql security definer set search_path = '' as $$
declare f private.launch_refunds; r private.launch_reservations; replacement uuid := gen_random_uuid();
begin
  if p_actor is null or not exists(select 1 from public.admins where user_id=p_actor) then raise exception 'not authorized' using errcode = '42501'; end if;
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
    verification_note = private.trim_input(p_note),verified_by = p_actor,verified_at = clock_timestamp()
    where operation_id = p_operation and refund_id = p_id and failure_snapshot is null;
  if not found then raise exception 'refund attempt history unavailable'; end if;
  update private.launch_refunds set operation_id = replacement,operation_claims = 0,state = 'queued',
    provider_source = 'integration',provider_refund_id = null,claim_id = null,lease_until = null,last_error = null,updated_at = clock_timestamp() where id = p_id;
  insert into private.launch_audit(night_id,reservation_id,action,actor_id,detail) values(r.night_id,r.id,'refund_replacement',p_actor,jsonb_build_object('refund_id',p_id,
    'failed_operation_id',p_operation,'operation_id',replacement,'provider_refund_id',p_provider_id,'evidence',p_evidence));
end $$;

revoke all on function public.admin_launch_overview(uuid),public.admin_search_launch_reservations(uuid,text,text,uuid) from public,anon,service_role;
grant execute on function public.admin_launch_overview(uuid),public.admin_search_launch_reservations(uuid,text,text,uuid) to authenticated;
revoke all on function public.inspect_launch_refund_recovery(uuid),public.adopt_launch_refund(uuid,uuid,text,text,uuid,text),
  public.replace_launch_refund(uuid,uuid,text,text,text,uuid) from public,anon,authenticated;
grant execute on function public.inspect_launch_refund_recovery(uuid),public.adopt_launch_refund(uuid,uuid,text,text,uuid,text),
  public.replace_launch_refund(uuid,uuid,text,text,text,uuid) to service_role;

alter table private.launch_refunds add column review_owner uuid references auth.users(id) on delete set null;
create function public.admin_claim_launch_refund(p_id uuid,p_note text) returns void
language plpgsql security definer set search_path = '' as $$
declare f private.launch_refunds; r private.launch_reservations;
begin
  if not private.is_admin() then raise exception 'not authorized' using errcode='42501'; end if;
  if not private.valid_input_text(p_note,500,true) then raise exception 'ownership note required'; end if;
  select * into f from private.launch_refunds where id=p_id;
  if not found then raise exception 'unknown refund'; end if;
  r:=private.launch_lock_reservation(f.reservation_id);
  select * into f from private.launch_refunds where id=p_id for update;
  if f.state='succeeded' then raise exception 'refund already completed'; end if;
  if f.review_owner=auth.uid() then return; end if;
  update private.launch_refunds set review_owner=auth.uid() where id=p_id;
  perform private.launch_log(r.night_id,r.id,'refund_owner_assigned',jsonb_build_object('refund_id',p_id,'previous_owner',f.review_owner,'note',private.trim_input(p_note)));
end $$;
revoke all on function public.admin_claim_launch_refund(uuid,text) from public,anon,service_role;
grant execute on function public.admin_claim_launch_refund(uuid,text) to authenticated;
