-- #189: applied with founder approval on 2026-10-17 as 20261017205749.
-- Reuse #184's outbox, proof exchange, leases and provider operation identities.
alter table private.launch_access_mail drop constraint launch_access_mail_kind_check;
alter table private.launch_access_mail add constraint launch_access_mail_kind_check
  check(kind in ('confirmed_access','recovery','participant_cancelled','event_cancelled','event_postponed','refund_succeeded','corrected_summary'));
alter table private.launch_access_mail
  add column payload_envelope text check(payload_envelope is null or
    (length(payload_envelope) between 103 and 262144 and payload_envelope ~ '^v1\.[A-Za-z0-9_-]+$')),
  add column refund_operation uuid,
  add column payload_version text check(payload_version ~ '^[a-f0-9]{64}$');

-- Legacy attempts did not freeze the full provider body. Do not change an
-- already-attempted operation's content during this rollout or recreate it.
update private.launch_access_mail set state='unknown',completed_at=clock_timestamp(),claim_id=null,lease_until=null
  where first_attempt_at is not null and state in ('failed','sending');

-- Keep minimal event receipts after the 30-day message retention. Deleting old
-- messages must never turn a repeated provider observation into a fresh email.
create table private.launch_mail_events (
  reservation_id uuid not null references private.launch_reservations(id) on delete restrict,
  event_key text not null check(event_key ~ '^[a-z_/-]{1,40}[a-f0-9-]{0,36}$'),
  primary key(reservation_id,event_key)
);
alter table private.launch_mail_events enable row level security;
revoke all on private.launch_mail_events from public,anon,authenticated,service_role;

create function private.queue_launch_lifecycle_mail(p_id uuid,p_kind text,p_key text,p_operation uuid default null) returns void
language plpgsql set search_path='' as $$
begin
  -- No backfill and no recipient supplied by a caller. Missing checkout origin
  -- means the payment has no trusted delivery handoff; do not invent one.
  if not exists(select 1 from private.launch_checkout_work where reservation_id=p_id) then return; end if;
  insert into private.launch_mail_events values(p_id,p_key) on conflict do nothing;
  if not found then return; end if;
  insert into private.launch_access_mail(reservation_id,kind,recipient_email,locale,origin,refund_operation)
    select r.id,p_kind,r.email,r.locale,w.origin,p_operation from private.launch_reservations r
    join private.launch_checkout_work w on w.reservation_id=r.id where r.id=p_id;
end $$;

create function private.launch_lifecycle_audit_mail() returns trigger
language plpgsql security definer set search_path='' as $$
declare id uuid; reason text;
begin
  if new.action='participant_cancelled' then
    perform private.queue_launch_lifecycle_mail(new.reservation_id,'participant_cancelled','participant_cancelled');
  elsif new.action='event_cancelled' then
    select cancellation_reason into reason from private.launch_events where night_id=new.night_id;
    for id in select r.id from private.launch_reservations r join private.launch_payments p on p.reservation_id=r.id
      where r.night_id=new.night_id and p.state='paid' order by r.id loop
      perform private.queue_launch_lifecycle_mail(id,case when reason='postponed' then 'event_postponed' else 'event_cancelled' end,'organizer_cancelled');
    end loop;
  elsif new.action='email_corrected' then
    -- Revoke pending mail even if an address is later changed back. The founder
    -- command has already expired management access before writing this audit.
    update private.launch_access_mail set state='suppressed',completed_at=clock_timestamp(),claim_id=null,lease_until=null
      where reservation_id=new.reservation_id and state in ('queued','failed','sending');
    perform private.queue_launch_lifecycle_mail(new.reservation_id,'corrected_summary','correction/'||gen_random_uuid()::text);
  end if;
  return new;
end $$;
create trigger launch_lifecycle_audit_mail after insert on private.launch_audit
  for each row execute function private.launch_lifecycle_audit_mail();

create function private.launch_refund_success_mail() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.state='succeeded' then
    perform private.queue_launch_lifecycle_mail(new.reservation_id,'refund_succeeded','refund/'||new.operation_id::text,new.operation_id);
  end if;
  return new;
end $$;
create trigger launch_refund_success_mail after insert or update of state on private.launch_refunds
  for each row execute function private.launch_refund_success_mail();

