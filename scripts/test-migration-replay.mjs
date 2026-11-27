import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist';
import { moddatetime } from '@electric-sql/pglite/contrib/moddatetime';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { uuid_ossp } from '@electric-sql/pglite/contrib/uuid_ossp';

// #280 / SEC-018: the production project is built from this directory alone,
// so every migration must replay, in filename order, on an empty database.
// The Supabase platform objects are a small stand-in; hosted behavior (Auth,
// Storage service, Realtime delivery, pg_cron, pg_net) is verified on the real
// project by the catalog comparison in docs/production-cutover.md.
const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const db = new PGlite({ extensions: { btree_gist, moddatetime, pgcrypto, uuid_ossp } });
await db.exec(read('tests/helpers/supabase-platform.sql'));

const files = readdirSync(new URL('../supabase/migrations', import.meta.url)).filter(file => file.endsWith('.sql')).sort();
for (const file of files) {
  // pg_cron and pg_net cannot load here; the stand-in provides what they expose.
  const sql = read(`supabase/migrations/${file}`).replace(/create extension if not exists (pg_cron|pg_net)[^;]*;/gi, '');
  try {
    await db.exec(sql);
  } catch (error) {
    assert.fail(`${file} does not replay on an empty database: ${error.message}`);
  }
}

const column = async sql => (await db.query(sql)).rows.map(row => Object.values(row)[0]);

// What the release expects an empty project to contain after the replay.
assert.deepEqual(
  await column("select id || ':' || public from storage.buckets order by id"),
  ['profile-photo-rounds:false', 'profile-photo-sources:false', 'profile-photo-staging:false', 'profile-photos:false'],
  'the four photo buckets exist and are private',
);
assert.deepEqual(
  await column("select schemaname || '.' || tablename from pg_publication_tables where pubname = 'supabase_realtime' order by 1"),
  ['public.matches', 'public.messages', 'public.photo_invalidation', 'public.photo_state', 'public.presence', 'public.venue_night_public_state', 'public.venues'],
  'Realtime publication',
);
assert.deepEqual(await column('select jobname from cron.job order by 1'), [
  'amourette-cron-history-retention', 'amourette-launch-access-retention', 'amourette-launch-gender-erasure', 'amourette-launch-payments', 'amourette-launch-reminders',
  'amourette-photo-cleanup', 'amourette-process-email-outbox', 'bartap-close-ended-nights',
], 'scheduled jobs');
assert.deepEqual(
  await column("select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity"),
  [], 'every public table has row level security',
);
// A visitor without a session reaches no table and no RPC of the application.
assert.deepEqual(
  await column(`select n.nspname || '.' || c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname in ('public','private') and c.relkind in ('r','v','m')
      and (has_table_privilege('anon', c.oid, 'select') or has_table_privilege('anon', c.oid, 'insert')
        or has_table_privilege('anon', c.oid, 'update') or has_table_privilege('anon', c.oid, 'delete'))`),
  [], 'anon has no table access',
);
// RLS cannot guard TRUNCATE, and no API role creates triggers or foreign keys:
// the platform default must be gone from every table, and from future ones.
assert.deepEqual(
  await column(`select c.relname || '>' || g.grantee::regrole::text || '>' || g.privilege_type
    from pg_class c, aclexplode(c.relacl) g
    where c.relnamespace = 'public'::regnamespace and c.relkind in ('r','p')
      and g.grantee::regrole::text in ('anon','authenticated','service_role')
      and g.privilege_type in ('TRUNCATE','REFERENCES','TRIGGER','MAINTAIN')`),
  [], 'API roles hold no TRUNCATE, REFERENCES, TRIGGER or MAINTAIN',
);
await db.exec('create table public.default_privilege_probe (id int)');
assert.deepEqual(
  await column(`select g.grantee::regrole::text from pg_class c, aclexplode(c.relacl) g
    where c.oid = 'public.default_privilege_probe'::regclass and g.grantee::regrole::text in ('anon','authenticated','service_role')`),
  [], 'a new table gets no privilege for the API roles by default',
);
await db.exec('drop table public.default_privilege_probe');
// The only rows the migrations insert are the three flagged QA venues and
// their nights: the production runbook deletes exactly those, nothing else.
assert.deepEqual(await column('select slug from public.venues where is_test_venue order by 1'), ['test-crowded', 'test-empty', 'test-waiting']);
assert.deepEqual(await column(`select (select count(*) from public.venues where not is_test_venue)
  + (select count(*) from public.admins) + (select count(*) from public.profiles) + (select count(*) from auth.users)`), [0]);

await db.close();
process.stdout.write(`migration replay: ok (${files.length} migrations)\n`);
