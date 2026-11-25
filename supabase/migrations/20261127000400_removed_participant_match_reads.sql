-- SEC-005 (#368): a participant removed for the night loses every read path to
-- the people they matched with that night.
--
-- Removal already closes presence and refuses sending, check-in and the room, but
-- the match row, its messages, the partner card, the partner's profile and the
-- partner's live presence stayed readable until the night closed.
--
-- The reads are filtered, not deleted: a founder can give access back for the
-- night (restore_to_venue, moderate_case 'restore'), and deleting the match would
-- also erase the partner's conversation. The partner keeps the paused chat they
-- already get when the other person leaves the bar.
--
-- private.is_ejected_from_venue_night(night) tests the caller (auth.uid()) and
-- already ignores an expired temporary suspension. Every body below is the
-- current one with that single predicate added; signatures and grants unchanged.

drop policy matches_select_member on public.matches;
create policy matches_select_member on public.matches for select to authenticated using (
  (select auth.uid()) in (profile_a, profile_b)
  and private.is_live_venue_night(venue_night_id)
  and not private.is_ejected_from_venue_night(venue_night_id)
  and not exists (
    select 1 from public.blocks b where
      (b.blocker_id = profile_a and b.blocked_id = profile_b)
      or (b.blocker_id = profile_b and b.blocked_id = profile_a)
  )
);

-- Also filters the Postgres Changes feed of messages, which applies this policy.
drop policy messages_select_member on public.messages;
create policy messages_select_member on public.messages for select to authenticated using (
  exists (
    select 1 from public.matches m
    where m.id = messages.match_id
      and (select auth.uid()) in (m.profile_a, m.profile_b)
      and private.is_live_venue_night(m.venue_night_id)
      and not private.is_ejected_from_venue_night(m.venue_night_id)
      and not exists (
        select 1 from public.blocks b where
          (b.blocker_id = m.profile_a and b.blocked_id = m.profile_b)
          or (b.blocker_id = m.profile_b and b.blocked_id = m.profile_a)
      )
  )
);

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
  -- Same refusal as an unknown match: the removed person learns nothing more.
  if not found or me not in (matched.profile_a, matched.profile_b)
    or private.is_ejected_from_venue_night(matched.venue_night_id) then
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

create or replace function public.chat_partner_state(p_match_id uuid)
returns table(id uuid,first_name text,bio text,photo_url text,correction_id uuid,seen_correction_id uuid,expires_at timestamptz)
language plpgsql stable security definer set search_path='' as $$
begin
  if auth.uid() is null or p_match_id is null then raise exception 'invalid chat request' using errcode='42501'; end if;
  return query select p.id,p.first_name,p.bio,
    case when private.photo_allowed(p.id) then p.photo_url else null end,
    case when p.first_name is not null then notice.correction_id end,case when p.first_name is not null then notice.seen_correction_id end,least(m.expires_at,n.closes_at)
    from public.matches m join public.venue_nights n on n.id=m.venue_night_id
    join public.profiles p on p.id=case when m.profile_a=auth.uid() then m.profile_b else m.profile_a end
    left join private.match_name_notices notice on notice.match_id=m.id and notice.recipient_id=auth.uid()
    where m.id=p_match_id and auth.uid() in (m.profile_a,m.profile_b)
      and n.status='live' and n.terminal_at is null and n.closes_at>clock_timestamp() and m.expires_at>clock_timestamp()
      and not private.is_ejected_from_venue_night(m.venue_night_id)
      and not exists(select 1 from public.blocks b where
        (b.blocker_id=m.profile_a and b.blocked_id=m.profile_b) or (b.blocker_id=m.profile_b and b.blocked_id=m.profile_a));
end $$;

-- Profiles and public photos (private.can_view_public_photo) read this set.
create or replace function private.visible_profile_ids()
returns setof uuid
language sql stable security definer set search_path = '' as $$
  select auth.uid()
  union
  select p.profile_id from public.presence p
  where p.id in (select private.discoverable_presence_ids())
  union
  -- Established chat access deliberately does not depend on current discovery
  -- preferences, visibility, departure or the viewer's photo correction state.
  -- Keep the existing night, removal and block boundary; rejected photos remain hidden.
  select case when m.profile_a = auth.uid() then m.profile_b else m.profile_a end
  from public.matches m join public.venue_nights night on night.id = m.venue_night_id
  where auth.uid() in (m.profile_a, m.profile_b)
    and night.status = 'live' and night.terminal_at is null and now() < night.closes_at
    and not private.is_ejected_from_venue_night(m.venue_night_id)
    and not exists (
      select 1 from public.blocks b
      where (b.blocker_id = m.profile_a and b.blocked_id = m.profile_b)
         or (b.blocker_id = m.profile_b and b.blocked_id = m.profile_a)
    )
$$;
