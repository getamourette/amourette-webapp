-- Founder-only aggregate gender mix for active venue-night participants.
-- Individual profile ids and genders never leave the database through this API.

create function public.admin_venue_night_gender_counts()
returns table (
  venue_night_id uuid,
  women_count integer,
  men_count integer,
  nonbinary_count integer
)
language plpgsql
security definer
stable
set search_path = public, private
as $$
begin
  if not private.is_admin() then
    raise exception 'not authorized';
  end if;

  return query
  select
    vn.id,
    count(distinct p.profile_id) filter (
      where pp.id is not null and pr.gender = 'woman'
    )::integer,
    count(distinct p.profile_id) filter (
      where pp.id is not null and pr.gender = 'man'
    )::integer,
    count(distinct p.profile_id) filter (
      where pp.id is not null and pr.gender = 'nonbinary'
    )::integer
  from public.venue_nights vn
  left join public.presence p
    on p.venue_night_id = vn.id
   and p.left_at is null
  left join public.profiles pr on pr.id = p.profile_id
  left join public.profile_private pp
    on pp.id = p.profile_id
   and pp.adult_confirmed_at is not null
  group by vn.id;
end;
$$;

comment on function public.admin_venue_night_gender_counts() is
  'Founder-only active participant gender aggregates by venue night; returns no user-level data.';

revoke execute on function public.admin_venue_night_gender_counts()
  from public, anon;
grant execute on function public.admin_venue_night_gender_counts()
  to authenticated;
