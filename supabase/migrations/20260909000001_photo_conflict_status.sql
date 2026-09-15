-- A stale review is an application conflict, not a retriable SQL serialization
-- failure. PT409 makes PostgREST return HTTP 409 immediately to the founder.
begin;

create or replace function public.submit_profile_photo(
  p_owner uuid,p_path text,p_expected_revision integer,p_profile jsonb default null
) returns uuid language plpgsql security definer set search_path=public,private as $$
declare s public.photo_state; version_id uuid; first_photo boolean;
begin
  if p_path !~ ('^'||p_owner::text||'/[0-9a-f-]+\.(jpg|png|webp)$') or not exists(
    select 1 from storage.objects where bucket_id='profile-photos' and name=p_path
      and created_at>now()-interval '15 minutes'
      and (metadata->>'size')::bigint between 1 and 5242880
      and metadata->>'mimetype' in ('image/jpeg','image/png','image/webp')
  ) then raise exception 'invalid photo file'; end if;
  if p_profile is not null then
    insert into public.profiles(id,first_name,bio,gender,interested_in)
    values(p_owner,p_profile->>'first_name',nullif(p_profile->>'bio',''),p_profile->>'gender',
      array(select jsonb_array_elements_text(p_profile->'interested_in')));
    if p_profile->>'adult_confirmed' is distinct from 'true' then raise exception 'age confirmation required'; end if;
    insert into public.profile_private(id,adult_confirmed_at) values(p_owner,now());
    insert into public.photo_state(profile_id) values(p_owner) on conflict(profile_id) do nothing;
  end if;
  select * into s from public.photo_state where profile_id=p_owner for update;
  if not found or p_expected_revision is null or s.revision<>p_expected_revision then raise exception 'stale photo decision' using errcode='PT409'; end if;
  insert into public.photo_versions(profile_id,path) values(p_owner,p_path) returning id into version_id;
  first_photo := s.displayed_id is null and not s.correction_required;
  if s.pending_id is not null then
    update public.photo_versions set status='superseded' where id=s.pending_id;
  end if;
  update public.photo_state set
    displayed_id=case when first_photo then version_id else displayed_id end,
    pending_id=case when first_photo then null else version_id end,
    last_action='submitted',revision=revision+1,updated_at=now()
    where profile_id=p_owner;
  if first_photo then update public.profiles set photo_url=p_path where id=p_owner; end if;
  insert into public.photo_audit(profile_id,version_id,action,actor_id) values(p_owner,version_id,'submitted',p_owner);
  perform private.notify_photo_change(p_owner);
  return version_id;
end $$;

create or replace function public.decide_profile_photo(p_owner uuid,p_version uuid,p_expected_revision integer,p_action text,p_reason text default null)
returns void language plpgsql security definer set search_path=public,private as $$
declare s public.photo_state; v public.photo_versions;
begin
  if auth.uid() is null or p_action is null or (p_action='cancelled' and auth.uid()<>p_owner)
    or (p_action in ('approved','rejected') and not private.is_admin())
    or p_action not in ('cancelled','approved','rejected') then raise exception 'not authorized' using errcode='42501'; end if;
  if p_action='rejected' and (p_reason is null or p_reason not in ('face_unclear','multiple_people','not_person','sexual','violent'))
    or (p_action<>'rejected' and p_reason is not null) then raise exception 'invalid reason'; end if;
  select * into s from public.photo_state where profile_id=p_owner for update;
  if not found or p_expected_revision is null or s.revision<>p_expected_revision or
    (p_version is distinct from s.displayed_id and p_version is distinct from s.pending_id) then
    raise exception 'stale photo decision' using errcode='PT409'; end if;
  select * into v from public.photo_versions where id=p_version and profile_id=p_owner;
  if not found or v.status in ('rejected','superseded') or
    (p_action='cancelled' and p_version is distinct from s.pending_id) or
    (p_action='approved' and v.status<>'unverified') then
    raise exception 'stale photo decision' using errcode='PT409'; end if;
  update public.photo_versions set status=case when p_action='cancelled' then 'superseded' else p_action end where id=p_version;
  if p_action='approved' then
    if p_version=s.pending_id then
      update public.photo_state set displayed_id=p_version,pending_id=null,correction_required=false,correction_since=null,reason=null where profile_id=p_owner;
      update public.profiles set photo_url=v.path where id=p_owner;
    end if;
  elsif p_action='rejected' and p_version=s.displayed_id then
    update public.photo_state set correction_required=true,correction_since=now(),reason=p_reason where profile_id=p_owner;
    update public.profiles set photo_url=null where id=p_owner;
    delete from public.likes l where p_owner in (l.liker_id,l.liked_id) and not exists(
      select 1 from public.matches m where m.venue_night_id=l.venue_night_id
        and m.profile_a=least(l.liker_id,l.liked_id) and m.profile_b=greatest(l.liker_id,l.liked_id));
  else
    update public.photo_state set pending_id=null,
      reason=case when correction_required then reason when p_action='rejected' then p_reason else null end
      where profile_id=p_owner;
  end if;
  update public.photo_state set revision=revision+1,last_action=p_action,last_reason=p_reason,
    reason=case when p_action='approved' and not correction_required then null else reason end,updated_at=now() where profile_id=p_owner;
  insert into public.photo_audit(profile_id,version_id,action,reason,actor_id)
    values(p_owner,p_version,p_action,p_reason,auth.uid());
  perform private.notify_photo_change(p_owner);
end $$;

-- A protected preview requires its existing automation bypass header.
create or replace function private.dispatch_photo_cleanup() returns bigint
language plpgsql security definer set search_path='' as $$
declare worker_url text; worker_secret text; preview_bypass text; request_id bigint;
begin
  select decrypted_secret into worker_url from vault.decrypted_secrets where name='photo_cleanup_url' limit 1;
  select decrypted_secret into worker_secret from vault.decrypted_secrets where name='photo_cleanup_secret' limit 1;
  select decrypted_secret into preview_bypass from vault.decrypted_secrets where name='photo_cleanup_bypass' limit 1;
  if worker_url is null or worker_secret is null then return null; end if;
  select net.http_post(url:=worker_url,
    headers:=jsonb_build_object('Authorization','Bearer '||worker_secret,'Content-Type','application/json') ||
      case when preview_bypass is not null then jsonb_build_object('x-vercel-protection-bypass',preview_bypass) else '{}'::jsonb end,
    body:='{}'::jsonb,timeout_milliseconds:=10000) into request_id;
  return request_id;
end $$;

commit;
