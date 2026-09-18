CREATE OR REPLACE FUNCTION public.unsubscribe_email_by_token(p_token text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  token_email text;
  changed_count integer;
begin
  if p_token is null or p_token collate "C" !~ '^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$' then return 'invalid_token'; end if;
  select token.email into token_email
  from private.email_unsubscribe_tokens token
  where token.token_hash = extensions.digest(
    pg_catalog.convert_to(coalesce(p_token, ''), 'UTF8'), 'sha256'
  )
    and token.expires_at > now()
    and token.revoked_at is null;

  if token_email is null then
    return 'invalid_token';
  end if;

  update public.email_subscriptions
  set status = 'unsubscribed', unsubscribed_at = now()
  where email = token_email and status = 'subscribed';
  get diagnostics changed_count = row_count;

  if changed_count = 0 then
    return 'already_unsubscribed';
  end if;
  return 'unsubscribed';
exception when others then
  return 'failure';
end;
$function$
;

CREATE OR REPLACE FUNCTION public.validate_email_unsubscribe_token(p_token text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select case when p_token is null or p_token collate "C" !~ '^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$' then false else exists (
    select 1
    from private.email_unsubscribe_tokens token
    where token.token_hash = extensions.digest(
      pg_catalog.convert_to(coalesce(p_token, ''), 'UTF8'), 'sha256'
    )
      and token.expires_at > now()
      and token.revoked_at is null
  ) end;
$function$
;
