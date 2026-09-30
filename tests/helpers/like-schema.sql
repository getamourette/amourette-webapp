-- Add the existing lifecycle substrate omitted from photo-only tests.
alter table public.presence add checked_in_at timestamptz not null default now(), add last_seen_at timestamptz default now();
alter table public.likes add venue_id uuid, add expires_at timestamptz, add constraint likes_unique unique(liker_id,liked_id,venue_night_id), add check(liker_id<>liked_id);
alter table public.matches add venue_id uuid, add created_at timestamptz default now(), add unique(profile_a,profile_b,venue_night_id);
alter table public.venues add timezone text default 'UTC', add name text, add slug text, add city text, add is_test_venue boolean default false;
alter table public.venue_nights add waiting_opens_at timestamptz default now()-interval '1 hour', add guaranteed_launch_at timestamptz default now()-interval '30 minutes', add launch_threshold integer default 4, add opened_at timestamptz default now(), add launched_at timestamptz default now(), add launch_reason text, add terminal_reason text;
-- Production created the direct venue cascades before scheduled nights existed.
alter table public.venue_nights drop constraint venue_nights_venue_id_fkey;
alter table public.presence drop constraint presence_profile_id_fkey,
  add constraint presence_profile_id_fkey foreign key(profile_id) references public.profiles(id) on delete cascade;
alter table public.presence
  add constraint presence_venue_id_fkey foreign key(venue_id) references public.venues(id) on delete cascade,
  add constraint presence_venue_night_id_fkey foreign key(venue_night_id) references public.venue_nights(id) on delete cascade;
alter table public.likes
  add constraint likes_venue_id_fkey foreign key(venue_id) references public.venues(id) on delete cascade,
  add constraint likes_venue_night_id_fkey foreign key(venue_night_id) references public.venue_nights(id) on delete cascade;
alter table public.matches
  add constraint matches_venue_id_fkey foreign key(venue_id) references public.venues(id) on delete cascade,
  add constraint matches_venue_night_id_fkey foreign key(venue_night_id) references public.venue_nights(id) on delete cascade;
create table public.venue_ejections(profile_id uuid,venue_id uuid references public.venues(id) on delete cascade,venue_night_id uuid references public.venue_nights(id) on delete cascade,night date,reason text,note text,created_by uuid,expires_at timestamptz,created_at timestamptz default now(),unique(profile_id,venue_night_id));
alter table public.venue_nights add constraint venue_nights_venue_id_fkey
  foreign key(venue_id) references public.venues(id) on delete cascade;
create table public.moderation_cases(id uuid primary key default gen_random_uuid(),reported_id uuid,venue_night_id uuid,status text default 'pending_review',action_expires_at timestamptz,reviewed_at timestamptz,reviewed_by uuid,updated_at timestamptz default now(),unique(reported_id,venue_night_id));
create table public.venue_night_transitions(venue_night_id uuid,from_status text,to_status text,event text,reason text,actor_id uuid);
create table public.venue_match_events(match_id uuid primary key,venue_id uuid,night date,matched_at timestamptz);
alter table public.profiles add constraint profiles_gender_check check(gender in ('woman','man','nonbinary'));
create policy profiles_select_copresent on public.profiles for select to authenticated using(id in(select private.visible_profile_ids()));
create policy presence_select_copresent on public.presence for select to authenticated using(true);
drop policy presence_read on public.presence;
create function public.set_venue_profile_preview(uuid,boolean) returns void language sql as $$select$$;
create function private.can_like_preview_profile(uuid,uuid,uuid) returns boolean language sql as $$select true$$;
alter table public.likes enable row level security;
create policy likes_select_own on public.likes for select to authenticated using(liker_id=auth.uid());
create policy likes_insert_own on public.likes for insert to authenticated with check(liker_id=auth.uid());
create policy likes_delete_own on public.likes for delete to authenticated using(liker_id=auth.uid());
grant select,insert,delete on public.likes to authenticated;

-- Model the shared catalog's historical default privileges, which #231 revokes.
grant truncate,references,trigger on public.likes,public.matches to anon,authenticated;
