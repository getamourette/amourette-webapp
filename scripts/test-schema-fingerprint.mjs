import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist';
import { moddatetime } from '@electric-sql/pglite/contrib/moddatetime';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { uuid_ossp } from '@electric-sql/pglite/contrib/uuid_ossp';
import { QUERIES, differences, fingerprint, unexpected } from './schema-fingerprint.mjs';

// #434: the catalog comparison gates the production deployment, so it must see
// a change in every category and nothing when two databases hold the same
// migrations. Same replay as test-migration-replay, on two databases.
const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const files = readdirSync(new URL('../supabase/migrations', import.meta.url)).filter(file => file.endsWith('.sql')).sort();
async function replay() {
  const db = new PGlite({ extensions: { btree_gist, moddatetime, pgcrypto, uuid_ossp } });
  await db.exec(read('tests/helpers/supabase-platform.sql'));
  for (const file of files) await db.exec(read(`supabase/migrations/${file}`).replace(/create extension if not exists (pg_cron|pg_net)[^;]*;/gi, ''));
  return db;
}
const catalog = Object.keys(QUERIES).filter(name => name !== 'seed_rows');
const dump = db => fingerprint(async query => (await db.query(query)).rows, catalog);

const [first, second] = await Promise.all([replay(), replay()]);
const before = await dump(first);
assert.ok(!('seed_rows' in before), 'row counts stay out of a catalog dump');
for (const name of ['tables', 'columns', 'functions', 'function_grants', 'policies', 'triggers', 'table_grants', 'cron_jobs', 'buckets']) {
  assert.ok(Object.keys(before[name]).length, `${name} is read`);
}
assert.deepEqual(differences(before, await dump(second)), [], 'the same migrations give the same catalog');

// One change per category the deployment gate relies on.
await second.exec(`
  create table public.drift_probe (id int);
  alter table public.venues add column drift_probe int;
  alter function public.run_venue_night_lifecycle() set search_path = pg_catalog;
  grant select on public.venues to anon;
  create policy drift_probe on public.venues for select to anon using (true);
  select cron.unschedule('amourette-photo-cleanup');
`);
const found = differences(before, await dump(second));
const has = (category, key, side) => found.some(item => item.category === category && item.key === key && item.side === side);
assert.ok(has('tables', 'public.drift_probe', 'second only'));
assert.ok(has('columns', 'public.venues.drift_probe', 'second only'));
assert.ok(has('functions', 'public.run_venue_night_lifecycle()', 'different'));
assert.ok(has('table_grants', 'public.venues>anon', 'second only'));
assert.ok(has('policies', 'public.venues.drift_probe', 'second only'));
assert.ok(has('cron_jobs', 'amourette-photo-cleanup', 'first only'));

// A recorded difference is accepted by key or for a whole category; the rest
// is still refused.
const allowed = { tables: { 'public.drift_probe': 'probe' }, columns: { '*': 'probe' } };
const refused = unexpected(found, allowed);
assert.ok(!refused.some(item => item.category === 'tables' || item.category === 'columns'));
assert.ok(refused.some(item => item.category === 'functions'));
assert.deepEqual(unexpected([], allowed), []);
// The gate keeps what changes meaning: how a predicate groups and the case of
// a literal. Only whitespace is ignored.
const policy = using => ({ policies: { 'public.t.p': using } });
assert.equal(differences(policy('(owner = uid() OR is_public) AND active'), policy('owner = uid() OR (is_public AND active)')).length, 1);
assert.equal(differences(policy("status = 'Open'"), policy("status = 'open'")).length, 1);
assert.deepEqual(differences(policy('a  =\n b'), policy(' a = b ')), []);

// A category missing from one side is not compared, never reported as empty.
assert.deepEqual(differences(before, { tables: before.tables }), []);

console.log('Schema fingerprint: identical replays match, each category detects a change, recorded differences pass.');
