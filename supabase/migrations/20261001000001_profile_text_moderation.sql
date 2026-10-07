-- #236. Behavioral cutover. Prepare only; shared application is founder-gated.
begin;

-- Public profiles are a publication projection. Rejected text is accessible only
-- in the active correction workflow, never via participant profile reads.
create table private.profile_text_state (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  field text not null check (field in ('first_name','bio')),
  revision uuid not null default gen_random_uuid(),
  required boolean not null default false,
  requirement_id uuid,
  reason text check (reason in ('sexual','hateful','harassment','misleading_identity','inappropriate')),
  rejected_text text,
  primary key(profile_id,field),
  check (required = (requirement_id is not null)),
  check (required = (reason is not null)),
  check (required or rejected_text is null)
);
create table private.bio_corrections (
  id uuid primary key,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  requirement_id uuid not null,
  proposed_text text check (proposed_text is null or
    (private.valid_input_text(proposed_text,300,true) and proposed_text=private.trim_input(proposed_text))),
  status text not null default 'pending' check (status in ('pending','approved','rejected','cancelled')),
  created_at timestamptz not null default clock_timestamp(),
  resolved_at timestamptz,
  reviewed_by uuid,
  check ((status='pending')=(resolved_at is null))
);
create unique index one_pending_bio_correction on private.bio_corrections(profile_id) where status='pending';
create index bio_correction_owner_history on private.bio_corrections(profile_id,created_at desc,id);
alter table private.name_corrections add requirement_id uuid;

do $$
declare original text; patched text;
begin
  original:=pg_get_functiondef('private.guard_name_correction()'::regprocedure);
  patched:=replace(original,'if new.id is distinct from old.id',
    'if new.requirement_id is distinct from old.requirement_id or new.id is distinct from old.id');
  if patched=original then raise exception 'name request guard requires review'; end if;
  execute patched;
end $$;


-- Metadata only: #234 can consume this attributable trail without archiving text.
create table private.profile_text_events (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  field text not null check(field in ('first_name','bio')),
  requirement_id uuid not null,
  request_id uuid,
  action text not null check(action in ('required','submitted','cancelled','approved','rejected')),
  reason text,
  actor_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default clock_timestamp(),
  venue_night_id uuid references public.venue_nights(id) on delete set null,
  report_id uuid references public.reports(id) on delete set null
);
create index profile_text_events_owner on private.profile_text_events(profile_id,created_at,id);
create table private.text_application (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  field text not null,
  transaction_id bigint not null,
  primary key(profile_id,field)
);
alter table private.profile_text_state enable row level security;
alter table private.bio_corrections enable row level security;
alter table private.profile_text_events enable row level security;
alter table private.text_application enable row level security;
revoke all on private.profile_text_state,private.bio_corrections,private.profile_text_events,private.text_application
  from public,anon,authenticated,service_role;

insert into private.profile_text_state(profile_id,field)
select p.id,f from public.profiles p cross join unnest(array['first_name','bio']) f;
alter table public.profiles alter column first_name drop not null;
alter table public.profiles drop constraint if exists profiles_first_name_check;
alter table public.profiles add constraint profiles_first_name_check check(first_name is null or
  (private.valid_input_text(first_name,30,true) and first_name=private.trim_input(first_name)));

-- The normalizer still validates every present name; only the guarded publication
-- transition may create null. Preserve current consent and bio normalization.
do $$
declare original text; patched text;
begin
  original:=pg_get_functiondef('private.normalize_profile_inputs()'::regprocedure);
  patched:=replace(original,'not private.valid_input_text(new.first_name,30,true)',
    '(new.first_name is not null and not private.valid_input_text(new.first_name,30,true))');
  if patched=original then raise exception 'profile normalizer requires review'; end if;
  execute patched;
end $$;

create function private.guard_profile_text() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if tg_op='INSERT' then
    if new.first_name is null then raise exception 'first name required' using errcode='23514'; end if;
    return new;
  end if;
  if old.bio is distinct from new.bio and exists(select 1 from private.profile_text_state s
    where s.profile_id=old.id and s.field='bio' and s.required)
    and not exists(select 1 from private.text_application a where a.profile_id=old.id
      and a.field='bio' and a.transaction_id=txid_current()) then
    raise exception 'bio correction approval required' using errcode='42501';
  end if;
  if new.first_name is null and not exists(select 1 from private.profile_text_state s
    where s.profile_id=old.id and s.field='first_name' and s.required) then
    raise exception 'first name required' using errcode='23514';
  end if;
  return new;
