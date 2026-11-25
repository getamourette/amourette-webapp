-- #558: two service reminders per confirmed reservation, at 10:00 venue time two
-- days before the night and on the morning of the night. Decision and reason:
-- docs/decisions/2026-11-25-reservation-reminders.md.
--
-- Behaviour: two new kinds in the outbox constraint, and launch_mail_eligible,
-- read_launch_mail_context and bind_launch_access_mail replaced with the same
-- arguments. New: the reminder schedule helpers, the queueing function and its
-- pg_cron job. Reminders reuse the outbox of #184/#189: same worker, retries,
-- Resend idempotency key, founder alert and resend (#489). No existing row changes.
--
-- Rules, all enforced here rather than by the worker:
-- * one reminder of each kind per reservation (private.launch_mail_events key);
-- * only a confirmed, paid reservation with no refund, no arrival record, no
--   revoked arrival credential, on a night neither cancelled nor ended;
-- * never late: a reservation confirmed after a reminder's time never gets it,
--   and a reminder goes out at most 6 hours after its time, never after the night
--   starts, and a two-day reminder written before the free-cancellation deadline
--   never goes out after it (its frozen text would promise a free cancellation).
--   The same rule is checked again at every claim, render and send.

alter table private.launch_access_mail drop constraint launch_access_mail_kind_check;
alter table private.launch_access_mail add constraint launch_access_mail_kind_check
  check(kind in ('confirmed_access','recovery','participant_cancelled','event_cancelled','event_postponed','refund_succeeded',
    'corrected_summary','reminder_two_days','reminder_morning'));

-- 10:00 on the venue's calendar day of the night, or two days before it.
create function private.launch_reminder_at(p_kind text,p_starts timestamptz,p_timezone text) returns timestamptz
language sql stable set search_path='' as $$
  select (((p_starts at time zone p_timezone)::date - case p_kind when 'reminder_two_days' then 2 else 0 end) + time '10:00') at time zone p_timezone
$$;

-- End of the send window. least() ignores the null of the last argument.
create function private.launch_reminder_until(p_kind text,p_starts timestamptz,p_timezone text) returns timestamptz
language sql stable set search_path='' as $$
  select least(t.at+interval '6 hours',p_starts,
    case when p_kind='reminder_two_days' and t.at<p_starts-interval '48 hours' then p_starts-interval '48 hours' end)
  from (select private.launch_reminder_at(p_kind,p_starts,p_timezone) at) t
$$;

create function private.launch_reminder_due(p_reservation uuid,p_kind text,p_now timestamptz) returns boolean
language sql stable set search_path='' as $$
  select exists(select 1 from private.launch_reservations r
    join private.launch_payments p on p.reservation_id=r.id
    join private.launch_events e on e.night_id=r.night_id
    join public.venue_nights n on n.id=r.night_id join public.venues v on v.id=n.venue_id
    join private.launch_credentials c on c.reservation_id=r.id
    cross join lateral (select private.launch_reminder_at(p_kind,n.waiting_opens_at,v.timezone) at,
      private.launch_reminder_until(p_kind,n.waiting_opens_at,v.timezone) until) t
    where r.id=p_reservation and p_kind in ('reminder_two_days','reminder_morning')
      and r.state='confirmed' and p.state='paid' and r.confirmed_at<=t.at
      and e.cancelled_at is null and n.terminal_at is null and c.arrival_revoked_at is null
      and not exists(select 1 from private.launch_arrivals a where a.reservation_id=r.id)
      and not exists(select 1 from private.launch_refunds f where f.reservation_id=r.id)
      and p_now>=t.at and p_now<t.until)
$$;

-- Called every five minutes by pg_cron. Concurrent runs are harmless: the event
-- receipt's primary key lets exactly one of them queue the mail.
create function private.queue_launch_reminders(p_now timestamptz default clock_timestamp()) returns void
language plpgsql set search_path='' as $$
declare x record;
begin
  for x in select r.id,k.kind from private.launch_reservations r
      join public.venue_nights n on n.id=r.night_id
      cross join (values ('reminder_two_days'),('reminder_morning')) k(kind)
    where r.state='confirmed' and n.terminal_at is null
      and n.waiting_opens_at>p_now and n.waiting_opens_at<p_now+interval '3 days'
      and not exists(select 1 from private.launch_mail_events m where m.reservation_id=r.id and m.event_key=k.kind)
      and private.launch_reminder_due(r.id,k.kind,p_now)
    order by r.id,k.kind loop
    perform private.queue_launch_lifecycle_mail(x.id,x.kind,x.kind);
  end loop;
end $$;

-- Same body as 20261017000001, plus the reminder line.
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
      and (m.kind<>'participant_cancelled' or e.cancelled_at is null)
      and (m.kind<>'refund_succeeded' or exists(select 1 from private.launch_refunds f
        where f.reservation_id=r.id and f.state='succeeded' and f.operation_id=m.refund_operation))
      and (m.token_hash is null or (m.token_expires_at>clock_timestamp()
        and c.management_hash=m.credential_hash and c.management_expires_at=m.credential_expires_at)))
