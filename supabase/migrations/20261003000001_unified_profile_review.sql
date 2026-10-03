-- #294. Behavioral cutover: apply only after explicit founder authorization.
-- Reuse #236/#229 text publication and #194 photo decisions. Reports, bans,
-- matches, messages, preferences and ordinary editing permissions are unchanged.
begin;
select private.lock_like_eligibility();

create function private.valid_review_corrections(value jsonb,p_allow_legacy boolean default false) returns boolean
language plpgsql immutable set search_path='' as $$
declare item jsonb; fields text[]:=array[]::text[]; f text; why text;
begin
  if value is null or jsonb_typeof(value)<>'array' or octet_length(value::text)>2048
    or jsonb_array_length(value) not between 1 and 3 then return false; end if;
  for item in select jsonb_array_elements(value) loop
    if jsonb_typeof(item)<>'object' or (select count(*) from jsonb_object_keys(item))<>2
      or not item ?& array['field','reason'] or jsonb_typeof(item->'field')<>'string'
      or jsonb_typeof(item->'reason')<>'string' then return false; end if;
    f:=item->>'field'; why:=item->>'reason';
    if f=any(fields) or f not in ('first_name','bio','photo') then return false; end if;
    if (f='photo' and why not in ('face_unclear','multiple_people','not_person','sexual','violent')
      and not (p_allow_legacy is true and why='legacy_unknown'))
      or (f<>'photo' and why not in ('sexual','hateful','harassment','misleading_identity','inappropriate')) then return false; end if;
    fields:=array_append(fields,f);
  end loop;
  return true;
end $$;

create table private.profile_reviews (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  revision uuid not null default gen_random_uuid(),
  approved_name_revision uuid,
  approved_bio_revision uuid,
  approved_photo_id uuid,
  correction_id uuid,
  corrections jsonb,
  original_name text,
  original_bio text,
  original_photo_path text,
  original_photo_id uuid,
  requested_by uuid references auth.users(id) on delete set null,
  requested_at timestamptz,
  notification_seen boolean not null default false,
  submitted_revision uuid,
  submitted_at timestamptz not null default clock_timestamp(),
  check ((correction_id is null)=(corrections is null)),
  check (corrections is null or private.valid_review_corrections(corrections,true)),
  check ((correction_id is null)=(requested_at is null)),
  check (correction_id is not null or (original_name is null and original_bio is null
    and original_photo_path is null and original_photo_id is null and submitted_revision is null))
);
alter table private.profile_reviews enable row level security;
revoke all on private.profile_reviews from public,anon,authenticated,service_role;
insert into private.profile_reviews(profile_id,submitted_at,approved_photo_id)
select p.id,p.created_at,case when v.status='approved' then v.id end
from public.profiles p left join public.photo_state s on s.profile_id=p.id
left join public.photo_versions v on v.id=s.displayed_id;

create function private.initialize_profile_review() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  insert into private.profile_reviews(profile_id,submitted_at) values(new.id,new.created_at);
  return new;
end $$;
create trigger zz_initialize_profile_review after insert on public.profiles
for each row execute function private.initialize_profile_review();

