-- Bloc 0 — Foundations: Row Level Security.
-- Security is enforced here, never client-side (see AGENTS.md conventions).
-- Note: Supabase anonymous sign-in issues the `authenticated` role (with
-- is_anonymous=true), so every policy below targets `authenticated`. The `anon`
-- role (no session at all) gets nothing.

alter table public.profiles        enable row level security;
alter table public.profile_private enable row level security;
alter table public.venues          enable row level security;
alter table public.presence        enable row level security;
alter table public.likes           enable row level security;
alter table public.matches         enable row level security;
alter table public.messages        enable row level security;

-- ---------------------------------------------------------------------------
-- profiles — public columns only (no PII in this table). Any signed-in user can
-- read them. NOTE: in Bloc 1 we will tighten SELECT to co-present users only
-- (live invariant). It is intentionally open now so Bloc 2 (like/match) can be
-- built and tested before presence (Bloc 1) exists — see build order in roadmap.
-- ---------------------------------------------------------------------------
create policy profiles_select_authenticated on public.profiles
  for select to authenticated using (true);

create policy profiles_insert_own on public.profiles
  for insert to authenticated with check (id = (select auth.uid()));

create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- profile_private — PII, owner-only for every operation. This is the hard
-- guarantee that email/phone never reach another user.
-- ---------------------------------------------------------------------------
create policy profile_private_select_own on public.profile_private
  for select to authenticated using (id = (select auth.uid()));

create policy profile_private_insert_own on public.profile_private
  for insert to authenticated with check (id = (select auth.uid()));

create policy profile_private_update_own on public.profile_private
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

create policy profile_private_delete_own on public.profile_private
  for delete to authenticated using (id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- venues — read-only for users (writes via service role only).
-- ---------------------------------------------------------------------------
create policy venues_select_authenticated on public.venues
  for select to authenticated using (true);

-- ---------------------------------------------------------------------------
-- presence — you manage your own check-in; everyone can read presence rows
-- (no PII; needed to know who is in the room). Tighten to same-venue in Bloc 1.
-- ---------------------------------------------------------------------------
create policy presence_select_authenticated on public.presence
  for select to authenticated using (true);

create policy presence_insert_own on public.presence
  for insert to authenticated with check (profile_id = (select auth.uid()));

create policy presence_update_own on public.presence
  for update to authenticated
  using (profile_id = (select auth.uid()))
  with check (profile_id = (select auth.uid()));

create policy presence_delete_own on public.presence
  for delete to authenticated using (profile_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- likes — the discreet double opt-in red line. You can write your own likes and
-- read ONLY the ones you sent. You can NEVER read a like that targets you, so no
-- one is ever told they were liked. The match (created by trigger) is the only
-- signal that surfaces, and only when it is mutual.
-- ---------------------------------------------------------------------------
create policy likes_select_own on public.likes
  for select to authenticated using (liker_id = (select auth.uid()));

create policy likes_insert_own on public.likes
  for insert to authenticated with check (liker_id = (select auth.uid()));

create policy likes_delete_own on public.likes
  for delete to authenticated using (liker_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- matches — readable only by the two matched profiles. No user writes: rows are
-- created by the handle_new_like() trigger and removed by cascade.
-- ---------------------------------------------------------------------------
create policy matches_select_member on public.matches
  for select to authenticated
  using ((select auth.uid()) in (profile_a, profile_b));

-- ---------------------------------------------------------------------------
-- messages — only the two members of a match can read its messages, and you can
-- only send as yourself into a match you belong to. No match, no message.
-- ---------------------------------------------------------------------------
create policy messages_select_member on public.messages
  for select to authenticated
  using (
    exists (
      select 1 from public.matches m
      where m.id = messages.match_id
        and (select auth.uid()) in (m.profile_a, m.profile_b)
    )
  );

create policy messages_insert_member on public.messages
  for insert to authenticated
  with check (
    sender_id = (select auth.uid())
    and exists (
      select 1 from public.matches m
      where m.id = messages.match_id
        and (select auth.uid()) in (m.profile_a, m.profile_b)
    )
  );
