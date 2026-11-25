// #431: a founder can end an opened night now, through the same transition the
// scheduled end uses. Proves what is erased (presence, likes, matches and their
// messages, removals for the night) and what is kept (profiles, the finalized
// night report, the founder's moderation history, the audit trail), and that the
// result is the same as the cron's end at closes_at.
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
const signedIn = (user, sql, args) => as('authenticated', user, sql, args);
const one = async (sql, args = []) => (await db.query(sql, args)).rows[0];

const founder = randomUUID();
await db.query('insert into auth.users(id) values($1)', [founder]);
await db.query('insert into public.admins(user_id) values($1)', [founder]);

// One night with everything the end must clean or keep: four guests checked
// in, a mutual like (match) with messages, a like that is not mutual, and one
// guest removed for the night by the founder.
async function populatedNight(label, { paused = false } = {}) {
  const venue = randomUUID(), night = randomUUID();
  const [ana, ben, cam, dan] = [randomUUID(), randomUUID(), randomUUID(), randomUUID()];
  for (const [id, name] of [[ana, 'Ana'], [ben, 'Ben'], [cam, 'Cam'], [dan, 'Dan']]) {
    await db.query('insert into auth.users(id) values($1)', [id]);
    await db.query('insert into public.profiles(id,first_name) values($1,$2)', [id, name]);
  }
  await db.query("insert into public.venues(id,slug,name,city,timezone,is_live) values($1,$2,$3,'Paris','Europe/Paris',true)", [venue, `end-${venue}`, label]);
  await db.query(`insert into public.venue_nights(id,venue_id,waiting_opens_at,guaranteed_launch_at,closes_at,status,opened_at,launched_at,launch_reason)
    values($1,$2,now()-interval '2 hours',now()-interval '1 hour',now()+interval '3 hours','live',now()-interval '2 hours',now()-interval '1 hour','threshold')`, [night, venue]);
  for (const id of [ana, ben, cam, dan]) await db.query('insert into public.presence(profile_id,venue_id,venue_night_id) values($1,$2,$3)', [id, venue, night]);
  // Likes are fixture rows here: the eligibility guard (profile completion,
  // consent) is covered by test-like-sql; the match trigger still runs.
  const like = (a, b) => db.query(`insert into public.likes(liker_id,liked_id,venue_id,venue_night_id,expires_at)
    values($1,$2,$3,$4,now()+interval '3 hours')`, [a, b, venue, night]);
  await db.exec('alter table public.likes disable trigger aaa_like_write_guard');
  await like(ana, ben); await like(ben, ana); await like(cam, ana);
  await db.exec('alter table public.likes enable trigger aaa_like_write_guard');
  const match = (await one('select id from public.matches where venue_night_id=$1', [night])).id;
  await db.query("insert into public.messages(match_id,sender_id,body) values($1,$2,'hello'),($1,$3,'hi')", [match, ana, ben]);
  await signedIn(founder, "select eject_from_venue($1,$2,'harassment','Walked out by staff')", [dan, venue]);
  if (paused) await signedIn(founder, 'select close_venue_night($1)', [night]);
  return { venue, night, match, people: [ana, ben, cam, dan] };
}

// The observable state of a night: what the end must erase, and what it must keep.
async function snapshot({ venue, night, match, people }) {
  const n = async (sql, args) => (await one(`select count(*)::int as n from ${sql}`, args)).n;
  const row = await one('select status, terminal_at is not null as terminal, terminal_reason from public.venue_nights where id=$1', [night]);
  return {
    status: row.status, terminal: row.terminal, terminal_reason: row.terminal_reason,
    venue_live: (await one('select is_live from public.venues where id=$1', [venue])).is_live,
    open_presence: await n('public.presence where venue_night_id=$1 and left_at is null', [night]),
    presence_rows: await n('public.presence where venue_night_id=$1', [night]),
    likes: await n('public.likes where venue_night_id=$1', [night]),
    matches: await n('public.matches where venue_night_id=$1', [night]),
    messages: await n('public.messages where match_id=$1', [match]),
    removals: await n('public.venue_ejections where venue_night_id=$1', [night]),
    profiles: await n('public.profiles where id = any($1::uuid[])', [people]),
    report_finalized: (await one('select finalized_at is not null as f from public.venue_night_reports where venue_night_id=$1', [night]))?.f ?? false,
    moderation_events: await n('private.moderation_events where venue_night_id=$1', [night]),
  };
}

