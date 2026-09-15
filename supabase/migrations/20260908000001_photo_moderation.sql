-- #194. Coordinated deployment required: old clients lose direct photo writes.
-- No presence or voluntary-visibility changes are made by photo moderation.
begin;

alter table public.profiles alter column photo_url drop not null;
create table public.photo_versions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  path text not null,
  status text not null default 'unverified' check (status in ('unverified','approved','rejected','superseded')),
  created_at timestamptz not null default now()
);
create unique index photo_versions_uploaded_path on public.photo_versions(path) where path ~ '^[0-9a-f-]{36}/';
create index photo_versions_owner on public.photo_versions(profile_id);
create table public.photo_state (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  displayed_id uuid references public.photo_versions(id),
  pending_id uuid references public.photo_versions(id),
  correction_required boolean not null default false,
  correction_since timestamptz,
  last_reason text check (last_reason in ('face_unclear','multiple_people','not_person','sexual','violent')),
  reason text check (reason in ('face_unclear','multiple_people','not_person','sexual','violent')),
  last_action text check (last_action in ('approved','rejected','submitted','cancelled')),
  revision integer not null default 0,
  updated_at timestamptz not null default now()
);
create table public.photo_audit (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  version_id uuid not null,
  action text not null check (action in ('submitted','cancelled','approved','rejected')),
  reason text check (reason in ('face_unclear','multiple_people','not_person','sexual','violent')),
  actor_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index photo_audit_owner_date on public.photo_audit(profile_id,created_at);
-- A private, content-free invalidation for owners and existing chat partners.
create table public.photo_invalidation (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  revision bigint not null default 0
);

insert into public.photo_versions(profile_id,path,created_at)
select id,photo_url,created_at from public.profiles where photo_url is not null;
insert into public.photo_state(profile_id,displayed_id)
select p.id,v.id from public.profiles p left join public.photo_versions v on v.profile_id=p.id;
insert into public.photo_invalidation(profile_id) select id from public.profiles;

alter table public.photo_versions enable row level security;
alter table public.photo_state enable row level security;
alter table public.photo_audit enable row level security;
alter table public.photo_invalidation enable row level security;
create policy photo_versions_read on public.photo_versions for select to authenticated
using (profile_id=auth.uid() or private.is_admin());
create policy photo_state_read on public.photo_state for select to authenticated
using (profile_id=auth.uid() or private.is_admin());
create policy photo_audit_read on public.photo_audit for select to authenticated using (private.is_admin());
create policy photo_invalidation_read on public.photo_invalidation for select to authenticated using (profile_id=auth.uid());
revoke all on public.photo_versions,public.photo_state,public.photo_audit,public.photo_invalidation from anon,authenticated;
grant select on public.photo_versions,public.photo_state,public.photo_audit,public.photo_invalidation to authenticated;
grant select,insert,update,delete on public.photo_versions,public.photo_state,public.photo_audit,public.photo_invalidation to service_role;
alter publication supabase_realtime add table public.photo_state,public.photo_invalidation;

-- Only server operations can create profiles or change their photo projection.
revoke insert,update on public.profiles from authenticated;
grant update(first_name,bio,gender,interested_in) on public.profiles to authenticated;
update storage.buckets set public=false where id='profile-photos';
drop policy if exists profile_photos_insert_own on storage.objects;
drop policy if exists profile_photos_update_own on storage.objects;

create function private.photo_allowed(p_profile_id uuid) returns boolean
language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.photo_state s where s.profile_id=p_profile_id
    and not s.correction_required and s.displayed_id is not null)
$$;
revoke all on function private.photo_allowed(uuid) from public,anon;
grant execute on function private.photo_allowed(uuid) to authenticated;

-- Restrictive policies also cover reads through an existing match relation.
create policy presence_photo_gate on public.presence as restrictive for select to authenticated
using (profile_id=auth.uid() or private.is_admin() or
  (private.photo_allowed(profile_id) and private.photo_allowed(auth.uid())));

-- Lock the same state rows, in UUID order, before every like INSERT/UPDATE.
-- A waiter reads the committed correction state after obtaining the row lock.
create function private.guard_photo_like() returns trigger
language plpgsql security definer set search_path=public,private as $$
begin
  perform 1 from public.photo_state where profile_id in (new.liker_id,new.liked_id)
    order by profile_id for update;
  if not private.photo_allowed(new.liker_id) or not private.photo_allowed(new.liked_id) then
    raise exception 'photo correction required' using errcode='42501';
  end if;
  return new;
