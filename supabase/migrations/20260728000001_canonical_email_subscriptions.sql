-- Canonical, profile-independent marketing consent. Anonymous Auth users carry
-- the authenticated role, and each user owns exactly one subscription state.
create table public.email_subscriptions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  locale text not null,
  source text not null,
  consent_version text not null,
  status text not null default 'subscribed',
  subscribed_at timestamptz not null default now(),
  unsubscribed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint email_subscriptions_email_normalized
    check (email = lower(btrim(email)) and email ~ '^[^[:space:]@]+@[^[:space:]@]+$'),
  constraint email_subscriptions_locale_valid
    check (locale in ('en', 'fr', 'es')),
  constraint email_subscriptions_source_valid
    check (source in ('landing', 'room_popup', 'waiting_room')),
  constraint email_subscriptions_consent_version_present
    check (btrim(consent_version) <> ''),
  constraint email_subscriptions_status_valid
    check (status in ('subscribed', 'unsubscribed')),
  constraint email_subscriptions_status_timestamps_coherent check (
    (status = 'subscribed' and unsubscribed_at is null)
    or
    (status = 'unsubscribed' and unsubscribed_at is not null and unsubscribed_at >= subscribed_at)
  )
);

comment on table public.email_subscriptions is
  'Owner-scoped canonical state for optional global marketing email consent.';

create trigger set_email_subscriptions_updated_at
before update on public.email_subscriptions
for each row execute function extensions.moddatetime (updated_at);

alter table public.email_subscriptions enable row level security;
revoke all on public.email_subscriptions from anon, public;

create policy "Owners can read their email subscription"
on public.email_subscriptions for select to authenticated
using (user_id = (select auth.uid()));

create policy "Owners can create their email subscription"
on public.email_subscriptions for insert to authenticated
with check (user_id = (select auth.uid()));

create policy "Owners can update their email subscription"
on public.email_subscriptions for update to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

create policy "Owners can delete their email subscription"
on public.email_subscriptions for delete to authenticated
using (user_id = (select auth.uid()));

grant select, insert, update, delete on public.email_subscriptions to authenticated;

-- Legacy room consents had no locale. Use deterministic English until a later
-- owner action records their current locale in the canonical row.
insert into public.email_subscriptions (
  user_id, email, locale, source, consent_version, status, subscribed_at,
  unsubscribed_at, created_at, updated_at
)
select
  id, lower(btrim(email)), 'en', 'room_popup',
  email_marketing_consent_version, 'subscribed', email_marketing_consent_at,
  null, created_at, greatest(updated_at, email_marketing_consent_at)
from public.profile_private
where email is not null
  and email_marketing_consent_at is not null
  and email_marketing_consent_version is not null
on conflict (user_id) do nothing;

alter table public.profile_private
  drop column email,
  drop column email_marketing_consent_at,
  drop column email_marketing_consent_version;
