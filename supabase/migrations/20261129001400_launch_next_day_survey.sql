-- #559: the day after a night, guests who arrived may receive a thank-you email
-- with a short survey and a separate opt-in to hear about the next night.
-- Decision and the open legal question: docs/decisions/2026-11-27-next-day-survey.md.
--
-- Off by default, per night: nothing is queued for a night until a founder turns
-- the survey on for it (private.launch_survey_settings). No night has a row after
-- this migration, so it sends nothing by itself.
--
-- Behaviour: one new outbox kind, launch_mail_eligible replaced with the same
-- arguments, the subscription source and consent version widened, and
-- subscribe_to_marketing_email replaced with the same arguments to admit them.
-- New: survey settings, links and answers, their functions and one pg_cron job.
-- The survey email reuses the outbox of #184/#189: same worker, retries, Resend
-- idempotency key, founder alert and resend (#489). No existing row changes.
--
-- Rules, all enforced here rather than by the worker:
-- * only a reservation with a verified arrival whose arrival credential was not
--   revoked, on a night that was not cancelled and has ended, and only while the
--   founder setting is on (checked again at every claim, render and send);
-- * from 11:00 venue time the day after the night starts, for three days at most;
-- * one survey email per reservation (private.launch_mail_events key);
-- * answers are stored with the night only, never with the reservation, the
--   email or any account: they cannot be joined to likes, matches or a person.

create table private.launch_survey_settings (
  night_id uuid primary key references private.launch_events(night_id) on delete cascade,
  enabled_at timestamptz not null default clock_timestamp(),
  enabled_by uuid references auth.users(id) on delete set null
);

-- One private survey link per reservation. The token is stored hashed; the email
-- carries it in the URL fragment. answered_at allows one answer per link.
create table private.launch_survey_links (
  reservation_id uuid primary key references private.launch_reservations(id) on delete cascade,
  mail_id uuid not null unique,
  night_id uuid not null references private.launch_events(night_id) on delete cascade,
  token_hash bytea not null,
  expires_at timestamptz not null,
  answered_at timestamptz
);

-- Deliberately without reservation, email or account: only the night.
create table private.launch_survey_answers (
  id bigint generated always as identity primary key,
  night_id uuid not null references private.launch_events(night_id) on delete cascade,
  matched text check (matched in ('yes','no')),
  talked text check (talked in ('yes','no')),
  at_ease text check (at_ease in ('yes','somewhat','no')),
  heard_from text check (heard_from in ('friend','instagram','venue','street','other')),
  submitted_at timestamptz not null default clock_timestamp(),
  check (num_nonnulls(matched,talked,at_ease,heard_from) > 0)
);
revoke all on table private.launch_survey_settings,private.launch_survey_links,private.launch_survey_answers
  from public,anon,authenticated,service_role;

alter table private.launch_access_mail drop constraint launch_access_mail_kind_check;
alter table private.launch_access_mail add constraint launch_access_mail_kind_check
  check(kind in ('confirmed_access','recovery','participant_cancelled','event_cancelled','event_postponed','refund_succeeded',
    'corrected_summary','reminder_two_days','reminder_morning','next_day_survey'));

-- 11:00 on the venue's calendar day after the night starts.
create function private.launch_survey_at(p_starts timestamptz,p_timezone text) returns timestamptz
language sql stable set search_path='' as $$
  select (((p_starts at time zone p_timezone)::date + 1) + time '11:00') at time zone p_timezone
$$;

create function private.launch_survey_due(p_reservation uuid,p_now timestamptz) returns boolean
language sql stable set search_path='' as $$
  select exists(select 1 from private.launch_reservations r
    join private.launch_events e on e.night_id=r.night_id
    join private.launch_survey_settings s on s.night_id=r.night_id
    join public.venue_nights n on n.id=r.night_id join public.venues v on v.id=n.venue_id
    join private.launch_credentials c on c.reservation_id=r.id
    join private.launch_arrivals a on a.reservation_id=r.id
    cross join lateral (select private.launch_survey_at(n.waiting_opens_at,v.timezone) at) t
    where r.id=p_reservation and r.state='confirmed' and a.outcome='verified'
      and c.arrival_revoked_at is null and e.cancelled_at is null
      and n.closes_at<=p_now and p_now>=t.at and p_now<t.at+interval '3 days')
$$;

-- Called every fifteen minutes by pg_cron. Concurrent runs are harmless: the
-- event receipt's primary key lets exactly one of them queue the mail.
create function private.queue_launch_surveys(p_now timestamptz default clock_timestamp()) returns void
language plpgsql set search_path='' as $$
declare x record;
begin
  for x in select r.id from private.launch_reservations r
      join private.launch_survey_settings s on s.night_id=r.night_id
      join public.venue_nights n on n.id=r.night_id
    where r.state='confirmed' and n.waiting_opens_at<p_now and n.waiting_opens_at>p_now-interval '6 days'
      and not exists(select 1 from private.launch_mail_events m where m.reservation_id=r.id and m.event_key='next_day_survey')
      and private.launch_survey_due(r.id,p_now)
    order by r.id loop
    perform private.queue_launch_lifecycle_mail(x.id,'next_day_survey','next_day_survey');
  end loop;
end $$;

-- Same body as 20261129001200, plus the survey line.
create or replace function private.launch_mail_eligible(m private.launch_access_mail) returns boolean
language sql stable set search_path='' as $$
  select exists(select 1 from private.launch_reservations r join public.venue_nights n on n.id=r.night_id
    join private.launch_events e on e.night_id=r.night_id
    join private.launch_credentials c on c.reservation_id=r.id
    where r.id=m.reservation_id and r.email=m.recipient_email
      and not exists(select 1 from public.email_suppressions s where s.email=m.recipient_email)
      and (m.kind<>'confirmed_access' or (r.state='confirmed' and e.cancelled_at is null and n.terminal_at is null
        and n.closes_at>clock_timestamp() and c.arrival_revoked_at is null))
      and (m.kind not in ('reminder_two_days','reminder_morning') or private.launch_reminder_due(r.id,m.kind,clock_timestamp()))
      and (m.kind<>'next_day_survey' or private.launch_survey_due(r.id,clock_timestamp()))
      and (m.kind<>'participant_cancelled' or e.cancelled_at is null)
      and (m.kind<>'refund_succeeded' or exists(select 1 from private.launch_refunds f
        where f.reservation_id=r.id and f.state='succeeded' and f.operation_id=m.refund_operation))
      and (m.token_hash is null or (m.token_expires_at>clock_timestamp()
        and c.management_hash=m.credential_hash and c.management_expires_at=m.credential_expires_at)))
$$;

-- Worker only: binds a fresh survey token to a claimed survey email before it is
-- rendered. A retry before the payload is frozen replaces a token never sent; an
-- answered link is never replaced.
create function public.bind_launch_survey_mail(p_id uuid,p_claim uuid,p_token text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare m private.launch_access_mail; l private.launch_survey_links;
begin
  perform private.launch_secret_hash(p_token);
  select * into m from private.launch_access_mail where id=p_id for update;
  if not found or m.claim_id is distinct from p_claim or m.state<>'sending' or m.lease_until<=clock_timestamp()
    or m.kind<>'next_day_survey' or m.payload_envelope is not null then raise exception 'mail claim unavailable'; end if;
  insert into private.launch_survey_links(reservation_id,mail_id,night_id,token_hash,expires_at)
    select r.id,m.id,r.night_id,private.launch_secret_hash(p_token),clock_timestamp()+interval '14 days'
    from private.launch_reservations r where r.id=m.reservation_id
  on conflict (reservation_id) do update set mail_id=excluded.mail_id,token_hash=excluded.token_hash,expires_at=excluded.expires_at
    where private.launch_survey_links.answered_at is null
  returning * into l;
  if l.reservation_id is null then raise exception 'survey already answered'; end if;
  return jsonb_build_object('expires_at',l.expires_at);
end $$;

-- The survey page's header and state. Returns only what the page shows.
create function public.read_launch_survey(p_link uuid,p_token text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare l private.launch_survey_links; result jsonb;
begin
  select * into l from private.launch_survey_links where mail_id=p_link;
  if not found or p_token is null or p_token !~ '^[0-9a-f]{64}$' or l.token_hash<>private.launch_secret_hash(p_token) then
    return jsonb_build_object('status','invalid');
  end if;
  select jsonb_build_object('status',case when l.answered_at is not null then 'answered'
      when l.expires_at<=clock_timestamp() then 'expired' else 'open' end,
    'locale',r.locale,'venue_name',v.name,'starts_at',n.waiting_opens_at,'timezone',v.timezone)
  into result from private.launch_reservations r join public.venue_nights n on n.id=r.night_id
    join public.venues v on v.id=n.venue_id where r.id=l.reservation_id;
  return result;
end $$;

-- Records one answer per link, then, only when the guest ticked the separate
-- box, subscribes the reservation's email to the next-nights list with its own
-- consent version. p_user is the browser's own verified session (the route
-- checks it), never a value the guest chooses. Invalid input is refused before
-- any effect; a subscription failure rolls the answer back so the guest retries.
create function public.submit_launch_survey(p_link uuid,p_token text,p_matched text,p_talked text,p_at_ease text,
  p_heard text,p_next_night boolean,p_user uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare l private.launch_survey_links; r private.launch_reservations; subscription jsonb;
begin
  if (p_matched is not null and p_matched not in ('yes','no')) or (p_talked is not null and p_talked not in ('yes','no'))
    or (p_at_ease is not null and p_at_ease not in ('yes','somewhat','no'))
    or (p_heard is not null and p_heard not in ('friend','instagram','venue','street','other'))
    or p_next_night is null or (p_next_night and p_user is null)
    or (num_nonnulls(p_matched,p_talked,p_at_ease,p_heard)=0 and not p_next_night) then
    raise exception 'invalid survey answer' using errcode='22023';
  end if;
  perform private.launch_secret_hash(p_token);
  select * into l from private.launch_survey_links where mail_id=p_link for update;
  if not found or l.token_hash<>private.launch_secret_hash(p_token) then return jsonb_build_object('status','invalid'); end if;
  if l.answered_at is not null then return jsonb_build_object('status','answered'); end if;
  if l.expires_at<=clock_timestamp() then return jsonb_build_object('status','expired'); end if;
  if num_nonnulls(p_matched,p_talked,p_at_ease,p_heard)>0 then
    insert into private.launch_survey_answers(night_id,matched,talked,at_ease,heard_from)
      values(l.night_id,p_matched,p_talked,p_at_ease,p_heard);
  end if;
  update private.launch_survey_links set answered_at=clock_timestamp() where reservation_id=l.reservation_id;
  if p_next_night then
    select * into r from private.launch_reservations where id=l.reservation_id;
    subscription:=public.subscribe_to_marketing_email(p_user,r.email,r.locale,'next_day_survey','next-day-survey-v1');
  end if;
  return jsonb_build_object('status','recorded','delivery_id',subscription->>'delivery_id');
end $$;

-- Founder setting and totals. Totals only: no answer row leaves the database.
create function public.admin_set_launch_survey(p_night uuid,p_enabled boolean) returns boolean
language plpgsql security definer set search_path='' as $$
begin
  if not private.is_admin() then raise exception 'not authorized' using errcode='42501'; end if;
  if p_night is null or p_enabled is null or not exists(select 1 from private.launch_events where night_id=p_night) then
    raise exception 'unknown night';
  end if;
  if p_enabled then
    insert into private.launch_survey_settings(night_id,enabled_by) values(p_night,auth.uid()) on conflict (night_id) do nothing;
  else
    delete from private.launch_survey_settings where night_id=p_night;
  end if;
  return p_enabled;
end $$;

create function public.admin_launch_survey(p_night uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
  if not private.is_admin() then raise exception 'not authorized' using errcode='42501'; end if;
  if p_night is null or not exists(select 1 from private.launch_events where night_id=p_night) then raise exception 'unknown night'; end if;
  select jsonb_build_object(
      'enabled',exists(select 1 from private.launch_survey_settings where night_id=p_night),
      'send_at',(select private.launch_survey_at(n.waiting_opens_at,v.timezone) from public.venue_nights n
        join public.venues v on v.id=n.venue_id where n.id=p_night),
      'queued',(select count(*) from private.launch_mail_events m join private.launch_reservations r on r.id=m.reservation_id
        where r.night_id=p_night and m.event_key='next_day_survey'),
      'answers',count(a.id),
      'matched_yes',count(*) filter(where a.matched='yes'),'matched_no',count(*) filter(where a.matched='no'),
      'talked_yes',count(*) filter(where a.talked='yes'),'talked_no',count(*) filter(where a.talked='no'),
      'at_ease_yes',count(*) filter(where a.at_ease='yes'),'at_ease_somewhat',count(*) filter(where a.at_ease='somewhat'),
      'at_ease_no',count(*) filter(where a.at_ease='no'),
      'heard_friend',count(*) filter(where a.heard_from='friend'),'heard_instagram',count(*) filter(where a.heard_from='instagram'),
      'heard_venue',count(*) filter(where a.heard_from='venue'),'heard_street',count(*) filter(where a.heard_from='street'),
      'heard_other',count(*) filter(where a.heard_from='other'))
    into result from private.launch_survey_answers a where a.night_id=p_night;
  return result;
end $$;

-- The next-nights list gains one source and its consent version.
alter table public.email_subscriptions
  drop constraint email_subscriptions_source_valid,
  add constraint email_subscriptions_source_valid
    check (source in ('landing','room_popup','waiting_room','subscription_management','empty_room','next_day_survey'));
alter table public.email_subscriptions
  drop constraint email_subscriptions_consent_contract,
  add constraint email_subscriptions_consent_contract check (
    case source
      when 'landing' then consent_version in ('2026-07-24', 'landing-night-announcements-v2')
      when 'subscription_management' then consent_version in ('email-preferences-v1', 'email-preferences-v2')
      when 'room_popup' then consent_version = 'global-live-night-email-v1'
      when 'waiting_room' then consent_version = 'global-live-night-email-v1'
      when 'empty_room' then consent_version = 'global-live-night-email-v1'
      when 'next_day_survey' then consent_version = 'next-day-survey-v1'
      else false
    end
  );

-- Same body as 20260930170320, plus the survey source and its version.
create or replace function public.subscribe_to_marketing_email(p_user_id uuid, p_email text, p_locale text, p_source text, p_consent_version text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
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
    or p_source is null or p_source not in ('landing','room_popup','waiting_room','empty_room','subscription_management','next_day_survey')
    or p_consent_version is distinct from (case p_source
      when 'landing' then 'landing-night-announcements-v2'
      when 'subscription_management' then 'email-preferences-v2'
      when 'next_day_survey' then 'next-day-survey-v1'
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
$function$;

revoke all on function private.launch_survey_at(timestamptz,text),private.launch_survey_due(uuid,timestamptz),
  private.queue_launch_surveys(timestamptz) from public,anon,authenticated,service_role;
revoke all on function public.bind_launch_survey_mail(uuid,uuid,text),public.read_launch_survey(uuid,text),
  public.submit_launch_survey(uuid,text,text,text,text,text,boolean,uuid) from public,anon,authenticated;
grant execute on function public.bind_launch_survey_mail(uuid,uuid,text),public.read_launch_survey(uuid,text),
  public.submit_launch_survey(uuid,text,text,text,text,text,boolean,uuid) to service_role;
revoke all on function public.admin_set_launch_survey(uuid,boolean),public.admin_launch_survey(uuid) from public,anon,service_role;
grant execute on function public.admin_set_launch_survey(uuid,boolean),public.admin_launch_survey(uuid) to authenticated;
revoke all on function public.subscribe_to_marketing_email(uuid, text, text, text, text) from public, anon, authenticated;
grant execute on function public.subscribe_to_marketing_email(uuid, text, text, text, text) to service_role;

select cron.schedule('amourette-launch-surveys','*/15 * * * *',$$select private.queue_launch_surveys();$$);