end $$;
revoke all on function private.guard_photo_like() from public,anon,authenticated;
create trigger aaa_photo_like_guard before insert or update on public.likes
for each row execute function private.guard_photo_like();

create function private.notify_photo_change(p_profile_id uuid) returns void
language plpgsql security definer set search_path=public,private as $$
declare night_id uuid;
begin
  insert into public.photo_invalidation(profile_id,revision) values(p_profile_id,1)
    on conflict(profile_id) do update set revision=photo_invalidation.revision+1;
  -- Only each recipient's own identifier is emitted, never who changed or why.
  insert into public.photo_invalidation(profile_id,revision)
    select distinct case when m.profile_a=p_profile_id then m.profile_b else m.profile_a end,1
    from public.matches m where p_profile_id in (m.profile_a,m.profile_b)
      and m.expires_at>now()
    on conflict(profile_id) do update set revision=photo_invalidation.revision+1;
  for night_id in select distinct venue_night_id from public.presence
    where profile_id=p_profile_id and left_at is null
    union select vn.id from public.venue_nights vn join public.venues v on v.id=vn.venue_id
      where v.profile_preview_enabled and private.is_open_venue_night(vn.id)
  loop perform private.refresh_venue_night_public_state(night_id); end loop;
end $$;
revoke all on function private.notify_photo_change(uuid) from public,anon,authenticated;

