import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist';
import { moddatetime } from '@electric-sql/pglite/contrib/moddatetime';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { uuid_ossp } from '@electric-sql/pglite/contrib/uuid_ossp';

// #374 (SEC-011): founder account protection in the database. The migration is
// applied on top of existing rows, as the merge workflow does on both projects.
const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const target = '20261128000374_founder_account_protection.sql';
const db = new PGlite({ extensions: { btree_gist, moddatetime, pgcrypto, uuid_ossp } });
await db.exec(read('tests/helpers/supabase-platform.sql'));
const files = readdirSync(new URL('../supabase/migrations', import.meta.url)).filter(file => file.endsWith('.sql')).sort();
assert.ok(files.includes(target), 'the migration under test exists');
const apply = async file => db.exec(read(`supabase/migrations/${file}`).replace(/create extension if not exists (pg_cron|pg_net)[^;]*;/gi, ''));
for (const file of files.filter(file => file < target)) await apply(file);

// Existing data: two founders on real domains, fixture users tagged both ways,
// and near misses that must survive (one marker only).
const user = async (email, appMeta = {}) => (await db.query(
  'insert into auth.users(email, raw_app_meta_data) values ($1, $2) returning id', [email, appMeta])).rows[0].id;
const founderA = await user('founder.one@getamourette.com', { provider: 'email' });
const founderB = await user('founder.two@example.net', { provider: 'email' });
const fixtures = [
  await user('e2e-1@example.com', { provider: 'email', e2e_run: 'run-1' }),
  await user('E2E-2@EXAMPLE.COM', { provider: 'email', e2e_run: 'run-2' }),
];
const exampleWithoutTag = await user('someone@example.com', { provider: 'email' });
const taggedRealDomain = await user('founder.three@getamourette.com', { provider: 'email', e2e_run: 'odd' });
const lookalike = await user('e2e-3@example.com.evil.test', { provider: 'email', e2e_run: 'run-3' });
for (const id of [founderA, founderB, ...fixtures, exampleWithoutTag, taggedRealDomain, lookalike]) {
  await db.query('insert into public.admins(user_id) values ($1)', [id]);
}

await apply(target);

const remaining = (await db.query('select user_id from public.admins order by user_id')).rows.map(row => row.user_id);
assert.deepEqual(remaining, [founderA, founderB, exampleWithoutTag, taggedRealDomain, lookalike].sort(),
  'only rows carrying both fixture markers are removed');
assert.equal((await db.query('select count(*)::int as n from auth.users')).rows[0].n, 7, 'no Auth user is deleted');
console.log('Stale fixture founders: 2 tagged example.com rows removed; founders and single-marker rows kept.');

// Before User Created hook: anonymous sign-ups pass, everything else is refused.
const hook = async event => (await db.query('select public.hook_before_user_created($1::jsonb) as r', [event])).rows[0].r;
assert.deepEqual(await hook({ metadata: { name: 'before-user-created' }, user: { is_anonymous: true, email: '' } }), {});
for (const user of [
  { is_anonymous: false, email: 'someone@example.com' },
  { is_anonymous: false, phone: '+33600000000' },
  { email: 'missing-flag@example.com' },
  {},
]) {
  const result = await hook({ metadata: { name: 'before-user-created' }, user });
  assert.equal(result.error?.http_code, 403, `refused: ${JSON.stringify(user)}`);
}
const grants = (await db.query(`select r.rolname from pg_roles r
  where has_function_privilege(r.oid, 'public.hook_before_user_created(jsonb)', 'execute')
    and r.rolname in ('anon', 'authenticated', 'service_role', 'supabase_auth_admin') order by 1`)).rows.map(row => row.rolname);
assert.deepEqual(grants, ['supabase_auth_admin'], 'only Supabase Auth can execute the hook');
console.log('Sign-up hook: anonymous accepted; email, phone and unflagged sign-ups refused; Auth-only execute grant.');

async function asSession(claims, sql) {
  await db.exec('begin');
  try {
    await db.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify(claims)]);
    await db.exec('set local role authenticated');
    return await db.query(sql);
  } finally {
    await db.exec('rollback');
  }
}
// The /admin gate asks whether the caller is a founder still missing the second factor.
const participant = await user('guest@example.org', { provider: 'anonymous' });
const needed = async claims => (await asSession(claims, 'select public.founder_second_factor_needed() as v')).rows[0].v;
assert.equal(await needed({ sub: founderA, role: 'authenticated', aal: 'aal1' }), true, 'founder at aal1 is offered setup');
assert.equal(await needed({ sub: founderA, role: 'authenticated' }), true, 'missing aal counts as one factor');
assert.equal(await needed({ sub: founderA, role: 'authenticated', aal: 'aal2' }), false);
assert.equal(await needed({ sub: participant, role: 'authenticated', aal: 'aal1' }), false, 'another account learns nothing');
const fixtureRows = (await db.query(`select count(*)::int as n from public.admins a join auth.users u on u.id = a.user_id
  where lower(u.email) like '%@example.com' and u.raw_app_meta_data ? 'e2e_run'`)).rows[0].n;
assert.equal(fixtureRows, 0, 'catalog check: no fixture-tagged founder row');
console.log('Setup question: true only for the calling founder without a second factor; no fixture-tagged founder row left.');
