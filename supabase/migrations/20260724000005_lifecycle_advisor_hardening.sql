-- Follow up on the post-cutover advisors: keep btree_gist out of the exposed
-- schema, avoid per-row auth.uid() initialization, and cover the new lifecycle
-- foreign keys used by cleanup/analytics queries.

alter extension btree_gist set schema extensions;

create index analytics_events_by_venue_night on public.analytics_events (venue_night_id) where venue_night_id is not null;
create index venue_scan_events_by_venue_night on public.venue_scan_events (venue_night_id) where venue_night_id is not null;
create index venue_match_events_by_venue_night on public.venue_match_events (venue_night_id) where venue_night_id is not null;
create index venue_chat_start_events_by_venue_night on public.venue_chat_start_events (venue_night_id) where venue_night_id is not null;
create index venue_conversation_events_by_venue_night on public.venue_conversation_events (venue_night_id) where venue_night_id is not null;
create index venue_ejections_by_venue_night on public.venue_ejections (venue_night_id);
create index venue_night_transitions_by_night on public.venue_night_transitions (venue_night_id, created_at);

drop policy if exists presence_select_copresent on public.presence;
create policy presence_select_copresent on public.presence for select to authenticated using (
  profile_id = (select auth.uid()) or (
    venue_night_id in (select private.my_active_venue_night_ids())
    and left_at is null
    and is_visible
    and private.is_live_venue_night(venue_night_id)
    and not exists (
      select 1 from public.blocks b where
        (b.blocker_id = (select auth.uid()) and b.blocked_id = profile_id)
        or (b.blocked_id = (select auth.uid()) and b.blocker_id = profile_id)
    )
  )
);

drop policy if exists presence_update_own on public.presence;
create policy presence_update_own on public.presence for update to authenticated
using (profile_id = (select auth.uid()))
with check (
  profile_id = (select auth.uid()) and (
    left_at is not null or (
      private.is_open_venue_night(venue_night_id)
      and not private.is_ejected_from_venue_night(venue_night_id)
    )
  )
);

drop policy if exists likes_select_own on public.likes;
create policy likes_select_own on public.likes for select to authenticated using (
  liker_id = (select auth.uid()) and private.is_live_venue_night(venue_night_id)
);
drop policy if exists likes_insert_own on public.likes;
create policy likes_insert_own on public.likes for insert to authenticated with check (
  liker_id = (select auth.uid())
  and private.is_live_venue_night(venue_night_id)
  and not exists (
    select 1 from public.blocks b where
      (b.blocker_id = liker_id and b.blocked_id = liked_id)
      or (b.blocker_id = liked_id and b.blocked_id = liker_id)
  )
);
drop policy if exists likes_delete_own on public.likes;
create policy likes_delete_own on public.likes for delete to authenticated using (
  liker_id = (select auth.uid()) and private.is_live_venue_night(venue_night_id)
);

drop policy if exists matches_select_member on public.matches;
create policy matches_select_member on public.matches for select to authenticated using (
  (select auth.uid()) in (profile_a, profile_b)
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
      and (select auth.uid()) in (m.profile_a, m.profile_b)
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
  sender_id = (select auth.uid())
  and exists (
    select 1 from public.matches m
    where m.id = messages.match_id
      and (select auth.uid()) in (m.profile_a, m.profile_b)
      and private.is_live_venue_night(m.venue_night_id)
      and not exists (
        select 1 from public.blocks b where
          (b.blocker_id = m.profile_a and b.blocked_id = m.profile_b)
          or (b.blocker_id = m.profile_b and b.blocked_id = m.profile_a)
      )
  )
);