end $$;
create trigger a02_guard_profile_text before insert or update on public.profiles
for each row execute function private.guard_profile_text();

-- Retain #229's exact-approval guard; only the private moderation transaction may
-- additionally remove a published name. No caller-settable flag grants access.
create or replace function private.guard_profile_name() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.first_name is distinct from old.first_name and not (
    (new.first_name is null and exists(select 1 from private.text_application a
      where a.profile_id=old.id and a.field='first_name' and a.transaction_id=txid_current()))
    or exists(select 1 from private.name_application a join private.name_corrections r on r.id=a.correction_id
      where a.profile_id=old.id and a.transaction_id=txid_current() and r.profile_id=old.id
        and r.status='approved' and r.proposed_name=new.first_name)
  ) then raise exception 'name correction approval required' using errcode='42501'; end if;
  return new;
end $$;

create function private.version_profile_text() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if tg_op='INSERT' then
    insert into private.profile_text_state(profile_id,field) values(new.id,'first_name'),(new.id,'bio');
  else
    update private.profile_text_state s set revision=gen_random_uuid()
    where s.profile_id=new.id and ((s.field='bio' and new.bio is distinct from old.bio)
      or (s.field='first_name' and new.first_name is distinct from old.first_name));
    if new.first_name is distinct from old.first_name then
      perform private.invalidate_like_pairs(new.id,null);
    end if;
  end if;
  return new;
end $$;
create trigger z95_version_profile_text after insert or update on public.profiles
for each row execute function private.version_profile_text();

-- Share discovery/write eligibility, preserving established matches and all other
-- restrictions. Fail if the predicate changed instead of silently missing a gate.
do $$
declare original text; patched text;
begin
  original:=pg_get_functiondef('private.like_pair_eligible(uuid,uuid,uuid)'::regprocedure);
  patched:=replace(original,'and private.photo_allowed(p_actor)',
    'and a.first_name is not null and b.first_name is not null and private.photo_allowed(p_actor)');
  if patched=original then raise exception 'like eligibility definition requires review'; end if;
  execute patched;
end $$;

