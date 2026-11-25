// #258: a founder deletes a guest's account on a verified request. The database
// side has two parts: admin_account_deletion_check() says whether it may happen
// now (founders only, never a founder account, never while a report, case or
// removal is open), and the Auth account deletion cascades through every table
// that names the person, except the records kept on purpose. The check scans
// every uuid column of the application, so a new table that keeps the person's
// id after deletion fails here until it is listed with its reason.
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
const verdict = async (founder, profile) => (await guest(founder, 'select admin_account_deletion_check($1) v', [profile]))[0].v;

// Every base-table uuid column of the application schemas holding this id.
async function holders(id) {
  const columns = (await db.query(`select c.table_schema, c.table_name, c.column_name from information_schema.columns c
    join information_schema.tables t on t.table_schema = c.table_schema and t.table_name = c.table_name and t.table_type = 'BASE TABLE'
    where c.table_schema in ('public','private') and c.data_type = 'uuid' order by 1,2,3`)).rows;
  const found = [];
  for (const { table_schema, table_name, column_name } of columns) {
    const { rows } = await db.query(`select count(*)::int n from "${table_schema}"."${table_name}" where "${column_name}" = $1`, [id]);
    if (rows[0].n) found.push(`${table_schema}.${table_name}.${column_name}`);
  }
  return found;
}

const [founder, otherFounder, alice, bob] = [randomUUID(), randomUUID(), randomUUID(), randomUUID()];
for (const id of [founder, otherFounder, alice, bob]) await db.query('insert into auth.users(id) values($1)', [id]);
await db.query('insert into public.admins(user_id) values($1),($2)', [founder, otherFounder]);
for (const [id, name] of [[alice, 'Alice'], [bob, 'Bob']]) {
  await db.query('insert into public.profiles(id,first_name) values($1,$2)', [id, name]);
  await db.query('insert into public.profile_private(id,adult_confirmed_at) values($1,now())', [id]);
}
const venue = randomUUID(), night = randomUUID();
await db.query("insert into public.venues(id,slug,name,city,timezone,is_live) values($1,$2,'Deletion bar','Paris','Europe/Paris',true)", [venue, `deletion-${venue}`]);
await db.query(`insert into public.venue_nights(id,venue_id,waiting_opens_at,guaranteed_launch_at,closes_at,status,opened_at,launched_at,launch_reason)
  values($1,$2,now()-interval '2 hours',now()-interval '1 hour',now()+interval '3 hours','live',now()-interval '2 hours',now()-interval '1 hour','threshold')`, [night, venue]);
for (const id of [alice, bob]) await db.query('insert into public.presence(profile_id,venue_id,venue_night_id) values($1,$2,$3)', [id, venue, night]);

await check('only a founder may ask, and asking deletes nothing', async () => {
  await assert.rejects(guest(bob, 'select admin_account_deletion_check($1)', [alice]), /not authorized/);
  await assert.rejects(as('anon', null, 'select admin_account_deletion_check($1)', [alice]), /permission denied/);
  await assert.rejects(as('service_role', null, 'select admin_account_deletion_check($1)', [alice]), /permission denied/);
  await assert.rejects(guest(founder, 'select admin_account_deletion_check(null)'), /profile required/);
  assert.equal(await verdict(founder, alice), 'ready');
  assert.equal((await db.query('select count(*)::int n from public.profiles where id=$1', [alice])).rows[0].n, 1);
});

await check('never the founder herself, never another founder; an unknown id reads as gone', async () => {
  assert.equal(await verdict(founder, founder), 'self');
  assert.equal(await verdict(founder, otherFounder), 'founder');
  assert.equal(await verdict(founder, randomUUID()), 'gone');
});

let reportId;
await check('an undecided report, made or received, holds the deletion of both people', async () => {
  reportId = (await guest(alice, "select submit_report($1,$2,'unsafe_behavior',null) id", [bob, night]))[0].id;
  assert.equal(await verdict(founder, alice), 'open_report', 'the reporter');
  assert.equal(await verdict(founder, bob), 'open_report', 'the reported person');
  await guest(founder, 'select review_report($1)', [reportId]);
  assert.equal(await verdict(founder, alice), 'ready');
  assert.equal(await verdict(founder, bob), 'ready', 'the case closes with its last report');
});

await check('a case waiting for review holds it', async () => {
  await db.query("update public.moderation_cases set status='pending_review' where reported_id=$1", [bob]);
  assert.equal(await verdict(founder, bob), 'open_case');
  await db.query("update public.moderation_cases set status='reviewed' where reported_id=$1", [bob]);
  assert.equal(await verdict(founder, bob), 'ready');
});

await check('a removal from a night still running holds it; restored, it may go', async () => {
  await guest(founder, "select eject_from_venue($1,$2,'harassment')", [alice, venue]);
  assert.equal(await verdict(founder, alice), 'removed');
  await guest(founder, 'select restore_to_venue($1,$2)', [alice, venue]);
  await db.query('insert into public.presence(profile_id,venue_id,venue_night_id) values($1,$2,$3) on conflict do nothing', [alice, venue, night]);
  assert.equal(await verdict(founder, alice), 'ready');
});

