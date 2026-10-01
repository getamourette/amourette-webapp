-- #158. Behavioral migration: founder approval is required before remote application.
-- The existing welcome pipeline stays intact; campaigns use the same private outbox.
create table public.email_campaigns (
  id uuid primary key default gen_random_uuid(),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  confirmed_at timestamptz,
  nights jsonb not null check (jsonb_typeof(nights) = 'array' and jsonb_array_length(nights) between 1 and 20),
  messages jsonb not null check (jsonb_typeof(messages) = 'object'),
  constraint campaign_confirmation_time check (confirmed_at is null or confirmed_at >= created_at)
);
create table public.email_campaign_nights (
  campaign_id uuid not null references public.email_campaigns(id) on delete cascade,
  -- Historical selections survive venue deletion; current eligibility is checked at send.
  venue_night_id uuid not null,
  primary key (campaign_id, venue_night_id)
);
alter table public.email_deliveries add column campaign_id uuid references public.email_campaigns(id);
alter table public.email_deliveries add constraint email_campaign_kind
  check ((kind = 'upcoming_nights') = (campaign_id is not null));
create unique index email_campaign_recipient_unique on public.email_deliveries(campaign_id, recipient_email)
  where campaign_id is not null;
create index email_campaign_frequency on public.email_deliveries(recipient_email, created_at)
  where campaign_id is not null;
alter table public.email_campaigns enable row level security;
alter table public.email_campaign_nights enable row level security;
revoke all on public.email_campaigns, public.email_campaign_nights from public, anon, authenticated, service_role;
-- No direct table writes: only the bounded commands below. No recipient projection to clients.
grant select on public.email_campaigns, public.email_campaign_nights to service_role;