await check('only a founder can end a night; guests and anonymous callers are refused before any effect', async () => {
  const subject = await populatedNight('Refusals');
  const before = await snapshot(subject);
  const guest = subject.people[0];
  await assert.rejects(signedIn(guest, 'select end_venue_night_now($1)', [subject.night]), /not authorized/);
  await assert.rejects(as('anon', null, 'select end_venue_night_now($1)', [subject.night]), /permission denied/);
  assert.deepEqual(await snapshot(subject), before, 'a refused call changes nothing');
  const grants = (await db.query(`select r.rolname from pg_roles r
    where has_function_privilege(r.oid, 'public.end_venue_night_now(uuid)', 'execute')
      and r.rolname in ('anon', 'authenticated', 'service_role') order by 1`)).rows.map(r => r.rolname);
  assert.deepEqual(grants, ['authenticated'], 'only signed-in callers reach it, and the function checks the founder');
});

await check('a night that has not opened, an unknown id and a null id are refused', async () => {
  const venue = randomUUID(), night = randomUUID();
  await db.query("insert into public.venues(id,slug,name,city,timezone) values($1,$2,'Later','Paris','Europe/Paris')", [venue, `later-${venue}`]);
  await db.query(`insert into public.venue_nights(id,venue_id,waiting_opens_at,guaranteed_launch_at,closes_at)
    values($1,$2,now()+interval '1 day',now()+interval '25 hours',now()+interval '30 hours')`, [night, venue]);
  await assert.rejects(signedIn(founder, 'select end_venue_night_now($1)', [night]), /night has not opened/);
  assert.equal((await one('select terminal_at from public.venue_nights where id=$1', [night])).terminal_at, null);
  await assert.rejects(signedIn(founder, 'select end_venue_night_now($1)', [randomUUID()]), /venue night not found/);
  await assert.rejects(signedIn(founder, 'select end_venue_night_now(null)'), /venue night not found/);
});

let ended;
await check('ending a live night now erases presence, likes, matches, messages and removals, and keeps profiles, report and history', async () => {
  const subject = await populatedNight('Early end');
  const before = await snapshot(subject);
  assert.deepEqual(before, {
    status: 'live', terminal: false, terminal_reason: null, venue_live: true,
    open_presence: 3, presence_rows: 4, likes: 3, matches: 1, messages: 2, removals: 1,
    profiles: 4, report_finalized: false, moderation_events: 1,
  }, 'the fixture holds everything the end acts on (the removed guest was checked out by the removal)');
  const [{ end_venue_night_now: row }] = await signedIn(founder, 'select end_venue_night_now($1)', [subject.night]);
  assert.match(String(row), new RegExp(subject.night), 'the ended night is returned');
  ended = await snapshot(subject);
  assert.deepEqual(ended, {
    // erased or closed
    status: 'closed', terminal: true, terminal_reason: 'scheduled_end', venue_live: false,
    open_presence: 0, likes: 0, matches: 0, messages: 0, removals: 0,
    // kept
    presence_rows: 4, profiles: 4, report_finalized: true, moderation_events: 1,
  });
  const transition = await one(`select from_status, to_status, event, reason, actor_id from public.venue_night_transitions
    where venue_night_id=$1 order by id desc limit 1`, [subject.night]);
  assert.deepEqual(transition, { from_status: 'live', to_status: 'closed', event: 'ended', reason: 'manual', actor_id: founder },
    'the audit trail says a founder ended it early');
  await assert.rejects(signedIn(founder, 'select end_venue_night_now($1)', [subject.night]), /night has already ended/,
    'a repeated click is refused and adds no second transition');
  assert.equal((await one("select count(*)::int as n from public.venue_night_transitions where venue_night_id=$1 and event='ended'", [subject.night])).n, 1);
});

await check('a paused room can be ended too', async () => {
  const subject = await populatedNight('Paused end', { paused: true });
  const before = await snapshot(subject);
  assert.equal(before.status, 'closed'); assert.equal(before.terminal, false);
  assert.equal(before.matches, 1, 'pausing keeps the match'); assert.equal(before.removals, 1);
  await signedIn(founder, 'select end_venue_night_now($1)', [subject.night]);
  const after = await snapshot(subject);
  assert.equal(after.terminal, true);
  assert.equal(after.matches + after.likes + after.messages + after.removals + after.open_presence, 0);
});

await check('the result is the same as the scheduled end run by the cron at closes_at', async () => {
  const subject = await populatedNight('Scheduled end');
  await db.query("update public.venue_nights set closes_at = now() - interval '1 second' where id=$1", [subject.night]);
  await db.query('select public.run_venue_night_lifecycle()');
  assert.deepEqual(await snapshot(subject), ended, 'early end and scheduled end leave the same state');
});

await db.close();
console.log(`End night now: ${checks} checks passed.`);
