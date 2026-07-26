-- Qualify venue_nights columns so they cannot collide with the PL/pgSQL
-- output parameters exposed by the table-returning function.
create or replace function public.venue_night_state(p_venue_id uuid)
  returns table (
    venue_night_id uuid, status text, participant_count integer,
    launch_threshold integer, guaranteed_launch_at timestamptz, closes_at timestamptz
  )
  language plpgsql security definer stable set search_path = public, private
as $$
declare me uuid := auth.uid(); active_night public.venue_nights;
begin
  if me is null then raise exception 'not authenticated'; end if;
  select vn.* into active_night from public.venue_nights vn
  where vn.venue_id = p_venue_id and vn.terminal_at is null
    and now() < vn.closes_at
    and (vn.status in ('waiting', 'live') or vn.waiting_opens_at <= now())
  order by vn.waiting_opens_at desc limit 1;
  if not found then return; end if;
  return query select active_night.id, active_night.status,
    (select count(*)::integer from public.presence p
      join public.profiles pr on pr.id = p.profile_id
      join public.profile_private pp on pp.id = p.profile_id
      where p.venue_night_id = active_night.id and p.left_at is null
        and pp.adult_confirmed_at is not null),
    active_night.launch_threshold, active_night.guaranteed_launch_at, active_night.closes_at;
end;
$$;
revoke execute on function public.venue_night_state(uuid) from anon, public;
grant execute on function public.venue_night_state(uuid) to authenticated;