create function private.require_campaign_founder(p_actor uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_actor is null or not exists(select 1 from public.admins where user_id = p_actor) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
end;
$$;

create function private.campaign_nights(p_ids uuid[]) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare result jsonb;
begin
  if p_ids is null or array_ndims(p_ids) is distinct from 1 or cardinality(p_ids) not between 1 and 20
    or array_position(p_ids, null) is not null or cardinality(p_ids) <> (select count(distinct id) from unnest(p_ids) id)
    then raise exception 'invalid_nights'; end if;
  -- Lock source rows so edits/deletes cannot race confirmation. Consistent ordering.
  perform n.id from public.venue_nights n join public.venues v on v.id = n.venue_id
    where n.id = any(p_ids) order by n.id for share of n, v;
  select jsonb_agg(jsonb_build_object('id', n.id, 'venue_id', v.id, 'name', v.name, 'city', v.city,
    'timezone', v.timezone, 'waiting_opens_at', n.waiting_opens_at,
    'guaranteed_launch_at', n.guaranteed_launch_at, 'closes_at', n.closes_at)
    order by n.waiting_opens_at, n.id) into result
  from public.venue_nights n join public.venues v on v.id = n.venue_id
  where n.id = any(p_ids) and not v.is_test_venue and n.terminal_at is null
    and n.status = 'closed' and n.waiting_opens_at > clock_timestamp();
  if result is null or jsonb_array_length(result) <> cardinality(p_ids) then raise exception 'nights_changed'; end if;
  return result;
end;
$$;

create function private.campaign_address_available(p_email text, p_except uuid default null) returns boolean
language sql stable security definer set search_path = '' as $$
  select not exists(select 1 from public.email_deliveries d
    where d.campaign_id is not null and d.recipient_email = p_email and d.id is distinct from p_except
      and (d.created_at > now() - interval '7 days' or d.sent_at > now() - interval '7 days'
        or d.status in ('queued', 'sending', 'unknown')));
$$;

create function private.campaign_recipients()
returns table(email text, locale text, user_id uuid, reason text)
language sql stable security definer set search_path = '' as $$
  with latest as (
    select distinct on (s.email) s.email, s.locale, s.user_id
    from public.email_subscriptions s
    where s.status = 'subscribed' and s.unsubscribed_at is null and s.subscribed_at <= now()
      and private.valid_marketing_email(s.email) and btrim(s.consent_version) <> ''
    order by s.email, s.subscribed_at desc, s.updated_at desc, s.user_id
  ) select l.email, l.locale, l.user_id,
    case when exists(select 1 from public.email_suppressions x where x.email = l.email) then 'suppressed'
      when not private.campaign_address_available(l.email) then 'frequency' else 'eligible' end
  from latest l;
$$;

create function private.campaign_audience() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('eligible', count(*) filter(where reason = 'eligible'),
    'en', count(*) filter(where reason = 'eligible' and locale = 'en'),
    'fr', count(*) filter(where reason = 'eligible' and locale = 'fr'),
    'es', count(*) filter(where reason = 'eligible' and locale = 'es'),
    'frequency', count(*) filter(where reason = 'frequency'),
    'suppressed', count(*) filter(where reason = 'suppressed')) from private.campaign_recipients();
$$;

create function private.campaign_projection(p_id uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('id', c.id, 'created_at', c.created_at, 'confirmed_at', c.confirmed_at,
    'nights', c.nights, 'messages', c.messages, 'counts', (
      select jsonb_build_object('queued', count(*) filter(where status = 'queued'),
        'sending', count(*) filter(where status = 'sending'), 'sent', count(*) filter(where status = 'sent'),
        'delivered', count(*) filter(where status = 'delivered'), 'failed', count(*) filter(where status = 'failed' or (status = 'suppressed' and provider_message_id is not null)),
        'unknown', count(*) filter(where status = 'unknown'), 'skipped', count(*) filter(where status = 'suppressed' and provider_message_id is null))
      from public.email_deliveries where campaign_id = c.id)) from public.email_campaigns c where c.id = p_id;
$$;

create function public.admin_email_campaign_context(p_actor uuid, p_night_ids uuid[]) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_campaign_founder(p_actor);
  return jsonb_build_object('nights', private.campaign_nights(p_night_ids), 'audience', private.campaign_audience());
end;
$$;

create function public.admin_email_campaign_dashboard(p_actor uuid, p_offset integer default 0) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare nights jsonb; campaigns jsonb;
begin
  perform private.require_campaign_founder(p_actor);
  if p_offset is null or p_offset < 0 or p_offset > 100000 or p_offset % 20 <> 0 then raise exception 'invalid_offset'; end if;
  select coalesce(jsonb_agg(item order by starts_at, id), '[]'::jsonb) into nights from (
    select n.id, n.waiting_opens_at starts_at, jsonb_build_object('id', n.id, 'venue_id', v.id, 'name', v.name,
      'city', v.city, 'timezone', v.timezone, 'waiting_opens_at', n.waiting_opens_at,
      'guaranteed_launch_at', n.guaranteed_launch_at, 'closes_at', n.closes_at) item
    from public.venue_nights n join public.venues v on v.id = n.venue_id
    where not v.is_test_venue and n.terminal_at is null and n.status = 'closed' and n.waiting_opens_at > now()
  ) upcoming;
  select coalesce(jsonb_agg(private.campaign_projection(id) order by created_at desc, id desc), '[]'::jsonb)
    into campaigns from (select id, created_at from public.email_campaigns order by created_at desc, id desc limit 20 offset p_offset) c;
  return jsonb_build_object('nights', nights, 'campaigns', campaigns,
    'hasMore', (select count(*) > p_offset + 20 from public.email_campaigns));
end;
$$;

create function public.admin_prepare_email_campaign(p_actor uuid, p_night_ids uuid[], p_nights jsonb, p_messages jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare campaign_id uuid; current_nights jsonb; lang text;
begin
  perform private.require_campaign_founder(p_actor);
  perform pg_advisory_xact_lock(hashtextextended('email-campaigns', 0));
  if (select count(*) from public.email_campaigns where created_by = p_actor and created_at > now() - interval '1 hour') >= 30 then
    raise exception 'preview_rate_limit'; end if;
  current_nights := private.campaign_nights(p_night_ids);
  if p_nights is distinct from current_nights then raise exception 'nights_changed'; end if;
  if p_messages is null or jsonb_typeof(p_messages) <> 'object' or octet_length(p_messages::text) > 800000
    or (select count(*) from jsonb_object_keys(p_messages)) <> 3 then raise exception 'invalid_messages'; end if;
  foreach lang in array array['en','fr','es'] loop
    if jsonb_typeof(p_messages->lang) is distinct from 'object'
      or jsonb_typeof(p_messages->lang->'subject') is distinct from 'string'
      or jsonb_typeof(p_messages->lang->'html') is distinct from 'string'
      or jsonb_typeof(p_messages->lang->'text') is distinct from 'string'
      or length(p_messages->lang->>'subject') not between 1 and 200
      or length(p_messages->lang->>'html') not between 1 and 200000
      or length(p_messages->lang->>'text') not between 1 and 50000
      or position('https://getamourette.com/unsubscribe?token=CAMPAIGN_PREVIEW' in p_messages->lang->>'html') = 0
      or position('https://getamourette.com/unsubscribe?token=CAMPAIGN_PREVIEW' in p_messages->lang->>'text') = 0
      then raise exception 'invalid_messages'; end if;
  end loop;
  insert into public.email_campaigns(created_by, nights, messages) values(p_actor, current_nights, p_messages) returning id into campaign_id;
  insert into public.email_campaign_nights select campaign_id, unnest(p_night_ids);
  return jsonb_build_object('campaign', private.campaign_projection(campaign_id), 'audience', private.campaign_audience());
end;
$$;

create function public.admin_review_email_campaign(p_actor uuid, p_campaign_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare c public.email_campaigns%rowtype; ids uuid[];
begin
  perform private.require_campaign_founder(p_actor);
  select * into c from public.email_campaigns where id = p_campaign_id;
  if c.id is null then raise exception 'campaign_not_found'; end if;
  if c.confirmed_at is null then
    select array_agg(venue_night_id) into ids from public.email_campaign_nights where campaign_id = c.id;
    if c.nights is distinct from private.campaign_nights(ids) then raise exception 'nights_changed'; end if;
  end if;
  return jsonb_build_object('campaign', private.campaign_projection(c.id), 'audience', private.campaign_audience());
end;
$$;

-- Database guard applies even to direct service-role outbox inserts/edits.
create function private.guard_campaign_delivery() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and (new.campaign_id is distinct from old.campaign_id or new.recipient_email <> old.recipient_email
    or new.kind <> old.kind or new.created_at <> old.created_at or new.locale <> old.locale or new.payload <> old.payload) then
    if old.campaign_id is not null or new.campaign_id is not null then raise exception 'immutable_campaign_delivery'; end if;
  end if;
  if tg_op = 'INSERT' and new.campaign_id is not null then
    perform pg_advisory_xact_lock(hashtextextended('email-campaigns', 0));
    if not exists(select 1 from public.email_campaigns where id = new.campaign_id and confirmed_at is not null)
      or not private.campaign_address_available(new.recipient_email) then raise exception 'campaign_frequency_limit'; end if;
  end if;
  return new;
end;
$$;
create trigger guard_campaign_delivery before insert or update on public.email_deliveries
for each row execute function private.guard_campaign_delivery();

create function public.admin_confirm_email_campaign(p_actor uuid, p_campaign_id uuid, p_expected_audience jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare c public.email_campaigns%rowtype; ids uuid[]; audience jsonb;
begin
  perform private.require_campaign_founder(p_actor);
  perform pg_advisory_xact_lock(hashtextextended('email-campaigns', 0));
  select * into c from public.email_campaigns where id = p_campaign_id for update;
  if c.id is null then raise exception 'campaign_not_found'; end if;
  -- The persisted draft UUID is the request receipt: lost responses replay safely.
  if c.confirmed_at is not null then return private.campaign_projection(c.id); end if;
  select array_agg(venue_night_id) into ids from public.email_campaign_nights where campaign_id = c.id;
  if c.nights is distinct from private.campaign_nights(ids) then raise exception 'nights_changed'; end if;
  -- Freeze subscription/suppression reads for the queue transaction, including insert phantoms.
  lock table public.email_subscriptions, public.email_suppressions in share mode;
  audience := private.campaign_audience();
  if p_expected_audience is distinct from audience then raise exception 'audience_changed'; end if;
  if (audience->>'eligible')::integer = 0 then raise exception 'empty_audience'; end if;
  update public.email_campaigns set confirmed_at = now() where id = c.id;
  insert into public.email_deliveries(kind, campaign_id, recipient_email, locale, payload, idempotency_key)
    select 'upcoming_nights', c.id, r.email, r.locale, jsonb_build_object('user_id', r.user_id),
      'campaign:' || c.id::text || ':' || r.email from private.campaign_recipients() r where r.reason = 'eligible';
  return private.campaign_projection(c.id);
end;
$$;

create function public.admin_retry_email_campaign(p_actor uuid, p_campaign_id uuid) returns integer
language plpgsql security definer set search_path = '' as $$
declare changed integer; c public.email_campaigns%rowtype; ids uuid[];
begin
  perform private.require_campaign_founder(p_actor);
  perform pg_advisory_xact_lock(hashtextextended('email-campaigns', 0));
  select * into c from public.email_campaigns where id = p_campaign_id and confirmed_at is not null;
  if c.id is null then raise exception 'campaign_not_found'; end if;
  select array_agg(venue_night_id) into ids from public.email_campaign_nights where campaign_id = c.id;
  if c.nights is distinct from private.campaign_nights(ids) then raise exception 'nights_changed'; end if;
  -- Never retry sent/bounced/provider-known or ambiguous deliveries. The claim rechecks all eligibility.
  update public.email_deliveries set status = 'queued', next_attempt_at = now()
    where campaign_id = p_campaign_id and status = 'failed' and provider_message_id is null and sent_at is null
      and ((last_error_code ~ '^resend_http_4[0-9][0-9]$' and last_error_code not in ('resend_http_408','resend_http_409')) or last_error_code = 'delivery_setup_error')
      and private.campaign_address_available(recipient_email, id);
  get diagnostics changed = row_count;
  return changed;
end;
$$;

create or replace function public.claim_email_delivery(p_delivery_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare d public.email_deliveries%rowtype; c public.email_campaigns%rowtype; ids uuid[];
begin
  -- Same lock order as confirmation/retry; row locks still protect welcome deliveries.
  perform pg_advisory_xact_lock(hashtextextended('email-campaigns', 0));
  select * into d from public.email_deliveries where id = p_delivery_id for update skip locked;
  if d.id is null or not (d.status in ('queued','failed') and d.next_attempt_at <= now()) then return null; end if;
  if exists(select 1 from public.email_suppressions where email = d.recipient_email)
    or not exists(select 1 from public.email_subscriptions where email = d.recipient_email and status = 'subscribed'
      and unsubscribed_at is null and subscribed_at <= now() and btrim(consent_version) <> '') then
    update public.email_deliveries set status = 'suppressed', last_error_code = 'ineligible_before_send' where id = d.id;
    return null;
  end if;
  if d.campaign_id is not null then
    select * into c from public.email_campaigns where id = d.campaign_id;
    select array_agg(venue_night_id) into ids from public.email_campaign_nights where campaign_id = c.id;
    begin
      if c.nights is distinct from private.campaign_nights(ids) then raise exception 'nights_changed'; end if;
    exception when raise_exception then
      update public.email_deliveries set status = 'suppressed', last_error_code = 'nights_changed' where id = d.id;
      return null;
    end;
    if not private.campaign_address_available(d.recipient_email, d.id) then
      update public.email_deliveries set status = 'suppressed', last_error_code = 'campaign_frequency_limit' where id = d.id;
      return null;
    end if;
  end if;
  update public.email_deliveries set status = 'sending', attempt_count = attempt_count + 1 where id = d.id returning * into d;
  return jsonb_build_object('id', d.id, 'kind', d.kind, 'recipient_email', d.recipient_email,
    'locale', d.locale, 'attempt_count', d.attempt_count, 'message', c.messages->d.locale);
end;
$$;

-- Called after rendering/token issuance, immediately before the provider request.
create function public.authorize_email_transport(p_delivery_id uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare d public.email_deliveries%rowtype;
begin
  select * into d from public.email_deliveries where id = p_delivery_id for update;
  if d.id is null or d.status <> 'sending' then return false; end if;
  if exists(select 1 from public.email_suppressions where email = d.recipient_email)
    or not exists(select 1 from public.email_subscriptions where email = d.recipient_email and status = 'subscribed'
      and unsubscribed_at is null and subscribed_at <= now() and btrim(consent_version) <> '') then
    update public.email_deliveries set status = 'suppressed', last_error_code = 'ineligible_before_send' where id = d.id;
    return false;
  end if;
  return true;
end;
$$;

revoke all on function private.require_campaign_founder(uuid), private.campaign_nights(uuid[]),
  private.campaign_address_available(text,uuid), private.campaign_recipients(), private.campaign_audience(),
  private.campaign_projection(uuid), private.guard_campaign_delivery() from public, anon, authenticated, service_role;
revoke all on function public.admin_email_campaign_context(uuid,uuid[]), public.admin_email_campaign_dashboard(uuid,integer),
  public.admin_prepare_email_campaign(uuid,uuid[],jsonb,jsonb), public.admin_review_email_campaign(uuid,uuid),
  public.admin_confirm_email_campaign(uuid,uuid,jsonb), public.admin_retry_email_campaign(uuid,uuid),
  public.authorize_email_transport(uuid) from public, anon, authenticated;
grant execute on function public.admin_email_campaign_context(uuid,uuid[]), public.admin_email_campaign_dashboard(uuid,integer),
  public.admin_prepare_email_campaign(uuid,uuid[],jsonb,jsonb), public.admin_review_email_campaign(uuid,uuid),
  public.admin_confirm_email_campaign(uuid,uuid,jsonb), public.admin_retry_email_campaign(uuid,uuid),
  public.authorize_email_transport(uuid) to service_role;
