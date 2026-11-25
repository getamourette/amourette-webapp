-- #481: a guest who hid her profile stays hidden when she checks in again during
-- the same night: "Join tonight" after leaving, the automatic return after a
-- pause and reopen, a reload or a new QR scan once her presence has ended.
-- Visibility lived only on the presence row, and every new row defaulted to
-- visible, so she reappeared in every compatible feed without any action.
--
-- check_in now copies is_visible from the caller's latest presence row for that
-- night. It is decided in the same transaction as the insert, so no visible
-- window exists, and only the caller's own history is read: nobody else can make
-- her visible. A new night still starts visible, as before.
--
-- Behaviour change: same signature and grants, body identical to
-- 20260728011255_revert_balance_ready_launch.sql apart from the insert.

create or replace function public.check_in(p_venue_id uuid)
  returns public.presence
  language plpgsql security definer set search_path=public,private
as $$
declare me uuid:=auth.uid(); night public.venue_nights; result public.presence; eligible integer;
  visible boolean;
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
    select p.is_visible into visible from public.presence p
    where p.profile_id=me and p.venue_night_id=night.id
    order by p.checked_in_at desc, p.left_at desc nulls first limit 1;
    insert into public.presence(profile_id,venue_id,venue_night_id,is_visible)
      values(me,p_venue_id,night.id,coalesce(visible,true)) returning * into result;
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
