-- Participant policies cannot query venue_nights/venue_ejections directly:
-- those tables are intentionally admin-only, so their own RLS would make every
-- nested EXISTS false. Keep lifecycle facts behind narrow private definer helpers.

create or replace function private.is_live_venue_night(p_venue_night_id uuid)
  returns boolean
  language sql
  security definer
  stable
  set search_path = public
as $$
  select exists (
    select 1 from public.venue_nights vn
    where vn.id = p_venue_night_id
      and vn.status = 'live'
      and vn.terminal_at is null
      and now() < vn.closes_at
  )
$$;

create or replace function private.is_open_venue_night(p_venue_night_id uuid)
  returns boolean
  language sql
  security definer
  stable
  set search_path = public
as $$
  select exists (
    select 1 from public.venue_nights vn
    where vn.id = p_venue_night_id
      and vn.status in ('waiting', 'live')
      and vn.terminal_at is null
      and now() < vn.closes_at
  )
$$;

create or replace function private.is_ejected_from_venue_night(p_venue_night_id uuid)
  returns boolean
  language sql
  security definer
  stable
  set search_path = public
as $$
  select exists (
    select 1 from public.venue_ejections ve
    where ve.venue_night_id = p_venue_night_id
      and ve.profile_id = auth.uid()
  )
$$;

revoke execute on function private.is_live_venue_night(uuid),
  private.is_open_venue_night(uuid),
  private.is_ejected_from_venue_night(uuid) from public, anon;
grant execute on function private.is_live_venue_night(uuid),
  private.is_open_venue_night(uuid),
  private.is_ejected_from_venue_night(uuid) to authenticated;

drop policy if exists presence_select_copresent on public.presence;
create policy presence_select_copresent on public.presence for select to authenticated using (
  profile_id = auth.uid() or (
    venue_night_id in (select private.my_active_venue_night_ids())
    and left_at is null
    and is_visible
    and private.is_live_venue_night(venue_night_id)
    and not exists (
      select 1 from public.blocks b where
        (b.blocker_id = auth.uid() and b.blocked_id = profile_id)
        or (b.blocked_id = auth.uid() and b.blocker_id = profile_id)
    )
  )
);

drop policy if exists presence_update_own on public.presence;
create policy presence_update_own on public.presence for update to authenticated
using (profile_id = auth.uid())
with check (
  profile_id = auth.uid() and (
    left_at is not null or (
      private.is_open_venue_night(venue_night_id)
      and not private.is_ejected_from_venue_night(venue_night_id)
    )
  )
);

drop policy if exists likes_select_own on public.likes;
create policy likes_select_own on public.likes for select to authenticated using (
  liker_id = auth.uid() and private.is_live_venue_night(venue_night_id)
);
drop policy if exists likes_insert_own on public.likes;
create policy likes_insert_own on public.likes for insert to authenticated with check (
  liker_id = auth.uid()
  and private.is_live_venue_night(venue_night_id)
  and not exists (
    select 1 from public.blocks b where
      (b.blocker_id = liker_id and b.blocked_id = liked_id)
      or (b.blocker_id = liked_id and b.blocked_id = liker_id)
  )
);
drop policy if exists likes_delete_own on public.likes;
create policy likes_delete_own on public.likes for delete to authenticated using (
  liker_id = auth.uid() and private.is_live_venue_night(venue_night_id)
);

drop policy if exists matches_select_member on public.matches;
create policy matches_select_member on public.matches for select to authenticated using (
  auth.uid() in (profile_a, profile_b)
  and private.is_live_venue_night(venue_night_id)
  and not exists (
    select 1 from public.blocks b where
      (b.blocker_id = profile_a and b.blocked_id = profile_b)
      or (b.blocker_id = profile_b and b.blocked_id = profile_a)
  )
);

drop policy if exists messages_select_member on public.messages;
create policy messages_select_member on public.messages for select to authenticated using (
  exists (
    select 1 from public.matches m
    where m.id = messages.match_id
      and auth.uid() in (m.profile_a, m.profile_b)
      and private.is_live_venue_night(m.venue_night_id)
      and not exists (
        select 1 from public.blocks b where
          (b.blocker_id = m.profile_a and b.blocked_id = m.profile_b)
          or (b.blocker_id = m.profile_b and b.blocked_id = m.profile_a)
      )
  )
);

drop policy if exists messages_insert_member on public.messages;
create policy messages_insert_member on public.messages for insert to authenticated with check (
  sender_id = auth.uid()
  and exists (
    select 1 from public.matches m
    where m.id = messages.match_id
      and auth.uid() in (m.profile_a, m.profile_b)
      and private.is_live_venue_night(m.venue_night_id)
      and not exists (
        select 1 from public.blocks b where
          (b.blocker_id = m.profile_a and b.blocked_id = m.profile_b)
          or (b.blocker_id = m.profile_b and b.blocked_id = m.profile_a)
      )
  )
);
