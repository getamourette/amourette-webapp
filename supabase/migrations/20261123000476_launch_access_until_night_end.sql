-- #476: reservation access lasts until the reserved night is over, and opening the
-- confirmation link on another device no longer revokes the tab that paid.
-- Local preparation only. Shared application requires founder approval.
--
-- 1. One lifetime rule for management access and for every email link: until
--    24 hours after the night closes, and at least 24 hours from issue (a link
--    requested after the night still opens for a day, as recovery links did).
--    It replaces seven days for the credential and the confirmation link and one
--    day for recovery links: a guest who booked two weeks ahead kept a link that
--    died before the night.
-- 2. Opening a confirmation or corrected-summary link hands out the access that
--    already exists instead of replacing it, so every device that opened it, and
--    the tab that paid, keep working. A recovery link still replaces the access
--    when opened: it stays the guest's way to cut off every earlier link and tab,
--    and #405's "replaced by a newer link" answer depends on it. A link opened
--    after its access was ended by a founder email correction also renews it.
-- 3. Existing rows: still-valid access and still-valid links are extended to the
--    new rule, never shortened, and each link stays bound to the access it
--    names, so a reservation already paid keeps working through the migration.

create function private.launch_access_expires_at(p_reservation uuid) returns timestamptz
language sql set search_path='' as $$
  select greatest(n.closes_at,clock_timestamp())+interval '24 hours'
  from private.launch_reservations r join public.venue_nights n on n.id=r.night_id where r.id=p_reservation
$$;
revoke all on function private.launch_access_expires_at(uuid) from public,anon,authenticated,service_role;

