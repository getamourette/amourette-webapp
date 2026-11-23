-- #405: tell the holder of a replaced email link that a newer one exists.
-- Local preparation only. Shared application requires founder approval.
--
-- "Superseded" is disclosed only to a caller whose identifier AND token matched an
-- unexpired proof. The guest is told to use their most recent email, so it is said
-- only when the most recent link issued to that same, still current, address is
-- another one, was delivered (recorded as sent, or already opened) and works now.
-- An unknown identifier, a wrong token, an expired proof, a corrected recipient, or
-- a most recent link that is itself dead or undelivered all keep the generic refusal.
-- exchange_launch_access calls this function, so it inherits the same answer.
create index launch_access_mail_reservation on private.launch_access_mail(reservation_id,created_at);

create or replace function public.inspect_launch_access(p_id uuid,p_token text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare m private.launch_access_mail; latest private.launch_access_mail; envelope text;
begin
  select * into m from private.launch_access_mail where id=p_id and token_hash=private.launch_secret_hash(p_token)
    and token_expires_at>clock_timestamp();
  if not found then raise exception 'reservation access denied'; end if;
  if not exists(select 1 from private.launch_reservations r join private.launch_credentials c on c.reservation_id=r.id
    where r.id=m.reservation_id and r.email=m.recipient_email and c.management_hash=m.credential_hash and c.management_expires_at=m.credential_expires_at)
  then
    select * into latest from private.launch_access_mail l
      where l.reservation_id=m.reservation_id and l.recipient_email=m.recipient_email and l.token_hash is not null
      order by l.created_at desc,l.id desc limit 1;
    if latest.id<>m.id and (latest.state='sent' or latest.exchanged_envelope is not null)
      and latest.token_expires_at>clock_timestamp()
      and exists(select 1 from private.launch_reservations r join private.launch_credentials c on c.reservation_id=r.id
        where r.id=latest.reservation_id and r.email=latest.recipient_email
          and c.management_hash=latest.credential_hash and c.management_expires_at=latest.credential_expires_at)
      then raise exception 'reservation access superseded'; end if;
    raise exception 'reservation access denied';
  end if;
  select delivery_envelope into envelope from private.launch_checkout_work where reservation_id=m.reservation_id;
  return jsonb_build_object('reservation_id',m.reservation_id,'envelope',envelope,'exchanged',m.exchanged_envelope is not null);
end $$;