$$;

-- Same body as 20261017000001, except that a frozen reminder is also dropped when
-- its night, venue or reservation changed after it was written.
create or replace function public.read_launch_mail_context(p_id uuid,p_claim uuid) returns jsonb
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
  if m.kind in ('confirmed_access','corrected_summary','participant_cancelled','reminder_two_days','reminder_morning') and m.payload_version is not null
    and m.payload_version is distinct from result->>'version' then
    update private.launch_access_mail set state='suppressed',completed_at=clock_timestamp(),claim_id=null,lease_until=null where id=m.id;
    return null;
  end if;
  return result;
end $$;

-- Same body as 20261123000476, plus the reminder kinds: a reminder carries the
-- private management link, which shares the existing access like a confirmation
-- link does (exchange_launch_access renews access only for 'recovery').
create or replace function public.bind_launch_access_mail(p_id uuid,p_claim uuid,p_token text,p_envelope text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare m private.launch_access_mail;
begin
  if p_envelope is null or length(p_envelope) not between 103 and 2003 or p_envelope !~ '^v1\.[A-Za-z0-9_-]+$' then raise exception 'invalid envelope'; end if;
  perform private.launch_secret_hash(p_token);
  select * into m from private.launch_access_mail where id=p_id for update;
  if not found or m.claim_id is distinct from p_claim or m.state<>'sending' or m.lease_until<=clock_timestamp()
    or m.kind not in ('confirmed_access','recovery','corrected_summary','reminder_two_days','reminder_morning') then raise exception 'mail claim unavailable'; end if;
  if not exists(select 1 from private.launch_reservations where id=m.reservation_id and email=m.recipient_email)
    or exists(select 1 from public.email_suppressions where email=m.recipient_email)
    then raise exception 'mail recipient unavailable'; end if;
  if m.token_hash is null then
    update private.launch_access_mail set token_hash=private.launch_secret_hash(p_token),token_envelope=p_envelope,
      token_expires_at=private.launch_access_expires_at(m.reservation_id),
      credential_hash=(select management_hash from private.launch_credentials where reservation_id=m.reservation_id),
      credential_expires_at=(select management_expires_at from private.launch_credentials where reservation_id=m.reservation_id)
      where id=m.id returning * into m;
  end if;
  return jsonb_build_object('token_envelope',m.token_envelope,'expires_at',m.token_expires_at);
end $$;

revoke all on function private.launch_reminder_at(text,timestamptz,text),private.launch_reminder_until(text,timestamptz,text),
  private.launch_reminder_due(uuid,text,timestamptz),private.queue_launch_reminders(timestamptz) from public,anon,authenticated,service_role;

select cron.schedule('amourette-launch-reminders','*/5 * * * *',$$select private.queue_launch_reminders();$$);
