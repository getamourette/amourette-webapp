-- Bloc 0 — Foundations: core data model for Bartap.
-- Persistent identity (profiles), ephemeral everything else (presence, likes, matches, messages).
-- See docs/decisions.md (2026-06-19) for the rationale behind each choice.
--
-- This migration replaces the throwaway scaffold tables (bigint ids, email/phone in the
-- public profile, open DM). Their 18 rows are test data and are dropped on purpose.

-- ---------------------------------------------------------------------------
-- 0. Drop the scaffold tables. Incompatible with the new auth-backed model
--    (uuid ids referencing auth.users instead of bigint auto-increment).
-- ---------------------------------------------------------------------------
drop table if exists public.messages cascade;
drop table if exists public.profiles cascade;

-- ---------------------------------------------------------------------------
-- 1. profiles — persistent identity, one row per auth.users (anonymous) session.
--    Only the soft-identity columns live here (first name + photo required, bio
--    optional). PII (email/phone) is isolated in profile_private below so RLS can
--    actually guarantee it never leaks: RLS is row-level and cannot hide a column
--    of a row that is otherwise readable.
-- ---------------------------------------------------------------------------
create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  first_name  text not null check (length(trim(first_name)) between 1 and 50),
  photo_url   text not null,
  bio         text check (bio is null or length(bio) <= 500),
  -- Dating filter. gender = what you are; interested_in = the set you want to see.
  -- interested_in is meaningless without the other person's gender to filter on,
  -- so the two ship together. Values kept in sync between both columns' checks.
  gender        text not null check (gender in ('woman', 'man', 'nonbinary')),
  interested_in text[] not null check (
                  cardinality(interested_in) between 1 and 3
                  and interested_in <@ array['woman', 'man', 'nonbinary']
                ),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.profiles is
  'Persistent public identity. Readable by authenticated users (first name + photo + bio only).';

-- keep updated_at fresh
create extension if not exists moddatetime schema extensions;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function extensions.moddatetime (updated_at);

