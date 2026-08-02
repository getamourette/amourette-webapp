-- Fix composite assignment in the balance-gated manual launch function.

create or replace function public.launch_venue_night(p_venue_night_id uuid)
  returns public.venue_nights language plpgsql security definer set search_path=public,private
as $$
declare
  night public.venue_nights;
  minimum_women integer;
  participants integer;
  women integer;
  men integer;
begin
  if not private.is_admin() then raise exception 'not authorized'; end if;
  select vn.* into night
  from public.venue_nights vn
  where vn.id=p_venue_night_id
  for update of vn;
  if not found then raise exception 'venue night not found'; end if;
  select v.minimum_women_percentage into minimum_women
  from public.venues v where v.id=night.venue_id;

  if now()<night.guaranteed_launch_at then
    select
      count(distinct p.profile_id)::integer,
      count(distinct p.profile_id) filter(where pr.gender='woman')::integer,
      count(distinct p.profile_id) filter(where pr.gender='man')::integer
    into participants,women,men
    from public.presence p
    join public.profiles pr on pr.id=p.profile_id
    join public.profile_private pp on pp.id=p.profile_id and pp.adult_confirmed_at is not null
    where p.venue_night_id=night.id and p.left_at is null;

    if participants<night.launch_threshold then
      raise exception 'attendance requirement not reached';
    end if;
    if women+men=0 or women*100<minimum_women*(women+men) then
      raise exception 'room balance requirement not reached';
    end if;
  end if;

  return private.transition_venue_night(night.id,'launched','manual',auth.uid());
end;
$$;

revoke execute on function public.launch_venue_night(uuid) from anon,public;
grant execute on function public.launch_venue_night(uuid) to authenticated;
