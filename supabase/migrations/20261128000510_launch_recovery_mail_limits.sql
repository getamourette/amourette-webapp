-- #371 (SEC-008): a recovery request must not let anyone mail an address that
-- never paid. The reservation email is unverified by design, so an unpaid hold can
-- carry anybody's address; before this change each hold allowed ten recovery mails a
-- day, and a new hold after expiry started a fresh budget.
--
-- Behaviour change, same arguments: `request_launch_access` keeps its generic
-- answer and gains three limits, and `admin_launch_mail_problems` reports when the
-- global ceiling is reached so the founders' mail alert shows it.
--   1. An unpaid hold gets one recovery mail at most, and only when the address
--      received no recovery mail in the last 24 hours, whatever the reservation:
--      a second hold for the same address does not reset the budget.
--   2. One address receives at most ten recovery mails per 24 hours across every
--      reservation and night (the per-reservation cooldown and cap stay).
--   3. All addresses together receive at most 200 recovery mails per 24 hours.
--      Confirmation, cancellation and refund mail never count and are never held
--      back by it.

create index launch_access_mail_recovery_recipient on private.launch_access_mail(recipient_email,created_at) where kind='recovery';
create index launch_access_mail_recovery_created on private.launch_access_mail(created_at) where kind='recovery';

-- One value for the limit and for the alert that says it was reached.
create function private.launch_recovery_daily_ceiling() returns integer
language sql immutable set search_path='' as $$ select 200 $$;
revoke all on function private.launch_recovery_daily_ceiling() from public,anon,authenticated,service_role;

create or replace function public.request_launch_access(p_night uuid,p_email text,p_origin text) returns void
language plpgsql security definer set search_path='' as $$
declare r private.launch_reservations; paid boolean;
begin
  if p_night is null or not private.valid_marketing_email(p_email) or p_origin is null
    or length(p_origin)>255 or p_origin !~ '^https?://[A-Za-z0-9.:-]+$' then raise exception 'invalid recovery'; end if;
  -- The per-address limits span nights, so the night lock alone does not serialize
  -- two requests for one address; this lock does. Nothing else takes it.
  perform pg_advisory_xact_lock(hashtextextended('launch-recovery:'||lower(private.trim_input(p_email) collate "C"),0));
  perform private.launch_lock(p_night);
  select x.* into r from private.launch_reservations x join private.launch_payments p on p.reservation_id=x.id
    where x.night_id=p_night and x.email=lower(private.trim_input(p_email) collate "C")
    and (x.state in ('holding','confirmed') or p.state='paid')
    order by (x.state in ('holding','confirmed')) desc,x.created_at desc,x.id limit 1;
  if not found then return; end if;
  paid := r.state='confirmed' or exists(select 1 from private.launch_payments p where p.reservation_id=r.id and p.state='paid');
  -- Requests never rotate management credentials. Every refusal below returns like
  -- an unknown address does, so none discloses whether a reservation was found.
  if exists(select 1 from private.launch_access_mail where reservation_id=r.id and kind='recovery'
    and created_at>clock_timestamp()-interval '2 minutes') then return; end if;
  if (select count(*) from private.launch_access_mail where reservation_id=r.id and kind='recovery'
    and created_at>clock_timestamp()-interval '1 day')>=10 then return; end if;
  if not paid and (exists(select 1 from private.launch_access_mail where reservation_id=r.id and kind='recovery')
    or exists(select 1 from private.launch_access_mail where recipient_email=r.email and kind='recovery'
      and created_at>clock_timestamp()-interval '1 day')) then return; end if;
  if (select count(*) from private.launch_access_mail where recipient_email=r.email and kind='recovery'
    and created_at>clock_timestamp()-interval '1 day')>=10 then return; end if;
  if (select count(*) from private.launch_access_mail where kind='recovery'
    and created_at>clock_timestamp()-interval '1 day')>=private.launch_recovery_daily_ceiling() then return; end if;
  insert into private.launch_access_mail(reservation_id,kind,recipient_email,locale,origin)
    values(r.id,'recovery',r.email,r.locale,p_origin);
end $$;

create or replace function public.admin_launch_mail_problems() returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
  if not private.is_admin() then raise exception 'not authorized' using errcode='42501'; end if;
  -- First name and venue only: the global alert never shows a guest's address.
  -- The total is exact; the list stays bounded however large an outage gets.
  return (with problems as (select m.id,m.kind,m.state,m.attempts,m.created_at,r.first_name,v.name venue_name,v.timezone,n.waiting_opens_at starts_at
      from private.launch_access_mail m join private.launch_reservations r on r.id=m.reservation_id
        join public.venue_nights n on n.id=r.night_id join public.venues v on v.id=n.venue_id
      where m.state in ('failed','unknown') and private.launch_mail_eligible(m))
    select jsonb_build_object('total',(select count(*) from problems),'items',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'kind',p.kind,
      'state',p.state,'attempts',p.attempts,'first_name',p.first_name,'venue_name',p.venue_name,'timezone',p.timezone,'starts_at',p.starts_at)
      order by p.created_at,p.id) from (select * from problems order by created_at,id limit 50) p),'[]'::jsonb),
      -- #371: recovery requests stop being mailed once the global ceiling is reached.
      'recovery_ceiling',private.launch_recovery_daily_ceiling(),
      'recovery_ceiling_reached',(select count(*) from private.launch_access_mail where kind='recovery'
        and created_at>clock_timestamp()-interval '1 day')>=private.launch_recovery_daily_ceiling()));
end $$;
