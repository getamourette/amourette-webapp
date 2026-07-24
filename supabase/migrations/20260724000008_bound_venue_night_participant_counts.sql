-- The Nights tab polls this every ten seconds. Historical nights are terminal
-- and cannot have active participants, so exclude them from both the scan and
-- the response instead of letting polling cost grow with retained history.
create or replace function public.admin_venue_night_participant_counts()
returns table (venue_night_id uuid, participant_count integer)
language plpgsql security definer stable set search_path = public, private
as $$
begin
  if not private.is_admin() then raise exception 'not authorized'; end if;
  return query select vn.id, (count(p.id) filter (where pp.id is not null))::integer
  from public.venue_nights vn
  left join public.presence p on p.venue_night_id = vn.id and p.left_at is null
  left join public.profiles pr on pr.id = p.profile_id
  left join public.profile_private pp on pp.id = p.profile_id and pp.adult_confirmed_at is not null
  where vn.terminal_at is null
  group by vn.id;
end;
$$;
revoke execute on function public.admin_venue_night_participant_counts() from public, anon;
grant execute on function public.admin_venue_night_participant_counts() to authenticated;
