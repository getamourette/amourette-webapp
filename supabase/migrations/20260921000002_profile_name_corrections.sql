-- #229. Behavioral cutover: deploy the editor without first_name UPDATE alongside
-- this migration. Requires founder approval before shared application.
begin;

create table private.name_corrections (
  id uuid primary key,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  proposed_name text not null check (private.valid_input_text(proposed_name,30,true)
    and proposed_name=private.trim_input(proposed_name)),
  status text not null default 'pending' check (status in ('pending','approved','rejected','cancelled')),
  created_at timestamptz not null default clock_timestamp(),
  resolved_at timestamptz,
  reviewed_by uuid,
  check ((status='pending')=(resolved_at is null))
);
create unique index one_pending_name_correction on private.name_corrections(profile_id) where status='pending';
create index name_correction_owner_history on private.name_corrections(profile_id,created_at desc);
create index name_correction_queue on private.name_corrections(created_at,id) where status='pending';
create table private.match_name_notices (
  match_id uuid not null references public.matches(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  correction_id uuid not null references private.name_corrections(id) on delete cascade,
  seen_correction_id uuid references private.name_corrections(id) on delete set null,
  primary key(match_id,recipient_id)
);
-- An unforgeable authorization for the exact UPDATE executed by approval.
create table private.name_application (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  correction_id uuid not null references private.name_corrections(id) on delete cascade,
  transaction_id bigint not null
);
alter table private.name_corrections enable row level security;
alter table private.match_name_notices enable row level security;
alter table private.name_application enable row level security;
revoke all on private.name_corrections,private.match_name_notices,private.name_application from public,anon,authenticated,service_role;

create function private.guard_name_correction() returns trigger
language plpgsql set search_path='' as $$
begin
  if new.id is distinct from old.id or new.profile_id is distinct from old.profile_id
    or new.proposed_name is distinct from old.proposed_name or new.created_at is distinct from old.created_at
    or old.status<>'pending' or new.status='pending' then
    raise exception 'immutable name correction' using errcode='23514';
  end if;
  return new;
end $$;
create trigger immutable_name_correction before update on private.name_corrections
for each row execute function private.guard_name_correction();

create function private.guard_profile_name() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.first_name is distinct from old.first_name and not exists (
    select 1 from private.name_application a join private.name_corrections r on r.id=a.correction_id
    where a.profile_id=old.id and a.transaction_id=txid_current()
      and r.profile_id=old.id and r.status='approved' and r.proposed_name=new.first_name
  ) then raise exception 'name correction approval required' using errcode='42501'; end if;
  return new;
end $$;
create trigger a01_guard_profile_name before update on public.profiles
for each row execute function private.guard_profile_name();
revoke all on function private.guard_profile_name(),private.guard_name_correction() from public,anon,authenticated,service_role;
revoke update on public.profiles from public,anon,authenticated;
revoke update(first_name) on public.profiles from public,anon,authenticated;
grant update(bio,gender,interested_in) on public.profiles to authenticated;

create function public.my_name_correction()
returns table(id uuid,proposed_name text,status text,created_at timestamptz,resolved_at timestamptz,current_name text)
language plpgsql stable security definer set search_path='' as $$
begin
  if auth.uid() is null then raise exception 'not authenticated' using errcode='42501'; end if;
  return query select r.id,r.proposed_name,r.status,r.created_at,r.resolved_at,p.first_name
    from public.profiles p left join lateral (
      select c.* from private.name_corrections c where c.profile_id=p.id order by c.created_at desc,c.id desc limit 1
    ) r on true where p.id=auth.uid();
end $$;

create function public.submit_name_correction(p_request_id uuid,p_proposed_name text)
returns uuid language plpgsql security definer set search_path='' as $$
declare current_name text; proposal text; previous private.name_corrections;
begin
  if auth.uid() is null then raise exception 'not authenticated' using errcode='42501'; end if;
  if p_request_id is null or not private.valid_input_text(p_proposed_name,30,true) then
    raise exception 'invalid proposed name' using errcode='22023'; end if;
  proposal:=private.trim_input(p_proposed_name);
  select first_name into current_name from public.profiles where id=auth.uid() for update;
  if not found then raise exception 'profile required' using errcode='42501'; end if;
  select * into previous from private.name_corrections where id=p_request_id;
  if found then
    if previous.profile_id<>auth.uid() or previous.proposed_name<>proposal then
      raise exception 'request identifier reused' using errcode='22023'; end if;
    return previous.id;
  end if;
  if proposal=current_name then raise exception 'name unchanged' using errcode='22023'; end if;
  if exists(select 1 from private.name_corrections where profile_id=auth.uid() and status='pending') then
    raise exception 'pending correction exists' using errcode='PT409'; end if;
  insert into private.name_corrections(id,profile_id,proposed_name) values(p_request_id,auth.uid(),proposal);
  return p_request_id;
end $$;

create function public.cancel_name_correction(p_request_id uuid)
returns text language plpgsql security definer set search_path='' as $$
declare request private.name_corrections;
begin
  if auth.uid() is null or p_request_id is null then raise exception 'invalid cancellation' using errcode='42501'; end if;
  perform 1 from public.profiles where id=auth.uid() for update;
  select * into request from private.name_corrections where id=p_request_id and profile_id=auth.uid() for update;
  if not found then raise exception 'not authorized' using errcode='42501'; end if;
  if request.status='pending' then
    update private.name_corrections set status='cancelled',resolved_at=clock_timestamp() where id=request.id;
    return 'cancelled';
  end if;
  return request.status;
end $$;

create function public.admin_name_corrections(p_request_id uuid default null)
returns table(id uuid,profile_id uuid,current_name text,proposed_name text,status text,created_at timestamptz,resolved_at timestamptz,reviewed_by uuid)
language plpgsql stable security definer set search_path='' as $$
begin
  if not private.is_admin() then raise exception 'not authorized' using errcode='42501'; end if;
  return query select r.id,r.profile_id,p.first_name,r.proposed_name,r.status,r.created_at,r.resolved_at,r.reviewed_by
    from private.name_corrections r join public.profiles p on p.id=r.profile_id
    where (p_request_id is null and r.status='pending') or r.id=p_request_id order by r.created_at,r.id;
end $$;

create function public.decide_name_correction(p_request_id uuid,p_action text)
returns table(applied boolean,status text) language plpgsql security definer set search_path='' as $$
declare request private.name_corrections; owner_id uuid;
begin
  if not private.is_admin() then raise exception 'not authorized' using errcode='42501'; end if;
  if p_request_id is null or p_action is null or p_action not in ('approved','rejected') then
    raise exception 'invalid name decision' using errcode='22023'; end if;
  -- Same order as #231: eligibility barrier, then profile/request rows. This also
  -- orders approval relative to reciprocal likes and terminal match cascades.
  perform private.lock_like_eligibility();
  select r.profile_id into owner_id from private.name_corrections r where r.id=p_request_id;
  perform 1 from public.profiles where id=owner_id for update;
  select * into request from private.name_corrections r where r.id=p_request_id for update;
  if not found then raise exception 'request unavailable' using errcode='PT409'; end if;
  if request.status<>'pending' then return query select false,request.status; return; end if;
  update private.name_corrections r set status=p_action,resolved_at=clock_timestamp(),reviewed_by=auth.uid() where r.id=request.id;
  if p_action='approved' then
    insert into private.name_application values(owner_id,request.id,txid_current());
    update public.profiles set first_name=request.proposed_name where id=owner_id;
    delete from private.name_application where profile_id=owner_id;
    insert into private.match_name_notices(match_id,recipient_id,correction_id)
      select m.id,case when m.profile_a=owner_id then m.profile_b else m.profile_a end,request.id
      from public.matches m join public.venue_nights n on n.id=m.venue_night_id
      where owner_id in (m.profile_a,m.profile_b) and m.expires_at>clock_timestamp()
        and n.terminal_at is null and n.closes_at>clock_timestamp()
      on conflict(match_id,recipient_id) do update set correction_id=excluded.correction_id;
  end if;
  return query select true,p_action;
end $$;

create function public.chat_partner_state(p_match_id uuid)
returns table(id uuid,first_name text,bio text,photo_url text,correction_id uuid,seen_correction_id uuid,expires_at timestamptz)
language plpgsql stable security definer set search_path='' as $$
begin
  if auth.uid() is null or p_match_id is null then raise exception 'invalid chat request' using errcode='42501'; end if;
  return query select p.id,p.first_name,p.bio,
    case when private.photo_allowed(p.id) then p.photo_url else null end,
    notice.correction_id,notice.seen_correction_id,least(m.expires_at,n.closes_at)
    from public.matches m join public.venue_nights n on n.id=m.venue_night_id
    join public.profiles p on p.id=case when m.profile_a=auth.uid() then m.profile_b else m.profile_a end
    left join private.match_name_notices notice on notice.match_id=m.id and notice.recipient_id=auth.uid()
    where m.id=p_match_id and auth.uid() in (m.profile_a,m.profile_b)
      and n.status='live' and n.terminal_at is null and n.closes_at>clock_timestamp() and m.expires_at>clock_timestamp()
      and not exists(select 1 from public.blocks b where
        (b.blocker_id=m.profile_a and b.blocked_id=m.profile_b) or (b.blocker_id=m.profile_b and b.blocked_id=m.profile_a));
end $$;

create function public.acknowledge_name_correction(p_match_id uuid,p_correction_id uuid)
returns boolean language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null or p_match_id is null or p_correction_id is null then
    raise exception 'invalid notice receipt' using errcode='22023'; end if;
  -- Do not mark a newer version seen when an old render's receipt arrives late.
  perform pg_catalog.pg_advisory_xact_lock_shared(231,0);
  update private.match_name_notices notice set seen_correction_id=p_correction_id
    where notice.match_id=p_match_id and notice.recipient_id=auth.uid() and notice.correction_id=p_correction_id
      and exists(select 1 from public.chat_partner_state(p_match_id));
  return found;
end $$;

revoke all on function public.my_name_correction(),public.submit_name_correction(uuid,text),public.cancel_name_correction(uuid),
 public.admin_name_corrections(uuid),public.decide_name_correction(uuid,text),public.chat_partner_state(uuid),public.acknowledge_name_correction(uuid,uuid)
 from public,anon,service_role;
grant execute on function public.my_name_correction(),public.submit_name_correction(uuid,text),public.cancel_name_correction(uuid),
 public.admin_name_corrections(uuid),public.decide_name_correction(uuid,text),public.chat_partner_state(uuid),public.acknowledge_name_correction(uuid,uuid)
 to authenticated;
-- These private tables are deliberately absent from Realtime publications.
commit;
