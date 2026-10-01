-- #281. Behavioral cutover: founder approval and coordinated release required.
-- #203 must approve public disclosures/evidence retention before real collection.
begin;
select private.lock_like_eligibility();

create table private.matching_consent_wordings (
  version text not null, locale text not null check(locale in ('en','fr','es')),
  wording text not null, primary key(version,locale)
);
insert into private.matching_consent_wordings values
 ('matching-v1-draft','en','I agree that Amourette uses my gender and dating preferences to suggest compatible people to me and show my profile to them.'),
 ('matching-v1-draft','fr','J’accepte qu’Amourette utilise mon genre et mes préférences de rencontre pour me proposer des personnes compatibles et leur montrer mon profil.'),
 ('matching-v1-draft','es','Acepto que Amourette utilice mi género y mis preferencias de citas para sugerirme personas compatibles y mostrarles mi perfil.');
create table private.matching_consent_state (
  profile_id uuid primary key references public.profiles(id) on delete cascade deferrable initially deferred,
  revision uuid not null, version text not null, locale text not null,
  granted_at timestamptz not null, withdrawn_at timestamptz,
  foreign key(version,locale) references private.matching_consent_wordings(version,locale),
  check(withdrawn_at is null or withdrawn_at>=granted_at)
);
create table private.matching_consent_events (
  revision uuid primary key,
  profile_id uuid not null references private.matching_consent_state(profile_id) on delete cascade,
  action text not null check(action in ('granted','withdrawn')),
  version text not null, locale text not null, occurred_at timestamptz not null,
  foreign key(version,locale) references private.matching_consent_wordings(version,locale)
);
create index matching_consent_events_owner on private.matching_consent_events(profile_id);
alter table private.matching_consent_wordings enable row level security;
alter table private.matching_consent_state enable row level security;
alter table private.matching_consent_events enable row level security;
revoke all on private.matching_consent_wordings,private.matching_consent_state,private.matching_consent_events
  from public,anon,authenticated,service_role;

create function private.has_matching_consent(p_owner uuid) returns boolean
language sql volatile security definer set search_path='' as $$
  select exists(select 1 from private.matching_consent_state s where s.profile_id=p_owner and s.withdrawn_at is null)
$$;
create function private.validate_matching_consent(p_consent boolean,p_version text,p_locale text) returns void
language plpgsql security definer set search_path='' as $$
begin
  if p_consent is distinct from true or p_version is distinct from 'matching-v1-draft'
    or p_locale is null or p_locale not in ('en','fr','es') then
    raise exception 'matching consent required' using errcode='22023';
  end if;
end $$;
create function private.record_matching_consent(p_owner uuid,p_revision uuid,p_version text,p_locale text) returns void
language plpgsql security definer set search_path='' as $$
declare accepted_at timestamptz:=clock_timestamp();
begin
  insert into private.matching_consent_state(profile_id,revision,version,locale,granted_at)
    values(p_owner,p_revision,p_version,p_locale,accepted_at)
    on conflict(profile_id) do update set revision=excluded.revision,version=excluded.version,
      locale=excluded.locale,granted_at=excluded.granted_at,withdrawn_at=null;
  insert into private.matching_consent_events values(p_revision,p_owner,'granted',p_version,p_locale,accepted_at);
end $$;
revoke all on function private.has_matching_consent(uuid),private.validate_matching_consent(boolean,text,text),
  private.record_matching_consent(uuid,uuid,text,text) from public,anon,authenticated,service_role;

-- An absent pair represents no usable matching preferences. Never use a made-up
-- gender or an empty array as a substitute for erasure.
alter table public.profiles alter column gender drop not null, alter column interested_in drop not null,
  drop constraint profiles_interested_in_check,
  add constraint profiles_interested_in_check check (
    (gender is null and interested_in is null) or
    (gender is not null and interested_in is not null and private.valid_interests(interested_in)));
create or replace function private.normalize_profile_inputs()
returns trigger language plpgsql set search_path='' as $$
begin
  if not private.valid_input_text(new.first_name,30,true) or not private.valid_input_text(new.bio,16384,false)
    or not ((new.gender is null and new.interested_in is null) or
      (new.gender is not null and private.valid_interests(new.interested_in))) then
    raise exception 'invalid profile input' using errcode='23514';
  end if;
  if length(private.trim_input(new.bio))>300 then
    raise exception 'bio_too_long' using errcode='23514',constraint='profiles_bio_check';
  end if;
  new.first_name:=private.trim_input(new.first_name); new.bio:=nullif(private.trim_input(new.bio),'');
  return new;
