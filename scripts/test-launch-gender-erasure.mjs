// #388: the gender given at reservation is erased from the reservation record
// 30 days after the evening ends, by the scheduled in-database job, and nothing
// else in the record changes. Isolated PostgreSQL (PGlite) only.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { installLaunchSchema, asRole, admin, fixture, attempt, create, cancel, pay, scalar } from './launch-test-database.mjs';

const JOB = 'amourette-launch-gender-erasure';
const MIGRATION = 'supabase/migrations/20261125000388_erase_launch_reservation_gender.sql';
const pg = new PGlite();
const db = { query: (sql, args) => args ? pg.query(sql, args) : pg.exec(sql).then(r => r.at(-1)) };
let checks = 0;
async function check(name, fn) { await fn(); checks++; console.log(`PASS ${name}`); }

// pg_cron runs the stored command as the job owner; so does this.
async function runJob() {
  const command = (await db.query('select command from cron.job where jobname=$1', [JOB])).rows[0]?.command;
  assert.ok(command, `${JOB} is not scheduled`);
  return Object.values((await db.query(command)).rows[0])[0];
}

// Books one confirmed reservation per answer on a fresh night, then moves the
// night into the past. The schedule is frozen once registration opens, so the
// test lifts the guard as a superuser would; the application cannot.
// `cancelled` answers are paid, then cancelled with a refund, before the move.
async function pastNight({ closedDaysAgo, terminalDaysAgo = closedDaysAgo, genders = ['woman'], cancelled = [] }) {
  const { night } = await fixture(db, { capacity: genders.length + 1 });
  const bookings = [];
  for (const [index, gender] of [...genders, ...cancelled].entries()) {
    const a = { ...attempt(night), ...(gender === null ? {} : { gender }) };
    await create(db, a); await pay(db, a); bookings.push(a);
    if (index >= genders.length) await cancel(db, a);
  }
  await db.query('alter table public.venue_nights disable trigger launch_night_guard');
  await db.query(`update public.venue_nights set status='closed',opened_at=null,launched_at=null,
      waiting_opens_at=clock_timestamp()-make_interval(secs=>$2::float8*86400)-interval '5 hours',
      guaranteed_launch_at=clock_timestamp()-make_interval(secs=>$2::float8*86400)-interval '4 hours',
      closes_at=clock_timestamp()-make_interval(secs=>$2::float8*86400),
      terminal_at=case when $3::float8 is null then null else clock_timestamp()-make_interval(secs=>$3::float8*86400) end,
      terminal_reason=case when $3::float8 is null then null else 'scheduled_end' end
    where id=$1`, [night, closedDaysAgo, terminalDaysAgo]);
  await db.query('alter table public.venue_nights enable trigger launch_night_guard');
  return { night, bookings };
}

const genderOf = id => scalar(db, 'select gender from private.launch_reservations where id=$1', [id]);
// Every private row tied to the reservations, without the gender itself.
async function snapshot(ids) {
  const tables = (await db.query(`select table_name from information_schema.columns
    where table_schema='private' and column_name='reservation_id' order by table_name`)).rows.map(r => r.table_name);
  const rows = { launch_reservations: (await db.query(`select to_jsonb(r)-'gender' row from private.launch_reservations r where id=any($1) order by id`, [ids])).rows };
  for (const table of tables) rows[table] = (await db.query(`select to_jsonb(t) row from private.${table} t where reservation_id=any($1) order by 1`, [ids])).rows;
  return rows;
}

