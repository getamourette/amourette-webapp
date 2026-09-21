-- #231: behavioral cutover; founder approval required before remote application.
begin;

-- Lock namespaces: (231, 0) eligibility; (232, hash) request; (233, hash) pair.
-- Hash collisions only serialize unrelated work. Locks last through commit.
create function private.lock_like_eligibility() returns void
language plpgsql volatile security definer set search_path = '' as $$
begin
  -- A fresh snapshot after waiting is essential, including for direct writes.
  if current_setting('transaction_isolation') <> 'read committed' then
    raise exception 'eligibility changes require read committed' using errcode='25001';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(231, 0);
end $$;
revoke all on function private.lock_like_eligibility() from public, anon, authenticated;

create function private.like_pair_eligible(p_actor uuid, p_target uuid, p_night uuid)
returns boolean language sql volatile security definer set search_path = '' as $$
  select p_actor <> p_target and exists (
    select 1 from public.presence mine
    join public.presence theirs on theirs.venue_night_id=mine.venue_night_id
    join public.venue_nights n on n.id=mine.venue_night_id
    join public.profiles a on a.id=mine.profile_id
    join public.profiles b on b.id=theirs.profile_id
    where mine.profile_id=p_actor and theirs.profile_id=p_target and n.id=p_night
      and mine.left_at is null and mine.is_visible
      and theirs.left_at is null and theirs.is_visible
      and n.status='live' and n.terminal_at is null and clock_timestamp()<n.closes_at
      and b.gender=any(a.interested_in) and a.gender=any(b.interested_in)
      and private.photo_allowed(p_actor) and private.photo_allowed(p_target)
      and not exists(select 1 from public.blocks bl where
        (bl.blocker_id=p_actor and bl.blocked_id=p_target) or
        (bl.blocker_id=p_target and bl.blocked_id=p_actor))
      and not exists(select 1 from public.venue_ejections e
        where e.venue_night_id=n.id and e.profile_id in (p_actor,p_target)
          and (e.expires_at is null or clock_timestamp()<e.expires_at))
  )
$$;
revoke all on function private.like_pair_eligible(uuid,uuid,uuid) from public, anon, authenticated;

