-- Keep an existing conversation readable after departure, but only allow new
-- messages while both matched participants are physically checked in to the
-- match's exact venue-night. Visibility/discovery pause does not affect chat.

create or replace function private.match_participants_present(p_match_id uuid)
  returns boolean
  language sql
  security definer
  stable
  set search_path = public
as $$
  select exists (
    select 1
    from public.matches m
    where m.id = p_match_id
      and exists (
        select 1 from public.presence p
        where p.profile_id = m.profile_a
          and p.venue_night_id = m.venue_night_id
          and p.left_at is null
      )
      and exists (
        select 1 from public.presence p
        where p.profile_id = m.profile_b
          and p.venue_night_id = m.venue_night_id
          and p.left_at is null
      )
  )
$$;

revoke execute on function private.match_participants_present(uuid) from public, anon;
grant execute on function private.match_participants_present(uuid) to authenticated;

create or replace function public.match_presence_state(p_match_id uuid)
  returns table (me_is_present boolean, other_is_present boolean)
  language plpgsql
  security definer
  stable
  set search_path = public
as $$
declare
  matched public.matches;
  me uuid := auth.uid();
  other_profile_id uuid;
begin
  if me is null then raise exception 'not authenticated'; end if;

  select * into matched from public.matches where id = p_match_id;
  if not found or me not in (matched.profile_a, matched.profile_b) then
    raise exception 'match not available';
  end if;

  other_profile_id := case
    when matched.profile_a = me then matched.profile_b
    else matched.profile_a
  end;

  return query select
    exists (
      select 1 from public.presence p
      where p.profile_id = me
        and p.venue_night_id = matched.venue_night_id
        and p.left_at is null
    ),
    exists (
      select 1 from public.presence p
      where p.profile_id = other_profile_id
        and p.venue_night_id = matched.venue_night_id
        and p.left_at is null
    );
end;
$$;

revoke execute on function public.match_presence_state(uuid) from public, anon;
grant execute on function public.match_presence_state(uuid) to authenticated;

drop policy if exists messages_insert_member on public.messages;
create policy messages_insert_member on public.messages for insert to authenticated with check (
  sender_id = (select auth.uid())
  and exists (
    select 1 from public.matches m
    where m.id = messages.match_id
      and (select auth.uid()) in (m.profile_a, m.profile_b)
      and private.is_live_venue_night(m.venue_night_id)
      and private.match_participants_present(m.id)
      and not exists (
        select 1 from public.blocks b where
          (b.blocker_id = m.profile_a and b.blocked_id = m.profile_b)
          or (b.blocker_id = m.profile_b and b.blocked_id = m.profile_a)
      )
  )
);
