-- Minimal isolated pre-#77 schema, including the constraints replaced by the migration.
-- It deliberately does not simulate Supabase Storage, Auth HTTP or full app RLS.
create role anon; create role authenticated; create role service_role bypassrls;
create schema auth; create schema private; create schema extensions;
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
create table public.admins(user_id uuid primary key);
create function private.is_admin() returns boolean language sql stable security definer as $$select exists(select 1 from public.admins where user_id=auth.uid())$$;
create table public.profiles(id uuid primary key default gen_random_uuid(),first_name text not null, bio text, gender text not null default 'woman' check(gender in ('woman','man','nonbinary')), interested_in text[] not null default array['woman'],photo_url text,
 constraint profiles_first_name_check check(length(trim(first_name)) between 1 and 50), constraint profiles_bio_check check(length(bio)<=500), constraint profiles_interested_in_check check(cardinality(interested_in) between 1 and 3));
create table public.venues(id uuid primary key default gen_random_uuid(), name text not null, slug text not null unique, city text, timezone text not null, is_test_venue boolean default false, profile_preview_enabled boolean default false);
create table public.venue_nights(id uuid primary key default gen_random_uuid(),venue_id uuid references venues,waiting_opens_at timestamptz not null,guaranteed_launch_at timestamptz not null,closes_at timestamptz not null, launch_threshold integer not null check(launch_threshold>0),status text default 'live',terminal_at timestamptz,check(waiting_opens_at<guaranteed_launch_at and guaranteed_launch_at<closes_at));
create table public.messages(id uuid primary key default gen_random_uuid(),body text not null,match_id uuid,sender_id uuid,created_at timestamptz default now(),constraint messages_body_check check(length(trim(body)) between 1 and 2000));
create table public.moderation_cases(id uuid primary key default gen_random_uuid(),reported_id uuid,venue_night_id uuid,status text default 'pending_review',action_expires_at timestamptz,reviewed_at timestamptz,reviewed_by uuid,updated_at timestamptz default now(),unique(reported_id,venue_night_id));
create table public.reports(id uuid primary key default gen_random_uuid(),reporter_id uuid,reported_id uuid,venue_id uuid,venue_night_id uuid,case_id uuid,reason text not null check(reason in ('harassment','fake_profile','underage','unsafe_behavior','other')),note text,interaction_evidence text,interaction_verified_at timestamptz,created_at timestamptz default now());
create table public.blocks(id uuid primary key default gen_random_uuid(),reason text not null,note text);
create table public.venue_ejections(profile_id uuid,venue_id uuid,venue_night_id uuid,night date,reason text,note text,created_by uuid,expires_at timestamptz,created_at timestamptz default now(),unique(profile_id,venue_night_id));
create table public.presence(profile_id uuid,venue_night_id uuid,left_at timestamptz);
create table public.matches(id uuid,profile_a uuid,profile_b uuid,venue_night_id uuid);
create table public.email_subscriptions(user_id uuid primary key,email text not null,locale text not null,source text not null,consent_version text not null,status text,subscribed_at timestamptz,unsubscribed_at timestamptz,constraint email_subscriptions_email_normalized check(email=lower(btrim(email))));
create table public.email_deliveries(id uuid primary key default gen_random_uuid(),kind text,recipient_email text,locale text,payload jsonb,idempotency_key text,status text,created_at timestamptz default now());
create table public.email_suppressions(email text primary key,reason text,provider_event_id text,suppressed_at timestamptz);
create table private.email_unsubscribe_tokens(email text,token_hash bytea,expires_at timestamptz,revoked_at timestamptz);
-- Guard tests must return before hashing; this stub fails if malformed tokens reach it.
create function extensions.digest(bytea,text) returns bytea language plpgsql as $$begin raise exception 'unexpected token hashing'; end$$;
grant usage on schema auth,private to authenticated,service_role;
grant select,insert,update on messages,reports,blocks,venues,venue_nights to authenticated;
-- #194 creates profiles only through its service RPC; participants can edit metadata.
grant select on profiles to authenticated;
grant update(first_name,bio,gender,interested_in) on profiles to authenticated;
-- Model the existing service-only subscription boundary, never restore direct writes.
alter default privileges revoke execute on functions from public;

create table public.profile_private(id uuid primary key,phone text,adult_confirmed_at timestamptz);
grant all on public.profile_private to authenticated;
create table public.analytics_events(event_name text,properties jsonb,qr_code_id text,source text,medium text,campaign text,content text,referrer text);
grant insert,truncate,references,trigger on public.analytics_events to authenticated;

create schema storage;
create table storage.buckets(id text primary key,public boolean,file_size_limit bigint,allowed_mime_types text[]);
insert into storage.buckets(id,public) values('profile-photos',false);

create table private.email_webhook_events(event_id text primary key,event_type text not null,event_created_at timestamptz not null);
alter table public.email_deliveries add column provider_message_id text, add column provider_event_at timestamptz,add column delivered_at timestamptz,add column last_error_code text;
