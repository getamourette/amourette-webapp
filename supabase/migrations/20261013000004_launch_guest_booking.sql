-- #184: local preparation only. Shared application requires founder approval.
alter table public.venues add column address text
  check (address is null or (private.valid_input_text(address,300,true) and address=private.trim_input(address)));

create function public.admin_set_venue_address(p_venue uuid,p_address text) returns void
language plpgsql security definer set search_path='' as $$
begin
  if not private.is_admin() then raise exception 'not authorized' using errcode='42501'; end if;
  if p_address is not null and not private.valid_input_text(p_address,300,true) then raise exception 'invalid address'; end if;
  perform 1 from public.venues where id=p_venue for update;
  if not found then raise exception 'venue unavailable'; end if;
  -- An address is practical booking information, not permission to move a booked event.
  if exists(select 1 from private.launch_events e join public.venue_nights n on n.id=e.night_id
    where n.venue_id=p_venue and e.registration_opens_at<=clock_timestamp()
    and n.closes_at>clock_timestamp() and e.cancelled_at is null and n.terminal_at is null)
    and (select address from public.venues where id=p_venue) is distinct from private.trim_input(p_address)
    then raise exception 'address is frozen while reservations are open'; end if;
  update public.venues set address=private.trim_input(p_address) where id=p_venue;
end $$;
revoke all on function public.admin_set_venue_address(uuid,text) from public,anon,service_role;
grant execute on function public.admin_set_venue_address(uuid,text) to authenticated;

-- Separate public event information from guest/financial projections.
create function public.launch_booking_event(p_night uuid) returns jsonb
language sql security definer set search_path='' as $$
  select public.launch_event_availability(p_night) || jsonb_build_object(
    'now',clock_timestamp(),'venue_name',v.name,'city',v.city,'address',v.address)
  from private.launch_events e join public.venue_nights n on n.id=e.night_id
  join public.venues v on v.id=n.venue_id where e.night_id=p_night;
$$;
revoke all on function public.launch_booking_event(uuid) from public,anon,authenticated;
grant execute on function public.launch_booking_event(uuid) to service_role;

-- Operational access email has its own eligibility. Never subscribe a guest to marketing.
-- Only ciphertext is retained for links and renewed credentials; hashes authorize exchanges.
create table private.launch_access_mail (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid not null references private.launch_reservations(id) on delete restrict,
  kind text not null check(kind in ('confirmed_access','recovery')),
  recipient_email text not null check(private.valid_marketing_email(recipient_email)),
  locale text not null check(locale in ('en','fr','es')),
  origin text not null check(length(origin)<=255 and origin ~ '^https?://[A-Za-z0-9.:-]+$'),
  state text not null default 'queued' check(state in ('queued','sending','sent','failed','unknown','suppressed')),
  created_at timestamptz not null default clock_timestamp(),
  next_attempt_at timestamptz not null default clock_timestamp(),
  first_attempt_at timestamptz,
  attempts integer not null default 0 check(attempts>=0),
  lease_until timestamptz,
  claim_id uuid,
  provider_id text,
  token_hash bytea check(octet_length(token_hash)=32),
  token_envelope text check(length(token_envelope)<=2048),
  token_expires_at timestamptz,
  credential_hash bytea,
  credential_expires_at timestamptz,
  completed_at timestamptz,
  exchanged_envelope text check(length(exchanged_envelope)<=1503),
  check((token_hash is null)=(token_envelope is null)),
  check((token_hash is null)=(token_expires_at is null))
);
create unique index launch_initial_access_once on private.launch_access_mail(reservation_id) where kind='confirmed_access';
create index launch_access_mail_queue on private.launch_access_mail(next_attempt_at) where state in ('queued','failed','sending');
alter table private.launch_access_mail enable row level security;
revoke all on private.launch_access_mail from public,anon,authenticated,service_role;

create function private.queue_launch_initial_access() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.state='confirmed' and old.state is distinct from 'confirmed' then
    insert into private.launch_access_mail(reservation_id,kind,recipient_email,locale,origin)
    select new.id,'confirmed_access',new.email,new.locale,w.origin from private.launch_checkout_work w where w.reservation_id=new.id
    on conflict do nothing;
  end if;
  return new;
end $$;
create trigger launch_initial_access after update of state on private.launch_reservations
for each row execute function private.queue_launch_initial_access();

