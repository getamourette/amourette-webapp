-- Founder-only live activity signal for Stats venue ranking. Eligible active
-- attendance is the base; a recent arrival is weighted twice for momentum.

create or replace function public.admin_venue_activity()
returns table (
  venue_night_id uuid,
  active_participants integer,
  arrivals_15m integer,
  trend_score integer
)
language plpgsql security definer stable set search_path=public,private
as $$
begin
  if not private.is_admin() then raise exception 'not authorized'; end if;
  return query
  select vn.id,
    count(distinct p.profile_id) filter(where p.left_at is null and pp.id is not null)::integer,
    count(distinct p.profile_id) filter(where p.left_at is null and pp.id is not null and p.checked_in_at>=now()-interval '15 minutes')::integer,
    (
      count(distinct p.profile_id) filter(where p.left_at is null and pp.id is not null)
      + 2*count(distinct p.profile_id) filter(where p.left_at is null and pp.id is not null and p.checked_in_at>=now()-interval '15 minutes')
    )::integer
  from public.venue_nights vn
  left join public.presence p on p.venue_night_id=vn.id
  left join public.profile_private pp on pp.id=p.profile_id and pp.adult_confirmed_at is not null
  where vn.terminal_at is null
  group by vn.id;
end;
$$;

revoke execute on function public.admin_venue_activity() from anon,public;
grant execute on function public.admin_venue_activity() to authenticated;
