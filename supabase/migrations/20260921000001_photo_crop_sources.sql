-- #31: private reusable originals; compatible with existing clients and versions.
-- Founder approval required before applying to the shared development database.
begin;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('profile-photo-sources','profile-photo-sources',false,52428800,array['image/jpeg','image/png','image/webp']);
-- No Storage policy grants source access to clients, including owners/admins.
-- The authenticated API checks ownership and current-version membership.

create function private.valid_photo_crop(c jsonb) returns boolean
language plpgsql immutable set search_path='' as $$
begin
  if c is null then return true; end if;
  if jsonb_typeof(c)<>'object' then return false; end if;
  if (select count(*) from jsonb_object_keys(c))<>4 or not c ?& array['x','y','width','height'] then return false; end if;
  if exists(select 1 from jsonb_each(c) where jsonb_typeof(value)<>'number') then return false; end if;
  return (c->>'x')::numeric>=0 and (c->>'y')::numeric>=0
    and (c->>'width')::numeric>0 and (c->>'height')::numeric>0
    and (c->>'x')::numeric+(c->>'width')::numeric<=100.000001
    and (c->>'y')::numeric+(c->>'height')::numeric<=100.000001;
end $$;
revoke all on function private.valid_photo_crop(jsonb) from public,anon;
grant execute on function private.valid_photo_crop(jsonb) to authenticated,service_role;

alter table public.photo_versions
  add column source_path text,
  add column source_width integer,
  add column source_height integer,
  add column portrait_crop jsonb,
  add column round_crop jsonb,
  add column image_width integer,
  add column image_height integer,
  add constraint photo_crop_bounds check(private.valid_photo_crop(portrait_crop) and private.valid_photo_crop(round_crop)),
  add constraint photo_source_dimensions check(
    (source_path is null and source_width is null and source_height is null and portrait_crop is null)
    or (source_path is not null and source_width is not null and source_height is not null
      and source_width>0 and source_height>0 and source_width::bigint*source_height<=25000000
      and source_path ~ ('^'||profile_id::text||'/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$'))),
  add constraint photo_image_dimensions check(
    (image_width is null and image_height is null and round_crop is null)
    or (image_width is not null and image_height is not null and image_width>0 and image_height>0
      and image_width::bigint*image_height<=25000000)),
  add constraint photo_round_square check(round_crop is null or
    abs((round_crop->>'width')::numeric*image_width/100-(round_crop->>'height')::numeric*image_height/100)<=1);
create index photo_versions_source on public.photo_versions(source_path) where source_path is not null;

