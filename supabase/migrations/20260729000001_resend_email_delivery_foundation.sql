-- Durable provider-neutral outbox and operational suppressions. These tables
-- contain recipient PII and deliberately have no Data API access for clients.
create table public.email_deliveries (
  id uuid primary key default gen_random_uuid(),
  kind text not null,
  recipient_email text not null,
  locale text not null,
  payload jsonb not null default '{}'::jsonb,
  idempotency_key text not null unique,
  status text not null default 'queued',
  attempt_count integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  provider_message_id text unique,
  provider_event_at timestamptz,
  last_error_code text,
  sent_at timestamptz,
  delivered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint email_deliveries_kind_present check (btrim(kind) <> ''),
  constraint email_deliveries_recipient_normalized
    check (recipient_email = lower(btrim(recipient_email))),
  constraint email_deliveries_locale_valid check (locale in ('en', 'fr', 'es')),
  constraint email_deliveries_status_valid check (
    status in ('queued', 'sending', 'sent', 'delivered', 'failed', 'unknown', 'suppressed')
  ),
  constraint email_deliveries_attempt_count_valid check (attempt_count >= 0)
);

create index email_deliveries_ready_idx
  on public.email_deliveries (next_attempt_at, created_at)
  where status in ('queued', 'failed');

create table public.email_suppressions (
  email text primary key,
  reason text not null,
  provider text not null default 'resend',
  provider_event_id text,
  suppressed_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint email_suppressions_email_normalized check (email = lower(btrim(email))),
  constraint email_suppressions_reason_valid
    check (reason in ('hard_bounce', 'complaint', 'provider_suppression'))
);

create table private.email_webhook_events (
  event_id text primary key,
  event_type text not null,
  event_created_at timestamptz not null,
  received_at timestamptz not null default now()
);

create trigger set_email_deliveries_updated_at before update on public.email_deliveries
for each row execute function extensions.moddatetime(updated_at);
create trigger set_email_suppressions_updated_at before update on public.email_suppressions
for each row execute function extensions.moddatetime(updated_at);

alter table public.email_deliveries enable row level security;
alter table public.email_suppressions enable row level security;
revoke all on public.email_deliveries, public.email_suppressions from public, anon, authenticated;
revoke all on private.email_webhook_events from public, anon, authenticated, service_role;
grant select, insert, update on public.email_deliveries, public.email_suppressions to service_role;

-- Subscription writes now pass through one atomic function so consent and its
-- welcome outbox item cannot diverge. Identical active submissions are no-ops.
create or replace function public.subscribe_to_marketing_email(
  p_user_id uuid,
  p_email text,
  p_locale text,
  p_source text,
  p_consent_version text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner_id uuid := p_user_id;
  normalized_email text := lower(btrim(p_email));
  previous public.email_subscriptions%rowtype;
  delivery_id uuid;
  is_identical boolean;
begin
  if owner_id is null then raise exception 'Authentication required'; end if;
  if normalized_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' then
    raise exception 'Invalid email';
  end if;
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
$$;

-- Idempotency uses the Svix delivery id. Provider timestamps prevent an older
-- delayed event from rolling a delivery state backwards.
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
    provider_event_at = p_event_created_at,
    last_error_code = case when p_event_type in ('email.bounced', 'email.complained', 'email.suppressed')
      then p_event_type else last_error_code end
  where provider_message_id = p_provider_message_id
    and (provider_event_at is null or provider_event_at <= p_event_created_at);

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

revoke all on function public.subscribe_to_marketing_email(uuid, text, text, text, text) from public, anon, authenticated;
grant execute on function public.subscribe_to_marketing_email(uuid, text, text, text, text) to service_role;
revoke all on function public.record_resend_email_event(text, text, timestamptz, text, text) from public, anon, authenticated;
grant execute on function public.record_resend_email_event(text, text, timestamptz, text, text) to service_role;

-- Behavioral boundary: clients can still read their own consent, but direct
-- INSERT/UPDATE/DELETE is revoked in favor of the audited server route + RPC.
drop policy if exists "Owners can create their email subscription" on public.email_subscriptions;
drop policy if exists "Owners can update their email subscription" on public.email_subscriptions;
drop policy if exists "Owners can delete their email subscription" on public.email_subscriptions;
revoke insert, update, delete on public.email_subscriptions from authenticated;