create function public.request_launch_access(p_night uuid,p_email text,p_origin text) returns void
language plpgsql security definer set search_path='' as $$
declare r private.launch_reservations;
begin
  if p_night is null or not private.valid_marketing_email(p_email) or p_origin is null
    or length(p_origin)>255 or p_origin !~ '^https?://[A-Za-z0-9.:-]+$' then raise exception 'invalid recovery'; end if;
  perform private.launch_lock(p_night);
  select x.* into r from private.launch_reservations x join private.launch_payments p on p.reservation_id=x.id
    where x.night_id=p_night and x.email=lower(private.trim_input(p_email) collate "C")
    and (x.state in ('holding','confirmed') or p.state='paid')
    order by (x.state in ('holding','confirmed')) desc,x.created_at desc,x.id limit 1;
  if not found then return; end if;
  -- Requests never rotate management credentials. Per-recipient cooldown also
  -- applies across IPs and does not disclose whether a reservation was found.
  if exists(select 1 from private.launch_access_mail where reservation_id=r.id and kind='recovery'
    and created_at>clock_timestamp()-interval '2 minutes') then return; end if;
  if (select count(*) from private.launch_access_mail where reservation_id=r.id and kind='recovery'
    and created_at>clock_timestamp()-interval '1 day')>=10 then return; end if;
  insert into private.launch_access_mail(reservation_id,kind,recipient_email,locale,origin)
    values(r.id,'recovery',r.email,r.locale,p_origin);
end $$;

create function public.claim_launch_access_mail(p_origin text,p_recipients text[] default null) returns jsonb
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
    where mail.state in ('queued','failed') and (not exists(select 1 from private.launch_reservations r
      where r.id=mail.reservation_id and r.email=mail.recipient_email)
      or exists(select 1 from public.email_suppressions s where s.email=mail.recipient_email) or (mail.token_hash is not null and (mail.token_expires_at<=clock_timestamp()
        or not exists(select 1 from private.launch_credentials c where c.reservation_id=mail.reservation_id
          and c.management_hash=mail.credential_hash and c.management_expires_at=mail.credential_expires_at))));
  select * into m from private.launch_access_mail where origin=p_origin
    and (p_recipients is null or recipient_email=any(p_recipients))
    and ((state in ('queued','failed') and next_attempt_at<=clock_timestamp())
      or (state='sending' and lease_until<clock_timestamp()))
    order by created_at,id for update skip locked limit 1;
  if not found then return null; end if;
  update private.launch_access_mail set state='sending',attempts=attempts+1,
    first_attempt_at=coalesce(first_attempt_at,clock_timestamp()),claim_id=gen_random_uuid(),lease_until=clock_timestamp()+interval '60 seconds'
    where id=m.id returning * into m;
  return jsonb_build_object('id',m.id,'claim',m.claim_id,'kind',m.kind,'recipient',m.recipient_email,
    'locale',m.locale,'origin',m.origin,'attempts',m.attempts,'token_envelope',m.token_envelope);
end $$;

