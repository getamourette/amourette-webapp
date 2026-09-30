-- #31: independent round framing from the same private original.
-- Founder approval required before applying to the shared database.
begin;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('profile-photo-rounds','profile-photo-rounds',false,52428800,array['image/png']);

alter table public.photo_versions
  add column round_path text,
  add column round_source_crop jsonb,
  add column round_side integer,
  add constraint photo_round_source check (
    (round_path is null and round_source_crop is null and round_side is null)
    or (round_path is not null and round_source_crop is not null and round_side is not null
      and source_path is not null and source_width is not null and source_height is not null
      and round_path ~ ('^'||profile_id::text||'/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.png$')
      and private.valid_photo_crop(round_source_crop)
      and abs((round_source_crop->>'width')::numeric*source_width/100-(round_source_crop->>'height')::numeric*source_height/100)<=1
      and round_side>0 and round_side::bigint*round_side<=25000000
      and round_side=least(
        greatest(1,least(source_width,round(source_width*((round_source_crop->>'x')::numeric+(round_source_crop->>'width')::numeric)/100)::int)-least(source_width-1,round(source_width*(round_source_crop->>'x')::numeric/100)::int)),
        greatest(1,least(source_height,round(source_height*((round_source_crop->>'y')::numeric+(round_source_crop->>'height')::numeric)/100)::int)-least(source_height-1,round(source_height*(round_source_crop->>'y')::numeric/100)::int)))
    ));
create unique index photo_versions_round_path on public.photo_versions(round_path) where round_path is not null;

create function private.can_read_round_photo(p_path text) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.photo_versions v
    where v.round_path=p_path and private.can_read_photo(v.path))
$$;
revoke all on function private.can_read_round_photo(text) from public,anon;
grant execute on function private.can_read_round_photo(text) to authenticated;
create policy round_photo_download on storage.objects for select to authenticated
using(bucket_id='profile-photo-rounds' and private.can_read_round_photo(name));

-- Validate both images before the existing atomic moderation transition.
-- Existing command signatures and portrait-relative round metadata are retained.
create function public.submit_profile_photo_framing(
  p_owner uuid,p_path text,p_expected_revision integer,p_source_path text,
  p_source_width integer,p_source_height integer,p_image_width integer,p_image_height integer,
  p_round_path text,p_round_source_crop jsonb,p_round_side integer,
  p_crop jsonb default null,p_from_version uuid default null,p_profile jsonb default null
) returns uuid language plpgsql security definer set search_path='' as $$
declare v uuid;
begin
  if p_owner is null or p_source_width is null or p_source_height is null
    or p_source_width<1 or p_source_height<1 or p_source_width::bigint*p_source_height>25000000
    or p_round_path is null or p_round_path !~ ('^'||p_owner::text||'/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.png$')
    or p_round_source_crop is null or not private.valid_photo_crop(p_round_source_crop)
    or p_round_side is null or p_round_side<1 or p_round_side::bigint*p_round_side>25000000 then
    raise exception 'invalid round crop';
  end if;
  if abs((p_round_source_crop->>'width')::numeric*p_source_width/100-(p_round_source_crop->>'height')::numeric*p_source_height/100)>1
    or p_round_side<>least(
      greatest(1,least(p_source_width,round(p_source_width*((p_round_source_crop->>'x')::numeric+(p_round_source_crop->>'width')::numeric)/100)::int)-least(p_source_width-1,round(p_source_width*(p_round_source_crop->>'x')::numeric/100)::int)),
      greatest(1,least(p_source_height,round(p_source_height*((p_round_source_crop->>'y')::numeric+(p_round_source_crop->>'height')::numeric)/100)::int)-least(p_source_height-1,round(p_source_height*(p_round_source_crop->>'y')::numeric/100)::int))) then
    raise exception 'invalid round crop';
  end if;
  if not exists(select 1 from storage.objects where bucket_id='profile-photo-rounds' and name=p_round_path
    and (metadata->>'size')::bigint between 1 and 52428800 and metadata->>'mimetype'='image/png'
    and created_at>now()-interval '15 minutes') then raise exception 'invalid round photo'; end if;
  v:=public.submit_profile_photo_crop(p_owner,p_path,p_expected_revision,p_source_path,
    p_source_width,p_source_height,p_image_width,p_image_height,p_crop,null,p_from_version,p_profile);
  update public.photo_versions set round_path=p_round_path,round_source_crop=p_round_source_crop,round_side=p_round_side where id=v;
  return v;
end $$;
revoke all on function public.submit_profile_photo_framing(uuid,text,integer,text,integer,integer,integer,integer,text,jsonb,integer,jsonb,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.submit_profile_photo_framing(uuid,text,integer,text,integer,integer,integer,integer,text,jsonb,integer,jsonb,uuid,jsonb) to service_role;

create or replace function public.profile_photo_presentation(p_profile uuid) returns jsonb
language sql stable security definer set search_path='' as $$
  select jsonb_build_object('source',p.photo_url,'roundCrop',v.round_crop,'roundSource',v.round_path)
  from public.profiles p left join public.photo_state s on s.profile_id=p.id
  left join public.photo_versions v on v.id=s.displayed_id and v.path=p.photo_url
  where p.id=p_profile and p.photo_url is not null and private.can_view_public_photo(p.id)
$$;

-- Preserve the old queue contract for open founder clients. New review clients
-- receive both assets from the same immutable displayed/pending version snapshot.
create function public.admin_photo_framing(p_night uuid default null,p_profile uuid default null) returns setof jsonb
language sql stable security definer set search_path='' as $$
  select to_jsonb(q)||jsonb_build_object('displayed_round_path',d.round_path,'pending_round_path',p.round_path)
  from public.admin_photo_queue(p_night,p_profile) q
  left join public.photo_versions d on d.id=q.displayed_id
  left join public.photo_versions p on p.id=q.pending_id
$$;
revoke all on function public.admin_photo_framing(uuid,uuid) from public,anon;
grant execute on function public.admin_photo_framing(uuid,uuid) to authenticated;

create function public.expired_profile_photo_round_paths() returns setof text
language sql security definer set search_path='' as $$
  select o.name from storage.objects o where o.bucket_id='profile-photo-rounds'
    and o.created_at<now()-interval '24 hours'
    and not exists(select 1 from public.photo_versions v join public.photo_state s on s.profile_id=v.profile_id
      where v.round_path=o.name and (v.id=s.pending_id or (v.id=s.displayed_id and
        (not s.correction_required or s.correction_since>now()-interval '30 days'))))
    order by o.created_at limit 100
$$;
revoke all on function public.expired_profile_photo_round_paths() from public,anon,authenticated;
grant execute on function public.expired_profile_photo_round_paths() to service_role;
commit;
