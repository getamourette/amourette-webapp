-- #350: behavioral migration. Announce before applying to the shared database.
-- Existing attempted requests deliberately retain an unknown first request claim.
alter table private.launch_checkout_work add column first_request_claim uuid;

create or replace function public.start_launch_checkout_request(p_id uuid,p_claim uuid) returns timestamptz
language plpgsql security definer set search_path = '' as $$
declare started timestamptz;
begin
 update private.launch_checkout_work set first_requested_at=coalesce(first_requested_at,clock_timestamp()),
   first_request_claim=case when first_requested_at is null then p_claim else first_request_claim end
 where reservation_id=p_id and claim_id=p_claim and lease_until>clock_timestamp() and state='pending'
 returning first_requested_at into started;
 if started is null then raise exception 'stale checkout claim'; end if;
 return started;
end $$;

create or replace function public.reject_launch_checkout_creation(p_id uuid,p_claim uuid,p_evidence text) returns void
language plpgsql security definer set search_path = '' as $$
declare r private.launch_reservations;
begin
 r := private.launch_lock_reservation(p_id);
 perform 1 from private.launch_checkout_work where reservation_id=p_id and claim_id=p_claim
   and lease_until>clock_timestamp() and first_request_claim=p_claim and first_requested_at is not null for update;
 if not found or p_evidence is null or p_evidence !~ '^req_[A-Za-z0-9]{1,240}$' or
   exists(select 1 from private.launch_payments where reservation_id=p_id and (checkout_id is not null or state<>'pending')) then
   raise exception 'definitive creation rejection required';
 end if;
 -- No Checkout exists in this exceptional provider-validation branch. Keep the
 -- evidence on the payment record without inventing a provider Checkout ID.
 update private.launch_payments set state='unpaid',release_evidence=p_evidence where reservation_id=p_id;
 if r.state='holding' then
   update private.launch_reservations set state='expired',expired_at=clock_timestamp() where id=p_id;
   update private.launch_credentials set arrival_revoked_at=clock_timestamp() where reservation_id=p_id;
 end if;
 perform private.launch_log(r.night_id,p_id,'checkout_rejected',jsonb_build_object('evidence',p_evidence));
end $$;

revoke all on function public.start_launch_checkout_request(uuid,uuid),public.reject_launch_checkout_creation(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.start_launch_checkout_request(uuid,uuid),public.reject_launch_checkout_creation(uuid,uuid,text) to service_role;

-- Keep the existing address freeze window for all venue location details.
create or replace function private.launch_venue_location_frozen(p_venue uuid) returns boolean
language sql security definer set search_path = '' as $$
  select exists(select 1 from private.launch_events e join public.venue_nights n on n.id=e.night_id
    where n.venue_id=p_venue and e.registration_opens_at<=clock_timestamp()
    and n.closes_at>clock_timestamp() and e.cancelled_at is null and n.terminal_at is null);
$$;
revoke all on function private.launch_venue_location_frozen(uuid) from public,anon,authenticated,service_role;

create or replace function public.admin_set_venue_address(p_venue uuid,p_address text) returns void
language plpgsql security definer set search_path='' as $$
begin
  if not private.is_admin() then raise exception 'not authorized' using errcode='42501'; end if;
  if p_address is not null and not private.valid_input_text(p_address,300,true) then raise exception 'invalid address'; end if;
  perform 1 from public.venues where id=p_venue for update;
  if not found then raise exception 'venue unavailable'; end if;
  -- An address is practical booking information, not permission to move a booked event.
  if private.launch_venue_location_frozen(p_venue)
    and (select address from public.venues where id=p_venue) is distinct from private.trim_input(p_address)
    then raise exception 'address is frozen while reservations are open'; end if;
  update public.venues set address=private.trim_input(p_address) where id=p_venue;
end $$;
revoke all on function public.admin_set_venue_address(uuid,text) from public,anon,service_role;
grant execute on function public.admin_set_venue_address(uuid,text) to authenticated;

CREATE OR REPLACE FUNCTION public.save_venue_details(p_venue_id uuid, p_name text, p_slug text, p_city text, p_timezone text)
 RETURNS public.venues
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = ''
AS $function$
declare result public.venues;
begin
if not private.is_admin() then raise exception 'not authorized'; end if;
if p_city is null or p_timezone is null or not ((p_city='Paris' and p_timezone='Europe/Paris') or (p_city='New York' and p_timezone='America/New_York')) then raise exception 'unsupported rollout location'; end if;
if p_venue_id is null and (p_slug is null or p_slug collate "C" !~ '^[a-z0-9-]{1,80}$') then raise exception 'valid slug is required'; end if;
if not private.valid_input_text(p_name,120,true) then raise exception 'venue name is required'; end if;
if p_city not in ('Paris','New York') or p_timezone not in ('Europe/Paris','America/New_York') then raise exception 'unsupported rollout location'; end if;
if (p_city='Paris' and p_timezone<>'Europe/Paris') or (p_city='New York' and p_timezone<>'America/New_York') then raise exception 'city and timezone must describe the same rollout location'; end if;
if p_venue_id is null then
if nullif(trim(p_slug),'') is null or p_slug !~ '^[a-z0-9-]+$' then raise exception 'valid slug is required'; end if;
insert into public.venues(name,slug,city,timezone) values(private.trim_input(p_name),trim(p_slug),p_city,p_timezone) returning * into result;
else
select * into result from public.venues where id=p_venue_id and not is_test_venue for update;
if not found then raise exception 'venue not found or test fixture'; end if;
if (result.city is distinct from p_city or result.timezone is distinct from p_timezone)
  and private.launch_venue_location_frozen(p_venue_id) then
  raise exception 'location is frozen while reservations are open';
end if;
update public.venues set name=private.trim_input(p_name),city=p_city,timezone=p_timezone where id=p_venue_id and not is_test_venue returning * into result;
if not found then raise exception 'venue not found or test fixture'; end if; end if;
return result;
end $function$
;
revoke execute on function public.save_venue_details(uuid,text,text,text,text) from anon,public;
grant execute on function public.save_venue_details(uuid,text,text,text,text) to authenticated;
