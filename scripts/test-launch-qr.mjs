import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import sharp from 'sharp';
import jsQR from 'jsqr';
import { PGlite } from '@electric-sql/pglite';
import { installLaunchSchema, service, admin, asRole, fixture, attempt, pay, cancel, scalar, stranger } from './launch-test-database.mjs';
import { sealCredential } from '../lib/server/launch-secrets.ts';
import { getLaunchArrivalQr, getLaunchArrivalEmailAsset } from '../lib/server/launch-arrival.ts';
import { renderLaunchQr } from '../lib/launch-qr.ts';

const pg = new PGlite();
const db = { query: (sql, args) => args ? pg.query(sql, args) : pg.exec(sql).then(r => r.at(-1)) };
process.env.LAUNCH_SECRET_KEY = randomBytes(32).toString('hex');
const rpc = async (name, args) => {
  const entries = Object.entries(args);
  assert.match(name, /^[a-z_]+$/);
  return (await service(db, `select public.${name}(${entries.map(([key], i) => `${key}=>$${i + 1}`).join(',')}) result`, entries.map(([, v]) => v)))[0].result;
};
async function prepare() {
  const { night } = await fixture(db), a = attempt(night);
  // Delivery survives the original seven-day browser capability.
  const credential = { id: a.id, management: a.management, arrival: a.arrival, issued: Date.now() - 8 * 86400000 };
  await rpc('prepare_launch_checkout', {
    p_id: a.id, p_night: night, p_email: a.email, p_name: a.name, p_locale: a.locale,
    p_policy: a.policy, p_late_ack: a.late, p_management_secret: a.management, p_arrival_secret: a.arrival,
    p_envelope: sealCredential(credential, 'delivery'), p_account: 'acct_qrtest', p_origin: 'https://test.example.com',
  });
  return a;
}
async function moveNight(night, start, end) {
  await db.query('alter table venue_nights disable trigger launch_night_guard');
  try {
    await db.query(`update venue_nights set waiting_opens_at=clock_timestamp()+$2::interval,
      guaranteed_launch_at=clock_timestamp()+$2::interval+interval '1 minute',
      closes_at=clock_timestamp()+$3::interval where id=$1`, [night, start, end]);
  } finally { await db.query('alter table venue_nights enable trigger launch_night_guard'); }
}
const lookup = (a, secret = a.arrival, night = a.night) => admin(db, 'select admin_lookup_launch_arrival($1,$2) result', [night, secret]).then(r => r[0].result);
const verify = (a, secret = a.arrival, night = a.night) => admin(db, "select admin_verify_launch_arrival($1,$2,'qr',$3) result", [a.id, night, secret]).then(r => r[0].result);
const guest = a => getLaunchArrivalQr(rpc, a.id, a.management);
const counts = a => scalar(db, `select jsonb_build_object(
  'arrivals',(select count(*) from private.launch_arrivals where reservation_id=$1),
  'refunds',(select count(*) from private.launch_refunds where reservation_id=$1),
  'audit',(select count(*) from private.launch_audit where reservation_id=$1))`, [a.id]);
