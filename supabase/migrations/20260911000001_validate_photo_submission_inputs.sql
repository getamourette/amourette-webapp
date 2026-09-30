-- #77: preserve #194's transaction and grants; validate its newly integrated inputs.
-- Based on the deployed definition re-read on 2026-09-11. Requires #77 text helpers.
CREATE OR REPLACE FUNCTION public.submit_profile_photo(p_owner uuid, p_path text, p_expected_revision integer, p_profile jsonb DEFAULT NULL::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private'
AS $function$
declare s public.photo_state; version_id uuid; first_photo boolean;
begin

  -- #77: reject malformed command/profile data before any write or state lock.
  if p_owner is null or p_path is null or p_expected_revision is null or p_expected_revision < 0
    or p_path !~ ('^'||p_owner::text||'/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$') then
    raise exception 'invalid photo submission';
  end if;
  if p_profile is not null then
    if jsonb_typeof(p_profile) is distinct from 'object' or octet_length(p_profile::text)>16384 then
      raise exception 'invalid photo profile';
    end if;
    if exists(select 1 from jsonb_object_keys(p_profile) key where key not in ('first_name','bio','gender','interested_in','adult_confirmed'))
      or jsonb_typeof(p_profile->'first_name') is distinct from 'string'
      or not private.valid_input_text(p_profile->>'first_name',30,true)
      or (p_profile ? 'bio' and jsonb_typeof(p_profile->'bio') not in ('null','string'))
      or not private.valid_input_text(p_profile->>'bio',500,false)
      or jsonb_typeof(p_profile->'gender') is distinct from 'string'
      or p_profile->>'gender' not in ('woman','man','nonbinary')
      or jsonb_typeof(p_profile->'interested_in') is distinct from 'array'
      or p_profile->'adult_confirmed' is distinct from 'true'::jsonb then
      raise exception 'invalid photo profile';
    end if;
    if exists(select 1 from jsonb_array_elements(p_profile->'interested_in') item where jsonb_typeof(item)<>'string')
      or not private.valid_interests(array(select jsonb_array_elements_text(p_profile->'interested_in'))) then
      raise exception 'invalid photo profile';
    end if;
  end if;
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
end $function$
;
