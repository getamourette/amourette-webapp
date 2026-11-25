-- #489 (Z1-I3): founders see reservation emails that did not go out and can
-- send a stopped one again. Additive: two founder-only functions, no table change.
--
-- `failed` mails are already retried every 2 minutes by the worker until 23 hours
-- after their first attempt; then they become `unknown`, like a definitive Resend
-- refusal. Only mails a send could still deliver are listed (same eligibility rule
-- the worker applies before sending), so an ended night's mails do not linger.

create function public.admin_launch_mail_problems() returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
  if not private.is_admin() then raise exception 'not authorized' using errcode='42501'; end if;
  -- First name and venue only: the global alert never shows a guest's address.
  return coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'kind',m.kind,'state',m.state,'attempts',m.attempts,
      'first_name',r.first_name,'venue_name',v.name,'timezone',v.timezone,'starts_at',n.waiting_opens_at) order by m.created_at,m.id)
    from private.launch_access_mail m join private.launch_reservations r on r.id=m.reservation_id
      join public.venue_nights n on n.id=r.night_id join public.venues v on v.id=n.venue_id
    where m.state in ('failed','unknown') and private.launch_mail_eligible(m)),'[]'::jsonb);
end $$;

-- Requeue the same row: same Idempotency-Key and the same frozen body, so Resend
-- answers with the original message if it accepted it within 24 hours instead of
-- sending a second one. A new 23-hour retry window starts.
create function public.admin_resend_launch_mail(p_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare m private.launch_access_mail;
begin
  if not private.is_admin() then raise exception 'not authorized' using errcode='42501'; end if;
  if p_id is null then raise exception 'invalid mail'; end if;
  select * into m from private.launch_access_mail where id=p_id for update;
  if not found or m.state<>'unknown' or not private.launch_mail_eligible(m) then raise exception 'mail not resendable'; end if;
  update private.launch_access_mail set state='queued',completed_at=null,first_attempt_at=null,
    claim_id=null,lease_until=null,provider_id=null,next_attempt_at=clock_timestamp() where id=m.id;
end $$;

revoke all on function public.admin_launch_mail_problems(),public.admin_resend_launch_mail(uuid) from public,anon,authenticated,service_role;
grant execute on function public.admin_launch_mail_problems(),public.admin_resend_launch_mail(uuid) to authenticated;