let waiting;
try {
  await installLaunchSchema(db);
  // The shared substrate's cron.schedule is a no-op; record jobs as pg_cron does.
  await db.query(`create table cron.job(jobid bigserial primary key,jobname text unique,schedule text,command text);
    create or replace function cron.schedule(text,text,text) returns bigint language sql as
      $$insert into cron.job(jobname,schedule,command) values($1,$2,$3) on conflict(jobname) do update set schedule=excluded.schedule,command=excluded.command returning jobid$$;`);
  await check('main has no erasure: without the #388 migration a 31-day-old answer is kept', async () => {
    [waiting] = (await pastNight({ closedDaysAgo: 31 })).bookings;
    await assert.rejects(runJob(), new RegExp(`${JOB} is not scheduled`));
    assert.equal(await genderOf(waiting.id), 'woman');
  });
  await db.query(readFileSync(MIGRATION, 'utf8'));

  await check('scheduled hourly in the database; no API role may run it', async () => {
    assert.equal(await scalar(db, 'select schedule from cron.job where jobname=$1', [JOB]), '23 * * * *');
    for (const role of ['anon', 'authenticated', 'service_role']) {
      assert.equal(await scalar(db, "select has_function_privilege($1,'private.erase_launch_reservation_gender()','EXECUTE')", [role]), false);
      await assert.rejects(asRole(db, role, 'select private.erase_launch_reservation_gender()'), /permission denied/);
    }
  });

  await check('29 days after the evening the answer is kept; 31 days after it is erased, with the rest of the record intact', async () => {
    const kept = await pastNight({ closedDaysAgo: 29, genders: ['woman', 'man'] });
    const almost = await pastNight({ closedDaysAgo: 30 - 5 / 1440, genders: ['nonbinary'] });
    // A cancelled, refunded booking on the old night is erased too.
    const due = await pastNight({ closedDaysAgo: 31, genders: ['woman', 'man', 'nonbinary', null], cancelled: ['woman'] });
    const { night: future } = await fixture(db, { capacity: 2 });
    const upcoming = { ...attempt(future), gender: 'man' }; await create(db, upcoming); await pay(db, upcoming);

    const erasedIds = due.bookings.map(b => b.id), refunded = due.bookings.at(-1);
    const before = await snapshot(erasedIds);
    assert.equal(await scalar(db, 'select state from private.launch_reservations where id=$1', [refunded.id]), 'cancelled');
    assert.equal(before.launch_refunds.length, 1);
    // Four answers (the legacy booking has none) plus the one left over from the first group.
    assert.equal(await runJob(), 5);
    for (const b of [...due.bookings, waiting]) assert.equal(await genderOf(b.id), null);
    assert.deepEqual(await snapshot(erasedIds), before);
    assert.deepEqual(await Promise.all(kept.bookings.map(b => genderOf(b.id))), ['woman', 'man']);
    assert.equal(await genderOf(almost.bookings[0].id), 'nonbinary');
    assert.equal(await genderOf(upcoming.id), 'man');
    // The founder totals of the old night show erased answers as not recorded.
    assert.deepEqual((await admin(db, 'select admin_launch_overview($1) result', [due.night]))[0].result.gender_counts,
      { woman: 0, man: 0, nonbinary: 0, unspecified: 4 });
    assert.deepEqual((await admin(db, 'select admin_launch_overview($1) result', [kept.night]))[0].result.gender_counts,
      { woman: 1, man: 1, nonbinary: 0, unspecified: 0 });
  });

  await check('the evening ends at its scheduled close or its earlier terminal transition, whichever comes first', async () => {
    // The lifecycle job has not recorded the end: the scheduled close still counts.
    const unrecorded = await pastNight({ closedDaysAgo: 31, terminalDaysAgo: null });
    // Ended early: 31 days since it ended, although its scheduled close was later.
    const early = await pastNight({ closedDaysAgo: 29.5, terminalDaysAgo: 31 });
    // Ended 29 days ago, recorded a minute after its scheduled close.
    const lagging = await pastNight({ closedDaysAgo: 29, terminalDaysAgo: 29 - 1 / 1440 });
    assert.equal(await runJob(), 2);
    assert.equal(await genderOf(unrecorded.bookings[0].id), null);
    assert.equal(await genderOf(early.bookings[0].id), null);
    assert.equal(await genderOf(lagging.bookings[0].id), 'woman');
  });

  await check('idempotent: a second run erases nothing and changes nothing', async () => {
    const all = (await db.query('select id from private.launch_reservations')).rows.map(r => r.id);
    const genders = async () => (await db.query('select id,gender from private.launch_reservations order by id')).rows;
    const before = [await snapshot(all), await genders()];
    assert.equal(await runJob(), 0);
    assert.equal(await runJob(), 0);
    assert.deepEqual([await snapshot(all), await genders()], before);
  });
  console.log(`${checks} reservation gender erasure groups passed; isolated PostgreSQL only.`);
} finally { await pg.close(); }