-- Service-only entry point: the API authenticates the owner and validates bytes.
-- Initial identity and first photo commit together; human approval is never inferred.
create function public.submit_profile_photo(
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
  if not found or p_expected_revision is null or s.revision<>p_expected_revision then raise exception 'stale photo decision' using errcode='40001'; end if;
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
revoke all on function public.submit_profile_photo(uuid,text,integer,jsonb) from public,anon,authenticated;
grant execute on function public.submit_profile_photo(uuid,text,integer,jsonb) to service_role;

create function public.decide_profile_photo(p_owner uuid,p_version uuid,p_expected_revision integer,p_action text,p_reason text default null)
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
    raise exception 'stale photo decision' using errcode='40001'; end if;
  select * into v from public.photo_versions where id=p_version and profile_id=p_owner;
  if not found or v.status in ('rejected','superseded') or
    (p_action='cancelled' and p_version is distinct from s.pending_id) or
    (p_action='approved' and v.status<>'unverified') then
    raise exception 'stale photo decision' using errcode='40001'; end if;
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
revoke all on function public.decide_profile_photo(uuid,uuid,integer,text,text) from public,anon;
grant execute on function public.decide_profile_photo(uuid,uuid,integer,text,text) to authenticated;

-- Narrow founder destination: selected night participants, open work anywhere,
-- or a profile with a report. This never supplies a general profile directory.
create function public.admin_photo_queue(p_night uuid default null,p_profile uuid default null)
returns table(profile_id uuid,first_name text,displayed_id uuid,pending_id uuid,correction_required boolean,reason text,
  last_action text,revision integer,updated_at timestamptz,displayed_path text,displayed_status text,pending_path text,submitted_at timestamptz)
language plpgsql stable security definer set search_path=public,private as $$
begin
  if not private.is_admin() then raise exception 'not authorized' using errcode='42501'; end if;
  return query select s.profile_id,p.first_name,s.displayed_id,s.pending_id,s.correction_required,s.reason,
    s.last_action,s.revision,s.updated_at,d.path,d.status,n.path,coalesce(n.created_at,d.created_at)
    from public.photo_state s join public.profiles p on p.id=s.profile_id
    left join public.photo_versions d on d.id=s.displayed_id left join public.photo_versions n on n.id=s.pending_id
    where (p_profile is null or p.id=p_profile) and (
      (p_night is not null and exists(select 1 from public.presence pr where pr.profile_id=p.id and pr.venue_night_id=p_night))
      or (p_night is null and (s.correction_required or s.pending_id is not null or d.status='unverified'))
      or (p_profile is not null and exists(select 1 from public.reports r where r.reported_id=p.id)))
    order by case when s.correction_required then 0 when d.status='unverified' then 1 else 2 end,
      coalesce(n.created_at,d.created_at),s.profile_id;
end $$;
revoke all on function public.admin_photo_queue(uuid,uuid) from public,anon;
grant execute on function public.admin_photo_queue(uuid,uuid) to authenticated;

-- Storage reads are authorized for each download; no participant signed URLs.
create function private.can_view_public_photo(p_profile uuid) returns boolean
language sql stable security definer set search_path=public,private as $$
  select auth.uid() is not null and (p_profile=auth.uid() or private.is_admin() or
    (private.photo_allowed(p_profile) and
      (p_profile in (select private.visible_profile_ids()) or exists(
        select 1 from public.presence pr join public.venues venue on venue.id=pr.venue_id
        where pr.profile_id=auth.uid() and pr.left_at is null and pr.is_visible
          and private.is_live_venue_night(pr.venue_night_id) and venue.profile_preview_enabled
          and private.photo_allowed(auth.uid())
          and exists(select 1 from public.profile_private pp where pp.id=p_profile and pp.adult_confirmed_at is not null)
          and not exists(select 1 from public.blocks b where
            (b.blocker_id=auth.uid() and b.blocked_id=p_profile) or (b.blocked_id=auth.uid() and b.blocker_id=p_profile))))))
$$;
revoke all on function private.can_view_public_photo(uuid) from public,anon;
grant execute on function private.can_view_public_photo(uuid) to authenticated;

create function private.can_read_photo(p_path text) returns boolean
language sql stable security definer set search_path=public,private as $$
  select exists(select 1 from public.photo_versions v join public.photo_state s on s.profile_id=v.profile_id
    where (v.path=p_path or v.path like '%/storage/v1/object/public/profile-photos/'||p_path)
      and (v.id=s.displayed_id or v.id=s.pending_id)
      and (v.profile_id=auth.uid() or private.is_admin() or
        (v.id=s.displayed_id and not s.correction_required and private.can_view_public_photo(v.profile_id))))
$$;
revoke all on function private.can_read_photo(text) from public,anon;
grant execute on function private.can_read_photo(text) to authenticated;
-- One authorized public projection also supports preview profiles, whose main
-- profile row is intentionally not readable through the normal discovery RLS.
create function public.profile_photo_source(p_profile uuid) returns text
language sql stable security definer set search_path=public,private as $$
  select p.photo_url from public.profiles p where p.id=p_profile
    and p.photo_url is not null and private.can_view_public_photo(p.id)
$$;
revoke all on function public.profile_photo_source(uuid) from public,anon;
grant execute on function public.profile_photo_source(uuid) to authenticated;

create policy photo_download on storage.objects for select to authenticated
using(bucket_id='profile-photos' and private.can_read_photo(name));

CREATE OR REPLACE FUNCTION public.preview_room_profiles(p_venue_id uuid)
 RETURNS TABLE(id uuid, first_name text, photo_url text, bio text, gender text, interested_in text[], profile_created_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'private'
AS $function$
declare
  me uuid := (select auth.uid());
  preview_allowed boolean;
begin
  if me is null then
    raise exception 'not authenticated';
  end if;

  select v.is_live
     and v.profile_preview_enabled
     and exists (
       select 1
       from public.presence p
       where p.profile_id = me
         and p.venue_id = p_venue_id
         and p.left_at is null
         and p.is_visible
         and private.is_live_venue_night(p.venue_night_id)
     )
    into preview_allowed
  from public.venues v
  where v.id = p_venue_id;

  if not coalesce(preview_allowed, false) or not private.photo_allowed(me) then
    return;
  end if;

  return query
    select
      pr.id,
      pr.first_name,
      pr.photo_url,
      pr.bio,
      pr.gender,
      pr.interested_in,
      pr.created_at
    from public.profiles pr
    join public.profile_private pp on pp.id = pr.id
    where pr.id <> me
      and private.photo_allowed(pr.id)
      and pp.adult_confirmed_at is not null
      and not exists (
        select 1
        from public.blocks b
        where (b.blocker_id = me and b.blocked_id = pr.id)
           or (b.blocker_id = pr.id and b.blocked_id = me)
      )
    order by pr.created_at asc
    limit 50;
end;
$function$;

CREATE OR REPLACE FUNCTION private.visible_profile_ids()
 RETURNS SETOF uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select auth.uid()
  union
  select theirs.profile_id from public.presence mine
  join public.presence theirs on theirs.venue_night_id=mine.venue_night_id
  join public.venue_nights vn on vn.id=mine.venue_night_id and vn.status='live' and vn.terminal_at is null and now()<vn.closes_at
  where mine.profile_id=auth.uid() and mine.left_at is null and mine.is_visible
    and theirs.left_at is null and theirs.is_visible
    and private.photo_allowed(mine.profile_id) and private.photo_allowed(theirs.profile_id)
    and not exists(select 1 from public.blocks b where
      (b.blocker_id=mine.profile_id and b.blocked_id=theirs.profile_id) or
      (b.blocker_id=theirs.profile_id and b.blocked_id=mine.profile_id))
  union
  select case when m.profile_a=auth.uid() then m.profile_b else m.profile_a end
  from public.matches m join public.venue_nights vn on vn.id=m.venue_night_id
  where auth.uid() in (m.profile_a,m.profile_b) and vn.status='live' and vn.terminal_at is null and now()<vn.closes_at
    and not exists(select 1 from public.blocks b where
      (b.blocker_id=m.profile_a and b.blocked_id=m.profile_b) or
      (b.blocker_id=m.profile_b and b.blocked_id=m.profile_a))
$function$;

-- Isolated founder test identities are removed through auth.users CASCADE.
grant insert(user_id),select(user_id),delete on public.admins to service_role;

-- Service-created QA profiles use the same initial unverified state. Ordinary
-- participants have no INSERT grant; the server onboarding RPC supplies no URL.
create function private.initialize_photo_state() returns trigger
language plpgsql security definer set search_path=public,private as $$
declare version_id uuid;
begin
  if new.photo_url is not null then
    insert into public.photo_versions(profile_id,path) values(new.id,new.photo_url) returning id into version_id;
  end if;
  insert into public.photo_state(profile_id,displayed_id) values(new.id,version_id);
  insert into public.photo_invalidation(profile_id) values(new.id);
  return new;
end $$;
revoke all on function private.initialize_photo_state() from public,anon,authenticated;
create trigger profile_initial_photo after insert on public.profiles for each row execute function private.initialize_photo_state();

-- Remove bytes, not audit metadata. Retired images and abandoned uploads get
-- 24 hours for retries; an uncorrected rejected display gets at most 30 days.
-- The worker deletes through Storage API (never storage.objects SQL DELETE).
create function public.expired_profile_photo_paths() returns setof text
language sql security definer set search_path=public,storage as $$
  select o.name from storage.objects o where o.bucket_id='profile-photos'
    and o.created_at<now()-interval '24 hours'
    and not exists(select 1 from public.photo_versions v join public.photo_state s on s.profile_id=v.profile_id
      where (v.path=o.name or v.path like '%/storage/v1/object/public/profile-photos/'||o.name)
        and (v.id=s.pending_id or (v.id=s.displayed_id and
          (not s.correction_required or s.correction_since>now()-interval '30 days'))))
    order by o.created_at limit 100
$$;
revoke all on function public.expired_profile_photo_paths() from public,anon,authenticated;
grant execute on function public.expired_profile_photo_paths() to service_role;

-- Reuse the email worker's pg_cron -> pg_net -> secret-authenticated API pattern.
create function private.dispatch_photo_cleanup() returns bigint
language plpgsql security definer set search_path='' as $$
declare worker_url text; worker_secret text; request_id bigint;
begin
  select decrypted_secret into worker_url from vault.decrypted_secrets where name='photo_cleanup_url' limit 1;
  select decrypted_secret into worker_secret from vault.decrypted_secrets where name='photo_cleanup_secret' limit 1;
  if worker_url is null or worker_secret is null then return null; end if;
  select net.http_post(url:=worker_url,
    headers:=jsonb_build_object('Authorization','Bearer '||worker_secret,'Content-Type','application/json'),
    body:='{}'::jsonb,timeout_milliseconds:=10000) into request_id;
  return request_id;
end $$;
revoke all on function private.dispatch_photo_cleanup() from public,anon,authenticated,service_role;
select cron.schedule('amourette-photo-cleanup','*/15 * * * *',$$select private.dispatch_photo_cleanup();$$);

commit;