create function private.can_review_profile_text(p_profile uuid,p_night uuid,p_report uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select private.is_admin() and (
    (p_night is not null and p_report is null and exists(select 1 from public.presence p
      where p.profile_id=p_profile and p.venue_night_id=p_night))
    or (p_report is not null and p_night is null and exists(select 1 from public.reports r
      where r.id=p_report and r.reported_id=p_profile))
    or (p_night is null and p_report is null and exists(select 1 from private.profile_text_state s
      where s.profile_id=p_profile and s.required) or
      (p_night is null and p_report is null and exists(select 1 from private.profile_text_events e where e.profile_id=p_profile)))
  )
$$;

create function public.require_profile_text_correction(p_profile uuid,p_field text,p_revision uuid,p_reason text,
  p_night uuid default null,p_report uuid default null)
returns void language plpgsql security definer set search_path='' as $$
declare s private.profile_text_state; value text; requirement uuid:=gen_random_uuid();
begin
  if not private.can_review_profile_text(p_profile,p_night,p_report) then
    raise exception 'not authorized' using errcode='42501'; end if;
  if p_field is null or p_field not in ('first_name','bio') or p_revision is null
    or p_reason is null or p_reason not in ('sexual','hateful','harassment','misleading_identity','inappropriate') then
    raise exception 'invalid correction requirement' using errcode='22023'; end if;
  perform private.lock_like_eligibility();
  perform 1 from public.profiles where id=p_profile for update;
  -- Recheck the context after waiting for an eligibility-changing transaction.
  if not private.can_review_profile_text(p_profile,p_night,p_report) then
    raise exception 'not authorized' using errcode='42501'; end if;
  select * into s from private.profile_text_state where profile_id=p_profile and field=p_field for update;
  if not found or s.revision<>p_revision or s.required then raise exception 'review changed' using errcode='PT409'; end if;
  select case when p_field='first_name' then p.first_name else p.bio end into value from public.profiles p where p.id=p_profile;
  if value is null then raise exception 'no published text' using errcode='PT409'; end if;
  -- Notify the old audience before changing eligibility.
  perform private.invalidate_profile_audience(p_profile,true);
  update private.profile_text_state set required=true,requirement_id=requirement,reason=p_reason,
    rejected_text=value,revision=gen_random_uuid() where profile_id=p_profile and field=p_field;
  if p_field='first_name' then
    -- An inspection of a pre-restriction request cannot lift a later requirement.
    update private.name_corrections set status='cancelled',resolved_at=clock_timestamp()
      where profile_id=p_profile and status='pending';
  end if;
  insert into private.text_application values(p_profile,p_field,txid_current());
  if p_field='first_name' then update public.profiles set first_name=null where id=p_profile;
  else update public.profiles set bio=null where id=p_profile; end if;
  delete from private.text_application where profile_id=p_profile and field=p_field;
  insert into private.profile_text_events(profile_id,field,requirement_id,action,reason,actor_id,venue_night_id,report_id)
    values(p_profile,p_field,requirement,'required',p_reason,auth.uid(),p_night,p_report);
end $$;

-- Owner-only state deliberately excludes founder identity and report context.
create function public.my_text_corrections()
returns table(field text,revision uuid,required boolean,reason text,request_id uuid,proposed_text text,status text)
language plpgsql stable security definer set search_path='' as $$
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode='42501'; end if;
  return query select s.field,s.revision,s.required,s.reason,r.id,r.proposal,r.status
    from private.profile_text_state s left join lateral (
      select n.id,n.proposed_name as proposal,n.status,n.created_at from private.name_corrections n
        where s.field='first_name' and n.profile_id=s.profile_id and (not s.required or n.requirement_id=s.requirement_id)
      union all select b.id,b.proposed_text,b.status,b.created_at from private.bio_corrections b
        where s.field='bio' and b.profile_id=s.profile_id and (not s.required or b.requirement_id=s.requirement_id)
      order by created_at desc,id desc limit 1
    ) r on true where s.profile_id=auth.uid() order by s.field;
end $$;

create function public.admin_text_reviews(p_profile uuid default null,p_night uuid default null,p_report uuid default null)
returns table(profile_id uuid,first_name text,field text,revision uuid,required boolean,reason text,
  published_text text,rejected_text text,request_id uuid,proposed_text text,status text)
language plpgsql stable security definer set search_path='' as $$
begin
  if not private.is_admin() or (p_night is not null and p_report is not null) then
    raise exception 'not authorized' using errcode='42501'; end if;
  return query select p.id,p.first_name,s.field,s.revision,s.required,s.reason,
    case when s.field='first_name' then p.first_name else p.bio end,s.rejected_text,r.id,r.proposal,r.status
    from private.profile_text_state s join public.profiles p on p.id=s.profile_id
    left join lateral (
      select n.id,n.proposed_name as proposal,n.status from private.name_corrections n
        where s.field='first_name' and n.profile_id=s.profile_id and n.status='pending'
      union all select b.id,b.proposed_text,b.status from private.bio_corrections b
        where s.field='bio' and b.profile_id=s.profile_id and b.status='pending'
    ) r on true
    where (p_profile is null or p.id=p_profile)
      and (p_profile is not null or p_night is not null or p_report is not null or s.required)
      and private.can_review_profile_text(p.id,p_night,p_report)
    order by p.id,s.field;
end $$;

create function public.admin_text_history(p_profile uuid,p_night uuid default null,p_report uuid default null)
returns table(id uuid,field text,request_id uuid,action text,reason text,actor_id uuid,created_at timestamptz)
language plpgsql stable security definer set search_path='' as $$
begin
  if not private.can_review_profile_text(p_profile,p_night,p_report) then
    raise exception 'not authorized' using errcode='42501'; end if;
  return query select e.id,e.field,e.request_id,e.action,e.reason,e.actor_id,e.created_at
    from private.profile_text_events e where e.profile_id=p_profile order by e.created_at,e.id;
end $$;

-- Immutable proposals reuse #229's one-pending-request and retry semantics.
create function private.guard_bio_correction() returns trigger
language plpgsql set search_path='' as $$
begin
  if row(new.id,new.profile_id,new.requirement_id,new.proposed_text,new.created_at)
    is distinct from row(old.id,old.profile_id,old.requirement_id,old.proposed_text,old.created_at)
    or old.status<>'pending' or new.status='pending' then
    raise exception 'immutable bio correction' using errcode='23514'; end if;
  return new;
end $$;
create trigger immutable_bio_correction before update on private.bio_corrections
for each row execute function private.guard_bio_correction();

create function private.text_request_event() returns trigger
language plpgsql security definer set search_path='' as $$
declare f text:=case when tg_table_name='name_corrections' then 'first_name' else 'bio' end; why text;
begin
  if new.requirement_id is null then return new; end if;
  select reason into why from private.profile_text_state where profile_id=new.profile_id and field=f;
  insert into private.profile_text_events(profile_id,field,requirement_id,request_id,action,reason,actor_id)
    values(new.profile_id,f,new.requirement_id,new.id,case when tg_op='INSERT' then 'submitted' else new.status end,why,auth.uid());
  update private.profile_text_state set revision=gen_random_uuid() where profile_id=new.profile_id and field=f;
  perform private.invalidate_participant(new.profile_id);
  return new;
end $$;
create trigger text_name_event after insert or update on private.name_corrections for each row execute function private.text_request_event();
create trigger text_bio_event after insert or update on private.bio_corrections for each row execute function private.text_request_event();

create function public.submit_bio_correction(p_request_id uuid,p_proposed_text text,p_revision uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare s private.profile_text_state; previous private.bio_corrections; proposal text;
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode='42501'; end if;
  if p_request_id is null or p_revision is null or (p_proposed_text is not null and not private.valid_input_text(p_proposed_text,300,false)) then
    raise exception 'invalid bio proposal' using errcode='22023'; end if;
  proposal:=nullif(private.trim_input(p_proposed_text),'');
  perform private.lock_like_eligibility();
  perform 1 from public.profiles where id=auth.uid() for update;
  select * into previous from private.bio_corrections where id=p_request_id;
  if found then
    if previous.profile_id<>auth.uid() or previous.proposed_text is distinct from proposal then
      raise exception 'request identifier reused' using errcode='22023'; end if;
    return previous.id;
  end if;
  select * into s from private.profile_text_state where profile_id=auth.uid() and field='bio' for update;
  if not found or not s.required or s.revision<>p_revision then raise exception 'correction changed' using errcode='PT409'; end if;
  if exists(select 1 from private.bio_corrections where profile_id=auth.uid() and status='pending') then
    raise exception 'pending correction exists' using errcode='PT409'; end if;
  insert into private.bio_corrections(id,profile_id,requirement_id,proposed_text)
    values(p_request_id,auth.uid(),s.requirement_id,proposal);
  return p_request_id;
end $$;

create function public.cancel_bio_correction(p_request_id uuid)
returns text language plpgsql security definer set search_path='' as $$
declare r private.bio_corrections;
begin
  if auth.uid() is null or p_request_id is null then raise exception 'invalid cancellation' using errcode='42501'; end if;
  perform private.lock_like_eligibility();
  perform 1 from public.profiles where id=auth.uid() for update;
  select * into r from private.bio_corrections where id=p_request_id and profile_id=auth.uid() for update;
  if not found then raise exception 'not authorized' using errcode='42501'; end if;
  if r.status='pending' then
    update private.bio_corrections set status='cancelled',resolved_at=clock_timestamp() where id=r.id;
    return 'cancelled';
  end if;
  return r.status;
end $$;

-- Bind newly submitted names to the current requirement without a second rename
-- path. Keep immutable request, receipts and matched-chat notice behavior intact.
create function private.bind_name_requirement() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  select requirement_id into new.requirement_id from private.profile_text_state
    where profile_id=new.profile_id and field='first_name';
  return new;
end $$;
create trigger bind_name_requirement before insert on private.name_corrections for each row execute function private.bind_name_requirement();

alter function public.decide_name_correction(uuid,text) set schema private;
alter function private.decide_name_correction(uuid,text) rename to apply_name_correction;
revoke all on function private.apply_name_correction(uuid,text) from public,anon,authenticated,service_role;
create function public.decide_name_correction(p_request_id uuid,p_action text)
returns table(applied boolean,status text) language plpgsql security definer set search_path='' as $$
declare r private.name_corrections; s private.profile_text_state; result record;
begin
  if not private.is_admin() then raise exception 'not authorized' using errcode='42501'; end if;
  if p_request_id is null or p_action is null or p_action not in ('approved','rejected') then
    raise exception 'invalid name decision' using errcode='22023'; end if;
  perform private.lock_like_eligibility();
  select * into r from private.name_corrections where id=p_request_id;
  if not found then raise exception 'request unavailable' using errcode='PT409'; end if;
  perform 1 from public.profiles where id=r.profile_id for update;
  select * into s from private.profile_text_state where profile_id=r.profile_id and field='first_name' for update;
  if r.status='pending' and r.requirement_id is distinct from s.requirement_id then
    raise exception 'review changed' using errcode='PT409'; end if;
  select * into result from private.apply_name_correction(p_request_id,p_action);
  if result.applied and p_action='approved' and s.required then
    update private.profile_text_state set required=false,requirement_id=null,reason=null,rejected_text=null,
      revision=gen_random_uuid() where profile_id=r.profile_id and field='first_name';
  end if;
  return query select result.applied::boolean,result.status::text;
end $$;

create function public.decide_bio_correction(p_request_id uuid,p_action text)
returns table(applied boolean,status text) language plpgsql security definer set search_path='' as $$
declare r private.bio_corrections; s private.profile_text_state;
begin
  if not private.is_admin() then raise exception 'not authorized' using errcode='42501'; end if;
  if p_request_id is null or p_action is null or p_action not in ('approved','rejected') then
    raise exception 'invalid bio decision' using errcode='22023'; end if;
  perform private.lock_like_eligibility();
  select * into r from private.bio_corrections where id=p_request_id;
  if not found then raise exception 'request unavailable' using errcode='PT409'; end if;
  perform 1 from public.profiles where id=r.profile_id for update;
  select * into r from private.bio_corrections where id=p_request_id for update;
  if r.status<>'pending' then return query select false,r.status; return; end if;
  select * into s from private.profile_text_state where profile_id=r.profile_id and field='bio' for update;
  if not s.required or r.requirement_id<>s.requirement_id then raise exception 'review changed' using errcode='PT409'; end if;
  update private.bio_corrections set status=p_action,resolved_at=clock_timestamp(),reviewed_by=auth.uid() where id=r.id;
  if p_action='approved' then
    insert into private.text_application values(r.profile_id,'bio',txid_current());
    update public.profiles set bio=r.proposed_text where id=r.profile_id;
    delete from private.text_application where profile_id=r.profile_id and field='bio';
    update private.profile_text_state set required=false,requirement_id=null,reason=null,rejected_text=null,
      revision=gen_random_uuid() where profile_id=r.profile_id and field='bio';
  end if;
  return query select true,p_action;
end $$;

-- Hide obsolete #229 notice versions while a name itself is unpublished.
do $$
declare original text; patched text;
begin
  original:=pg_get_functiondef('public.chat_partner_state(uuid)'::regprocedure);
  patched:=replace(original,'notice.correction_id,notice.seen_correction_id',
    'case when p.first_name is not null then notice.correction_id end,case when p.first_name is not null then notice.seen_correction_id end');
  if patched=original then raise exception 'chat partner definition requires review'; end if;
  execute patched;
end $$;

revoke all on function private.guard_profile_text(),private.version_profile_text(),private.can_review_profile_text(uuid,uuid,uuid),
  private.guard_bio_correction(),private.text_request_event(),private.bind_name_requirement() from public,anon,authenticated,service_role;
revoke all on function public.require_profile_text_correction(uuid,text,uuid,text,uuid,uuid),public.my_text_corrections(),
  public.admin_text_reviews(uuid,uuid,uuid),public.admin_text_history(uuid,uuid,uuid),public.submit_bio_correction(uuid,text,uuid),
  public.cancel_bio_correction(uuid),public.decide_bio_correction(uuid,text),public.decide_name_correction(uuid,text)
  from public,anon,authenticated,service_role;
grant execute on function public.require_profile_text_correction(uuid,text,uuid,text,uuid,uuid),public.my_text_corrections(),
  public.admin_text_reviews(uuid,uuid,uuid),public.admin_text_history(uuid,uuid,uuid),public.submit_bio_correction(uuid,text,uuid),
  public.cancel_bio_correction(uuid),public.decide_bio_correction(uuid,text),public.decide_name_correction(uuid,text) to authenticated;
commit;
