-- Resend can timestamp email.delivered a fraction of a second after an
-- email.complained test event, even when the complaint webhook arrives later.
-- Terminal reputation events must win regardless of provider timestamp, while
-- a later delivery event must never roll a suppressed delivery backward.
create or replace function public.record_resend_email_event(
  p_event_id text,
  p_event_type text,
  p_event_created_at timestamptz,
  p_provider_message_id text,
  p_recipient_email text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  inserted_count integer;
  normalized_email text := lower(btrim(p_recipient_email));
begin
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
$$;

revoke all on function public.record_resend_email_event(text, text, timestamptz, text, text) from public, anon, authenticated;
grant execute on function public.record_resend_email_event(text, text, timestamptz, text, text) to service_role;