// Everything else a guest leaves behind in one night. Written as the database
// owner with the application's guards switched off for setup only (likes and
// matches need approved photos and consent; their own tests cover that); the
// deletion below runs with every trigger and cascade active.
const [matchId, otherVenue] = [randomUUID(), randomUUID()];
await db.exec('set session_replication_role = replica');
await db.query(`insert into public.likes(liker_id,liked_id,venue_id,venue_night_id,expires_at) values($1,$2,$3,$4,now()+interval '3 hours'),($2,$1,$3,$4,now()+interval '3 hours')`, [alice, bob, venue, night]);
const [a, b] = [alice, bob].sort();
await db.query(`insert into public.matches(id,profile_a,profile_b,venue_id,venue_night_id,expires_at) values($1,$2,$3,$4,$5,now()+interval '3 hours')`, [matchId, a, b, venue, night]);
await db.query(`insert into public.messages(match_id,sender_id,body) values($1,$2,'Hello'),($1,$3,'Hi')`, [matchId, alice, bob]);
await db.query(`insert into public.venue_feedback(profile_id,venue_night_id,body) values($1,$2,'Great night')`, [alice, night]);
await db.query(`insert into public.venue_scan_events(user_id,venue_id,night,venue_night_id) values($1,$2,current_date,$3)`, [alice, venue, night]);
await db.query(`insert into public.analytics_events(event_name,user_id,session_id,venue_id,venue_night_id,properties) values('session_started',$1,'session-0001',$2,$3,'{}')`, [alice, venue, night]);
await db.query(`insert into public.email_subscriptions(user_id,email,locale,source,consent_version) values($1,'alice@example.com','en','room_popup','global-live-night-email-v1')`, [alice]);
await db.query(`insert into private.matching_consent_events(revision,profile_id,action,version,locale,occurred_at) values($1,$2,'granted','v1','en',now())`, [randomUUID(), alice]);
await db.query(`insert into public.photo_versions(profile_id,path,status) values($1,$2,'approved')`, [alice, `${alice}/photo.webp`]);
await db.query("insert into public.venues(id,slug,name,city,timezone,is_live) values($1,$2,'Other bar','Paris','Europe/Paris',true)", [otherVenue, `other-${otherVenue}`]);
await db.query(`insert into public.blocks(blocker_id,blocked_id,venue_id,reason) values($1,$2,$3,'harassment')`, [bob, alice, otherVenue]);
await db.exec('reset session_replication_role');

// Kept on purpose, each with its reason (docs/decisions/2026-11-25-founder-account-deletion.md).
const KEPT = [
  'private.matching_consent_events.profile_id', // consent proof: 12 months after account deletion (data register)
  'private.moderation_events.target_profile_id', // founder action history (#234), bare id, retention undecided
  'private.night_intervals.person_id', // night report source (#257): bare id, deleted when the night is finalized
  'private.night_people.person_id', // same, so the night's counters stay right
];

let before;
await check('before: the guest is named across the application', async () => {
  before = await holders(alice);
  for (const expected of ['public.profiles.id', 'public.profile_private.id', 'public.presence.profile_id', 'public.likes.liker_id',
    'public.likes.liked_id', 'public.matches.profile_a', 'public.messages.sender_id', 'public.blocks.blocked_id', 'public.reports.reporter_id',
    'public.venue_feedback.profile_id', 'public.venue_scan_events.user_id', 'public.analytics_events.user_id', 'public.email_subscriptions.user_id',
    'public.photo_versions.profile_id', ...KEPT]) {
    assert.ok(before.includes(expected) || (expected === 'public.matches.profile_a' && before.includes('public.matches.profile_b')), `fixture names the guest in ${expected}`);
  }
});

await check('the account deletion removes every row naming the guest except the records kept on purpose', async () => {
  // What the Auth Admin API's deleteUser does in the database.
  await db.query('delete from auth.users where id=$1', [alice]);
  const after = await holders(alice);
  assert.deepEqual(after, KEPT, `left after deletion: ${after.join(', ')}`);
  assert.ok(before.length > after.length + 10, 'the deletion removed rows from many tables');
});

await check('the other guest keeps the account, loses the shared match, and the history still reads', async () => {
  assert.equal((await db.query('select count(*)::int n from public.profiles where id=$1', [bob])).rows[0].n, 1);
  assert.equal((await db.query('select count(*)::int n from public.matches where id=$1', [matchId])).rows[0].n, 0);
  assert.equal((await db.query('select count(*)::int n from public.messages where sender_id=$1', [bob])).rows[0].n, 0, 'the chat goes with the match');
  assert.equal((await db.query('select count(*)::int n from public.likes where liker_id=$1', [bob])).rows[0].n, 0);
  const history = await guest(founder, 'select * from admin_moderation_history()');
  assert.ok(history.length >= 3, 'removal, restoration and report decision remain');
  assert.equal(await verdict(founder, alice), 'gone', 'a retry finds the account already gone');
});

console.log(`account deletion SQL: ${checks} checks passed`);