-- Only identity/content and opaque revisions are projected; no preferences,
-- contacts, report evidence or private messages enter the review interface.
create function private.profile_review_snapshot(p_profile uuid) returns jsonb
language sql stable security definer set search_path='' as $$
  select jsonb_build_object(
    'id',p.id,
    'revision',md5(concat(r.revision,':',n.revision,':',b.revision,':',nr.id,':',br.id,':',s.revision))::uuid,
    'firstName',case when nr.id is not null then nr.proposed_name else coalesce(p.first_name,n.rejected_text) end,
    'bio',case when br.id is not null then br.proposed_text else coalesce(p.bio,b.rejected_text) end,
    'photoPath',coalesce(pv.path,dv.path,p.photo_url),
    'nameRequest',nr.id,'bioRequest',br.id,'photoVersion',coalesce(pv.id,dv.id),
    'photoRevision',s.revision,'photoStatus',coalesce(pv.status,dv.status),
    'nameRevision',n.revision,'bioRevision',b.revision,
    'nameRequired',coalesce(n.required,false),'bioRequired',coalesce(b.required,false),
    'submittedAt',r.submitted_at,
    'approvedFields',to_jsonb(array_remove(array[
      case when r.approved_name_revision=n.revision and nr.id is null then 'first_name' end,
      case when r.approved_bio_revision=b.revision and br.id is null then 'bio' end,
      case when r.approved_photo_id=coalesce(pv.id,dv.id) and coalesce(pv.status,dv.status)='approved' then 'photo' end
    ],null)),
    'correction',case when r.correction_id is not null then jsonb_build_object(
      'fields',r.corrections,'original',jsonb_build_object('firstName',r.original_name,'bio',r.original_bio,'photoPath',r.original_photo_path)) end,
    'correctionId',r.correction_id,'notification',r.correction_id is not null and not r.notification_seen,
    'submittedRevision',r.submitted_revision,
    'changedFields',to_jsonb(array_remove(array[
      case when r.correction_id is not null and (not n.required or nr.id is not null) and (case when nr.id is not null then nr.proposed_name else p.first_name end) is distinct from r.original_name then 'first_name' end,
      case when r.correction_id is not null and (not b.required or br.id is not null) and (case when br.id is not null then br.proposed_text else p.bio end) is distinct from r.original_bio then 'bio' end,
      case when r.correction_id is not null and (not s.correction_required or pv.id is not null)
        and coalesce(pv.status,dv.status) in ('unverified','approved')
        and coalesce(pv.id,dv.id) is distinct from r.original_photo_id then 'photo' end
    ],null))
  )
  from public.profiles p join private.profile_reviews r on r.profile_id=p.id
  left join private.profile_text_state n on n.profile_id=p.id and n.field='first_name'
  left join private.profile_text_state b on b.profile_id=p.id and b.field='bio'
  left join lateral (select c.id,c.proposed_name from private.name_corrections c
    where c.profile_id=p.id and c.status='pending' and (not n.required or c.requirement_id=n.requirement_id)
    order by c.created_at desc,c.id desc limit 1) nr on true
  left join lateral (select c.id,c.proposed_text from private.bio_corrections c
    where c.profile_id=p.id and c.status='pending' and c.requirement_id=b.requirement_id
    order by c.created_at desc,c.id desc limit 1) br on true
  left join public.photo_state s on s.profile_id=p.id
  left join public.photo_versions dv on dv.id=s.displayed_id
  left join public.photo_versions pv on pv.id=s.pending_id
  where p.id=p_profile
$$;

create function private.profile_review_status(snapshot jsonb) returns text
language sql immutable set search_path='' as $$
  select case when snapshot->>'correctionId' is not null then
    case when snapshot->>'submittedRevision'=snapshot->>'revision' then 'needs_review' else 'awaiting_changes' end
    when jsonb_array_length(snapshot->'approvedFields')=3 then 'approved' else 'needs_review' end
$$;

create function private.profile_review_ready(snapshot jsonb) returns boolean
language plpgsql immutable set search_path='' as $$
declare item jsonb; f text;
begin
  if snapshot is null or snapshot->>'correctionId' is null then return false; end if;
  for item in select jsonb_array_elements(snapshot->'correction'->'fields') loop
    f:=item->>'field';
    if not (snapshot->'changedFields') ? f then return false; end if;
    if f='first_name' and ((snapshot->>'firstName') is null
      or ((snapshot->>'nameRequired')::boolean and snapshot->>'nameRequest' is null)) then return false; end if;
    if f='bio' and (snapshot->>'bioRequired')::boolean and snapshot->>'bioRequest' is null then return false; end if;
    if f='photo' and (snapshot->>'photoVersion' is null or snapshot->>'photoStatus' not in ('unverified','approved')) then return false; end if;
  end loop;
  return true;
end $$;

