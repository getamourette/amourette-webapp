// SEC-005 (#368): a participant removed for the night loses every read path to
// the people they matched with that night, while the partner keeps a coherent
// paused chat. Giving access back restores the reads; nothing is deleted.
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
async function as(user, sql, args = []) {
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [user]);
  await db.exec('set role authenticated');
  try { return (await db.query(sql, args)).rows; } finally { await db.exec('reset role'); }
}

const [founder, removed, partner, reporter, later, bystander] = Array.from({ length: 6 }, () => randomUUID());
for (const id of [founder, removed, partner, reporter, later, bystander]) await db.query('insert into auth.users(id) values($1)', [id]);
await db.query('insert into public.admins(user_id) values($1)', [founder]);
for (const [id, name] of [[removed, 'Removed'], [partner, 'Partner'], [reporter, 'Reporter'], [later, 'Later'], [bystander, 'Bystander']]) {
  await db.query("insert into public.profiles(id,first_name,bio) values($1,$2,'Hello')", [id, name]);
}

// A distinct partner per night, so an earlier night's match cannot answer for this one.
async function nightWithMatch(partner) {
  const venue = randomUUID(), night = randomUUID();
  await db.query("insert into public.venues(id,slug,name,city,timezone,is_live) values($1,$2,'Removal bar','Paris','Europe/Paris',true)", [venue, `removal-${venue}`]);
  await db.query(`insert into public.venue_nights(id,venue_id,waiting_opens_at,guaranteed_launch_at,closes_at,status,opened_at,launched_at,launch_reason)
    values($1,$2,now()-interval '2 hours',now()-interval '1 hour',now()+interval '3 hours','live',now()-interval '2 hours',now()-interval '1 hour','threshold')`, [night, venue]);
  // One active presence per profile: everyone moves on from the previous night.
  await db.query('update public.presence set left_at=now() where left_at is null');
  for (const id of [removed, partner, bystander]) {
    await db.query('insert into public.presence(profile_id,venue_id,venue_night_id) values($1,$2,$3)', [id, venue, night]);
  }
  const [a, b] = [removed, partner].sort();
  const [{ id: match }] = (await db.query(`insert into public.matches(profile_a,profile_b,venue_id,venue_night_id,expires_at) values($1,$2,$3,$4,now()+interval '3 hours') returning id`, [a, b, venue, night])).rows;
  await db.query("insert into public.messages(match_id,sender_id,body) values($1,$2,'See you at the bar')", [match, partner]);
  return { venue, night, match };
}

// Everything a participant can read about a match and the person behind it.
async function reads(user, match, other) {
  return {
    matches: (await as(user, 'select id from public.matches where id=$1', [match])).length,
    messages: (await as(user, 'select id from public.messages where match_id=$1', [match])).length,
    partnerCard: (await as(user, 'select id from public.chat_partner_state($1)', [match])).length,
    partnerProfile: (await as(user, 'select id from public.profiles where id=$1', [other])).length,
    presence: await as(user, 'select * from public.match_presence_state($1)', [match]).then(rows => rows[0], error => error.message),
  };
}
const nothing = { matches: 0, messages: 0, partnerCard: 0, partnerProfile: 0, presence: 'match not available' };

const first = await nightWithMatch(partner);

await check('before removal both participants read their match', async () => {
  assert.deepEqual(await reads(removed, first.match, partner),
    { matches: 1, messages: 1, partnerCard: 1, partnerProfile: 1, presence: { me_is_present: true, other_is_present: true } });
});

await check('removed at the door (eject_from_venue): the removed identity reads nothing about the match', async () => {
  await as(founder, "select public.eject_from_venue($1,$2,'harassment',null)", [removed, first.venue]);
  assert.deepEqual(await reads(removed, first.match, partner), nothing);
});

await check('the partner keeps a coherent, paused chat', async () => {
  assert.deepEqual(await reads(partner, first.match, removed),
    { matches: 1, messages: 1, partnerCard: 1, partnerProfile: 1, presence: { me_is_present: true, other_is_present: false } });
  await assert.rejects(as(removed, "insert into public.messages(match_id,sender_id,body) values($1,$2,'Still here?')", [first.match, removed]), /row-level security/);
});

await check('the removal deletes nothing, and giving access back restores the reads', async () => {
  assert.equal((await db.query('select count(*)::int n from public.messages where match_id=$1', [first.match])).rows[0].n, 1);
  await as(founder, 'select public.restore_to_venue($1,$2)', [removed, first.venue]);
  const back = await reads(removed, first.match, partner);
  assert.deepEqual({ ...back, presence: undefined }, { matches: 1, messages: 1, partnerCard: 1, partnerProfile: 1, presence: undefined });
  assert.deepEqual(back.presence, { me_is_present: false, other_is_present: true }, 'presence stays closed until they check in again');
});

await check('removed from a moderation case (moderate_case remove_for_night): same result', async () => {
  const second = await nightWithMatch(reporter);
  await as(reporter, "select public.submit_report($1,$2,'harassment',null)", [removed, second.night]);
  const [{ id: caseId }] = (await db.query('select id from public.moderation_cases where reported_id=$1 and venue_night_id=$2', [removed, second.night])).rows;
  await as(founder, "select public.moderate_case($1,'remove_for_night')", [caseId]);
  assert.deepEqual(await reads(removed, second.match, reporter), nothing);
  assert.equal((await reads(reporter, second.match, removed)).messages, 1);
});

await check('a removal from another night does not hide this night', async () => {
  const third = await nightWithMatch(later);
  assert.deepEqual({ ...(await reads(removed, third.match, later)), presence: undefined },
    { matches: 1, messages: 1, partnerCard: 1, partnerProfile: 1, presence: undefined });
});

console.log(`${checks} removed-participant access checks passed`);