-- The same predicate owns candidate reads and writes (#227), with exact night scope.
create or replace function private.discoverable_presence_ids() returns setof uuid
language sql stable security definer set search_path = '' as $$
  with scoped_presences as materialized (
    select candidate.id,candidate.profile_id,candidate.venue_night_id
    from public.presence mine
    join public.venue_nights night on night.id=mine.venue_night_id
    join public.presence candidate on candidate.venue_night_id=mine.venue_night_id
    where mine.profile_id=(select auth.uid())
      and mine.left_at is null and mine.is_visible
      and night.status='live' and night.terminal_at is null and clock_timestamp()<night.closes_at
      and candidate.profile_id<>mine.profile_id
      and candidate.left_at is null and candidate.is_visible
  )
  select p.id from scoped_presences p
  where private.like_pair_eligible(auth.uid(),p.profile_id,p.venue_night_id)
$$;

create table private.like_pair_authorizations (
  profile_a uuid not null references public.profiles(id) on delete cascade,
  profile_b uuid not null references public.profiles(id) on delete cascade,
  venue_night_id uuid not null references public.venue_nights(id) on delete cascade,
  token uuid not null default gen_random_uuid(),
  valid_until timestamptz not null,
  primary key(profile_a,profile_b,venue_night_id),
  check(profile_a<profile_b)
);
create index like_pair_authorizations_b on private.like_pair_authorizations(profile_b);
create index like_pair_authorizations_night on private.like_pair_authorizations(venue_night_id);
create table private.like_request_receipts (
  actor_id uuid not null references public.profiles(id) on delete cascade,
  request_id uuid not null,
  venue_night_id uuid not null references public.venue_nights(id) on delete cascade,
  target_id uuid not null,
  action text not null check(action in ('like','unlike')),
  token uuid,
  accepted boolean not null,
  primary key(actor_id,request_id)
);
create index like_request_receipts_night on private.like_request_receipts(venue_night_id);
alter table private.like_pair_authorizations enable row level security;
alter table private.like_request_receipts enable row level security;
revoke all on private.like_pair_authorizations,private.like_request_receipts from public,anon,authenticated,service_role;

create function private.invalidate_like_pairs(p_profile uuid default null, p_night uuid default null)
returns void language plpgsql volatile security definer set search_path = '' as $$
begin
  -- Caller holds the exclusive eligibility lock. Matches are deliberately untouched.
  update private.like_pair_authorizations a set token=gen_random_uuid()
  where (p_profile is null or p_profile in (a.profile_a,a.profile_b))
    and (p_night is null or a.venue_night_id=p_night)
    and (a.valid_until<=clock_timestamp() or not private.like_pair_eligible(a.profile_a,a.profile_b,a.venue_night_id));
  delete from public.likes l
  where (p_profile is null or p_profile in (l.liker_id,l.liked_id))
    and (p_night is null or l.venue_night_id=p_night)
    and not private.like_pair_eligible(l.liker_id,l.liked_id,l.venue_night_id)
    and not exists(select 1 from public.matches m where m.venue_night_id=l.venue_night_id
      and m.profile_a=least(l.liker_id,l.liked_id) and m.profile_b=greatest(l.liker_id,l.liked_id));
  update private.like_pair_authorizations a set valid_until=n.closes_at
  from public.venue_nights n where n.id=a.venue_night_id
    and (p_profile is null or p_profile in (a.profile_a,a.profile_b))
    and (p_night is null or a.venue_night_id=p_night);
end $$;
revoke all on function private.invalidate_like_pairs(uuid,uuid) from public,anon,authenticated;

create function private.before_like_eligibility_change() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform private.lock_like_eligibility();
  return null;
end $$;
create function private.after_like_eligibility_change() returns trigger
language plpgsql security definer set search_path = '' as $$
declare subject uuid; night uuid;
begin
  if tg_op='UPDATE' and old is not distinct from new then return null; end if;
  if tg_table_name='profiles' then
    if tg_op='UPDATE' and old.gender is not distinct from new.gender
      and old.interested_in @> new.interested_in and new.interested_in @> old.interested_in then return null; end if;
    subject:=coalesce(new.id,old.id);
  elsif tg_table_name='blocks' then
    subject:=coalesce(new.blocker_id,old.blocker_id);
  elsif tg_table_name='venue_nights' then
    night:=coalesce(new.id,old.id);
    if new.terminal_at is not null then
      delete from private.like_request_receipts where venue_night_id=night;
      delete from private.like_pair_authorizations where venue_night_id=night;
      return null;
    end if;
  else
    subject:=coalesce(new.profile_id,old.profile_id);
  end if;
  perform private.invalidate_like_pairs(subject,night);
  -- Moving a row's identity must also revoke the original pair's permission.
  if tg_op='UPDATE' and tg_table_name in ('presence','photo_state','venue_ejections') then
    if old.profile_id is distinct from new.profile_id then
      perform private.invalidate_like_pairs(old.profile_id,null);
    end if;
  end if;
  return null;
end $$;
revoke all on function private.before_like_eligibility_change(),private.after_like_eligibility_change() from public,anon,authenticated;

-- STATEMENT triggers run before tuple locks, including direct authorized writes.
-- Column-scoped UPDATE excludes ordinary last_seen_at heartbeat traffic.
do $$
declare item record;
begin
  for item in select * from (values
    ('profiles','gender,interested_in'),
    ('presence','profile_id,venue_night_id,is_visible,left_at'),
    ('blocks','blocker_id,blocked_id'),
    ('photo_state','profile_id,displayed_id,correction_required'),
    ('venue_ejections','profile_id,venue_night_id,expires_at'),
    ('venue_nights','status,terminal_at,closes_at')
  ) as t(tbl,cols) loop
    execute format('create trigger aaa_like_eligibility_lock before insert or delete or update of %s on public.%I for each statement execute function private.before_like_eligibility_change()',item.cols,item.tbl);
    execute format('create trigger zzz_like_eligibility_invalidate after insert or delete or update of %s on public.%I for each row execute function private.after_like_eligibility_change()',item.cols,item.tbl);
  end loop;
end $$;

-- Existing entry points can lock other rows before their first protected write.
-- Prepend the barrier to their existing bodies, preserving signatures, validation,
-- grants and behavior. Fail the migration if a required definition has drifted.
do $$
declare fn regprocedure; definition text; body text;
begin
  for fn in select unnest(array[
    'public.check_in(uuid)'::regprocedure,
    'private.transition_venue_night(uuid,text,text,uuid)'::regprocedure,
    'public.run_venue_night_lifecycle()'::regprocedure,
    'public.set_venue_live(uuid,boolean)'::regprocedure,
    'public.update_venue_night_schedule(uuid,timestamptz,timestamptz,timestamptz,integer)'::regprocedure,
    'public.save_venue_configuration(uuid,uuid,text,text,text,text,timestamptz,timestamptz,timestamptz,integer)'::regprocedure,
    'public.delete_venue_configuration(uuid)'::regprocedure,
    'public.eject_from_venue(uuid,uuid,text,text)'::regprocedure,
    'public.moderate_case(uuid,text)'::regprocedure,
    'public.submit_report(uuid,uuid,text,text)'::regprocedure,
    'public.submit_profile_photo(uuid,text,integer,jsonb)'::regprocedure,
    'public.decide_profile_photo(uuid,uuid,integer,text,text)'::regprocedure
  ]) loop
    select prosrc into body from pg_proc where oid=fn and prolang=(select oid from pg_language where lanname='plpgsql');
    if body is null or body !~* '\mbegin\M' then raise exception 'unexpected eligibility entry point: %',fn; end if;
    definition:=pg_get_functiondef(fn);
    execute replace(definition,body,regexp_replace(body,'\mbegin\M',E'begin\n  perform private.lock_like_eligibility();','i'));
  end loop;
end $$;

create function public.room_candidates(p_venue_id uuid)
returns table(id uuid,first_name text,bio text,photo_url text,checked_in_at timestamptz,venue_night_id uuid,like_token uuid)
language plpgsql volatile security definer set search_path = '' as $$
begin
  if auth.uid() is null or p_venue_id is null then raise exception 'invalid candidate request' using errcode='42501'; end if;
  if current_setting('transaction_isolation')<>'read committed' then raise exception 'read committed required' using errcode='25001'; end if;
  perform pg_catalog.pg_advisory_xact_lock_shared(231,0);
  -- Serialize token creation with commands using the pair row's unique key.
  insert into private.like_pair_authorizations(profile_a,profile_b,venue_night_id,valid_until)
  select least(auth.uid(),p.profile_id),greatest(auth.uid(),p.profile_id),p.venue_night_id,n.closes_at
  from public.presence p join public.venue_nights n on n.id=p.venue_night_id
  where n.venue_id=p_venue_id and p.left_at is null and p.is_visible
    and private.like_pair_eligible(auth.uid(),p.profile_id,n.id)
  order by least(auth.uid(),p.profile_id),greatest(auth.uid(),p.profile_id),p.venue_night_id
  on conflict on constraint like_pair_authorizations_pkey do nothing;
  return query select pr.id,pr.first_name,pr.bio,pr.photo_url,p.checked_in_at,p.venue_night_id,a.token
  from public.presence p join public.profiles pr on pr.id=p.profile_id
  join private.like_pair_authorizations a on a.profile_a=least(auth.uid(),p.profile_id)
    and a.profile_b=greatest(auth.uid(),p.profile_id) and a.venue_night_id=p.venue_night_id
  where p.venue_id=p_venue_id and p.left_at is null and p.is_visible
    and a.valid_until>clock_timestamp() and private.like_pair_eligible(auth.uid(),p.profile_id,p.venue_night_id)
  order by p.checked_in_at,p.profile_id;
end $$;
revoke all on function public.room_candidates(uuid) from public,anon;
grant execute on function public.room_candidates(uuid) to authenticated;

-- Trusted fixture inserts also use the barrier and pair lock, before other locks.
-- Participants can no longer reach this table write path at all.
drop trigger aaa_photo_like_guard on public.likes;
drop function private.guard_photo_like();
create function private.guard_like_write() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if current_setting('transaction_isolation')<>'read committed' then raise exception 'read committed required' using errcode='25001'; end if;
  perform pg_catalog.pg_advisory_xact_lock_shared(231,0);
  if new.venue_night_id is null then
    select n.id into new.venue_night_id from public.venue_nights n
    where n.venue_id=new.venue_id and n.status='live' and n.terminal_at is null and clock_timestamp()<n.closes_at;
  end if;
  perform pg_catalog.pg_advisory_xact_lock(233,hashtext(least(new.liker_id,new.liked_id)::text||greatest(new.liker_id,new.liked_id)::text||new.venue_night_id::text));
  if not private.like_pair_eligible(new.liker_id,new.liked_id,new.venue_night_id) then
    raise exception 'like unavailable' using errcode='42501';
  end if;
  select n.closes_at,n.venue_id into new.expires_at,new.venue_id from public.venue_nights n where n.id=new.venue_night_id;
  return new;
end $$;
revoke all on function private.guard_like_write() from public,anon,authenticated;
drop trigger if exists likes_set_expires_at on public.likes;
create trigger aaa_like_write_guard before insert on public.likes for each row execute function private.guard_like_write();

revoke insert,update,delete,truncate,references,trigger on public.likes from public,anon,authenticated;
revoke update on public.likes from service_role;
revoke insert,update,delete,truncate,references,trigger on public.matches from public,anon,authenticated;
drop policy if exists likes_insert_own on public.likes;
drop policy if exists likes_delete_own on public.likes;

create function public.write_like(p_venue_night_id uuid,p_target_id uuid,p_action text,p_request_id uuid,p_token uuid default null)
returns table(accepted boolean,liked boolean,match_id uuid)
language plpgsql volatile security definer set search_path = '' as $$
declare actor uuid:=auth.uid(); receipt private.like_request_receipts; pair_state private.like_pair_authorizations;
  allowed boolean; replay boolean; night public.venue_nights;
begin
  if actor is null then raise exception 'not authenticated' using errcode='42501'; end if;
  if p_venue_night_id is null or p_target_id is null or p_request_id is null or actor=p_target_id
    or p_action is null or p_action not in ('like','unlike')
    or (p_action='like' and p_token is null) or (p_action='unlike' and p_token is not null) then
    raise exception 'invalid like request' using errcode='22023';
  end if;
  if current_setting('transaction_isolation')<>'read committed' then raise exception 'read committed required' using errcode='25001'; end if;
  perform pg_catalog.pg_advisory_xact_lock_shared(231,0);
  perform pg_catalog.pg_advisory_xact_lock(232,hashtext(actor::text||p_request_id::text));
  perform pg_catalog.pg_advisory_xact_lock(233,hashtext(least(actor,p_target_id)::text||greatest(actor,p_target_id)::text||p_venue_night_id::text));
  select * into receipt from private.like_request_receipts where actor_id=actor and request_id=p_request_id;
  replay:=found;
  if replay and (receipt.venue_night_id<>p_venue_night_id or receipt.target_id<>p_target_id
    or receipt.action<>p_action or receipt.token is distinct from p_token) then
    raise exception 'request identifier reused' using errcode='22023';
  end if;
  select * into night from public.venue_nights where id=p_venue_night_id;
  if not found or night.terminal_at is not null or night.status<>'live' or clock_timestamp()>=night.closes_at then
    return query select false,false,null::uuid; return;
  end if;
  select * into pair_state from private.like_pair_authorizations
    where profile_a=least(actor,p_target_id) and profile_b=greatest(actor,p_target_id) and venue_night_id=p_venue_night_id;
  allowed:=private.like_pair_eligible(actor,p_target_id,p_venue_night_id);
  accepted:=case when p_action='like' then coalesce(allowed and pair_state.token=p_token and pair_state.valid_until>clock_timestamp(),false)
    else exists(select 1 from public.presence where profile_id=actor and venue_night_id=p_venue_night_id) end;
  if replay then
    accepted:=accepted and receipt.accepted;
  else
    -- Rejected commands also consume their UUID. A later change never retries a gesture.
    insert into private.like_request_receipts values(actor,p_request_id,p_venue_night_id,p_target_id,p_action,p_token,accepted);
    if accepted then
      if p_action='like' then
        insert into public.likes(liker_id,liked_id,venue_id,venue_night_id,expires_at)
        values(actor,p_target_id,night.venue_id,night.id,night.closes_at)
        on conflict(liker_id,liked_id,venue_night_id) do nothing;
      else
        delete from public.likes where liker_id=actor and liked_id=p_target_id and venue_night_id=p_venue_night_id;
      end if;
    end if;
  end if;
  liked:=allowed and exists(select 1 from public.likes where liker_id=actor and liked_id=p_target_id and venue_night_id=p_venue_night_id);
  match_id:=null;
  if allowed then
    select m.id into match_id from public.matches m where m.profile_a=least(actor,p_target_id)
      and m.profile_b=greatest(actor,p_target_id) and m.venue_night_id=p_venue_night_id;
  end if;
  return next;
end $$;
revoke all on function public.write_like(uuid,uuid,text,uuid,uuid) from public,anon;
grant execute on function public.write_like(uuid,uuid,text,uuid,uuid) to authenticated;

-- Seed existing pairs, then clean incompatible unmatched likes in both directions.
select private.lock_like_eligibility();
insert into private.like_pair_authorizations(profile_a,profile_b,venue_night_id,valid_until)
select distinct least(l.liker_id,l.liked_id),greatest(l.liker_id,l.liked_id),l.venue_night_id,n.closes_at
from public.likes l join public.venue_nights n on n.id=l.venue_night_id where n.terminal_at is null
on conflict do nothing;
select private.invalidate_like_pairs();
commit;
