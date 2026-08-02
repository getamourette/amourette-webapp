-- Revert the balance-gated manual launch experiment. Restore threshold-based
-- automatic launch on check-in and the prior venue configuration contract.

drop function public.save_venue_configuration(
  uuid,uuid,text,text,text,text,timestamptz,timestamptz,timestamptz,integer,integer
);

create function public.save_venue_configuration(
  p_venue_id uuid,
  p_night_id uuid,
  p_name text,
  p_slug text,
  p_city text,
  p_timezone text,
  p_waiting_opens_at timestamptz,
  p_guaranteed_launch_at timestamptz,
  p_closes_at timestamptz,
  p_launch_threshold integer
) returns jsonb language plpgsql security definer set search_path=public,private
as $$
declare venue_id uuid:=p_venue_id; night public.venue_nights;
begin
  if not private.is_admin() then raise exception 'not authorized'; end if;
  if nullif(trim(p_name),'') is null then raise exception 'venue name is required'; end if;
  if p_launch_threshold<1 then raise exception 'launch threshold must be positive'; end if;
  if not (p_waiting_opens_at<p_guaranteed_launch_at and p_guaranteed_launch_at<p_closes_at) then
    raise exception 'times must be ordered: entry, guaranteed launch, close';
  end if;

  if venue_id is null then
    if nullif(trim(p_slug),'') is null or p_slug !~ '^[a-z0-9-]+$' then raise exception 'valid slug is required'; end if;
    insert into public.venues(name,slug,city,timezone)
      values(trim(p_name),trim(p_slug),nullif(trim(coalesce(p_city,'')),''),p_timezone)
      returning id into venue_id;
  else
    update public.venues set name=trim(p_name),city=nullif(trim(coalesce(p_city,'')),'')
      where id=venue_id and not is_test_venue;
    if not found then raise exception 'venue not found or test fixture'; end if;
  end if;

  if p_night_id is null then
    select * into night from public.schedule_venue_night(
      venue_id,p_waiting_opens_at,p_guaranteed_launch_at,p_closes_at,p_launch_threshold
    );
  else
    select * into night from public.update_venue_night_schedule(
      p_night_id,p_waiting_opens_at,p_guaranteed_launch_at,p_closes_at,p_launch_threshold
    );
  end if;
  return jsonb_build_object('venue_id',venue_id,'venue_night_id',night.id);
end;
$$;

revoke execute on function public.save_venue_configuration(
  uuid,uuid,text,text,text,text,timestamptz,timestamptz,timestamptz,integer
) from anon,public;
grant execute on function public.save_venue_configuration(
  uuid,uuid,text,text,text,text,timestamptz,timestamptz,timestamptz,integer
) to authenticated;

create or replace function public.check_in(p_venue_id uuid)
  returns public.presence
  language plpgsql security definer set search_path=public,private
as $$
declare me uuid:=auth.uid(); night public.venue_nights; result public.presence; eligible integer;
begin
  if me is null then raise exception 'not authenticated'; end if;
  select * into night from public.venue_nights where venue_id=p_venue_id and terminal_at is null
    and status in ('waiting','live') and now()<closes_at for update;
  if not found then raise exception 'venue not open'; end if;
  if not exists (select 1 from public.profiles p join public.profile_private pp on pp.id=p.id
                 where p.id=me and pp.adult_confirmed_at is not null) then
    raise exception 'complete adult-confirmed profile required';
  end if;
  if exists(select 1 from public.venue_ejections where profile_id=me and venue_night_id=night.id
    and (expires_at is null or expires_at>now())) then raise exception 'ejected from venue'; end if;
  update public.presence set left_at=now() where profile_id=me and left_at is null
    and venue_night_id<>night.id;
  update public.presence set last_seen_at=now() where profile_id=me and left_at is null
    and venue_night_id=night.id returning * into result;
  if not found then
    insert into public.presence(profile_id,venue_id,venue_night_id)
      values(me,p_venue_id,night.id) returning * into result;
  end if;
  if night.status='waiting' then
    select count(*)::integer into eligible from public.presence p
    join public.profiles pr on pr.id=p.profile_id
    join public.profile_private pp on pp.id=p.profile_id
    where p.venue_night_id=night.id and p.left_at is null and pp.adult_confirmed_at is not null;
    if eligible >= night.launch_threshold then
      perform private.transition_venue_night(night.id,'launched','threshold',null);
    end if;
  end if;
  return result;
end;
$$;

revoke execute on function public.check_in(uuid) from anon,public;
grant execute on function public.check_in(uuid) to authenticated;

create or replace function public.launch_venue_night(p_venue_night_id uuid)
  returns public.venue_nights language plpgsql security definer set search_path=public,private
as $$
begin
  if not private.is_admin() then raise exception 'not authorized'; end if;
  return private.transition_venue_night(p_venue_night_id,'launched','manual',auth.uid());
end;
$$;

revoke execute on function public.launch_venue_night(uuid) from anon,public;
grant execute on function public.launch_venue_night(uuid) to authenticated;

alter table public.venues drop column minimum_women_percentage;