-- Same body as 20261116000001, except the credential lifetime.
create or replace function public.create_launch_reservation(p_id uuid,p_night uuid,p_email text,p_name text,p_locale text,
  p_policy text,p_late_ack boolean,p_hold_until timestamptz,p_management_secret text,p_arrival_secret text,
  p_gender text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare r private.launch_reservations; e private.launch_events; n public.venue_nights;
  email_value text; name_value text; management bytea; arrival bytea; t timestamptz;
begin
  if p_id is null or not private.valid_marketing_email(p_email) or not private.valid_input_text(p_name,30,true)
    or p_locale is null or p_locale not in ('en','fr','es') or p_late_ack is null
    or (p_gender is not null and p_gender not in ('woman','man','nonbinary')) then raise exception 'invalid reservation input' using errcode = '22023'; end if;
  email_value := lower(private.trim_input(p_email) collate "C"); name_value := private.trim_input(p_name);
  management := private.launch_secret_hash(p_management_secret); arrival := private.launch_secret_hash(p_arrival_secret);
  if management = arrival then raise exception 'credentials must differ'; end if;
  perform private.launch_lock(p_night);
  select * into r from private.launch_reservations where id = p_id;
  if found then
    if (r.night_id,r.email,r.first_name,r.locale,r.policy_version,r.late_cancellation_acknowledged,r.hold_until,r.gender)
      is distinct from (p_night,email_value,name_value,p_locale,p_policy,p_late_ack,p_hold_until,p_gender) then raise exception 'reservation identifier reused'; end if;
    perform private.launch_authorize(p_id,p_management_secret);
    if not exists(select 1 from private.launch_credentials where reservation_id = p_id and arrival_hash = arrival) then raise exception 'reservation identifier reused'; end if;
    return private.launch_projection(p_id);
  end if;
  -- Do not disclose the existing ID or a Checkout URL on this branch.
  if exists(select 1 from private.launch_reservations where night_id = p_night and email = email_value and state in ('holding','confirmed')) then
    return jsonb_build_object('access_required',true);
  end if;
  select * into e from private.launch_events where night_id = p_night;
  select * into n from public.venue_nights where id = p_night;
  t := clock_timestamp();
  if e.night_id is null or e.cancelled_at is not null or n.terminal_at is not null or t < e.registration_opens_at or t >= n.waiting_opens_at - interval '30 minutes' then raise exception 'registration closed'; end if;
  if p_policy is distinct from e.policy_version then raise exception 'reservation policy acceptance required'; end if;
  if not private.launch_cancellation_refundable(n.waiting_opens_at,t) and not p_late_ack then raise exception 'late cancellation acknowledgement required'; end if;
  if p_hold_until is null or not isfinite(p_hold_until) or p_hold_until <= t or p_hold_until > n.waiting_opens_at then raise exception 'invalid payment hold deadline'; end if;
  insert into private.launch_reservations(id,night_id,email,first_name,locale,policy_version,late_cancellation_acknowledged,hold_until,created_at,accepted_at,gender)
    values(p_id,p_night,email_value,name_value,p_locale,p_policy,p_late_ack,p_hold_until,t,t,p_gender);
  insert into private.launch_credentials values(p_id,management,private.launch_access_expires_at(p_id),arrival,null);
  insert into private.launch_payments(reservation_id,amount_minor,currency) values(p_id,e.deposit_minor,e.currency);
  perform private.launch_log(p_night,p_id,'hold_created');
  return private.launch_projection(p_id);
end $$;

create or replace function public.renew_launch_access(p_id uuid,p_secret text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r private.launch_reservations; h bytea;
begin
  h := private.launch_secret_hash(p_secret); r := private.launch_lock_reservation(p_id);
  update private.launch_credentials set management_hash = h,management_expires_at = private.launch_access_expires_at(p_id)
    where reservation_id = p_id and management_hash <> h;
  if found then perform private.launch_log(r.night_id,p_id,'access_renewed'); end if;
  return jsonb_build_object('reservation_id',p_id,'recipient_email',r.email,'locale',r.locale);
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
      token_expires_at=private.launch_access_expires_at(m.reservation_id),
      credential_hash=(select management_hash from private.launch_credentials where reservation_id=m.reservation_id),
      credential_expires_at=(select management_expires_at from private.launch_credentials where reservation_id=m.reservation_id)
      where id=m.id returning * into m;
  end if;
  return jsonb_build_object('token_envelope',m.token_envelope,'expires_at',m.token_expires_at);
end $$;

create or replace function public.exchange_launch_access(p_id uuid,p_token text,p_previous text,p_management text,p_arrival text,p_envelope text) returns jsonb
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
  -- A confirmation link shares the access that already exists: opening it elsewhere
  -- must not revoke the tab that paid (#476). inspect_launch_access has just proved
  -- this link is bound to that access.
  if m.kind<>'recovery' and exists(select 1 from private.launch_credentials
    where reservation_id=r.id and management_expires_at>clock_timestamp()) then
    update private.launch_access_mail set exchanged_envelope=p_previous where id=p_id;
    return jsonb_build_object('reservation_id',r.id,'envelope',p_previous,'exchanged',true);
  end if;
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

-- Existing data. Links bound to a still-valid access follow it to its new expiry,
-- so inspect_launch_access, which compares both, keeps accepting them.
with extended as (
  select c.reservation_id,c.management_hash,c.management_expires_at old_expiry,
    greatest(c.management_expires_at,private.launch_access_expires_at(c.reservation_id)) new_expiry
  from private.launch_credentials c where c.management_expires_at>clock_timestamp()
), relinked as (
  update private.launch_access_mail m set credential_expires_at=x.new_expiry from extended x
  where m.reservation_id=x.reservation_id and m.credential_hash=x.management_hash and m.credential_expires_at=x.old_expiry
)
update private.launch_credentials c set management_expires_at=x.new_expiry from extended x where c.reservation_id=x.reservation_id;

update private.launch_access_mail set token_expires_at=greatest(token_expires_at,private.launch_access_expires_at(reservation_id))
  where token_hash is not null and token_expires_at>clock_timestamp();
