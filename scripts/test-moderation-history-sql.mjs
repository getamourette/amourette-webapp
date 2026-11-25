// #234: every founder moderation action leaves an attributable, append-only
// event that survives the night's cleanup, and only founders can read it.
// Runs on the real migration directory, replayed on an isolated PGlite database.
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
async function check(name, fn) { await fn(); checks++; console.log(`PASS ${name}`); }
async function as(role, user, sql, args = []) {
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [user ?? '']);
  await db.exec(`set role ${role}`);
  try { return (await db.query(sql, args)).rows; } finally { await db.exec('reset role'); }
}
const guest = (user, sql, args) => as('authenticated', user, sql, args);
const events = async () => (await db.query(`select action, actor_id, target_profile_id, venue_night_id, case_id, report_id, reason
  from private.moderation_events order by id`)).rows;
const count = async () => (await events()).length;

const [founder, other, removed, reporter] = [randomUUID(), randomUUID(), randomUUID(), randomUUID()];
for (const id of [founder, other, removed, reporter]) await db.query('insert into auth.users(id) values($1)', [id]);
await db.query('insert into public.admins(user_id) values($1),($2)', [founder, other]);
for (const [id, name] of [[removed, 'Removed'], [reporter, 'Reporter']]) {
  await db.query("insert into public.profiles(id,first_name) values($1,$2)", [id, name]);
}
async function liveNight() {
  const venue = randomUUID(), night = randomUUID();
  await db.query("insert into public.venues(id,slug,name,city,timezone,is_live) values($1,$2,'History bar','Paris','Europe/Paris',true)", [venue, `history-${venue}`]);
  await db.query(`insert into public.venue_nights(id,venue_id,waiting_opens_at,guaranteed_launch_at,closes_at,status,opened_at,launched_at,launch_reason)
    values($1,$2,now()-interval '2 hours',now()-interval '1 hour',now()+interval '3 hours','live',now()-interval '2 hours',now()-interval '1 hour','threshold')`, [night, venue]);
  for (const id of [removed, reporter]) await db.query('insert into public.presence(profile_id,venue_id,venue_night_id) values($1,$2,$3)', [id, venue, night]);
  return { venue, night };
}
const { venue, night } = await liveNight();
const ejected = async (id = removed, n = night) => (await db.query('select 1 from public.venue_ejections where profile_id=$1 and venue_night_id=$2', [id, n])).rows.length === 1;

await check('a guest reads nothing and writes nothing, a founder reads', async () => {
  await assert.rejects(guest(removed, 'select * from admin_moderation_history()'), /not authorized/);
  await assert.rejects(guest(reporter, 'select * from admin_moderation_history($1,$2)', [removed, night]), /not authorized/);
  await assert.rejects(guest(removed, 'select * from private.moderation_events'), /permission denied/);
  await assert.rejects(guest(removed, `insert into private.moderation_events(action,actor_id,target_profile_id,venue_night_id)
    values('access_restored',$1,$1,$2)`, [removed, night]), /permission denied/);
  await assert.rejects(guest(founder, 'delete from private.moderation_events'), /permission denied/, 'not even a founder session writes the table');
  await assert.rejects(as('anon', null, 'select * from admin_moderation_history()'), /permission denied/);
  await assert.rejects(as('service_role', null, 'select * from private.moderation_events'), /permission denied/);
  assert.deepEqual(await guest(founder, 'select * from admin_moderation_history()'), []);
});

await check('door removal (eject_from_venue) records who, whom, when, which night and why', async () => {
  await guest(founder, "select eject_from_venue($1,$2,'harassment','Walked out by staff')", [removed, venue]);
  assert.ok(await ejected());
  assert.deepEqual(await events(), [{ action: 'removed_for_night', actor_id: founder, target_profile_id: removed, venue_night_id: night, case_id: null, report_id: null, reason: 'harassment' }]);
  const [row] = await guest(founder, 'select * from admin_moderation_history($1,$2)', [removed, night]);
  assert.equal(row.target_first_name, 'Removed');
  assert.equal(row.venue_name, 'History bar');
  assert.equal(row.by_me, true);
  assert.equal((await guest(other, 'select by_me from admin_moderation_history()'))[0].by_me, false, 'the other founder sees it was not them');
  assert.ok(!('note' in row) && !('actor_id' in row), 'no note and no raw founder id leave the server');
});

await check('direct restore (restore_to_venue) records access given back, and nothing when nothing was lifted', async () => {
  await guest(other, 'select restore_to_venue($1,$2)', [removed, venue]);
  assert.ok(!(await ejected()));
  assert.deepEqual((await events()).at(-1), { action: 'access_restored', actor_id: other, target_profile_id: removed, venue_night_id: night, case_id: null, report_id: null, reason: null });
  const before = await count();
  await guest(other, 'select restore_to_venue($1,$2)', [removed, venue]);
  assert.equal(await count(), before);
});

