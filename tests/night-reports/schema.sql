-- Minimal pre-#257 substrate. Actual collector/lifecycle SQL is loaded by the test.
-- Auth HTTP, production RLS and concurrent PostgreSQL sessions require hosted QA.
create role anon; create role authenticated; create role service_role bypassrls;
create schema auth; create schema private;
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
create table auth.users(id uuid primary key);
create table admins(user_id uuid primary key);
create function private.is_admin() returns boolean language sql stable security definer as $$select exists(select 1 from admins where user_id=auth.uid())$$;
create table profiles(id uuid primary key references auth.users(id) on delete cascade,gender text not null);
create table profile_private(id uuid primary key references profiles(id) on delete cascade,adult_confirmed_at timestamptz);
create table venues(id uuid primary key default gen_random_uuid(),name text default 'Test',city text default 'Paris',timezone text default 'Europe/Paris',is_live boolean default true,profile_preview_enabled boolean default false,is_test_venue boolean default false);
create table venue_nights(id uuid primary key default gen_random_uuid(),venue_id uuid references venues(id) on delete cascade,waiting_opens_at timestamptz not null,guaranteed_launch_at timestamptz,closes_at timestamptz not null,status text default 'live',opened_at timestamptz,launched_at timestamptz,launch_reason text,terminal_at timestamptz,terminal_reason text);
create table venue_night_transitions(venue_night_id uuid,from_status text,to_status text,event text,reason text,actor_id uuid);
create table presence(id uuid primary key default gen_random_uuid(),profile_id uuid references profiles(id) on delete cascade,venue_id uuid,venue_night_id uuid references venue_nights(id) on delete cascade,checked_in_at timestamptz default now(),left_at timestamptz,is_visible boolean default true);
create table likes(id uuid primary key default gen_random_uuid(),liker_id uuid,liked_id uuid,venue_id uuid,venue_night_id uuid references venue_nights(id) on delete cascade,created_at timestamptz default now(),expires_at timestamptz,unique(liker_id,liked_id,venue_night_id));
create table matches(id uuid primary key default gen_random_uuid(),profile_a uuid,profile_b uuid,venue_id uuid,venue_night_id uuid references venue_nights(id) on delete cascade,created_at timestamptz default now(),expires_at timestamptz,unique(profile_a,profile_b,venue_night_id));
create table messages(id uuid primary key default gen_random_uuid(),match_id uuid references matches(id) on delete cascade,sender_id uuid,body text,created_at timestamptz default now());
create table venue_ejections(venue_night_id uuid);
create function private.night_ends_at(timestamptz,text) returns timestamptz language sql as $$select $1+interval '1 day'$$;
grant usage on schema private,auth to authenticated;
create function private.lock_like_eligibility() returns void language plpgsql as $$begin return; end$$;
create table blocks(blocker_id uuid,blocked_id uuid);
