-- Public unsubscribe links use opaque tokens. Only their SHA-256 hashes are
-- retained, and the private schema keeps both tokens and addresses outside the
-- Data API. Tokens intentionally survive a later re-subscription for 12 months.
create table private.email_unsubscribe_tokens (
  token_hash bytea primary key,
  email text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  constraint email_unsubscribe_tokens_email_normalized
    check (email = lower(btrim(email))),
  constraint email_unsubscribe_tokens_expiry_valid
    check (expires_at > created_at),
  constraint email_unsubscribe_tokens_revocation_valid
    check (revoked_at is null or revoked_at >= created_at)
);

comment on table private.email_unsubscribe_tokens is
  'Hashed, address-scoped tokens for public global marketing unsubscribe links.';

alter table public.email_subscriptions
  drop constraint email_subscriptions_source_valid,
  add constraint email_subscriptions_source_valid
    check (source in ('landing', 'room_popup', 'waiting_room', 'subscription_management'));

create or replace function public.issue_email_unsubscribe_token(
  p_email text,
  p_expires_at timestamptz default (now() + interval '12 months')
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_email text := lower(btrim(p_email));
  raw_token text;
begin
  if normalized_email = '' or p_expires_at <= now() then
    raise exception 'Invalid unsubscribe token request';
  end if;

  raw_token := translate(
    rtrim(pg_catalog.encode(extensions.gen_random_bytes(32), 'base64'), '='),
    '+/', '-_'
  );

  insert into private.email_unsubscribe_tokens (token_hash, email, expires_at)
  values (
    extensions.digest(pg_catalog.convert_to(raw_token, 'UTF8'), 'sha256'),
    normalized_email,
    p_expires_at
  );

  return raw_token;
end;
$$;

create or replace function public.validate_email_unsubscribe_token(p_token text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from private.email_unsubscribe_tokens token
    where token.token_hash = extensions.digest(
      pg_catalog.convert_to(coalesce(p_token, ''), 'UTF8'), 'sha256'
    )
      and token.expires_at > now()
      and token.revoked_at is null
  );
$$;

create or replace function public.unsubscribe_email_by_token(p_token text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  token_email text;
  changed_count integer;
begin
  select token.email into token_email
  from private.email_unsubscribe_tokens token
  where token.token_hash = extensions.digest(
    pg_catalog.convert_to(coalesce(p_token, ''), 'UTF8'), 'sha256'
  )
    and token.expires_at > now()
    and token.revoked_at is null;

  if token_email is null then
    return 'invalid_token';
  end if;

  update public.email_subscriptions
  set status = 'unsubscribed', unsubscribed_at = now()
  where email = token_email and status = 'subscribed';
  get diagnostics changed_count = row_count;

  if changed_count = 0 then
    return 'already_unsubscribed';
  end if;
  return 'unsubscribed';
exception when others then
  return 'failure';
end;
$$;

create or replace function public.unsubscribe_my_email_subscription()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner_email text;
  changed_count integer;
begin
  select subscription.email into owner_email
  from public.email_subscriptions subscription
  where subscription.user_id = (select auth.uid());

  if owner_email is null then
    return 'already_unsubscribed';
  end if;

  update public.email_subscriptions
  set status = 'unsubscribed', unsubscribed_at = now()
  where email = owner_email and status = 'subscribed';
  get diagnostics changed_count = row_count;

  if changed_count = 0 then
    return 'already_unsubscribed';
  end if;
  return 'unsubscribed';
exception when others then
  return 'failure';
end;
$$;

-- Operational revocation is service-only. It is also the narrow test seam for
-- proving that revoked tokens cannot mutate subscription state.
create or replace function public.revoke_email_unsubscribe_token(p_token text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  update private.email_unsubscribe_tokens
  set revoked_at = now()
  where token_hash = extensions.digest(
    pg_catalog.convert_to(coalesce(p_token, ''), 'UTF8'), 'sha256'
  ) and revoked_at is null;
  return found;
end;
$$;

revoke all on table private.email_unsubscribe_tokens from public, anon, authenticated, service_role;
revoke all on function public.issue_email_unsubscribe_token(text, timestamptz) from public, anon, authenticated;
revoke all on function public.revoke_email_unsubscribe_token(text) from public, anon, authenticated;
revoke all on function public.validate_email_unsubscribe_token(text) from public;
revoke all on function public.unsubscribe_email_by_token(text) from public;
revoke all on function public.unsubscribe_my_email_subscription() from public, anon;

grant execute on function public.issue_email_unsubscribe_token(text, timestamptz) to service_role;
grant execute on function public.revoke_email_unsubscribe_token(text) to service_role;
grant execute on function public.validate_email_unsubscribe_token(text) to anon, authenticated, service_role;
grant execute on function public.unsubscribe_email_by_token(text) to anon, authenticated, service_role;
grant execute on function public.unsubscribe_my_email_subscription() to authenticated;
