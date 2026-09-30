-- Align new subscription writes with the consent copy currently shown by the app.
-- Historical rows keep the version accepted at their original subscription.
-- The storage constraint represents history; the RPC below admits only current
-- versions for new commands. Direct participant subscription writes stay revoked.
alter table public.email_subscriptions
  drop constraint email_subscriptions_consent_contract,
  add constraint email_subscriptions_consent_contract check (
    case source
      when 'landing' then consent_version in ('2026-07-24', 'landing-night-announcements-v2')
      when 'subscription_management' then consent_version in ('email-preferences-v1', 'email-preferences-v2')
      when 'room_popup' then consent_version = 'global-live-night-email-v1'
      when 'waiting_room' then consent_version = 'global-live-night-email-v1'
      when 'empty_room' then consent_version = 'global-live-night-email-v1'
      else false
    end
  );

CREATE OR REPLACE FUNCTION public.subscribe_to_marketing_email(p_user_id uuid, p_email text, p_locale text, p_source text, p_consent_version text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  owner_id uuid := p_user_id;
  normalized_email text := lower(private.trim_input(p_email) collate "C");
  previous public.email_subscriptions%rowtype;
  delivery_id uuid;
  is_identical boolean;
begin
  if owner_id is null then raise exception 'Authentication required'; end if;
  if not private.valid_marketing_email(p_email) then
    raise exception 'Invalid email';
  end if;
  if p_locale is null or p_locale not in ('en','fr','es')
    or p_source is null or p_source not in ('landing','room_popup','waiting_room','empty_room','subscription_management')
    or p_consent_version is distinct from (case p_source
      when 'landing' then 'landing-night-announcements-v2'
      when 'subscription_management' then 'email-preferences-v2'
      else 'global-live-night-email-v1'
    end) then
    raise exception 'Invalid subscription input';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(owner_id::text, 0));
  select * into previous from public.email_subscriptions where user_id = owner_id;
  is_identical := previous.user_id is not null
    and previous.status = 'subscribed' and previous.email = normalized_email;

  if is_identical then
    return jsonb_build_object('already_subscribed', true, 'email', normalized_email);
  end if;
  if (select count(*) from public.email_deliveries
      where payload ->> 'user_id' = owner_id::text and created_at > now() - interval '1 hour') >= 5 then
    raise exception 'Subscription rate limit exceeded';
  end if;

  insert into public.email_subscriptions (
    user_id, email, locale, source, consent_version, status, subscribed_at, unsubscribed_at
  ) values (
    owner_id, normalized_email, p_locale, p_source, p_consent_version,
    'subscribed', now(), null
  ) on conflict (user_id) do update set
    email = excluded.email, locale = excluded.locale, source = excluded.source,
    consent_version = excluded.consent_version, status = 'subscribed',
    subscribed_at = excluded.subscribed_at, unsubscribed_at = null;

  insert into public.email_deliveries (
    kind, recipient_email, locale, payload, idempotency_key, status
  ) values (
    'welcome', normalized_email, p_locale,
    jsonb_build_object('user_id', owner_id),
    'welcome:' || owner_id::text || ':' || extract(epoch from now())::text,
    case when exists (
      select 1 from public.email_suppressions where email = normalized_email
    ) then 'suppressed' else 'queued' end
  ) returning id into delivery_id;

  return jsonb_build_object(
    'already_subscribed', false, 'email', normalized_email, 'delivery_id', delivery_id
  );
end;
$function$
;

revoke all on function public.subscribe_to_marketing_email(uuid, text, text, text, text) from public, anon, authenticated;
grant execute on function public.subscribe_to_marketing_email(uuid, text, text, text, text) to service_role;