let caseId, reportId;
await check('queue: review, remove, restore and remove again leave an accurate sequence', async () => {
  const start = await count();
  reportId = (await guest(reporter, "select submit_report($1,$2,'unsafe_behavior',null) id", [removed, night]))[0].id;
  caseId = (await db.query('select case_id from public.reports where id=$1', [reportId])).rows[0].case_id;
  assert.equal(await count(), start, 'a guest report is not a founder action');
  for (const action of ['review', 'remove_for_night', 'restore', 'remove_for_night']) {
    await guest(founder, 'select moderate_case($1,$2)', [caseId, action]);
  }
  assert.deepEqual((await events()).slice(start).map(e => [e.action, e.case_id, e.reason, e.actor_id, e.target_profile_id, e.venue_night_id]), [
    ['case_reviewed', caseId, null, founder, removed, night],
    ['removed_for_night', caseId, 'unsafe_behavior', founder, removed, night],
    ['access_restored', caseId, null, founder, removed, night],
    ['removed_for_night', caseId, 'unsafe_behavior', founder, removed, night],
  ]);
  assert.ok(await ejected());
  const history = await guest(founder, 'select action from admin_moderation_history($1,$2)', [removed, night]);
  assert.deepEqual(history.map(row => row.action), ['removed_for_night', 'access_restored', 'removed_for_night', 'case_reviewed', 'access_restored', 'removed_for_night'], 'newest first, door and queue together');
});

await check('queue restore without a removal to lift says the case was reopened, not that access was restored', async () => {
  await guest(founder, 'select moderate_case($1,$2)', [caseId, 'restore']);
  await guest(founder, 'select moderate_case($1,$2)', [caseId, 'restore']);
  assert.deepEqual((await events()).slice(-2).map(e => e.action), ['access_restored', 'case_reopened']);
});

await check('queue "Mark reviewed" (review_report) records the report decision, then the case closing', async () => {
  await guest(founder, 'select review_report($1)', [reportId]);
  assert.deepEqual((await events()).slice(-2).map(e => [e.action, e.report_id, e.case_id]), [
    ['report_reviewed', reportId, caseId], ['case_reviewed', null, caseId],
  ]);
});

await check('refused or failed actions leave no event', async () => {
  const before = await count();
  await assert.rejects(guest(reporter, "select eject_from_venue($1,$2,'harassment',null)", [removed, venue]), /not authorized/);
  await assert.rejects(guest(reporter, 'select moderate_case($1,$2)', [caseId, 'remove_for_night']), /not authorized/);
  await assert.rejects(guest(reporter, 'select review_report($1)', [reportId]), /not authorized/);
  await assert.rejects(guest(reporter, 'select restore_to_venue($1,$2)', [removed, venue]), /not authorized/);
  await assert.rejects(guest(founder, "select eject_from_venue($1,$2,'bad',null)", [removed, venue]), /invalid ejection reason/);
  await assert.rejects(guest(founder, "select eject_from_venue($1,$2,'other',null)", [randomUUID(), venue]), /foreign key/, 'unknown person');
  await assert.rejects(guest(founder, "select eject_from_venue($1,$2,'other',null)", [removed, randomUUID()]), /no active venue night/);
  await assert.rejects(guest(founder, 'select moderate_case($1,$2)', [caseId, 'ban']), /invalid moderation action/);
  await assert.rejects(guest(founder, 'select moderate_case($1,$2)', [randomUUID(), 'review']), /moderation case not found/);
  await assert.rejects(guest(founder, 'select review_report($1)', [randomUUID()]), /report not found/);
  assert.equal(await count(), before);
});

await check('the history is append-only, even for the database owner', async () => {
  await assert.rejects(db.query("update private.moderation_events set action='access_restored'"), /append-only/);
  await assert.rejects(db.query('delete from private.moderation_events'), /append-only/);
  await assert.rejects(db.query('truncate private.moderation_events'), /append-only/);
});

await check('the end of the night still deletes the removal, and the history survives it', async () => {
  await guest(founder, "select eject_from_venue($1,$2,'other',null)", [reporter, venue]);
  const before = await events();
  await db.query("select private.transition_venue_night($1,'ended','scheduled_end',null)", [night]);
  assert.ok(!(await ejected(removed)) && !(await ejected(reporter)), 'terminal cleanup unchanged');
  assert.deepEqual(await events(), before);
  assert.equal((await guest(founder, 'select * from admin_moderation_history(null,$1)', [night])).length, before.length);
});

await check('the history keeps no note, message, photo or preference', async () => {
  const columns = (await db.query(`select column_name from information_schema.columns
    where table_schema='private' and table_name='moderation_events' order by ordinal_position`)).rows.map(r => r.column_name);
  assert.deepEqual(columns, ['id', 'occurred_at', 'action', 'actor_id', 'target_profile_id', 'venue_night_id', 'case_id', 'report_id', 'reason']);
});

// A future command that removes someone, gives access back or decides a case
// must record it too. Only the guest's own report and the night's terminal
// cleanup touch these tables without being a founder action.
await check('every function that changes a removal or a case writes the history', async () => {
  const writers = (await db.query(`select n.nspname || '.' || p.proname as name, p.prosrc ~* 'insert\\s+into\\s+private\\.moderation_events' as records
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public','private')
      and p.prosrc ~* '(insert\\s+into|delete\\s+from|update)\\s+public\\.(venue_ejections|moderation_cases)'
    order by 1`)).rows;
  const exempt = new Set(['public.submit_report', 'private.transition_venue_night']);
  assert.deepEqual(writers.filter(w => !exempt.has(w.name)).map(w => w.name),
    ['public.eject_from_venue', 'public.moderate_case', 'public.restore_to_venue', 'public.review_report'], 'known founder action paths');
  assert.deepEqual(writers.filter(w => !exempt.has(w.name) && !w.records).map(w => w.name), [], 'a founder action path without history');
});

console.log(`moderation history: ok (${checks} checks)`);