create function public.bind_launch_access_mail(p_id uuid,p_claim uuid,p_token text,p_envelope text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare m private.launch_access_mail;
begin
  if p_envelope is null or length(p_envelope) not between 103 and 2003 or p_envelope !~ '^v1\.[A-Za-z0-9_-]+$' then raise exception 'invalid envelope'; end if;
  perform private.launch_secret_hash(p_token);
  select * into m from private.launch_access_mail where id=p_id for update;
  if not found or m.claim_id is distinct from p_claim or m.state<>'sending' then raise exception 'mail claim unavailable'; end if;
  if not exists(select 1 from private.launch_reservations where id=m.reservation_id and email=m.recipient_email)
    or exists(select 1 from public.email_suppressions where email=m.recipient_email)
    then raise exception 'mail recipient unavailable'; end if;
  if m.token_hash is null then
    update private.launch_access_mail set token_hash=private.launch_secret_hash(p_token),token_envelope=p_envelope,
      token_expires_at=clock_timestamp()+case when kind='confirmed_access' then interval '7 days' else interval '1 day' end,
      credential_hash=(select management_hash from private.launch_credentials where reservation_id=m.reservation_id),
      credential_expires_at=(select management_expires_at from private.launch_credentials where reservation_id=m.reservation_id)
      where id=m.id returning * into m;
  end if;
  return jsonb_build_object('token_envelope',m.token_envelope,'expires_at',m.token_expires_at);
end $$;

create function public.finish_launch_access_mail(p_id uuid,p_claim uuid,p_state text,p_provider text default null) returns void
language plpgsql security definer set search_path='' as $$
begin
  if p_id is null or p_claim is null or p_state is null or p_state not in ('sent','failed','unknown','suppressed') or
    (p_provider is not null and p_provider !~ '^[A-Za-z0-9_-]{1,255}$') or
    (p_state='sent' and (p_provider is null or p_provider !~ '^[A-Za-z0-9_-]{1,255}$')) then raise exception 'invalid delivery result'; end if;
  update private.launch_access_mail set state=p_state,provider_id=p_provider,claim_id=null,lease_until=null,
    completed_at=case when p_state in ('sent','unknown','suppressed') then clock_timestamp() else null end,
    next_attempt_at=clock_timestamp()+interval '2 minutes'
    where id=p_id and claim_id=p_claim and state='sending';
end $$;

-- Read-only proof inspection precedes the exchange; GETs never renew credentials.
create function public.inspect_launch_access(p_id uuid,p_token text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare m private.launch_access_mail; envelope text;
begin
  select * into m from private.launch_access_mail where id=p_id and token_hash=private.launch_secret_hash(p_token)
    and token_expires_at>clock_timestamp();
  if not found or not exists(select 1 from private.launch_reservations r join private.launch_credentials c on c.reservation_id=r.id
    where r.id=m.reservation_id and r.email=m.recipient_email and c.management_hash=m.credential_hash and c.management_expires_at=m.credential_expires_at)
    then raise exception 'reservation access denied'; end if;
  select delivery_envelope into envelope from private.launch_checkout_work where reservation_id=m.reservation_id;
  return jsonb_build_object('reservation_id',m.reservation_id,'envelope',envelope,'exchanged',m.exchanged_envelope is not null);
end $$;

create function public.exchange_launch_access(p_id uuid,p_token text,p_previous text,p_management text,p_arrival text,p_envelope text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare m private.launch_access_mail; r private.launch_reservations; inspected jsonb;
begin
  select * into m from private.launch_access_mail where id=p_id;
  if not found then raise exception 'reservation access denied'; end if;
  r:=private.launch_lock_reservation(m.reservation_id);
  select * into m from private.launch_access_mail where id=p_id for update;
  inspected:=public.inspect_launch_access(p_id,p_token);
  if m.exchanged_envelope is not null then return inspected; end if;
  if inspected->>'envelope' is distinct from p_previous then raise exception 'reservation access denied'; end if;
  if p_envelope is null or length(p_envelope) not between 103 and 1503 or p_envelope !~ '^v1\.[A-Za-z0-9_-]+$'
    or private.launch_secret_hash(p_management)=private.launch_secret_hash(p_arrival)
    or not exists(select 1 from private.launch_credentials where reservation_id=r.id and arrival_hash=private.launch_secret_hash(p_arrival))
    then raise exception 'invalid credential'; end if;
  perform public.renew_launch_access(r.id,p_management);
  update private.launch_checkout_work set delivery_envelope=p_envelope where reservation_id=r.id;
  update private.launch_access_mail set exchanged_envelope=p_envelope,credential_hash=private.launch_secret_hash(p_management),
    credential_expires_at=(select management_expires_at from private.launch_credentials where reservation_id=r.id) where id=p_id;
  return jsonb_build_object('reservation_id',r.id,'envelope',p_envelope,'exchanged',true);
end $$;

revoke all on function public.request_launch_access(uuid,text,text),public.claim_launch_access_mail(text,text[]),
  public.bind_launch_access_mail(uuid,uuid,text,text),public.finish_launch_access_mail(uuid,uuid,text,text),
  public.inspect_launch_access(uuid,text),public.exchange_launch_access(uuid,text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.request_launch_access(uuid,text,text),public.claim_launch_access_mail(text,text[]),
  public.bind_launch_access_mail(uuid,uuid,text,text),public.finish_launch_access_mail(uuid,uuid,text,text),
  public.inspect_launch_access(uuid,text),public.exchange_launch_access(uuid,text,text,text,text,text) to service_role;
revoke all on function private.queue_launch_initial_access() from public,anon,authenticated,service_role;

-- Retention runs in-database even while external email delivery is disabled.
create function private.cleanup_launch_access_mail() returns integer
language plpgsql security definer set search_path='' as $$
declare removed integer;
begin
  update private.launch_access_mail set state='unknown',completed_at=clock_timestamp(),claim_id=null,lease_until=null
    where (state in ('sending','failed') and first_attempt_at<clock_timestamp()-interval '23 hours')
      or (state='queued' and created_at<clock_timestamp()-interval '7 days');
  delete from private.launch_access_mail where completed_at<clock_timestamp()-interval '30 days'
    and state in ('sent','unknown','suppressed') and (token_expires_at is null or token_expires_at<clock_timestamp());
  get diagnostics removed=row_count;
  return removed;
end $$;
revoke all on function private.cleanup_launch_access_mail() from public,anon,authenticated,service_role;
select cron.schedule('amourette-launch-access-retention','17 3 * * *',$$select private.cleanup_launch_access_mail();$$);
