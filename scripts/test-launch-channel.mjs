// #561: the reservation-link channel is written once per reservation, only by the
// service facade with the attempt's management secret, ignores unknown values and
// reaches founders only as confirmed-booking totals.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { installLaunchSchema, asRole, service, admin, fixture, attempt, pay, cancel, scalar, stranger } from './launch-test-database.mjs';
import { bookingChannel, bookingInput, BOOKING_CHANNELS } from '../lib/launch-contract.ts';

const pg = new PGlite();
const db = { query: (sql, args) => args ? pg.query(sql, args) : pg.exec(sql).then(r => r.at(-1)) };
let checks = 0;
async function check(name, fn) { await fn(); checks++; console.log(`PASS ${name}`); }
const prepare = (a) => service(db, `select prepare_launch_checkout(p_id=>$1,p_night=>$2,p_email=>$3,p_name=>$4,p_locale=>$5,p_policy=>$6,p_late_ack=>$7,
  p_management_secret=>$8,p_arrival_secret=>$9,p_envelope=>$10,p_account=>'acct_test',p_origin=>'http://localhost:3000',p_gender=>'woman') result`,
  [a.id, a.night, a.email, a.name, a.locale, a.policy, a.late, a.management, a.arrival, 'v1.' + 'x'.repeat(100)]);
const record = async (a, channel, secret = a.management) =>
  (await service(db, 'select record_launch_reservation_channel($1,$2,$3) result', [a.id, secret, channel]))[0].result;
const stored = async (a) => (await db.query('select channel from private.launch_reservation_channels where reservation_id=$1', [a.id])).rows[0]?.channel;
const counts = async (night) => (await admin(db, 'select admin_launch_channel_counts($1) result', [night]))[0].result;

try {
  await check('URL value: only the four exact channel names are kept, anything else is absent', async () => {
    assert.deepEqual(BOOKING_CHANNELS, ['street', 'instagram', 'venue_flyer', 'venue_story']);
    for (const value of BOOKING_CHANNELS) assert.equal(bookingChannel(value), value);
    for (const value of [undefined, null, '', ' street', 'street ', 'Street', 'INSTAGRAM', 'venue-flyer', 'tiktok', 'street\u0000', ['street'], 1, {}, 'x'.repeat(10000)]) {
      assert.equal(bookingChannel(value), null, JSON.stringify(value)?.slice(0, 40));
    }
  });

  await check('booking body: a known channel is kept, an unknown one is dropped without refusing the booking', async () => {
    const base = { night: randomUUID(), email: 'guest@example.com', name: 'Guest', locale: 'en', policy: 'launch-v1', late_ack: true, gender: 'woman' };
    assert.equal(bookingInput({ ...base, channel: 'venue_story' }).channel, 'venue_story');
    for (const channel of ['tiktok', '', null, 'Instagram', ['street'], 42]) assert.equal('channel' in bookingInput({ ...base, channel }), false);
    assert.equal('channel' in bookingInput(base), false);
  });

  await installLaunchSchema(db);

  await check('first channel is stored once; a replay or later value never changes it', async () => {
    const { night } = await fixture(db, { capacity: 5 }), a = attempt(night);
    await prepare(a);
    assert.equal(await record(a, 'instagram'), true);
    assert.equal(await stored(a), 'instagram');
    await prepare(a); // resume of the same attempt
    assert.equal(await record(a, 'instagram'), false);
    assert.equal(await record(a, 'street'), false);
    assert.equal(await stored(a), 'instagram');
  });

  await check('unknown or missing value is recorded as absent, never refused', async () => {
    const { night } = await fixture(db, { capacity: 10 });
    for (const value of [null, '', 'tiktok', 'Street', ' street', 'venue-flyer', 'x'.repeat(5000)]) {
      const a = attempt(night); await prepare(a);
      assert.equal(await record(a, value), false);
      assert.equal(await stored(a), undefined);
    }
    // A durable constraint covers a direct privileged write too.
    const a = attempt(night); await prepare(a);
    await assert.rejects(db.query('insert into private.launch_reservation_channels(reservation_id,channel) values($1,$2)', [a.id, 'tiktok']), /check constraint/);
  });

  await check('only the attempt holder, through the service facade, can record a channel', async () => {
    const { night } = await fixture(db, { capacity: 5 }), a = attempt(night); await prepare(a);
    await assert.rejects(record(a, 'street', 'f'.repeat(64)), /access denied/);
    await assert.rejects(record({ ...a, id: randomUUID() }, 'street'), /access denied/);
    assert.equal(await stored(a), undefined);
    for (const [role, user] of [['anon', null], ['authenticated', stranger], ['authenticated', null]]) {
      await assert.rejects(asRole(db, role, 'select record_launch_reservation_channel($1,$2,$3)', [a.id, a.management, 'street'], user), /permission denied/);
      await assert.rejects(asRole(db, role, 'select * from private.launch_reservation_channels', [], user), /permission denied/);
    }
    await assert.rejects(service(db, 'select * from private.launch_reservation_channels'), /permission denied/);
    assert.equal(await stored(a), undefined);
  });

  await check('founder totals count confirmed bookings per channel; holds and cancellations are not counted', async () => {
    const { night } = await fixture(db, { capacity: 10 });
    const confirmed = [['street'], ['street'], ['instagram'], ['venue_story'], [null]];
    for (const [channel] of confirmed) { const a = attempt(night); await prepare(a); if (channel) await record(a, channel); await pay(db, a); }
    const hold = attempt(night); await prepare(hold); await record(hold, 'venue_flyer');
    const gone = attempt(night); await prepare(gone); await record(gone, 'venue_flyer'); await pay(db, gone); await cancel(db, gone);
    assert.deepEqual(await counts(night), { street: 2, instagram: 1, venue_flyer: 0, venue_story: 1, unspecified: 1 });
    const other = await fixture(db, { capacity: 1 });
    assert.deepEqual(await counts(other.night), { street: 0, instagram: 0, venue_flyer: 0, venue_story: 0, unspecified: 0 });
  });

  await check('totals are founder-only', async () => {
    const { night } = await fixture(db);
    await assert.rejects(asRole(db, 'authenticated', 'select admin_launch_channel_counts($1)', [night], stranger), /not authorized/);
    await assert.rejects(asRole(db, 'anon', 'select admin_launch_channel_counts($1)', [night]), /permission denied/);
    await assert.rejects(service(db, 'select admin_launch_channel_counts($1)', [night]), /permission denied/);
    await assert.rejects(admin(db, 'select admin_launch_channel_counts($1)', [randomUUID()]), /unknown night/);
  });

  console.log(`${checks} reservation channel checks passed`);
} finally { await pg.close(); }
