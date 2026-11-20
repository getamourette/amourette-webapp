-- #405: tell the holder of a replaced email link that a newer one exists.
-- Local preparation only. Shared application requires founder approval.
--
-- "Superseded" is disclosed only to a caller whose identifier AND token matched an
-- unexpired proof that is still addressed to the reservation's current email, and
-- only when a later link was really delivered to that same address and works now.
-- An unknown identifier, a wrong token, an expired proof, a corrected recipient or
-- a proof invalidated without a newer delivered link all keep the generic refusal.
-- exchange_launch_access calls this function, so it inherits the same answer.
create or replace function public.inspect_launch_access(p_id uuid,p_token text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare m private.launch_access_mail; envelope text;
begin
  select * into m from private.launch_access_mail where id=p_id and token_hash=private.launch_secret_hash(p_token)
    and token_expires_at>clock_timestamp();
  if not found then raise exception 'reservation access denied'; end if;
  if not exists(select 1 from private.launch_reservations r join private.launch_credentials c on c.reservation_id=r.id
    where r.id=m.reservation_id and r.email=m.recipient_email and c.management_hash=m.credential_hash and c.management_expires_at=m.credential_expires_at)
  then
    if exists(select 1 from private.launch_access_mail newer
      join private.launch_reservations r on r.id=newer.reservation_id and r.email=newer.recipient_email
      join private.launch_credentials c on c.reservation_id=r.id
        and c.management_hash=newer.credential_hash and c.management_expires_at=newer.credential_expires_at
      where newer.reservation_id=m.reservation_id and newer.recipient_email=m.recipient_email
        and newer.created_at>m.created_at and newer.state='sent' and newer.token_expires_at>clock_timestamp())
      then raise exception 'reservation access superseded'; end if;
    raise exception 'reservation access denied';
  end if;
  select delivery_envelope into envelope from private.launch_checkout_work where reservation_id=m.reservation_id;
  return jsonb_build_object('reservation_id',m.reservation_id,'envelope',envelope,'exchanged',m.exchanged_envelope is not null);
end $$;