async function decode(png, width) {
  const { data, info } = await sharp(png).resize(width, width, { kernel: 'nearest' }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const result = jsQR(new Uint8ClampedArray(data), info.width, info.height);
  assert.ok(result, `PNG must decode at ${width}px`);
  return result.data;
}
let groups = 0;
async function check(name, fn) { await fn(); groups++; console.log(`PASS ${name}`); }
try {
  await installLaunchSchema(db);
  await check('PNG contains only the exact opaque token and decodes at mobile/email sizes', async () => {
    for (const secret of [randomBytes(32).toString('hex'), '0'.repeat(64)]) {
      const png = await renderLaunchQr(secret);
      const metadata = await sharp(png).metadata();
      assert.equal(metadata.format, 'png'); assert.equal(metadata.width, 360); assert.equal(metadata.height, 360);
      for (const width of [200, 256, 328, 360]) assert.equal(await decode(png, width), secret);
      const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) {
        const offset = (y * info.width + x) * 4;
        assert.equal(data[offset + 3], 255);
        if (x < 32 || y < 32 || x >= info.width - 32 || y >= info.height - 32) {
          assert.deepEqual([...data.subarray(offset, offset + 3)], [255, 255, 255]);
        }
      }
    }
    for (const bad of [null, [], '', '0'.repeat(63), '0'.repeat(65), 'A'.repeat(64), ' '+ '0'.repeat(64), '0'.repeat(64)+'\n', 'https://test.example.com']) {
      await assert.rejects(renderLaunchQr(bad), /invalid_arrival_code/);
    }
  });
  await check('payment gates delivery; guest ownership and role grants protect credentials', async () => {
    const a = await prepare();
    await assert.rejects(guest(a), /unavailable/);
    await assert.rejects(getLaunchArrivalEmailAsset(rpc, a.id), /unavailable/);
    await assert.rejects(lookup(a), /unavailable/);
    await pay(db, a);
    for (const proof of [a.arrival, '0'.repeat(64), null]) await assert.rejects(guest({ ...a, management: proof }));
    for (const role of ['anon', 'authenticated']) {
      await assert.rejects(asRole(db, role, 'select get_launch_arrival_delivery($1,$2)', [a.id, a.management], stranger), /permission denied/);
      await assert.rejects(asRole(db, role, 'select read_launch_arrival_delivery($1)', [a.id], stranger), /permission denied/);
    }
    await assert.rejects(asRole(db, 'authenticated', 'select admin_lookup_launch_arrival($1,$2)', [a.night, a.arrival], stranger), /not authorized/);
    await assert.rejects(service(db, 'select admin_lookup_launch_arrival($1,$2)', [a.night, a.arrival]), /permission denied/);
    assert.equal(await scalar(db, "select to_regprocedure('public.admin_lookup_launch_arrival(text)')"), null);
    assert.equal(await scalar(db, "select to_regprocedure('public.admin_verify_launch_arrival(uuid,text,text)')"), null);
    const qr = await guest(a), email = await getLaunchArrivalEmailAsset(rpc, a.id);
    assert.equal(qr.reservation_id, a.id); assert.equal(qr.night_id, a.night);
    assert.equal(email.recipient, a.email); assert.equal(email.locale, 'en');
    assert.equal(await decode(email.content, 256), a.arrival);
    assert.equal(qr.png_data_url, `data:image/png;base64,${email.content.toString('base64')}`);
    for (const field of ['envelope', 'recipient_email', 'management', 'arrival']) assert.equal(field in qr, false);
    const replacement = randomBytes(32).toString('hex');
    await rpc('renew_launch_access', { p_id: a.id, p_secret: replacement });
    await assert.rejects(guest(a), /access denied/);
    assert.deepEqual(await guest({ ...a, management: replacement }), qr);
    assert.equal((await getLaunchArrivalEmailAsset(rpc, a.id)).content.toString('base64'), email.content.toString('base64'));
    // Only the signed, correctly bound durable envelope can render this booking.
    const value = await rpc('read_launch_arrival_delivery', { p_id: a.id });
    for (const envelope of [value.envelope.slice(0, -5) + 'AAAAA', sealCredential({ id: randomUUID(), arrival: a.arrival, management: replacement, issued: Date.now() }, 'delivery')]) {
      await assert.rejects(getLaunchArrivalEmailAsset(async () => ({ ...value, envelope }), a.id));
    }
  });
  await check('wrong night, malformed/management/other tokens and premature confirmation have no effects', async () => {
    const a = await prepare(), b = await prepare(); await pay(db, a); await pay(db, b);
    const before = await counts(a);
    assert.equal((await lookup(a)).id, a.id);
    await assert.rejects(verify(a), /outside/);
    for (const secret of [null, '', '0'.repeat(63), '0'.repeat(65), a.arrival.toUpperCase(), ` ${a.arrival}`, a.arrival+'\n', a.management, b.arrival]) {
      await assert.rejects(lookup(a, secret)); await assert.rejects(verify(a, secret));
    }
    for (const night of [null, randomUUID(), b.night]) {
      await assert.rejects(lookup(a, a.arrival, night), /unavailable/);
      await assert.rejects(verify(a, a.arrival, night), /unavailable/);
    }
    assert.deepEqual(await counts(a), before);
  });
  await check('arrival remains valid late in the event and repeated scans preserve the original verification', async () => {
    const a = await prepare(); await pay(db, a); await moveNight(a.night, '-4 hours', '1 minute');
    await lookup(a); assert.equal((await counts(a)).arrivals, 0);
    const first = await verify(a), after = await counts(a);
    assert.equal(first.arrival, 'verified'); assert.equal(first.refund_state, 'queued');
    assert.deepEqual(await verify(a), first); assert.deepEqual(await lookup(a), first);
    assert.equal((await guest(a)).verified_at, first.verified_at);
    assert.deepEqual(await counts(a), after);
    assert.equal(await scalar(db, 'select count(*)::int from presence where venue_night_id=$1', [a.night]), 0);
    // An already-verified booking cannot bypass wrong-token or night checks.
    await assert.rejects(verify(a, a.management)); await assert.rejects(verify(a, a.arrival, randomUUID()));
    await moveNight(a.night, '-4 hours', '-1 second');
    await assert.rejects(guest(a), /unavailable/); await assert.rejects(lookup(a), /unavailable/); await assert.rejects(verify(a), /unavailable/);
    assert.deepEqual(await counts(a), after);
    assert.equal((await admin(db, 'select admin_launch_reservation($1) result', [a.id]))[0].result.verified_at, first.verified_at);
  });
  await check('cancellation after lookup invalidates QR; cancelled/postponed/ended events refuse delivery and scans', async () => {
    for (const state of ['participant', 'cancelled', 'postponed', 'ended']) {
      const a = await prepare(); await pay(db, a); await lookup(a);
      if (state === 'participant') await cancel(db, a);
      else if (state === 'ended') await db.query("select private.transition_venue_night($1,'ended',null,null)", [a.night]);
      else await admin(db, 'select admin_cancel_launch_event($1,$2)', [a.night, state]);
      const before = await counts(a);
      await assert.rejects(guest(a), /unavailable/); await assert.rejects(getLaunchArrivalEmailAsset(rpc, a.id), /unavailable/);
      await assert.rejects(lookup(a), /unavailable/); await assert.rejects(verify(a), /unavailable/);
      assert.deepEqual(await counts(a), before);
    }
  });
  console.log(`${groups} launch QR groups passed (isolated SQL, delivery and independent PNG decoding).`);
} finally { await pg.close(); }