create function private.begin_profile_correction(p_profile uuid,p_fields jsonb,p_original jsonb,p_extend boolean default false) returns void
language plpgsql security definer set search_path='' as $$
declare previous private.profile_reviews; fields jsonb:=p_fields; original jsonb:=p_original;
begin
  select * into previous from private.profile_reviews where profile_id=p_profile for update;
  if p_extend and previous.correction_id is not null then
    select jsonb_agg(item order by item->>'field') into fields from (
      select item from jsonb_array_elements(previous.corrections) item
      where not exists(select 1 from jsonb_array_elements(p_fields) newer where newer->>'field'=item->>'field')
      union all select item from jsonb_array_elements(p_fields) item
    ) combined;
    if not exists(select 1 from jsonb_array_elements(p_fields) f where f->>'field'='first_name') then
      original:=original || jsonb_build_object('firstName',previous.original_name); end if;
    if not exists(select 1 from jsonb_array_elements(p_fields) f where f->>'field'='bio') then
      original:=original || jsonb_build_object('bio',previous.original_bio); end if;
    if not exists(select 1 from jsonb_array_elements(p_fields) f where f->>'field'='photo') then
      original:=original || jsonb_build_object('photoPath',previous.original_photo_path,'photoVersion',previous.original_photo_id); end if;
  end if;
  -- Invalidate the old eligible audience before setting the discovery hold.
  perform private.invalidate_profile_audience(p_profile,true);
  update private.profile_reviews set revision=gen_random_uuid(),correction_id=gen_random_uuid(),
    corrections=fields,original_name=original->>'firstName',original_bio=original->>'bio',
    original_photo_path=original->>'photoPath',original_photo_id=(original->>'photoVersion')::uuid,
    requested_by=auth.uid(),requested_at=clock_timestamp(),notification_seen=false,submitted_revision=null
    where profile_id=p_profile;
  perform private.invalidate_like_pairs(p_profile,null);
  perform private.invalidate_participant(p_profile);
end $$;

-- Adopt unresolved foundation corrections without publishing any rejected value.
do $$
declare owner uuid; pairs jsonb; original jsonb;
begin
  for owner in select p.id from public.profiles p where exists(select 1 from private.profile_text_state t where t.profile_id=p.id and t.required)
    or exists(select 1 from public.photo_state s where s.profile_id=p.id and s.correction_required) loop
    select jsonb_agg(item order by item->>'field') into pairs from (
      select jsonb_build_object('field',t.field,'reason',t.reason) item from private.profile_text_state t where t.profile_id=owner and t.required
      -- Historical photo decisions can lack a reason. Preserve their hold and
      -- explicitly mark the missing evidence; never invent a preset violation.
      union all select jsonb_build_object('field','photo','reason',coalesce(s.reason,'legacy_unknown')) from public.photo_state s where s.profile_id=owner and s.correction_required
    ) requested;
    if not private.valid_review_corrections(pairs,true) then
      raise exception 'Existing corrections need valid preset reasons before #294 cutover';
    end if;
    original:=private.profile_review_snapshot(owner);
    -- Existing pending edits must remain ready for an explicit profile submit;
    -- compare them with the rejected content, never with themselves.
    original:=original || jsonb_build_object(
      'firstName',coalesce((select rejected_text from private.profile_text_state where profile_id=owner and field='first_name'),original->>'firstName'),
      'bio',coalesce((select rejected_text from private.profile_text_state where profile_id=owner and field='bio'),original->>'bio'),
      'photoPath',(select v.path from public.photo_state s join public.photo_versions v on v.id=s.displayed_id where s.profile_id=owner),
      'photoVersion',(select displayed_id from public.photo_state where profile_id=owner));
    perform private.begin_profile_correction(owner,pairs,original);
  end loop;
end $$;

