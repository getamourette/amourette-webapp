CREATE OR REPLACE FUNCTION public.record_resend_email_event(p_event_id text, p_event_type text, p_event_created_at timestamp with time zone, p_provider_message_id text, p_recipient_email text DEFAULT NULL::text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  inserted_count integer;
  normalized_email text := lower(private.trim_input(p_recipient_email));
begin
  if not private.valid_input_text(p_event_id,200,true) or not private.valid_input_text(p_event_type,120,true)
    or not private.valid_input_text(p_provider_message_id,200,true)
    or not private.valid_input_text(p_recipient_email,254,false)
    or p_event_created_at is null or not isfinite(p_event_created_at)
    then raise exception 'invalid email event'; end if;
  insert into private.email_webhook_events (event_id, event_type, event_created_at)
  values (p_event_id, p_event_type, p_event_created_at)
  on conflict do nothing;
  get diagnostics inserted_count = row_count;
  if inserted_count = 0 then return false; end if;

  update public.email_deliveries set
    status = case p_event_type
      when 'email.delivered' then 'delivered'
      when 'email.bounced' then 'failed'
      when 'email.complained' then 'suppressed'
      when 'email.suppressed' then 'suppressed'
      else status end,
    delivered_at = case when p_event_type = 'email.delivered' then p_event_created_at else delivered_at end,
    provider_event_at = greatest(provider_event_at, p_event_created_at),
    last_error_code = case when p_event_type in ('email.bounced', 'email.complained', 'email.suppressed')
      then p_event_type else last_error_code end
  where provider_message_id = p_provider_message_id
    and (
      p_event_type in ('email.bounced', 'email.complained', 'email.suppressed')
      or (
        status <> 'suppressed'
        and (provider_event_at is null or provider_event_at <= p_event_created_at)
      )
    );

  if p_event_type in ('email.bounced', 'email.complained', 'email.suppressed')
     and normalized_email is not null and normalized_email <> '' then
    insert into public.email_suppressions (email, reason, provider_event_id, suppressed_at)
    values (normalized_email, case p_event_type
      when 'email.bounced' then 'hard_bounce'
      when 'email.complained' then 'complaint'
      else 'provider_suppression' end, p_event_id, p_event_created_at)
    on conflict (email) do update set
      reason = excluded.reason, provider_event_id = excluded.provider_event_id,
      suppressed_at = greatest(public.email_suppressions.suppressed_at, excluded.suppressed_at);

    update public.email_deliveries set status = 'suppressed', last_error_code = p_event_type
    where recipient_email = normalized_email and status in ('queued', 'failed');
  end if;
  return true;
end;
$function$
;

alter table private.email_webhook_events
  add constraint email_webhook_event_id_length check(length(event_id) between 1 and 200),
  add constraint email_webhook_event_type_length check(length(event_type) between 1 and 120),
  add constraint email_webhook_event_time_finite check(isfinite(event_created_at));
alter table public.email_deliveries add constraint email_delivery_provider_id_length
  check(provider_message_id is null or length(provider_message_id) between 1 and 200);
