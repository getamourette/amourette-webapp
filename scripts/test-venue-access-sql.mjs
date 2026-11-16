// SEC-001 (#364): a participant session cannot list venues and resolves one
// only by presenting its slug; founder admin tooling keeps its listing.
import { PGlite } from '@electric-sql/pglite';
import assert from 'node:assert/strict';
import { installLikeSchema, read } from './like-test-database.mjs';

const db = new PGlite();
// PGlite's query takes one statement; exec supports migrations.
await installLikeSchema({ query: (sql, args) => args ? db.query(sql, args) : db.exec(sql).then(results => results.at(-1)) });
// The deployed state this fix starts from (20260619000002 and 20260619000004).
await db.exec(`
  alter table public.venues enable row level security;
  create policy venues_select_authenticated on public.venues for select to authenticated using (true);
  grant select on public.venues to authenticated;
  alter table public.venues add constraint venues_slug_key unique (slug);
`);
const nightState = read('supabase/migrations/20260724000010_fix_venue_night_state_ambiguous_columns.sql');
await db.exec(nightState);

const id = () => crypto.randomUUID();
const [outsider, attendee, founder, bar, other] = Array.from({ length: 5 }, id);
for (const user of [outsider, attendee, founder]) await db.query('insert into auth.users values($1)', [user]);
await db.query('insert into admins(user_id) values($1)', [founder]);
for (const [venue, slug, name] of [[bar, 'le-bar', 'Le Bar'], [other, 'other-bar', 'Other Bar']]) {
  await db.query("insert into venues(id,slug,name,city,timezone) values($1,$2,$3,'Paris','Europe/Paris')", [venue, slug, name]);
}
const [barNight, otherNight] = [id(), id()];
for (const [night, venue] of [[barNight, bar], [otherNight, other]]) {
  await db.query(`insert into venue_nights(id,venue_id,status,waiting_opens_at,closes_at)
    values($1,$2,'live',now()-interval '1 hour',now()+interval '1 hour')`, [night, venue]);
}
await db.query("insert into profiles(id,first_name,photo_url,gender,interested_in) values($1,'Test',$2,'woman',array['man'])",
  [attendee, `${attendee}/test.jpg`]);
// Attendance that has ended still lets the chat header and the correction
// return resolve the venue they join on.
await db.query('insert into presence(profile_id,venue_id,venue_night_id,left_at) values($1,$2,$3,now())', [attendee, bar, barNight]);

async function as(user, sql, args = [], role = 'authenticated') {
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [user ?? '']);
  await db.query(`set role ${role}`);
  try { return (await db.query(sql, args)).rows; }
  finally { await db.query('reset role'); }
}
const listed = async user => (await as(user, 'select slug from venues order by slug')).map(row => row.slug);

// Starting point: the finding reproduces, so the assertions below are not vacuous.
assert.deepEqual(await listed(outsider), ['le-bar', 'other-bar']);

await db.exec(read('supabase/migrations/20261116000001_venue_by_slug.sql'));
// Step 1 alone changes nothing for the client that is still deployed.
assert.deepEqual(await listed(outsider), ['le-bar', 'other-bar']);
await db.exec(read('supabase/migrations/20261116000002_close_venue_listing.sql'));

// A participant session cannot list venues, with or without a filter that
// does not come from the slug lookup.
assert.deepEqual(await listed(outsider), []);
assert.deepEqual(await as(outsider, 'select id from venues where id=$1', [bar]), []);
assert.deepEqual(await as(outsider, 'select id from venues where slug=$1', ['le-bar']), []);
assert.deepEqual(await as(outsider, "select id from venues where slug like '%'"), []);

// Presenting the slug returns that venue and nothing else.
assert.deepEqual(await as(outsider, 'select * from venue_by_slug($1)', ['le-bar']),
  [{ id: bar, slug: 'le-bar', name: 'Le Bar', city: 'Paris', timezone: 'Europe/Paris' }]);
for (const slug of ['unknown', '', null, '%', 'le-%', 'LE-BAR', ' le-bar', 'le-bar ', 'a'.repeat(81)]) {
  assert.deepEqual(await as(outsider, 'select * from venue_by_slug($1)', [slug]), [], `slug ${JSON.stringify(slug)}`);
}
// The night state stays reachable with the id that lookup returned.
const [{ id: resolved }] = await as(outsider, 'select id from venue_by_slug($1)', ['le-bar']);
assert.equal((await as(outsider, 'select venue_night_id from venue_night_state($1)', [resolved]))[0].venue_night_id, barNight);

// No session at all: neither the table nor the lookup.
await assert.rejects(as(null, 'select id from venues', [], 'anon'), /permission denied/);
await assert.rejects(as(null, 'select * from venue_by_slug($1)', ['le-bar'], 'anon'), /permission denied/);

// A participant keeps the venue they attended (chat header, correction
// return), and only that one.
assert.deepEqual(await listed(attendee), ['le-bar']);
assert.deepEqual(await as(attendee,
  `select v.slug from presence p join venues v on v.id=p.venue_id where p.profile_id=$1`, [attendee]), [{ slug: 'le-bar' }]);

// Founder admin tooling still lists every venue.
assert.deepEqual(await listed(founder), ['le-bar', 'other-bar']);

// The helper is not a PostgREST RPC and the old policy is gone.
assert.deepEqual((await db.query("select policyname from pg_policies where schemaname='public' and tablename='venues' and cmd='SELECT'")).rows,
  [{ policyname: 'venues_select_admin_or_attended' }]);
assert.equal((await db.query("select n.nspname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where p.proname='my_attended_venue_ids'")).rows[0].nspname, 'private');

console.log('venue access SQL tests passed');
