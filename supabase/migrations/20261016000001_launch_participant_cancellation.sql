-- #192: consent and financial eligibility use one instant after the night lock.
-- Preview is read-only; confirmation never silently changes a promised refund.
create function public.manage_launch_cancellation(p_id uuid,p_secret text,p_confirm boolean,p_accept_retained boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare r private.launch_reservations; n public.venue_nights; t timestamptz;
  eligible boolean; allowed boolean; needs_confirmation boolean := false;
begin
  if p_confirm is null or p_accept_retained is null or (not p_confirm and p_accept_retained) then
    raise exception 'invalid cancellation command';
  end if;
  r := private.launch_lock_reservation(p_id);
  perform private.launch_authorize(p_id,p_secret);
  select * into n from public.venue_nights where id = r.night_id;
  t := clock_timestamp();
  eligible := private.launch_cancellation_refundable(n.waiting_opens_at,t);
  allowed := r.state = 'confirmed' and t < n.closes_at
    and exists(select 1 from private.launch_payments where reservation_id=p_id and state='paid')
    and not exists(select 1 from private.launch_arrivals where reservation_id=p_id);
  if p_confirm and r.state <> 'cancelled' then
    if not allowed then raise exception 'reservation can no longer be cancelled'; end if;
    if not eligible and not p_accept_retained
      and not exists(select 1 from private.launch_refunds where reservation_id=p_id) then
      needs_confirmation := true;
    else
      update private.launch_reservations set state='cancelled',cancelled_at=t,cancellation_refundable=eligible where id=p_id;
      update private.launch_credentials set arrival_revoked_at=coalesce(arrival_revoked_at,t) where reservation_id=p_id;
      if eligible then perform private.launch_queue_refund(p_id,'timely_cancellation'); end if;
      perform private.launch_log(r.night_id,p_id,'participant_cancelled',jsonb_build_object('refundable',eligible));
      allowed := false;
    end if;
  end if;
  return jsonb_build_object('reservation',private.launch_projection(p_id),'now',t,'timezone',
    (select timezone from public.venues where id=n.venue_id),'refundable',eligible,
    'can_cancel',allowed,'confirmation_required',needs_confirmation);
end $$;
revoke all on function public.manage_launch_cancellation(uuid,text,boolean,boolean) from public,anon,authenticated;
grant execute on function public.manage_launch_cancellation(uuid,text,boolean,boolean) to service_role;

-- Scope founder follow-up to the inspected night/state. Stale tabs must reload.
create function public.admin_follow_up_launch_waitlist(p_night uuid,p_id bigint,p_expected text,p_state text)
returns void language plpgsql security definer set search_path = '' as $$
declare current_state text;
begin
  if not private.is_admin() then raise exception 'not authorized' using errcode='42501'; end if;
  if p_id is null or p_id < 1 or p_id > 9007199254740991 or p_expected is null or p_state is null
    or p_expected not in ('waiting','contacted','closed') or p_state not in ('waiting','contacted','closed') then
    raise exception 'invalid waitlist command';
  end if;
  perform private.launch_lock(p_night);
  select state into current_state from private.launch_waitlist where id=p_id and night_id=p_night;
  if current_state is null then raise exception 'waitlist entry unavailable'; end if;
  if current_state = p_state then return; end if;
  if current_state <> p_expected then raise exception 'waitlist changed; reload'; end if;
  perform public.admin_update_launch_waitlist(p_id,p_state);
end $$;
revoke all on function public.admin_follow_up_launch_waitlist(uuid,bigint,text,text) from public,anon;
grant execute on function public.admin_follow_up_launch_waitlist(uuid,bigint,text,text) to authenticated;
