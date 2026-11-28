// #603: the landing page's booking button follows the next upcoming night
// (open for booking or announced), read from the data, and relays the posted link it was opened from.
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { installLaunchSchema, asRole, service, fixture, attempt, create, pay } from './launch-test-database.mjs';
import { landingAmount, landingBookingHref, landingDate, landingPlace, landingTime } from '../lib/landing-night.ts';

const pg = new PGlite();
const db = { query: (sql, args) => args ? pg.query(sql, args) : pg.exec(sql).then(r => r.at(-1)) };
let checks = 0;
async function check(name, fn) { await fn(); checks++; console.log(`PASS ${name}`); }
const next = async () => (await service(db, 'select launch_next_booking_event() result'))[0].result;

try {
  await installLaunchSchema(db);

  await check('no night at all: null, so the page offers the waitlist', async () => {
    assert.equal(await next(), null);
  });

  let announced;
  await check('a night announced before its bookings open is already offered', async () => {
    announced = (await fixture(db, { start: '3 days', end: '3 days 4 hours', opens: '1 hour' })).night;
    const event = await next();
    assert.equal(event.night_id, announced);
    assert.equal(event.venue_name, 'Test venue');
    assert.equal(event.status, 'not_open', 'its own page says when bookings open');
    assert.equal(event.registration_open, false);
    assert.equal(event.amount_minor, 1000);
    assert.equal('venue_id' in event, false, 'the venue id never leaves the database (#472)');
  });

  let sooner;
  await check('of two upcoming nights, the one that starts first is offered', async () => {
    sooner = (await fixture(db, { start: '2 days', end: '2 days 4 hours' })).night;
    const event = await next();
    assert.equal(event.night_id, sooner);
    assert.equal(event.status, 'open');
    assert.equal(event.registration_open, true);
  });

  await check('a full night stays the next night: its own page handles its waitlist', async () => {
    const booking = attempt(sooner);
    await create(db, booking);
    await pay(db, booking);
    const event = await next();
    assert.equal(event.night_id, sooner);
    assert.equal(event.available, 0);
  });

  await check('a night closing for registration (30 minutes before the doors) is skipped', async () => {
    await fixture(db, { start: '20 minutes', end: '4 hours' });
    assert.equal((await next()).night_id, sooner);
  });

  await check('a cancelled night is skipped for the next upcoming one', async () => {
    await db.query("update venue_nights set terminal_at = clock_timestamp(), terminal_reason = 'cancelled' where id = $1", [sooner]);
    assert.equal((await next()).night_id, announced);
  });

  await check('participants cannot call it: server only', async () => {
    for (const role of ['anon', 'authenticated']) {
      await assert.rejects(asRole(db, role, 'select launch_next_booking_event()'), /permission denied/, role);
    }
  });

  await check('booking link relays one known channel and drops anything else', async () => {
    const night = '7f9c1e9a-3b1d-4c55-9a51-2f7d3c1b8e10';
    assert.equal(landingBookingHref(night, ''), `/events/${night}`);
    for (const via of ['street', 'instagram', 'venue_flyer', 'venue_story']) {
      assert.equal(landingBookingHref(night, `?via=${via}`), `/events/${night}?via=${via}`);
    }
    for (const search of ['?via=tiktok', '?via=Instagram', '?via=', '?via=%20street', '?via=instagram&via=street', '?via=instagram&via=instagram', '?utm_source=x']) {
      assert.equal(landingBookingHref(night, search), `/events/${night}`, search);
    }
    assert.equal(landingBookingHref(night, '?utm_source=x&via=street'), `/events/${night}?via=street`);
  });

  await check('ticket prints the venue wall clock and a whole deposit', async () => {
    const start = '2026-12-10T18:30:00Z', end = '2026-12-10T22:00:00Z';
    assert.deepEqual(landingDate(start, 'Europe/Paris', 'fr'), ['Jeudi', '10 décembre']);
    assert.deepEqual(landingDate(start, 'Europe/Paris', 'en'), ['Thursday', 'December 10']);
    assert.equal(landingTime(start, 'Europe/Paris', 'fr'), '19\u00a0h\u00a030');
    assert.equal(landingTime(end, 'Europe/Paris', 'fr'), '23\u00a0h');
    assert.equal(landingTime(start, 'Europe/Paris', 'en'), '7:30\u00a0pm');
    assert.equal(landingTime(end, 'Europe/Paris', 'en'), '11\u00a0pm');
    assert.equal(landingTime(start, 'Europe/Paris', 'es'), '19:30');
    assert.equal(landingTime('2026-12-10T23:05:00Z', 'Europe/Paris', 'en'), '12:05\u00a0am');
    assert.equal(landingAmount(1000, 'eur', 'fr').replace(/\s/g, ' '), '10 €');
    assert.equal(landingAmount(1000, 'eur', 'en'), '€10');
    assert.equal(landingAmount(1050, 'eur', 'en'), '€10.50');
    assert.equal(landingPlace({ address: '50 rue Léon Frot, Paris 11e', city: 'Paris' }), '50 rue Léon Frot, Paris 11e');
    assert.equal(landingPlace({ address: '50 rue Léon Frot', city: 'Paris' }), '50 rue Léon Frot, Paris');
    assert.equal(landingPlace({ address: null, city: 'Paris' }), 'Paris');
  });

  console.log(`${checks} landing next-night checks passed`);
} finally { await pg.close(); }