-- New service-only command delegates the state transition to the existing entry
-- point inside the same transaction. The old signature and ACL stay unchanged.
create function public.submit_profile_photo_crop(
  p_owner uuid,p_path text,p_expected_revision integer,p_source_path text,
  p_source_width integer,p_source_height integer,p_image_width integer,p_image_height integer,
  p_crop jsonb default null,p_round_crop jsonb default null,p_from_version uuid default null,p_profile jsonb default null
) returns uuid language plpgsql security definer set search_path=public,private as $$
declare v uuid; previous public.photo_versions; s public.photo_state;
begin
  if p_owner is null or p_expected_revision is null or p_expected_revision<0
    or p_source_path is null or p_source_path !~ ('^'||p_owner::text||'/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$')
    or p_source_width is null or p_source_height is null or p_source_width<1 or p_source_height<1
    or p_source_width::bigint*p_source_height>25000000
    or p_image_width is null or p_image_height is null or p_image_width<1 or p_image_height<1
    or p_image_width::bigint*p_image_height>25000000
    or not private.valid_photo_crop(p_crop) or not private.valid_photo_crop(p_round_crop) then
    raise exception 'invalid photo crop';
  end if;
  if p_round_crop is not null and abs((p_round_crop->>'width')::numeric*p_image_width/100-(p_round_crop->>'height')::numeric*p_image_height/100)>1 then
    raise exception 'invalid round crop';
  end if;
  if p_crop is null then
    if p_image_width<>p_source_width or p_image_height<>p_source_height then raise exception 'invalid photo dimensions'; end if;
  elsif p_image_width<>greatest(1,least(p_source_width,round(p_source_width*((p_crop->>'x')::numeric+(p_crop->>'width')::numeric)/100)::int)-least(p_source_width-1,round(p_source_width*(p_crop->>'x')::numeric/100)::int))
    or p_image_height<>greatest(1,least(p_source_height,round(p_source_height*((p_crop->>'y')::numeric+(p_crop->>'height')::numeric)/100)::int)-least(p_source_height-1,round(p_source_height*(p_crop->>'y')::numeric/100)::int)) then
    raise exception 'invalid photo dimensions';
  end if;
  if p_from_version is not null then
    if p_profile is not null then raise exception 'invalid recrop'; end if;
    select * into s from public.photo_state where profile_id=p_owner for update;
    if not found or s.revision<>p_expected_revision then raise exception 'stale photo decision' using errcode='PT409'; end if;
    select * into previous from public.photo_versions where id=p_from_version and profile_id=p_owner
      and (id=s.pending_id or (id=s.displayed_id and (not s.correction_required or s.correction_since>now()-interval '30 days')));
    if not found then raise exception 'invalid recrop'; end if;
    if previous.source_path is not null and (previous.source_path<>p_source_path
      or previous.source_width<>p_source_width or previous.source_height<>p_source_height) then raise exception 'invalid recrop source'; end if;
  end if;
  if not exists(select 1 from storage.objects where bucket_id='profile-photo-sources' and name=p_source_path
    and (metadata->>'size')::bigint between 1 and 52428800 and metadata->>'mimetype' in ('image/jpeg','image/png','image/webp')) then
    raise exception 'invalid photo source';
  end if;
  -- Fresh commands cannot attach a pre-existing source belonging to a retired version.
  if p_from_version is null and not exists(select 1 from storage.objects where bucket_id='profile-photo-sources'
    and name=p_source_path and created_at>now()-interval '15 minutes') then raise exception 'invalid photo source'; end if;
  v := public.submit_profile_photo(p_owner,p_path,p_expected_revision,p_profile);
  update public.photo_versions set source_path=p_source_path,source_width=p_source_width,source_height=p_source_height,
    portrait_crop=p_crop,round_crop=p_round_crop,image_width=p_image_width,image_height=p_image_height where id=v;
  return v;
end $$;
revoke all on function public.submit_profile_photo_crop(uuid,text,integer,text,integer,integer,integer,integer,jsonb,jsonb,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.submit_profile_photo_crop(uuid,text,integer,text,integer,integer,integer,integer,jsonb,jsonb,uuid,jsonb) to service_role;

-- One authorized snapshot for displayed bytes + crop; no private source fields.
create function public.profile_photo_presentation(p_profile uuid) returns jsonb
language sql stable security definer set search_path='' as $$
  select jsonb_build_object('source',p.photo_url,'roundCrop',v.round_crop)
  from public.profiles p left join public.photo_state s on s.profile_id=p.id
  left join public.photo_versions v on v.id=s.displayed_id and v.path=p.photo_url
  where p.id=p_profile and p.photo_url is not null and private.can_view_public_photo(p.id)
$$;
revoke all on function public.profile_photo_presentation(uuid) from public,anon;
grant execute on function public.profile_photo_presentation(uuid) to authenticated;

-- Same retention as displayed files: active dependencies survive; retired or
-- deleted profiles leave no permanent original archive. Never delete shared
-- bytes while any retained version still references them.
create function public.expired_profile_photo_source_paths() returns setof text
language sql security definer set search_path='' as $$
  select o.name from storage.objects o where o.bucket_id='profile-photo-sources'
    and o.created_at<now()-interval '24 hours'
    and not exists(select 1 from public.photo_versions v join public.photo_state s on s.profile_id=v.profile_id
      where v.source_path=o.name and (v.id=s.pending_id or (v.id=s.displayed_id and
        (not s.correction_required or s.correction_since>now()-interval '30 days'))))
    order by o.created_at limit 100
$$;
revoke all on function public.expired_profile_photo_source_paths() from public,anon,authenticated;
grant execute on function public.expired_profile_photo_source_paths() to service_role;
commit;