end $$;
create or replace function private.guard_profile_preferences() returns trigger
language plpgsql security definer set search_path='' as $$
declare deadline timestamptz; effective_now timestamptz:=clock_timestamp(); restricted boolean;
begin
  if private.has_matching_consent(new.id) then
    if new.gender is null or new.gender not in ('woman','man','nonbinary') or not private.valid_interests(new.interested_in) then
      raise exception 'invalid profile preferences' using errcode='23514';
    end if;
  elsif new.gender is not null or new.interested_in is not null then
    raise exception 'matching consent required' using errcode='42501';
  end if;
  if tg_op='INSERT' then return new; end if;
  if row(new.gender,new.interested_in) is not distinct from row(old.gender,old.interested_in)
    or (new.gender is not distinct from old.gender and new.interested_in @> old.interested_in and old.interested_in @> new.interested_in) then return new; end if;
  select s.available_at into deadline from private.profile_edit_state s where s.profile_id=old.id;
  -- Erasure is always allowed. Keep only the deadline, never a previous answer.
  restricted:=new.gender is not null and (new.gender is distinct from old.gender or not (new.interested_in <@ old.interested_in));
  if old.gender is null and not exists(select 1 from private.matching_consent_events e where e.profile_id=old.id and e.action='withdrawn') then
    restricted:=false; -- Initial preference entry keeps the existing no-cooldown rule.
  end if;
  if restricted and effective_now<deadline then raise exception 'profile preference cooldown active' using errcode='P0001'; end if;
  insert into private.profile_edit_state(profile_id,version,available_at)
    values(old.id,gen_random_uuid(),case when restricted then effective_now+interval '12 hours' else deadline end)
    on conflict(profile_id) do update set version=excluded.version,available_at=excluded.available_at;
  return new;
end $$;
drop trigger a02_guard_profile_preferences on public.profiles;
create trigger a02_guard_profile_preferences before insert or update of gender,interested_in on public.profiles
  for each row execute function private.guard_profile_preferences();

-- Preserve the current photo pipeline and its validation, locks and ACLs. Abort
-- if the known insertion/validation boundaries have drifted on the shared DB.
do $$
declare definition text; body text; keys text:='''first_name'',''bio'',''gender'',''interested_in'',''adult_confirmed''';
  insertion text:=E'if p_profile is not null then\n    insert into public.profiles';
begin
  select prosrc,pg_get_functiondef(oid) into body,definition from pg_proc where oid='public.submit_profile_photo(uuid,text,integer,jsonb)'::regprocedure;
  if position(keys in body)=0 or position(insertion in body)=0 then raise exception 'unexpected photo submission definition'; end if;
  execute replace(definition,body,replace(replace(body,keys,keys||',''matching_consent'',''matching_consent_version'',''matching_consent_locale'''),insertion,
    E'if p_profile is not null then\n    perform private.validate_matching_consent((p_profile->''matching_consent'')=''true''::jsonb,p_profile->>''matching_consent_version'',p_profile->>''matching_consent_locale'');\n    perform private.record_matching_consent(p_owner,gen_random_uuid(),p_profile->>''matching_consent_version'',p_profile->>''matching_consent_locale'');\n    insert into public.profiles'));
end $$;

-- Extend the shared candidate/like predicate; both participants must consent.
do $$
declare definition text; body text; marker text:='select p_actor <> p_target and exists (';
begin
  select prosrc,pg_get_functiondef(oid) into body,definition from pg_proc where oid='private.like_pair_eligible(uuid,uuid,uuid)'::regprocedure;
  if position(marker in body)=0 then raise exception 'unexpected like predicate'; end if;
  execute replace(definition,body,replace(body,marker,
    'select private.has_matching_consent(p_actor) and private.has_matching_consent(p_target) and p_actor <> p_target and exists ('));
end $$;

do $$
declare definition text; body text; marker text:='perform private.lock_like_eligibility();';
begin
  select prosrc,pg_get_functiondef(oid) into body,definition from pg_proc where oid='public.update_my_profile_preferences(text,text[],uuid)'::regprocedure;
  if position(marker in body)=0 then raise exception 'unexpected preference update definition'; end if;
  execute replace(definition,body,replace(body,marker,marker||E'\n  if not private.has_matching_consent(actor) then raise exception ''matching consent required'' using errcode=''42501''; end if;'));
end $$;

create function public.get_my_matching_consent()
returns table(active boolean,revision uuid,granted_at timestamptz,withdrawn_at timestamptz,available_at timestamptz,server_now timestamptz)
language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode='42501'; end if;
  return query select s.profile_id is not null and s.withdrawn_at is null,s.revision,s.granted_at,s.withdrawn_at,e.available_at,clock_timestamp()
    from (select auth.uid() id) owner left join private.matching_consent_state s on s.profile_id=owner.id
    left join private.profile_edit_state e on e.profile_id=owner.id;
end $$;

create function public.grant_my_matching_consent(p_consent jsonb,p_version text,p_locale text,
  p_gender text,p_interested_in text[],p_expected_revision uuid,p_request_id uuid)
