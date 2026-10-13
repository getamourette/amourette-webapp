-- Stripe card refunds can fail after initially succeeding. Preserve payment and
-- operation identity while recording verified subsequent failure; never recreate
-- or replace from a webhook. Application remains founder-gated.
create or replace function private.launch_refund_guard() returns trigger
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
    or (old.state = 'succeeded' and new.state not in ('succeeded','failed'))) then
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
create function public.inspect_launch_refund_observation(p_provider text default null,p_payment text default null,p_account text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare result jsonb;
begin
  if (p_provider is null) <> (p_payment is null) or (p_provider is null) <> (p_account is null)
    or (p_provider is not null and p_provider !~ '^re_[A-Za-z0-9]{1,252}$')
    or (p_payment is not null and p_payment !~ '^pi_[A-Za-z0-9]{1,252}$')
    or (p_account is not null and p_account !~ '^acct_[A-Za-z0-9]{1,250}$') then raise exception 'invalid observation identity'; end if;
  select jsonb_build_object('id',f.id,'reservation_id',f.reservation_id,'operation_id',f.operation_id,
    'amount_minor',f.amount_minor,'currency',f.currency,'payment_id',p.payment_id,'provider_refund_id',f.provider_refund_id,
    'provider_source',f.provider_source,'account_id',w.account_id,'observed_version',f.updated_at)
  into result from private.launch_refunds f join private.launch_payments p on p.reservation_id=f.reservation_id
  join private.launch_checkout_work w on w.reservation_id=f.reservation_id
  where (p_provider is null and f.state='succeeded' and f.updated_at <= clock_timestamp()-interval '1 hour')
    or (p_provider is not null and f.provider_refund_id=p_provider and p.payment_id=p_payment and w.account_id=p_account)
  order by f.updated_at,f.id limit 1;
  return result;
end $$;

create function public.record_launch_refund_observation(p_id uuid,p_operation uuid,p_provider text,p_version timestamptz,p_state text,p_error text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare r private.launch_reservations; f private.launch_refunds;
begin
  if p_operation is null or p_provider is null or p_provider !~ '^re_[A-Za-z0-9]{1,252}$'
    or p_version is null or not isfinite(p_version) or p_state is null or p_state not in ('pending','succeeded','failed','review_needed')
    or (p_error is not null and p_error !~ '^[A-Za-z0-9_.-]{1,80}$') then raise exception 'invalid refund observation'; end if;
  select * into f from private.launch_refunds where id=p_id;
  if not found then raise exception 'unknown refund'; end if;
  r:=private.launch_lock_reservation(f.reservation_id);
  select * into f from private.launch_refunds where id=p_id for update;
  -- Lost responses, stale provider reads and archived-operation events do not
  -- overwrite newer worker/recovery results. The next poll retrieves current truth.
  if (f.operation_id,f.provider_refund_id,f.updated_at) is distinct from (p_operation,p_provider,p_version) then return; end if;
  if f.state='succeeded' and p_state not in ('succeeded','failed') then raise exception 'ambiguous completed refund observation'; end if;
  update private.launch_refunds set state=p_state,last_error=p_error,updated_at=clock_timestamp(),claim_id=null,lease_until=null where id=p_id;
  if (f.state,f.last_error) is distinct from (p_state,p_error) then
    perform private.launch_log(r.night_id,r.id,'refund_provider_observed',jsonb_build_object('refund_id',f.id,'operation_id',f.operation_id,
      'provider_refund_id',p_provider,'previous_state',f.state,'state',p_state,'error',p_error));
  end if;
end $$;

-- A founder can ask to check a completed refund, without putting it back in the
-- creation queue. It remains completed until Stripe supplies contrary evidence.
create or replace function public.admin_retry_launch_refund(p_id uuid,p_note text) returns void
language plpgsql security definer set search_path = '' as $$
declare f private.launch_refunds; r private.launch_reservations;
begin
  if not private.is_admin() then raise exception 'not authorized' using errcode='42501'; end if;
  if not private.valid_input_text(p_note,500,true) then raise exception 'reconciliation note required'; end if;
  select * into f from private.launch_refunds where id=p_id;
  if not found then raise exception 'unknown refund'; end if;
  r:=private.launch_lock_reservation(f.reservation_id);
  select * into f from private.launch_refunds where id=p_id for update;
  if f.state='succeeded' then
    update private.launch_refunds set updated_at=clock_timestamp()-interval '1 hour' where id=p_id;
  elsif f.state in ('failed','review_needed') then
    update private.launch_refunds set state='queued',lease_until=null,claim_id=null,updated_at=clock_timestamp() where id=p_id;
  else return;
  end if;
  perform private.launch_log(r.night_id,r.id,'refund_retry',jsonb_build_object('refund_id',p_id,'note',private.trim_input(p_note)));
end $$;
revoke all on function public.inspect_launch_refund_observation(text,text,text),public.record_launch_refund_observation(uuid,uuid,text,timestamptz,text,text) from public,anon,authenticated;
grant execute on function public.inspect_launch_refund_observation(text,text,text),public.record_launch_refund_observation(uuid,uuid,text,timestamptz,text,text) to service_role;
