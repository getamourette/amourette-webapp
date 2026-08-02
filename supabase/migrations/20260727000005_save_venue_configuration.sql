-- One atomic founder workflow for creating/editing a venue and its scheduled night.

create or replace function public.save_venue_configuration(
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

revoke execute on function public.save_venue_configuration(uuid,uuid,text,text,text,text,timestamptz,timestamptz,timestamptz,integer) from anon,public;
grant execute on function public.save_venue_configuration(uuid,uuid,text,text,text,text,timestamptz,timestamptz,timestamptz,integer) to authenticated;
