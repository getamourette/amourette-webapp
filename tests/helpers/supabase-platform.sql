-- Minimal stand-in for what an empty Supabase project already provides, used by
-- scripts/test-migration-replay.mjs to replay every migration on an empty
-- database. It models only what the migrations reference; it is not Supabase.
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create role authenticator noinherit;
create role supabase_auth_admin;
create role supabase_storage_admin;
create role supabase_realtime_admin;
create role supabase_admin;
create role dashboard_user;
grant anon, authenticated, service_role to authenticator;

create schema extensions;
create schema auth;
create schema storage;
create schema realtime;
create schema vault;
create schema cron;
create schema net;
grant usage on schema public, extensions to anon, authenticated, service_role;
grant usage on schema auth, storage, realtime to anon, authenticated, service_role;
-- What a project created with "Automatically expose new tables" off still
-- grants on every table postgres creates in public (read on both projects).
alter default privileges for role postgres in schema public
  grant truncate, references, trigger, maintain on tables to anon, authenticated, service_role;
create extension pgcrypto schema extensions;
create extension "uuid-ossp" schema extensions;
alter database postgres set search_path = "$user", public, extensions;
set search_path = "$user", public, extensions;

create table auth.users (
  id uuid primary key default gen_random_uuid(),
  aud text, role text, email text, encrypted_password text,
  email_confirmed_at timestamptz, last_sign_in_at timestamptz,
  raw_app_meta_data jsonb, raw_user_meta_data jsonb,
  is_anonymous boolean not null default false, is_sso_user boolean not null default false,
  banned_until timestamptz, deleted_at timestamptz, phone text,
  created_at timestamptz default now(), updated_at timestamptz default now()
);
create table auth.sessions (id uuid primary key default gen_random_uuid(), user_id uuid references auth.users(id) on delete cascade, created_at timestamptz default now());
create table auth.identities (id uuid primary key default gen_random_uuid(), user_id uuid references auth.users(id) on delete cascade, provider text);
create function auth.uid() returns uuid language sql stable as
  $$select nullif(coalesce(current_setting('request.jwt.claim.sub', true), current_setting('request.jwt.claims', true)::jsonb->>'sub'), '')::uuid$$;
create function auth.jwt() returns jsonb language sql stable as
  $$select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb$$;
create function auth.role() returns text language sql stable as
  $$select coalesce(current_setting('request.jwt.claim.role', true), current_user::text)$$;

create table storage.buckets (
  id text primary key, name text not null unique, owner uuid, owner_id text,
  created_at timestamptz default now(), updated_at timestamptz default now(),
  public boolean default false, avif_autodetection boolean default false,
  file_size_limit bigint, allowed_mime_types text[], type text default 'STANDARD'
);
create table storage.objects (
  id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets(id),
  name text, owner uuid, owner_id text, created_at timestamptz default now(),
  updated_at timestamptz default now(), last_accessed_at timestamptz default now(),
  metadata jsonb, path_tokens text[] generated always as (string_to_array(name, '/')) stored,
  version text, user_metadata jsonb, unique (bucket_id, name)
);
alter table storage.objects enable row level security;
alter table storage.buckets enable row level security;
create function storage.foldername(name text) returns text[] language sql immutable as
  $$select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1]$$;
create function storage.filename(name text) returns text language sql immutable as
  $$select (string_to_array(name, '/'))[array_length(string_to_array(name, '/'), 1)]$$;
create function storage.extension(name text) returns text language sql immutable as
  $$select reverse(split_part(reverse(name), '.', 1))$$;
grant all on storage.objects, storage.buckets to anon, authenticated, service_role;

create table realtime.messages (
  topic text not null, extension text not null, payload jsonb, event text, private boolean default false,
  updated_at timestamp default now(), inserted_at timestamp default now(), id uuid default gen_random_uuid()
);
alter table realtime.messages enable row level security;
create function realtime.topic() returns text language sql stable as $$select nullif(current_setting('realtime.topic', true), '')$$;
create function realtime.send(payload jsonb, event text, topic text, private boolean default true) returns void language sql as
  $$insert into realtime.messages(payload, event, topic, private, extension) values (payload, event, topic, private, 'broadcast')$$;
grant select, insert on realtime.messages to authenticated;
create publication supabase_realtime;

create table vault.secrets (id uuid primary key default gen_random_uuid(), name text unique, description text, secret text);
create view vault.decrypted_secrets as select id, name, description, secret, secret as decrypted_secret from vault.secrets;
create function vault.create_secret(new_secret text, new_name text default null, new_description text default '') returns uuid language sql as
  $$insert into vault.secrets(secret, name, description) values (new_secret, new_name, new_description) returning id$$;

create table cron.job (jobid bigserial primary key, jobname text unique, schedule text, command text, active boolean default true, username text default current_user, database text default current_database());
create table cron.job_run_details (jobid bigint, runid bigserial primary key, status text, return_message text, start_time timestamptz, end_time timestamptz);
create function cron.schedule(job_name text, schedule text, command text) returns bigint language sql as
  $$insert into cron.job(jobname, schedule, command) values (job_name, schedule, command)
    on conflict (jobname) do update set schedule = excluded.schedule, command = excluded.command returning jobid$$;
create function cron.unschedule(job_name text) returns boolean language sql as
  $$with gone as (delete from cron.job where jobname = job_name returning 1) select exists (select 1 from gone)$$;
create function cron.unschedule(job_id bigint) returns boolean language sql as
  $$with gone as (delete from cron.job where jobid = job_id returning 1) select exists (select 1 from gone)$$;

create function net.http_post(url text, body jsonb default '{}', params jsonb default '{}', headers jsonb default '{}', timeout_milliseconds integer default 5000) returns bigint language sql as $$select 1::bigint$$;
create function net.http_get(url text, params jsonb default '{}', headers jsonb default '{}', timeout_milliseconds integer default 5000) returns bigint language sql as $$select 1::bigint$$;