create function private.launch_mail_eligible(m private.launch_access_mail) returns boolean
language sql stable set search_path='' as $$
  select exists(select 1 from private.launch_reservations r join public.venue_nights n on n.id=r.night_id
    join private.launch_events e on e.night_id=r.night_id
    join private.launch_credentials c on c.reservation_id=r.id
    where r.id=m.reservation_id and r.email=m.recipient_email
      and not exists(select 1 from public.email_suppressions s where s.email=m.recipient_email)
      and (m.kind<>'confirmed_access' or (r.state='confirmed' and e.cancelled_at is null and n.terminal_at is null
        and n.closes_at>clock_timestamp() and c.arrival_revoked_at is null))
      and (m.kind<>'participant_cancelled' or e.cancelled_at is null)
      and (m.kind<>'refund_succeeded' or exists(select 1 from private.launch_refunds f
        where f.reservation_id=r.id and f.state='succeeded' and f.operation_id=m.refund_operation))
      and (m.token_hash is null or (m.token_expires_at>clock_timestamp()
        and c.management_hash=m.credential_hash and c.management_expires_at=m.credential_expires_at)))
$$;

-- Caller supplies only the leased job identity; authoritative event, payment and
-- refund information comes from the database, never an email-address lookup.
create function public.read_launch_mail_context(p_id uuid,p_claim uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare m private.launch_access_mail; result jsonb;
begin
  select * into m from private.launch_access_mail where id=p_id for update;
  if not found or p_claim is null or m.claim_id is distinct from p_claim or m.state<>'sending'
    or m.lease_until<=clock_timestamp() then raise exception 'mail claim unavailable'; end if;
  if not private.launch_mail_eligible(m) then
    update private.launch_access_mail set state='suppressed',completed_at=clock_timestamp(),claim_id=null,lease_until=null where id=m.id;
    return null;
  end if;
  select jsonb_build_object('reservation_id',r.id,'night_id',r.night_id,'kind',m.kind,'recipient',m.recipient_email,
    'locale',m.locale,'origin',m.origin,'payload_envelope',m.payload_envelope,
    'venue_name',v.name,'city',v.city,'address',v.address,'timezone',v.timezone,
    'starts_at',n.waiting_opens_at,'ends_at',n.closes_at,'cancellation_deadline',n.waiting_opens_at-interval '48 hours',
    'before_deadline',clock_timestamp()<=n.waiting_opens_at-interval '48 hours',
    'state',r.state,'cancellation_refundable',r.cancellation_refundable,
    'event_reason',e.cancellation_reason,'amount_minor',p.amount_minor,'currency',p.currency,
    'refund_state',f.state,'refund_eligible',coalesce(r.cancellation_refundable,false) or f.id is not null or e.cancelled_at is not null,
    'qr_eligible',r.state='confirmed' and p.state='paid' and e.cancelled_at is null and n.terminal_at is null
      and n.closes_at>clock_timestamp() and c.arrival_revoked_at is null)
  into result from private.launch_reservations r join private.launch_payments p on p.reservation_id=r.id
    join private.launch_events e on e.night_id=r.night_id join public.venue_nights n on n.id=r.night_id
    join public.venues v on v.id=n.venue_id join private.launch_credentials c on c.reservation_id=r.id
    left join private.launch_refunds f on f.reservation_id=r.id where r.id=m.reservation_id;
  result:=result || jsonb_build_object('version',encode(sha256(
    convert_to((case when m.kind='participant_cancelled' then result-'refund_state' else result end
      -'payload_envelope'-'before_deadline')::text,'UTF8')),'hex'));
  if m.kind in ('confirmed_access','corrected_summary','participant_cancelled') and m.payload_version is not null
    and m.payload_version is distinct from result->>'version' then
    update private.launch_access_mail set state='suppressed',completed_at=clock_timestamp(),claim_id=null,lease_until=null where id=m.id;
    return null;
  end if;
  return result;
end $$;

-- Entire provider body is encrypted and frozen before the first request. Retries
-- survive changed dates, configuration, templates and credential envelopes.
create function public.bind_launch_mail_payload(p_id uuid,p_claim uuid,p_envelope text,p_version text) returns text
language plpgsql security definer set search_path='' as $$
declare m private.launch_access_mail; context jsonb;
begin
  if p_version is null or p_version !~ '^[a-f0-9]{64}$' or p_envelope is null or length(p_envelope) not between 103 and 262144 or p_envelope !~ '^v1\.[A-Za-z0-9_-]+$'
    then raise exception 'invalid mail payload'; end if;
  select * into m from private.launch_access_mail where id=p_id for update;
  if not found or p_claim is null or m.claim_id is distinct from p_claim or m.state<>'sending'
    or m.lease_until<=clock_timestamp() or not private.launch_mail_eligible(m) then raise exception 'mail claim unavailable'; end if;
  context:=public.read_launch_mail_context(p_id,p_claim);
  if context is null or context->>'version' is distinct from p_version then raise exception 'mail context changed'; end if;
  update private.launch_access_mail set payload_envelope=coalesce(payload_envelope,p_envelope),
    payload_version=coalesce(payload_version,p_version) where id=m.id returning * into m;
  return m.payload_envelope;
end $$;

revoke all on function private.queue_launch_lifecycle_mail(uuid,text,text,uuid),private.launch_lifecycle_audit_mail(),
  private.launch_refund_success_mail(),private.launch_mail_eligible(private.launch_access_mail) from public,anon,authenticated,service_role;
revoke all on function public.read_launch_mail_context(uuid,uuid),public.bind_launch_mail_payload(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.read_launch_mail_context(uuid,uuid),public.bind_launch_mail_payload(uuid,uuid,text,text) to service_role;

create or replace function public.claim_launch_access_mail(p_origin text,p_recipients text[] default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare m private.launch_access_mail;
begin
  if p_origin is null or length(p_origin)>255 or p_origin !~ '^https?://[A-Za-z0-9.:-]+$'
    or (p_recipients is not null and (cardinality(p_recipients) not between 1 and 10
      or exists(select 1 from unnest(p_recipients) email where email is null or not private.valid_marketing_email(email)
        or email<>lower(private.trim_input(email) collate "C")))) then raise exception 'invalid mail claim'; end if;
  delete from private.launch_access_mail where completed_at<clock_timestamp()-interval '30 days'
    and state in ('sent','unknown','suppressed') and (token_expires_at is null or token_expires_at<clock_timestamp());
  -- Bounded recovery: never retry uncertain sends past the provider replay horizon.
  update private.launch_access_mail set state='unknown',completed_at=clock_timestamp(),claim_id=null,lease_until=null
    where state in ('sending','failed') and first_attempt_at<clock_timestamp()-interval '23 hours';
  update private.launch_access_mail mail set state='suppressed',completed_at=clock_timestamp(),claim_id=null,lease_until=null
    where mail.state in ('queued','failed','sending') and not private.launch_mail_eligible(mail);
  select * into m from private.launch_access_mail where origin=p_origin
    and (p_recipients is null or recipient_email=any(p_recipients))
    and ((state in ('queued','failed') and next_attempt_at<=clock_timestamp())
      or (state='sending' and lease_until<clock_timestamp()))
    order by created_at,id for update skip locked limit 1;
  if not found then return null; end if;
  update private.launch_access_mail set state='sending',attempts=attempts+1,
    first_attempt_at=coalesce(first_attempt_at,clock_timestamp()),claim_id=gen_random_uuid(),lease_until=clock_timestamp()+interval '60 seconds'
    where id=m.id returning * into m;
  return jsonb_build_object('id',m.id,'reservation_id',m.reservation_id,'claim',m.claim_id,'kind',m.kind,'recipient',m.recipient_email,
    'locale',m.locale,'origin',m.origin,'attempts',m.attempts,'token_envelope',m.token_envelope);
end $$;


create or replace function public.bind_launch_access_mail(p_id uuid,p_claim uuid,p_token text,p_envelope text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare m private.launch_access_mail;
begin
  if p_envelope is null or length(p_envelope) not between 103 and 2003 or p_envelope !~ '^v1\.[A-Za-z0-9_-]+$' then raise exception 'invalid envelope'; end if;
  perform private.launch_secret_hash(p_token);
  select * into m from private.launch_access_mail where id=p_id for update;
  if not found or m.claim_id is distinct from p_claim or m.state<>'sending' or m.lease_until<=clock_timestamp() or m.kind not in ('confirmed_access','recovery','corrected_summary') then raise exception 'mail claim unavailable'; end if;
  if not exists(select 1 from private.launch_reservations where id=m.reservation_id and email=m.recipient_email)
    or exists(select 1 from public.email_suppressions where email=m.recipient_email)
    then raise exception 'mail recipient unavailable'; end if;
  if m.token_hash is null then
    update private.launch_access_mail set token_hash=private.launch_secret_hash(p_token),token_envelope=p_envelope,
      token_expires_at=clock_timestamp()+case when kind in ('confirmed_access','corrected_summary') then interval '7 days' else interval '1 day' end,
      credential_hash=(select management_hash from private.launch_credentials where reservation_id=m.reservation_id),
      credential_expires_at=(select management_expires_at from private.launch_credentials where reservation_id=m.reservation_id)
      where id=m.id returning * into m;
  end if;
  return jsonb_build_object('token_envelope',m.token_envelope,'expires_at',m.token_expires_at);
end $$;
