import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist';
import { moddatetime } from '@electric-sql/pglite/contrib/moddatetime';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { uuid_ossp } from '@electric-sql/pglite/contrib/uuid_ossp';

// #560: the end of a night deletes its likes, matches and messages. Every total
// of the night must be read back from the durable report afterwards, on each
// path that ends a night: booked, arrived, absent, door arrival times, gender
// split (room and bookings), likes, matches and opened conversations. Built
// from the whole migrations directory, as production is.
const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const db = new PGlite({ extensions: { btree_gist, moddatetime, pgcrypto, uuid_ossp } });
const one = async (sql, args = []) => (await db.query(sql, args)).rows[0];
try {
  await db.exec(read('tests/helpers/supabase-platform.sql'));
  for (const file of readdirSync(new URL('../supabase/migrations', import.meta.url)).filter(f => f.endsWith('.sql')).sort()) {
    await db.exec(read(`supabase/migrations/${file}`).replace(/create extension if not exists (pg_cron|pg_net)[^;]*;/gi, ''));
  }
  await db.exec("set timezone='UTC'");
  const founder = crypto.randomUUID();
  await db.query('insert into auth.users(id) values($1)', [founder]);
  await db.query('insert into public.admins(user_id) values($1)', [founder]);
  const genders = ['woman', 'woman', 'woman', 'man', 'man', 'nonbinary'];
  const people = [];
  for (const gender of genders) {
    const id = crypto.randomUUID();
    people.push(id);
    await db.query('insert into auth.users(id) values($1)', [id]);
    // Gender needs matching consent; its foreign key is deferred to the commit.
    await db.exec(`begin;
      select private.record_matching_consent('${id}',gen_random_uuid(),'matching-v1-draft','en');
      insert into public.profiles(id,first_name,photo_url,gender,interested_in) values('${id}','Test','${id}/photo.jpg','${gender}',array['woman','man','nonbinary']);
      commit;`);
    await db.query('insert into public.profile_private(id,adult_confirmed_at) values($1,now())', [id]);
  }
  const venue = (await one("insert into public.venues(slug,name,city,timezone) values('snapshot-bar','Snapshot Bar','Paris','Europe/Paris') returning id")).id;

  // A live night, opened an hour ago, then its booking event.
  async function liveNight() {
    const night = (await one(`insert into public.venue_nights(venue_id,waiting_opens_at,guaranteed_launch_at,closes_at,status,opened_at,launched_at,launch_reason,stats_started_at)
      values($1,now()-interval '1 hour',now()-interval '30 minutes',now()+interval '3 hours','live',now()-interval '1 hour',now()-interval '30 minutes','manual',now()-interval '2 hours') returning id`,
      [venue])).id;
    return night;
  }
  const addEvent = night => db.query("insert into private.launch_events(night_id,registration_opens_at,capacity,deposit_minor,currency,policy_version) select id,waiting_opens_at-interval '7 days',20,1000,'eur','launch-v1' from public.venue_nights where id=$1", [night]);
  async function book(night, { gender = null, state = 'confirmed', paid = true, arrivedAt = null, noShow = false }) {
    const id = crypto.randomUUID();
    await db.query(`insert into private.launch_reservations(id,night_id,email,first_name,locale,policy_version,late_cancellation_acknowledged,hold_until,state,confirmed_at,cancelled_at,cancellation_refundable,gender,created_at,accepted_at)
      values($1,$2,$3,'Guest','en','launch-v1',true,now()+interval '1 hour',$4,case when $4 in ('confirmed','cancelled') then now() end,case when $4='cancelled' then now() end,case when $4='cancelled' then true end,$5,now()-interval '1 day',now()-interval '1 day')`,
      [id, night, `guest-${id.slice(0, 8)}@example.com`, state, gender]);
    await db.query(`insert into private.launch_payments(reservation_id,amount_minor,currency,state,payment_id,paid_at)
      values($1,1000,'eur',$2,$3,case when $2='paid' then now() end)`, [id, paid ? 'paid' : 'pending', paid ? `pi_${id.slice(0, 8)}` : null]);
    if (arrivedAt) await db.query("insert into private.launch_arrivals(reservation_id,outcome,verified_at,method) values($1,'verified',$2,'qr')", [id, arrivedAt]);
    if (noShow) await db.query("insert into private.launch_arrivals(reservation_id,outcome) values($1,'no_show')", [id]);
    return id;
  }
  async function roomActivity(night) {
    for (const id of people) await db.query('insert into public.presence(profile_id,venue_id,venue_night_id,checked_in_at) values($1,$2,$3,now()-interval \'1 hour\')', [id, venue, night]);
    const like = (a, b) => db.query('insert into public.likes(liker_id,liked_id,venue_id,venue_night_id) values($1,$2,$3,$4)', [people[a], people[b], venue, night]);
    // Three mutual pairs and two one-way likes: 8 likes, 3 matches.
    for (const [a, b] of [[0, 3], [3, 0], [1, 4], [4, 1], [2, 5], [5, 2], [0, 4], [1, 3]]) await like(a, b);
    const matches = (await db.query('select id,profile_a,profile_b from public.matches where venue_night_id=$1 order by created_at,id', [night])).rows;
    assert.equal(matches.length, 3, 'fixture: three mutual matches');
    // Two conversations opened, one of them answered.
    await db.query("insert into public.messages(match_id,sender_id,body) values($1,$2,'hi'),($1,$3,'hello')", [matches[0].id, matches[0].profile_a, matches[0].profile_b]);
    await db.query("insert into public.messages(match_id,sender_id,body) values($1,$2,'hey')", [matches[1].id, matches[1].profile_a]);
  }
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [founder]);
  const report = night => one('select * from public.admin_venue_night_report($1)', [night]);
  function assertEveryFigure(r, { booked, arrived, absent, arrivalTimes, bookingsByGender }) {
    assert.ok(r.finalized_at, 'the report is final');
    assert.equal(r.participants, 6);
    assert.deepEqual(r.gender_mix, { woman: 3, man: 2, nonbinary: 1 });
    assert.equal(r.likes, 8);
    assert.equal(r.matches, 3);
    assert.equal(r.conversations, 2);
    assert.equal(r.replies, 1);
    assert.deepEqual(r.likes_by_gender.map(g => [g.gender, g.sent, g.received]), [['man', 2, 4], ['nonbinary', 1, 1], ['woman', 5, 3]]);
    assert.equal(r.booked, booked, 'booked');
    assert.equal(r.arrived, arrived, 'arrived');
    assert.equal(r.absent, absent, 'absent');
    assert.deepEqual(r.arrival_times.map(b => [new Date(b.at).toISOString(), b.count]), arrivalTimes, 'arrival times');
    assert.deepEqual(r.bookings_by_gender, bookingsByGender, 'bookings by gender');
  }
  async function assertPurged(night) {
    for (const table of ['public.likes', 'public.matches', 'private.night_people', 'private.night_conversations']) {
      assert.equal((await one(`select count(*)::int n from ${table} where venue_night_id=$1`, [night])).n, 0, `${table} purged`);
    }
    assert.equal((await one('select count(*)::int n from public.messages')).n, 0, 'messages purged');
  }

  // Path 1: the scheduled end, through the minute job, after closes_at. The room
  // is used while the night is live, then the fixture moves the night to a fixed
  // past evening (20:00 to 01:00 Paris) before its booking event exists, since
  // a booking event freezes the schedule.
  const scheduled = await liveNight();
  await roomActivity(scheduled);
  await db.query(`update public.venue_nights set stats_started_at='2026-11-20T18:00:00Z',waiting_opens_at='2026-11-20T19:00:00Z',opened_at='2026-11-20T19:00:00Z',
    guaranteed_launch_at='2026-11-20T19:30:00Z',launched_at='2026-11-20T19:30:00Z',closes_at='2026-11-21T00:00:00Z' where id=$1`, [scheduled]);
  await addEvent(scheduled);
  await book(scheduled, { gender: 'woman', arrivedAt: '2026-11-20T19:05:00Z' });
  await book(scheduled, { gender: 'woman', arrivedAt: '2026-11-20T19:29:59Z' });
  await book(scheduled, { gender: 'man', arrivedAt: '2026-11-20T20:10:00Z' });
  await book(scheduled, { gender: 'man', noShow: true });
  await book(scheduled, { gender: null });
  await book(scheduled, { gender: 'nonbinary', state: 'cancelled' });
  await book(scheduled, { gender: 'woman', state: 'holding', paid: false });
  await db.query('select public.run_venue_night_lifecycle()');
  assert.equal((await one('select terminal_reason from public.venue_nights where id=$1', [scheduled])).terminal_reason, 'scheduled_end');
  await assertPurged(scheduled);
  const expected = {
    booked: 5, arrived: 3, absent: 2,
    arrivalTimes: [['2026-11-20T19:00:00.000Z', 2], ['2026-11-20T20:00:00.000Z', 1]],
    bookingsByGender: [
      { gender: 'woman', booked: 2, arrived: 2 }, { gender: 'man', booked: 2, arrived: 1 },
      { gender: 'nonbinary', booked: 0, arrived: 0 }, { gender: 'unspecified', booked: 1, arrived: 0 },
    ],
  };
  assertEveryFigure(await report(scheduled), expected);

  // The gender answers are erased from the reservations 30 days later (#388);
  // the stored totals do not move, and finalizing again rewrites nothing.
  const frozen = await report(scheduled);
  await db.query('update private.launch_reservations set gender=null where night_id=$1', [scheduled]);
  await db.query('select private.finalize_night_report($1)', [scheduled]);
  assert.deepEqual(await report(scheduled), frozen, 'the snapshot survives the gender erasure and a repeated finalization');

  // Path 2: a founder ends the night early from the admin (#431), through the
  // signed-in RPC. Bookings not verified yet count as absent at that moment.
  const early = await liveNight();
  await addEvent(early);
  await book(early, { gender: 'woman', arrivedAt: new Date(Date.now() - 50 * 60 * 1000).toISOString() });
  await book(early, { gender: 'nonbinary' });
  await roomActivity(early);
  await db.exec('set role authenticated');
  try { await db.query('select public.end_venue_night_now($1)', [early]); } finally { await db.exec('reset role'); }
  assert.equal((await one("select reason from public.venue_night_transitions where venue_night_id=$1 and event='ended'", [early])).reason, 'manual');
  await assertPurged(early);
  const earlyReport = await report(early);
  assertEveryFigure(earlyReport, {
    booked: 2, arrived: 1, absent: 1,
    arrivalTimes: earlyReport.arrival_times.map(b => [new Date(b.at).toISOString(), b.count]),
    bookingsByGender: [
      { gender: 'woman', booked: 1, arrived: 1 }, { gender: 'man', booked: 0, arrived: 0 },
      { gender: 'nonbinary', booked: 1, arrived: 0 }, { gender: 'unspecified', booked: 0, arrived: 0 },
    ],
  });
  assert.equal(earlyReport.arrival_times.length, 1);
  assert.equal(new Date(earlyReport.arrival_times[0].at).getUTCMinutes() % 30, 0, 'arrival buckets are half hours');

  // Path 3: a cancelled night keeps its room totals; booking totals mean nothing.
  const cancelled = await liveNight();
  await addEvent(cancelled);
  await book(cancelled, { gender: 'woman' });
  await roomActivity(cancelled);
  await db.query("select private.transition_venue_night($1,'cancelled')", [cancelled]);
  await assertPurged(cancelled);
  const cancelledReport = await report(cancelled);
  assert.equal(cancelledReport.likes, 8);
  assert.equal(cancelledReport.matches, 3);
  for (const key of ['booked', 'arrived', 'absent', 'arrival_times', 'bookings_by_gender']) assert.equal(cancelledReport[key], null, `${key} on a cancelled night`);

  // Same transaction as the purge: if the booking snapshot fails, the night does
  // not end and nothing is deleted. The failure is provoked in the real helper.
  const failing = await liveNight();
  await addEvent(failing);
  await book(failing, { gender: 'woman' });
  await roomActivity(failing);
  const helper = (await one("select pg_get_functiondef('private.night_booking_totals(uuid)'::regprocedure) def")).def;
  await db.exec(`create or replace function private.night_booking_totals(p_id uuid, out booked integer, out arrived integer, out absent integer, out arrival_times jsonb, out bookings_by_gender jsonb)
    language plpgsql as $$begin raise exception 'synthetic snapshot failure'; end$$`);
  await assert.rejects(() => db.query("select private.transition_venue_night($1,'ended')", [failing]), /synthetic snapshot failure/);
  await db.exec(helper);
  assert.equal((await one('select terminal_at from public.venue_nights where id=$1', [failing])).terminal_at, null, 'the night did not end');
  assert.equal((await one('select count(*)::int n from public.likes where venue_night_id=$1', [failing])).n, 8, 'likes kept');
  assert.equal((await one('select count(*)::int n from public.matches where venue_night_id=$1', [failing])).n, 3, 'matches kept');
  assert.equal((await one('select count(*)::int n from public.venue_night_reports where venue_night_id=$1', [failing])).n, 0, 'no report');
  await db.query("select private.transition_venue_night($1,'ended')", [failing]);
  assert.equal((await report(failing)).booked, 1, 'the next attempt stores the snapshot');

  // A night without a booking event keeps nulls for the booking totals.
  const unbooked = (await one(`insert into public.venue_nights(venue_id,waiting_opens_at,guaranteed_launch_at,closes_at,status,opened_at)
    values($1,now()-interval '1 hour',now()-interval '30 minutes',now()+interval '1 hour','waiting',now()-interval '1 hour') returning id`, [venue])).id;
  await db.query("select private.transition_venue_night($1,'ended')", [unbooked]);
  assert.equal((await report(unbooked)).booked, null);

  // The totals stay founder-only: no participant reads the report or the helper.
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [people[0]]);
  await db.exec('set role authenticated');
  try {
    await assert.rejects(() => report(scheduled), /not authorized/);
    await assert.rejects(() => db.query('select * from public.venue_night_reports'), /permission denied/);
    await assert.rejects(() => db.query('select * from private.night_booking_totals($1)', [scheduled]), /permission denied/);
  } finally { await db.exec('reset role'); }
  // Totals only: no reservation, guest or account identifier is stored.
  const stored = JSON.stringify((await db.query('select * from public.venue_night_reports')).rows);
  for (const id of people) assert.ok(!stored.includes(id), 'no account identifier in a report');
  for (const { id } of (await db.query('select id from private.launch_reservations')).rows) assert.ok(!stored.includes(id), 'no reservation identifier in a report');
  assert.ok(!stored.includes('example.com'), 'no email in a report');
  console.log('PASS #560 every night total is read back after the purge, on the scheduled end, an early end and a cancellation');
} catch (error) { console.error(error); process.exitCode = 1; }
finally { await db.close(); }
