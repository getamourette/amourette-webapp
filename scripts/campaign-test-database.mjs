import { readFileSync } from 'node:fs';

export async function installCampaignSchema(db) {
  const exec = sql => db.exec ? db.exec(sql) : db.query(sql);
  for (const role of ['anon', 'authenticated', 'service_role']) {
    if (!(await db.query('select 1 from pg_roles where rolname=$1', [role])).rows.length) {
      await db.query(`create role ${role}${role === 'service_role' ? ' bypassrls' : ''}`);
    }
  }
await exec(`

  create schema auth; create schema private; create schema extensions;
  create table auth.users(id uuid primary key);
  create table public.admins(user_id uuid primary key references auth.users);
  create function extensions.moddatetime() returns trigger language plpgsql as $$begin new.updated_at=now(); return new; end$$;
  create table venues(id uuid primary key, name text not null, city text, timezone text not null, is_test_venue boolean not null default false);
  create table venue_nights(id uuid primary key, venue_id uuid references venues, status text not null default 'closed',
    terminal_at timestamptz, waiting_opens_at timestamptz not null, guaranteed_launch_at timestamptz not null, closes_at timestamptz not null);
  create function auth.uid() returns uuid language sql as $$select null::uuid$$;
`);
const read = name => readFileSync(`supabase/migrations/${name}.sql`, 'utf8');
await exec(read('20260728000001_canonical_email_subscriptions').split('-- Legacy room consents')[0]);
await exec(read('20260802000001_resend_email_delivery_foundation').split('-- The application worker is called')[0]);
await exec(read('20260909000003_input_validation_contract').split('-- Runs before existing workflow triggers:')[0]);
await exec(read('20260921000002_admin_email_campaigns'));
}