returns table(status text,active boolean,revision uuid,granted_at timestamptz,withdrawn_at timestamptz,available_at timestamptz,server_now timestamptz)
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); previous private.matching_consent_state; deadline timestamptz; outcome text;
begin
  if actor is null then raise exception 'authentication required' using errcode='42501'; end if;
  -- JSONB preserves the HTTP runtime type: the string "true" is not agreement.
  perform private.validate_matching_consent(p_consent='true'::jsonb,p_version,p_locale);
  if p_request_id is null or p_gender is null or p_gender not in ('woman','man','nonbinary') or not private.valid_interests(p_interested_in) then
    raise exception 'invalid consent preferences' using errcode='22023';
  end if;
  perform private.lock_like_eligibility();
  perform 1 from public.profiles where id=actor for update;
  if not found then raise exception 'profile required' using errcode='42501'; end if;
  select * into previous from private.matching_consent_state s where s.profile_id=actor;
  select e.available_at into deadline from private.profile_edit_state e where e.profile_id=actor;
  if previous.revision=p_request_id and previous.withdrawn_at is null
    and previous.version=p_version and previous.locale=p_locale and exists(
      select 1 from public.profiles p where p.id=actor and p.gender=p_gender
        and p.interested_in @> p_interested_in and p_interested_in @> p.interested_in) then outcome:='unchanged';
  elsif p_expected_revision is distinct from previous.revision or
    (previous.profile_id is not null and previous.withdrawn_at is null) or
    exists(select 1 from private.matching_consent_events e where e.revision=p_request_id) then outcome:='stale';
  elsif clock_timestamp()<deadline then outcome:='cooldown';
  else
    perform private.record_matching_consent(actor,p_request_id,p_version,p_locale);
    update public.profiles set gender=p_gender,interested_in=p_interested_in where id=actor;
    perform private.notify_photo_change(actor);
    outcome:='saved';
  end if;
  return query select outcome,s.* from public.get_my_matching_consent() s;
end $$;

create function public.withdraw_my_matching_consent(p_expected_revision uuid)
returns table(status text,active boolean,revision uuid,granted_at timestamptz,withdrawn_at timestamptz,available_at timestamptz,server_now timestamptz)
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); previous private.matching_consent_state; next_revision uuid:=gen_random_uuid();
  withdrawn timestamptz; outcome text;
begin
  if actor is null then raise exception 'authentication required' using errcode='42501'; end if;
  if p_expected_revision is null then raise exception 'consent revision required' using errcode='22023'; end if;
  perform private.lock_like_eligibility();
  perform 1 from public.profiles where id=actor for update;
  if not found then raise exception 'profile required' using errcode='42501'; end if;
  select * into previous from private.matching_consent_state s where s.profile_id=actor;
  if previous.profile_id is null or previous.withdrawn_at is not null then outcome:='unchanged';
  elsif previous.revision is distinct from p_expected_revision then outcome:='stale';
  else
    withdrawn:=clock_timestamp();
    -- #282 sends only a generic private invalidation. Capture eligible viewers
    -- before revocation, since the profile update follows the consent-state write.
    if to_regprocedure('private.invalidate_profile_audience(uuid,boolean)') is not null then
      execute 'select private.invalidate_profile_audience($1,false)' using actor;
    end if;
    update private.matching_consent_state set revision=next_revision,withdrawn_at=withdrawn where profile_id=actor;
    insert into private.matching_consent_events values(next_revision,actor,'withdrawn',previous.version,previous.locale,withdrawn);
    update public.profiles set gender=null,interested_in=null where id=actor;
    delete from public.likes where liker_id=actor or liked_id=actor;
    delete from private.like_pair_authorizations where actor in (profile_a,profile_b);
    delete from private.like_request_receipts where actor_id=actor or target_id=actor;
    -- #257 may already be applied independently. Remove its identifiable gender
    -- copy too. Previously finalized aggregate reports follow #203's own policy.
    if to_regclass('private.night_people') is not null then
      execute 'update private.night_people set gender=null where person_id=$1' using actor;
    end if;
    perform private.notify_photo_change(actor);
    outcome:='saved';
  end if;
  return query select outcome,s.* from public.get_my_matching_consent() s;
end $$;
revoke all on function public.get_my_matching_consent(),
  public.grant_my_matching_consent(jsonb,text,text,text,text[],uuid,uuid),public.withdraw_my_matching_consent(uuid)
  from public,anon,authenticated,service_role;
grant execute on function public.get_my_matching_consent(),
  public.grant_my_matching_consent(jsonb,text,text,text,text[],uuid,uuid),public.withdraw_my_matching_consent(uuid) to authenticated;

create function private.guard_matching_gender_copy() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.gender is not null then
    -- Presence writes already hold this lock before #257's collection runs.
    perform private.lock_like_eligibility();
    if not private.has_matching_consent(new.person_id) then new.gender:=null; end if;
  end if;
  return new;
end $$;
revoke all on function private.guard_matching_gender_copy() from public,anon,authenticated,service_role;
do $$ begin
  if to_regclass('private.night_people') is not null then
    execute 'create trigger matching_gender_copy_guard before insert or update of gender on private.night_people for each row execute function private.guard_matching_gender_copy()';
  end if;
end $$;

-- Never manufacture consent for legacy/test accounts. This intentionally erases
-- unconsented answers on the approved cutover; fixtures must re-consent explicitly.
update public.profiles set gender=null,interested_in=null;
delete from public.likes;
delete from private.like_pair_authorizations;
delete from private.like_request_receipts;
do $$ begin
  if to_regclass('private.night_people') is not null then execute 'update private.night_people set gender=null'; end if;
end $$;
commit;
