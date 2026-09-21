-- #231 integrated regression: invalidate only pairs whose FK parents still exist.
-- Child triggers can run after a parent DELETE and before the pair's own cascade.
begin;

create or replace function private.invalidate_like_pairs(p_profile uuid default null, p_night uuid default null)
returns void language plpgsql volatile security definer set search_path = '' as $$
begin
  -- Caller holds the exclusive eligibility lock. Matches are deliberately untouched.
  update private.like_pair_authorizations a set token=gen_random_uuid()
  from public.venue_nights n, public.profiles pa, public.profiles pb
  where n.id=a.venue_night_id and pa.id=a.profile_a and pb.id=a.profile_b
    and (p_profile is null or p_profile in (a.profile_a,a.profile_b))
    and (p_night is null or a.venue_night_id=p_night)
    and (a.valid_until<=clock_timestamp() or not private.like_pair_eligible(a.profile_a,a.profile_b,a.venue_night_id));
  delete from public.likes l
  where (p_profile is null or p_profile in (l.liker_id,l.liked_id))
    and (p_night is null or l.venue_night_id=p_night)
    and not private.like_pair_eligible(l.liker_id,l.liked_id,l.venue_night_id)
    and not exists(select 1 from public.matches m where m.venue_night_id=l.venue_night_id
      and m.profile_a=least(l.liker_id,l.liked_id) and m.profile_b=greatest(l.liker_id,l.liked_id));
  update private.like_pair_authorizations a set valid_until=n.closes_at
  from public.venue_nights n, public.profiles pa, public.profiles pb
  where n.id=a.venue_night_id and pa.id=a.profile_a and pb.id=a.profile_b
    and (p_profile is null or p_profile in (a.profile_a,a.profile_b))
    and (p_night is null or a.venue_night_id=p_night);
end $$;
revoke all on function private.invalidate_like_pairs(uuid,uuid) from public,anon,authenticated;

-- Direct service-role venue deletion must obey the same order as the admin RPC.
create trigger aaa_like_eligibility_lock before delete on public.venues
for each statement execute function private.before_like_eligibility_change();

commit;
