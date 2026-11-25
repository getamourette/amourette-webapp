// SEC-006 (#369): a caller who is not allowed to run a founder or reviewer
// command is refused before it asks for the database-wide like-eligibility lock,
// which every like depends on. Runs on the real migration directory, replayed on
// an isolated PGlite database.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist';
import { moddatetime } from '@electric-sql/pglite/contrib/moddatetime';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { uuid_ossp } from '@electric-sql/pglite/contrib/uuid_ossp';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const db = new PGlite({ extensions: { btree_gist, moddatetime, pgcrypto, uuid_ossp } });
await db.exec(read('tests/helpers/supabase-platform.sql'));
for (const file of readdirSync(new URL('../supabase/migrations', import.meta.url)).filter(file => file.endsWith('.sql')).sort()) {
  await db.exec(read(`supabase/migrations/${file}`).replace(/create extension if not exists (pg_cron|pg_net)[^;]*;/gi, ''));
}

let checks = 0;
const failed = [];
// Every check runs, so one run shows each command still out of order.
async function check(name, fn) {
  try { await fn(); checks++; console.log(`PASS ${name}`); }
  catch (error) { failed.push(name); console.log(`FAIL ${name}\n${error.message}`); }
}

// The helper is the only place that takes the exclusive lock (231, 0); triggers
// call it too. A sequence is not rolled back with the refused call, so it counts
// every attempt, including one made just before an exception.
await db.exec(`
  create sequence public.like_lock_attempts;
  create or replace function private.lock_like_eligibility() returns void
  language plpgsql volatile security definer set search_path = '' as $$
  begin
    perform pg_catalog.nextval('public.like_lock_attempts');
    perform pg_catalog.pg_advisory_xact_lock(231, 0);
  end $$;`);
const attempts = async () => Number((await db.query("select last_value + (case when is_called then 0 else -1 end) n from public.like_lock_attempts")).rows[0].n);
async function as(user, sql, args = []) {
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [user]);
  await db.exec('set role authenticated');
  try { return (await db.query(sql, args)).rows; } finally { await db.exec('reset role'); }
}

const [founder, stranger, guest] = [randomUUID(), randomUUID(), randomUUID()];
for (const id of [founder, stranger, guest]) await db.query('insert into auth.users(id) values($1)', [id]);
await db.query('insert into public.admins(user_id) values($1)', [founder]);
for (const [id, name] of [[stranger, 'Stranger'], [guest, 'Guest']]) await db.query('insert into public.profiles(id,first_name) values($1,$2)', [id, name]);
const venue = randomUUID(), night = randomUUID();
await db.query("insert into public.venues(id,slug,name,city,timezone,is_live) values($1,$2,'Lock bar','Paris','Europe/Paris',true)", [venue, `lock-${venue}`]);
await db.query(`insert into public.venue_nights(id,venue_id,waiting_opens_at,guaranteed_launch_at,closes_at,status,opened_at,launched_at,launch_reason)
  values($1,$2,now()-interval '2 hours',now()-interval '1 hour',now()+interval '3 hours','live',now()-interval '2 hours',now()-interval '1 hour','threshold')`, [night, venue]);
for (const id of [stranger, guest]) await db.query('insert into public.presence(profile_id,venue_id,venue_night_id) values($1,$2,$3)', [id, venue, night]);
await as(stranger, "select public.submit_report($1,$2,'harassment',null)", [guest, night]);
const [{ id: caseId }] = (await db.query('select id from public.moderation_cases where reported_id=$1', [guest])).rows;
const later = n => `now()+interval '${n} days'`;

// One realistic call per command a participant session can reach. Each would
// succeed for a founder; for a checked-in participant it must be refused.
const commands = {
  eject_from_venue: ["select public.eject_from_venue($1,$2,'harassment',null)", [guest, venue]],
  moderate_case: ["select public.moderate_case($1,'remove_for_night')", [caseId]],
  require_profile_text_correction: ["select public.require_profile_text_correction($1,'bio',gen_random_uuid(),'other',$2,null)", [guest, night]],
  decide_profile_photo: ["select public.decide_profile_photo($1,gen_random_uuid(),0,'rejected','face_unclear')", [guest]],
  delete_venue_configuration: ['select public.delete_venue_configuration($1)', [venue]],
  save_venue_configuration: [`select public.save_venue_configuration(null,null,'New bar','new-bar','Paris','Europe/Paris',${later(1)},${later(1)}+interval '1 hour',${later(1)}+interval '5 hours',10)`, []],
  update_venue_night_schedule: [`select public.update_venue_night_schedule($1,${later(2)},${later(2)}+interval '1 hour',${later(2)}+interval '5 hours',10)`, [night]],
};

await check('every founder or reviewer command refuses a participant without asking for the like lock', async () => {
  const early = [];
  for (const [name, [sql, args]] of Object.entries(commands)) {
    const before = await attempts();
    await assert.rejects(as(stranger, sql, args), /not authorized/, name);
    if (await attempts() !== before) early.push(name);
  }
  assert.deepEqual(early, [], 'these commands asked for the like-eligibility lock before refusing');
});

await check('the counter sees a founder command take the lock (the probe works)', async () => {
  const before = await attempts();
  await as(founder, commands.eject_from_venue[0], commands.eject_from_venue[1]);
  assert.ok(await attempts() > before);
});

await check('a founder removal asks for the like lock before any other write or row lock', async () => {
  // Statement-level triggers would take it too, but only after the night row is
  // locked; the night lifecycle takes the like lock first, then that row.
  for (const name of ['eject_from_venue', 'moderate_case']) {
    const [{ body }] = (await db.query("select prosrc body from pg_proc where oid=$1::regprocedure", [`public.${name}(${name === 'eject_from_venue' ? 'uuid,uuid,text,text' : 'uuid,text'})`])).rows;
    const auth = body.indexOf('private.is_admin()'), lock = body.indexOf('private.lock_like_eligibility()');
    assert.ok(auth >= 0 && lock > auth, `${name}: authorization, then the like lock`);
    assert.ok(!/\b(select|insert|update|delete)\b/i.test(body.slice(auth, lock).replace(/raise exception[^;]*;/i, '')), `${name}: nothing between authorization and the lock`);
  }
});

// Guard for future commands: in a function a participant session can execute,
// the founder or reviewer test comes before the first request for the lock.
await check('no participant-callable command asks for the like lock before its founder or reviewer test', async () => {
  const rows = (await db.query(`select p.oid::regprocedure::text fn, p.prosrc body from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname in ('public','private') and has_function_privilege('authenticated',p.oid,'execute')
      and p.prosrc like '%lock_like_eligibility%'`)).rows;
  const late = rows.filter(({ body }) => {
    const lock = body.indexOf('lock_like_eligibility');
    const auth = body.search(/private\.(is_admin|can_review_\w+)\(/);
    return auth > lock;
  }).map(({ fn }) => fn);
  assert.deepEqual(late, []);
});

if (failed.length) { console.log(`${failed.length} like-lock authorization checks failed`); process.exit(1); }
console.log(`${checks} like-lock authorization checks passed`);