-- ---------------------------------------------------------------------------
-- 2. profile_private — PII, owner-only. Never exposed to other users.
--    Email is optional and collected after onboarding ("get notified about the
--    next live night"); it is what later upgrades the anonymous user to a
--    permanent account (same uuid). Phone kept for a possible future channel.
-- ---------------------------------------------------------------------------
create table public.profile_private (
  id          uuid primary key references public.profiles (id) on delete cascade,
  email       text,
  phone       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.profile_private is
  'PII (email, phone). Owner-only via RLS — never readable by other users.';

create trigger profile_private_set_updated_at
  before update on public.profile_private
  for each row execute function extensions.moddatetime (updated_at);

-- ---------------------------------------------------------------------------
-- 3. venues — the physical rooms you scan into. A QR encodes the slug.
--    Managed by us (service role); users only read.
-- ---------------------------------------------------------------------------
create table public.venues (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique check (slug ~ '^[a-z0-9-]+$'),
  name        text not null,
  city        text,
  created_at  timestamptz not null default now()
);

comment on table public.venues is 'Physical venues. Read-only for users; QR encodes the slug.';

-- ---------------------------------------------------------------------------
-- 4. presence — ephemeral check-in. You are "here, now" until you leave or
--    time out. One active row per profile (partial unique index). Leaving sets
--    left_at; a heartbeat bumps last_seen_at. "Active" = left_at IS NULL and a
--    fresh last_seen_at (staleness window applied at query/RLS time).
-- ---------------------------------------------------------------------------
create table public.presence (
  id            uuid primary key default gen_random_uuid(),
  profile_id    uuid not null references public.profiles (id) on delete cascade,
  venue_id      uuid not null references public.venues (id) on delete cascade,
  checked_in_at timestamptz not null default now(),
  last_seen_at  timestamptz not null default now(),
  left_at       timestamptz
);

comment on table public.presence is 'Ephemeral check-in: who is in a venue right now.';

-- at most one active presence per profile
create unique index presence_one_active_per_profile
  on public.presence (profile_id) where left_at is null;
-- fast "who is active in this venue" lookups
create index presence_active_by_venue
  on public.presence (venue_id) where left_at is null;

-- ---------------------------------------------------------------------------
-- 5. likes — secret, directional, scoped to a venue (a night). A like is never
--    visible to the person it targets (enforced in RLS). Reciprocity within the
--    same venue creates a match (trigger below).
-- ---------------------------------------------------------------------------
create table public.likes (
  id          uuid primary key default gen_random_uuid(),
  liker_id    uuid not null references public.profiles (id) on delete cascade,
  liked_id    uuid not null references public.profiles (id) on delete cascade,
  venue_id    uuid not null references public.venues (id) on delete cascade,
  created_at  timestamptz not null default now(),
  constraint likes_no_self check (liker_id <> liked_id),
  constraint likes_unique unique (liker_id, liked_id, venue_id)
);

comment on table public.likes is
  'Secret directional like, scoped to a venue. Only the liker can ever read it.';

-- reciprocity lookup: "does liked_id like me back here?"
create index likes_reciprocity on public.likes (liked_id, venue_id);

-- ---------------------------------------------------------------------------
-- 6. matches — derived from reciprocal likes. The pair is stored ordered
--    (profile_a < profile_b) so it is unique regardless of who liked first.
--    Ephemeral: a match belongs to a venue/night, we never let users retrieve
--    past matches. Created exclusively by the trigger below (no user inserts).
-- ---------------------------------------------------------------------------
create table public.matches (
  id          uuid primary key default gen_random_uuid(),
  profile_a   uuid not null references public.profiles (id) on delete cascade,
  profile_b   uuid not null references public.profiles (id) on delete cascade,
  venue_id    uuid not null references public.venues (id) on delete cascade,
  created_at  timestamptz not null default now(),
  constraint matches_ordered check (profile_a < profile_b),
  constraint matches_unique unique (profile_a, profile_b, venue_id)
);

comment on table public.matches is
  'Reciprocal-like match, ordered pair, scoped to a venue. Created by trigger only.';

create index matches_by_profile_a on public.matches (profile_a);
create index matches_by_profile_b on public.matches (profile_b);

-- Create a match when a like closes a reciprocal pair in the same venue.
-- SECURITY DEFINER so it can read likes (which users cannot SELECT) without ever
-- exposing them. Owned by the migration role (postgres), so it bypasses RLS.
create function public.handle_new_like()
  returns trigger
  language plpgsql
  security definer
  set search_path = public
as $$
begin
  if exists (
    select 1 from public.likes l
    where l.liker_id = new.liked_id
      and l.liked_id = new.liker_id
      and l.venue_id = new.venue_id
  ) then
    insert into public.matches (profile_a, profile_b, venue_id)
    values (
      least(new.liker_id, new.liked_id),
      greatest(new.liker_id, new.liked_id),
      new.venue_id
    )
    on conflict (profile_a, profile_b, venue_id) do nothing;
  end if;
  return new;
end;
$$;

create trigger likes_create_match
  after insert on public.likes
  for each row execute function public.handle_new_like();

-- ---------------------------------------------------------------------------
-- 7. messages — chat, always tied to a match. There is no open DM: a message
--    cannot exist without a match, which only a reciprocal like can create.
--    Ephemeral with the match (cascades on match delete).
-- ---------------------------------------------------------------------------
create table public.messages (
  id          uuid primary key default gen_random_uuid(),
  match_id    uuid not null references public.matches (id) on delete cascade,
  sender_id   uuid not null references public.profiles (id) on delete cascade,
  body        text not null check (length(trim(body)) between 1 and 2000),
  created_at  timestamptz not null default now()
);

comment on table public.messages is 'Chat messages, always scoped to a match. No open DM.';

create index messages_by_match on public.messages (match_id, created_at);

-- ---------------------------------------------------------------------------
-- 8. Realtime — clients subscribe to new messages and to matches unlocking.
-- ---------------------------------------------------------------------------
alter publication supabase_realtime add table public.messages;
alter publication supabase_realtime add table public.matches;
