import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist';
import { moddatetime } from '@electric-sql/pglite/contrib/moddatetime';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { uuid_ossp } from '@electric-sql/pglite/contrib/uuid_ossp';

// #481: a guest who hid her profile must stay hidden on every way back into the
// same night, decided by check_in itself, and nobody else can make her visible.
// Built from the whole migrations directory, as production is.
const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const db = new PGlite({ extensions: { btree_gist, moddatetime, pgcrypto, uuid_ossp } });
try {
  await db.exec(read('tests/helpers/supabase-platform.sql'));
  for (const file of readdirSync(new URL('../supabase/migrations', import.meta.url)).filter(f => f.endsWith('.sql')).sort()) {
    await db.exec(read(`supabase/migrations/${file}`).replace(/create extension if not exists (pg_cron|pg_net)[^;]*;/gi, ''));
  }
  const venue = slug => db.query('select id from public.venues where slug=$1', [slug]).then(r => r.rows[0].id);
  const crowded = await venue('test-crowded');
  const other = await venue('test-empty');
  const night = (await db.query('select id from public.venue_nights where venue_id=$1', [crowded])).rows[0].id;
  const [alice, bob, founder] = [crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID()];
  // check_in needs only an adult-confirmed profile; discovery is gated on is_visible.
  for (const id of [alice, bob, founder]) {
    await db.query('insert into auth.users(id) values($1)', [id]);
    await db.query("insert into public.profiles(id,first_name,photo_url) values($1,'Test',$2)", [id, `${id}/photo.jpg`]);
    await db.query('insert into public.profile_private(id,adult_confirmed_at) values($1,now())', [id]);
  }
  await db.query('insert into public.admins(user_id) values($1)', [founder]);

  // Every statement below runs as the signed-in participant, through the same
  // grants and policies as the browser.
  async function as(user, sql, args = []) {
    await db.exec(`select set_config('request.jwt.claim.sub','${user}',false); set role authenticated;`);
    try { return (await db.query(sql, args)).rows; } finally { await db.exec('reset role'); }
  }
  const checkIn = (user, at = crowded) => as(user, 'select id,is_visible,left_at,venue_night_id from public.check_in($1)', [at]).then(r => r[0]);
  const hide = user => as(user, 'update public.presence set is_visible=false where profile_id=$1 and left_at is null returning id', [user]);
  const leave = user => as(user, 'update public.presence set left_at=now() where profile_id=$1 and left_at is null returning id', [user]);
  const active = user => db.query('select is_visible from public.presence where profile_id=$1 and left_at is null', [user]).then(r => r.rows);

  assert.equal((await checkIn(alice)).is_visible, true, 'a first entry into the night is visible');
  await checkIn(bob);
  assert.equal((await hide(alice)).length, 1);

  // Join tonight / Join again after leaving, a reload or a new QR scan of an
  // ended presence: all of them reach check_in with no active row.
  assert.equal((await leave(alice)).length, 1);
  const rejoined = await checkIn(alice);
  assert.equal(rejoined.left_at, null);
  assert.equal(rejoined.is_visible, false, 'Rejoin after leaving keeps a hidden guest hidden');
  assert.deepEqual(await active(alice), [{ is_visible: false }]);

  // Reload or wake with the presence still active: the same row is kept.
  assert.equal((await checkIn(alice)).id, rejoined.id);
  assert.deepEqual(await active(alice), [{ is_visible: false }], 'a repeated check-in keeps her hidden');

  // A founder pauses and reopens: every presence ended, the paused screen checks in again.
  await as(founder, 'select public.close_venue_night($1)', [night]);
  assert.deepEqual(await active(alice), [], 'the pause ends her presence');
  await as(founder, 'select public.reopen_venue_night($1)', [night]);
  assert.equal((await checkIn(alice)).is_visible, false, 'the return after a pause keeps her hidden');

  // Another participant's modified client cannot make her visible.
  assert.deepEqual(await as(bob, 'update public.presence set is_visible=true where profile_id=$1 returning id', [alice]), []);
  await checkIn(bob);
  assert.deepEqual(await active(alice), [{ is_visible: false }], 'nobody else can reveal her');

  // Her own later choice is what carries over: visible, then leave and return.
  await as(alice, 'update public.presence set is_visible=true where profile_id=$1 and left_at is null', [alice]);
  await leave(alice);
  assert.equal((await checkIn(alice)).is_visible, true, 'a guest who made herself visible again returns visible');

  // Hidden is a per-night choice: another night starts visible.
  await hide(alice);
  const elsewhere = await checkIn(alice, other);
  assert.notEqual(elsewhere.venue_night_id, night);
  assert.equal(elsewhere.is_visible, true, 'a different night starts visible');
  console.log('PASS #481 a hidden guest stays hidden on Rejoin, repeated check-in and pause; nobody else can reveal her');
} finally {
  await db.close();
}