create function private.profile_review_discoverable(p_profile uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select not exists(select 1 from private.profile_reviews r where r.profile_id=p_profile and r.correction_id is not null)
$$;
do $$
declare original text; patched text;
begin
  original:=pg_get_functiondef('private.like_pair_eligible(uuid,uuid,uuid)'::regprocedure);
  patched:=replace(original,'and private.photo_allowed(p_actor)',
    'and private.profile_review_discoverable(p_actor) and private.profile_review_discoverable(p_target) and private.photo_allowed(p_actor)');
  if patched=original then raise exception 'discovery eligibility requires review'; end if;
  execute patched;
end $$;

-- Keep legacy report/profile actions and their signatures. Their decisions still
-- resolve only the chosen field; only unified approval can clear a profile hold.
alter function public.require_profile_text_correction(uuid,text,uuid,text,uuid,uuid) set schema private;
alter function private.require_profile_text_correction(uuid,text,uuid,text,uuid,uuid) rename to require_profile_text_foundation;
create function public.require_profile_text_correction(p_profile uuid,p_field text,p_revision uuid,p_reason text,p_night uuid default null,p_report uuid default null)
returns void language plpgsql security definer set search_path='' as $$
declare original jsonb;
begin
  perform private.lock_like_eligibility();
  if not private.can_review_profile_text(p_profile,p_night,p_report) then raise exception 'not authorized' using errcode='42501'; end if;
  perform 1 from public.profiles where id=p_profile for update;
  original:=private.profile_review_snapshot(p_profile);
  perform private.require_profile_text_foundation(p_profile,p_field,p_revision,p_reason,p_night,p_report);
  perform private.begin_profile_correction(p_profile,jsonb_build_array(jsonb_build_object('field',p_field,'reason',p_reason)),original,true);
end $$;

alter function public.decide_profile_photo(uuid,uuid,integer,text,text) set schema private;
alter function private.decide_profile_photo(uuid,uuid,integer,text,text) rename to decide_profile_photo_foundation;
create function public.decide_profile_photo(p_owner uuid,p_version uuid,p_expected_revision integer,p_action text,p_reason text default null)
returns void language plpgsql security definer set search_path='' as $$
declare original jsonb;
begin
  perform private.lock_like_eligibility();
  if p_action='rejected' and private.is_admin() then
    perform 1 from public.profiles where id=p_owner for update;
    original:=private.profile_review_snapshot(p_owner);
  end if;
  perform private.decide_profile_photo_foundation(p_owner,p_version,p_expected_revision,p_action,p_reason);
  if p_action='rejected' and exists(select 1 from public.photo_state where profile_id=p_owner and correction_required) then
    perform private.begin_profile_correction(p_owner,jsonb_build_array(jsonb_build_object('field','photo','reason',p_reason)),original,true);
  end if;
end $$;

create function private.can_review_at_venue(p_profile uuid,p_venue uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select private.is_admin() and p_venue is not null and exists(
    select 1 from public.presence p join public.venue_nights n on n.id=p.venue_night_id
    where p.profile_id=p_profile and n.venue_id=p_venue)
$$;

create function public.admin_profile_reviews(p_venue uuid,p_filter text default 'needs_review',p_offset integer default 0,p_limit integer default 40)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
  if not private.is_admin() then raise exception 'not authorized' using errcode='42501'; end if;
  if p_venue is null or not exists(select 1 from public.venues where id=p_venue)
    or p_filter is null or p_filter not in ('needs_review','awaiting_changes','approved','all')
    or p_offset is null or p_offset not between 0 and 2147483647 or p_limit is null or p_limit not between 1 and 50 then
    raise exception 'invalid profile review query' using errcode='22023'; end if;
  with scoped as materialized (
    select private.profile_review_snapshot(p.id) snapshot from public.profiles p
    where exists(select 1 from public.presence pr join public.venue_nights n on n.id=pr.venue_night_id where pr.profile_id=p.id and n.venue_id=p_venue)
  ), rows as materialized (
    select snapshot,private.profile_review_status(snapshot) status,
      coalesce(snapshot->>'correctionId' is not null and snapshot->>'submittedRevision'=snapshot->>'revision',false) resubmission from scoped
  ), page as (
    select snapshot || jsonb_build_object('status',status,'resubmission',resubmission) profile from rows
    where p_filter='all' or status=p_filter order by resubmission desc,(snapshot->>'submittedAt')::timestamptz,snapshot->>'id'
    offset p_offset limit p_limit
  ) select jsonb_build_object('venueId',p_venue,'filter',p_filter,'offset',p_offset,
    'counts',(select jsonb_build_object('needs_review',count(*) filter(where status='needs_review'),
      'awaiting_changes',count(*) filter(where status='awaiting_changes'),'approved',count(*) filter(where status='approved'),'all',count(*)) from rows),
    'profiles',coalesce((select jsonb_agg(profile) from page),'[]'::jsonb)) into result;
  return result;
end $$;

create function public.request_profile_corrections(p_profile uuid,p_venue uuid,p_revision uuid,p_fields jsonb)
returns void language plpgsql security definer set search_path='' as $$
declare original jsonb; item jsonb; f text; why text; night uuid; pending uuid; state private.profile_text_state; requirement uuid; photo public.photo_state;
begin
  if not private.can_review_at_venue(p_profile,p_venue) then raise exception 'not authorized' using errcode='42501'; end if;
  if p_revision is null or not private.valid_review_corrections(p_fields) then raise exception 'invalid profile corrections' using errcode='22023'; end if;
  perform private.lock_like_eligibility();
  perform 1 from public.profiles where id=p_profile for update;
  if not private.can_review_at_venue(p_profile,p_venue) then raise exception 'not authorized' using errcode='42501'; end if;
  original:=private.profile_review_snapshot(p_profile);
  if original->>'revision' is distinct from p_revision::text or private.profile_review_status(original) not in ('needs_review','approved') then raise exception 'review changed' using errcode='PT409'; end if;
  select n.id into night from public.presence pr join public.venue_nights n on n.id=pr.venue_night_id
    where pr.profile_id=p_profile and n.venue_id=p_venue order by n.id limit 1;
  for item in select jsonb_array_elements(p_fields) loop
    f:=item->>'field'; why:=item->>'reason';
    if f='photo' then
      if original->>'photoVersion' is null then raise exception 'photo unavailable' using errcode='PT409'; end if;
      perform private.decide_profile_photo_foundation(p_profile,(original->>'photoVersion')::uuid,(original->>'photoRevision')::integer,'rejected',why);
      select * into photo from public.photo_state where profile_id=p_profile;
      -- Rejecting a voluntary replacement ordinarily keeps the approved photo.
      -- A unified correction request explicitly requires a new profile picture.
      if not photo.correction_required and photo.displayed_id is not null then
        perform private.decide_profile_photo_foundation(p_profile,photo.displayed_id,photo.revision,'rejected',why);
      end if;
    else
      pending:=case when f='first_name' then (original->>'nameRequest')::uuid else (original->>'bioRequest')::uuid end;
      if pending is not null then
        if f='first_name' then perform public.decide_name_correction(pending,'rejected');
        else perform public.decide_bio_correction(pending,'rejected'); end if;
      end if;
      select * into state from private.profile_text_state where profile_id=p_profile and field=f for update;
      if not state.required and exists(select 1 from public.profiles p where p.id=p_profile and case when f='first_name' then p.first_name else p.bio end is not null) then
        perform private.require_profile_text_foundation(p_profile,f,state.revision,why,night,null);
      else
        -- A repeated request (or a previously empty optional bio) has no public
        -- text to remove. Reuse the foundation requirement and event contracts.
        requirement:=gen_random_uuid();
        update private.profile_text_state set required=true,requirement_id=requirement,reason=why,
          rejected_text=case when f='first_name' then original->>'firstName' else original->>'bio' end,revision=gen_random_uuid()
          where profile_id=p_profile and field=f;
        insert into private.profile_text_events(profile_id,field,requirement_id,action,reason,actor_id,venue_night_id)
          values(p_profile,f,requirement,'required',why,auth.uid(),night);
      end if;
    end if;
  end loop;
  perform private.begin_profile_correction(p_profile,p_fields,original);
end $$;

create function public.approve_profile_review(p_profile uuid,p_venue uuid,p_revision uuid)
returns void language plpgsql security definer set search_path='' as $$
declare snapshot jsonb; final jsonb;
begin
  if not private.can_review_at_venue(p_profile,p_venue) then raise exception 'not authorized' using errcode='42501'; end if;
  if p_revision is null then raise exception 'invalid profile approval' using errcode='22023'; end if;
  perform private.lock_like_eligibility();
  perform 1 from public.profiles where id=p_profile for update;
  if not private.can_review_at_venue(p_profile,p_venue) then raise exception 'not authorized' using errcode='42501'; end if;
  snapshot:=private.profile_review_snapshot(p_profile);
  if snapshot->>'revision' is distinct from p_revision::text or private.profile_review_status(snapshot)<>'needs_review'
    or snapshot->>'firstName' is null or snapshot->>'photoVersion' is null
    or snapshot->>'photoStatus' not in ('unverified','approved') then raise exception 'review changed' using errcode='PT409'; end if;
  if snapshot->>'nameRequest' is not null then perform public.decide_name_correction((snapshot->>'nameRequest')::uuid,'approved'); end if;
  if snapshot->>'bioRequest' is not null then perform public.decide_bio_correction((snapshot->>'bioRequest')::uuid,'approved'); end if;
  if snapshot->>'photoStatus'='unverified' then
    perform private.decide_profile_photo_foundation(p_profile,(snapshot->>'photoVersion')::uuid,(snapshot->>'photoRevision')::integer,'approved',null);
  end if;
  final:=private.profile_review_snapshot(p_profile);
  if (final->>'nameRequired')::boolean or (final->>'bioRequired')::boolean then raise exception 'corrections remain' using errcode='PT409'; end if;
  update private.profile_reviews set revision=gen_random_uuid(),approved_name_revision=(final->>'nameRevision')::uuid,
    approved_bio_revision=(final->>'bioRevision')::uuid,approved_photo_id=(final->>'photoVersion')::uuid,
    correction_id=null,corrections=null,original_name=null,original_bio=null,original_photo_path=null,original_photo_id=null,
    requested_at=null,requested_by=null,notification_seen=false,submitted_revision=null where profile_id=p_profile;
  perform private.invalidate_profile_audience(p_profile,true);
  perform private.invalidate_like_pairs(p_profile,null);
end $$;

create function public.my_profile_review() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare snapshot jsonb;
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode='42501'; end if;
  snapshot:=private.profile_review_snapshot(auth.uid());
  if snapshot is null or snapshot->>'correctionId' is null then return null; end if;
  return jsonb_build_object('profileId',auth.uid(),'requestId',snapshot->>'correctionId','revision',snapshot->>'revision',
    'status',private.profile_review_status(snapshot),'fields',snapshot->'correction'->'fields',
    'updatedFields',snapshot->'changedFields','canSubmit',private.profile_review_ready(snapshot),
    'notification',snapshot->'notification');
end $$;

create function public.submit_profile_review(p_revision uuid) returns void
language plpgsql security definer set search_path='' as $$
declare snapshot jsonb;
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode='42501'; end if;
  if p_revision is null then raise exception 'invalid profile submission' using errcode='22023'; end if;
  perform private.lock_like_eligibility();
  perform 1 from public.profiles where id=auth.uid() for update;
  snapshot:=private.profile_review_snapshot(auth.uid());
  if snapshot->>'revision' is distinct from p_revision::text or not private.profile_review_ready(snapshot) then raise exception 'corrections incomplete or changed' using errcode='PT409'; end if;
  if snapshot->>'submittedRevision'=snapshot->>'revision' then return; end if;
  update private.profile_reviews set submitted_revision=p_revision,submitted_at=clock_timestamp() where profile_id=auth.uid();
  perform private.invalidate_participant(auth.uid());
end $$;

create function public.acknowledge_profile_correction(p_request_id uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode='42501'; end if;
  if p_request_id is null then raise exception 'invalid correction notice' using errcode='22023'; end if;
  update private.profile_reviews set notification_seen=true where profile_id=auth.uid() and correction_id=p_request_id;
  if not found then raise exception 'correction changed' using errcode='PT409'; end if;
  perform private.invalidate_participant(auth.uid());
end $$;

revoke all on function private.valid_review_corrections(jsonb,boolean),private.initialize_profile_review(),private.profile_review_snapshot(uuid),
  private.profile_review_status(jsonb),private.profile_review_ready(jsonb),private.begin_profile_correction(uuid,jsonb,jsonb,boolean),
  private.profile_review_discoverable(uuid),private.can_review_at_venue(uuid,uuid),
  private.require_profile_text_foundation(uuid,text,uuid,text,uuid,uuid),private.decide_profile_photo_foundation(uuid,uuid,integer,text,text)
  from public,anon,authenticated,service_role;
revoke all on function public.admin_profile_reviews(uuid,text,integer,integer),public.request_profile_corrections(uuid,uuid,uuid,jsonb),
  public.approve_profile_review(uuid,uuid,uuid),public.my_profile_review(),public.submit_profile_review(uuid),public.acknowledge_profile_correction(uuid),
  public.require_profile_text_correction(uuid,text,uuid,text,uuid,uuid),public.decide_profile_photo(uuid,uuid,integer,text,text)
  from public,anon,authenticated,service_role;
grant execute on function public.admin_profile_reviews(uuid,text,integer,integer),public.request_profile_corrections(uuid,uuid,uuid,jsonb),
  public.approve_profile_review(uuid,uuid,uuid),public.my_profile_review(),public.submit_profile_review(uuid),public.acknowledge_profile_correction(uuid),
  public.require_profile_text_correction(uuid,text,uuid,text,uuid,uuid),public.decide_profile_photo(uuid,uuid,integer,text,text) to authenticated;
commit;
