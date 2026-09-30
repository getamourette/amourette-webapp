-- #230. Behavioral cutover: coordinate with the separate-save editor.
-- No backfill: existing profiles and new signups start without a cooldown.
create table private.profile_edit_state (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  version uuid not null default gen_random_uuid(),
  available_at timestamptz
);
alter table private.profile_edit_state enable row level security;
revoke all on private.profile_edit_state from public, anon, authenticated, service_role;

create function private.guard_profile_preferences() returns trigger
language plpgsql security definer set search_path = '' as $$
declare deadline timestamptz; effective_now timestamptz; restricted boolean;
begin
  -- #231's BEFORE STATEMENT trigger already holds eligibility before tuple locks.
  -- Validate even unchanged commands, before private writes or AFTER cleanup.
  if new.gender is null or new.gender not in ('woman','man','nonbinary')
    or not private.valid_interests(new.interested_in) then
    raise exception 'invalid profile preferences' using errcode='23514';
  end if;
  if new.gender is not distinct from old.gender
    and new.interested_in @> old.interested_in and old.interested_in @> new.interested_in then
    return new;
  end if;
  select s.available_at into deadline from private.profile_edit_state s where s.profile_id=old.id;
  effective_now:=clock_timestamp();
  restricted:=new.gender is distinct from old.gender or not (new.interested_in <@ old.interested_in);
  if restricted and effective_now < deadline then
    raise exception 'profile preference cooldown active' using errcode='P0001';
  end if;
  insert into private.profile_edit_state(profile_id,version,available_at)
    values(old.id,gen_random_uuid(),case when restricted then effective_now+interval '12 hours' else deadline end)
    on conflict(profile_id) do update set version=excluded.version,available_at=excluded.available_at;
  return new;
end $$;
revoke all on function private.guard_profile_preferences() from public,anon,authenticated,service_role;
create trigger a02_guard_profile_preferences before update of gender,interested_in on public.profiles
  for each row execute function private.guard_profile_preferences();

create function public.get_my_profile_edit_state()
returns table(gender text,interested_in text[],version uuid,available_at timestamptz,server_now timestamptz)
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode='42501'; end if;
  -- One snapshot for profile values and their version. No writes during reads.
  return query select p.gender,p.interested_in,s.version,s.available_at,clock_timestamp()
    from public.profiles p left join private.profile_edit_state s on s.profile_id=p.id
    where p.id=auth.uid();
end $$;

create function public.update_my_profile_preferences(p_gender text,p_interested_in text[],p_expected_version uuid)
returns table(status text,gender text,interested_in text[],version uuid,available_at timestamptz,server_now timestamptz)
language plpgsql security definer set search_path = '' as $$
declare actor uuid:=auth.uid(); current_profile public.profiles%rowtype;
  current_state private.profile_edit_state%rowtype; outcome text; effective_now timestamptz;
begin
  if actor is null then raise exception 'authentication required' using errcode='42501'; end if;
  if p_gender is null or p_gender not in ('woman','man','nonbinary') or not private.valid_interests(p_interested_in) then
    raise exception 'invalid profile preferences' using errcode='22023';
  end if;
  perform private.lock_like_eligibility();
  select p.* into current_profile from public.profiles p where p.id=actor for update;
  if not found then raise exception 'profile required' using errcode='42501'; end if;
  select s.* into current_state from private.profile_edit_state s where s.profile_id=actor;
  effective_now:=clock_timestamp();
  if p_gender=current_profile.gender and p_interested_in @> current_profile.interested_in
    and current_profile.interested_in @> p_interested_in then outcome:='unchanged';
  elsif p_expected_version is distinct from current_state.version then outcome:='stale';
  elsif (p_gender<>current_profile.gender or not (p_interested_in <@ current_profile.interested_in))
    and effective_now < current_state.available_at then outcome:='cooldown';
  else
    -- The same trigger used by direct writes changes state; existing AFTER
    -- triggers invalidate incompatible likes atomically and preserve matches.
    update public.profiles p set gender=p_gender,interested_in=p_interested_in where p.id=actor;
    outcome:='saved';
  end if;
  return query select outcome,s.gender,s.interested_in,s.version,s.available_at,s.server_now
    from public.get_my_profile_edit_state() s;
end $$;
revoke all on function public.get_my_profile_edit_state(), public.update_my_profile_preferences(text,text[],uuid)
  from public,anon,authenticated,service_role;
grant execute on function public.get_my_profile_edit_state(), public.update_my_profile_preferences(text,text[],uuid)
  to authenticated;
