// #561: the reservation-link channel survives the whole booking journey, Stripe
// redirect included. Real browser, real built Next server, real Stripe test-mode
// Checkout; the database is a disposable PGlite with every launch migration.
// Explicit opt-in (secrets): never included in CI or test:logic.
//
//   npm run build   # NEXT_PUBLIC_SUPABASE_URL may be a placeholder: REST calls are redirected
//   node --env-file=.env.local --experimental-strip-types scripts/test-launch-channel-journey.mjs
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { chromium } from '@playwright/test';
import { installLaunchSchema, service, admin, fixture } from './launch-test-database.mjs';
import { createLaunchStripe } from '../lib/server/launch-provider.ts';
import { handleLaunchEvent } from '../lib/server/launch-engine.ts';
import { bookingStrings } from '../lib/booking-strings.ts';

// Real provider effects: this exercise never runs against live mode, whatever the environment says.
if (process.env.STRIPE_MODE !== 'test' || !process.env.STRIPE_SECRET_KEY?.startsWith('sk_test_')) throw new Error('Requires STRIPE_MODE=test and a test secret key.');
const stripe = createLaunchStripe();
const account = (await stripe.accounts.retrieve(null)).id;
const s = bookingStrings.en;
const pg = new PGlite();
const db = { query: (sql, args) => args ? pg.query(sql, args) : pg.exec(sql).then(r => r.at(-1)) };
const rpc = async (name, args) => {
  const entries = Object.entries(args).filter(([, v]) => v !== undefined); assert.match(name, /^[a-z_]+$/);
  return (await service(db, `select public.${name}(${entries.map(([key], i) => `${key}=>$${i + 1}`).join(',')}) result`, entries.map(([, v]) => v)))[0].result;
};
// The server accepts only an https origin or the two local development origins on
// port 3000. Listening on IPv6 loopback leaves an IPv4 port 3000 to whatever else uses it.
const origin = 'http://localhost:3000', local = 'http://[::1]:3000';
const directory = await mkdtemp(join(tmpdir(), 'launch-channel-'));
let next, adapter, browser, queue = Promise.resolve(), output = '';
const sessions = [];
const channelOf = async id => (await db.query('select channel from private.launch_reservation_channels where reservation_id=$1', [id])).rows[0]?.channel ?? null;
const step = message => console.log(`  · ${message}`);

async function startBooking(page, night, query) {
  await page.goto(`${origin}/events/${night}${query}`);
  await page.getByRole('heading', { name: 'Test venue' }).waitFor();
  await page.getByLabel(s.name, { exact: true }).fill('Alice');
  await page.getByLabel(s.email, { exact: true }).first().fill(`channel-${randomBytes(4).toString('hex')}@example.com`);
  await page.getByRole('radio', { name: 'Woman', exact: true }).check();
  await page.getByRole('checkbox').first().check();
  await page.getByRole('button', { name: new RegExp(s.reserve.split('{amount}')[0]) }).click();
  await page.waitForURL(/^https:\/\/checkout\.stripe\.com\//, { timeout: 30000 });
  const id = (await db.query('select id from private.launch_reservations where night_id=$1 order by created_at desc limit 1', [night])).rows[0].id;
  const attempt = await rpc('inspect_launch_checkout', { p_id: id });
  sessions.push(attempt.checkout_id);
  return { id, checkout: attempt.checkout_id };
}

async function payOnStripe(page) {
  await page.waitForLoadState('domcontentloaded');
  // Checkout may list card as one accordion choice among others.
  const card = page.getByTestId('card-accordion-item-button');
  try { await card.waitFor({ timeout: 8000 }); await card.click(); } catch { /* card form shown directly */ }
  if (process.env.CHANNEL_JOURNEY_SHOTS) await page.screenshot({ path: join(process.env.CHANNEL_JOURNEY_SHOTS, 'stripe.png'), fullPage: true });
  // Card fields may sit in the page or in a Stripe iframe, depending on the Checkout version.
  const field = async (placeholder) => {
    for (let i = 0; i < 60; i++) {
      for (const frame of page.frames()) {
        const input = frame.getByPlaceholder(placeholder, { exact: true });
        if (await input.count().catch(() => 0)) return input.first();
      }
      await page.waitForTimeout(500);
    }
    throw new Error(`Stripe field not found: ${placeholder}`);
  };
  await (await field('Card number')).fill('4242424242424242');
  await (await field('MM / YY')).fill('1230');
  await (await field('Security code')).fill('123');
  await (await field('First and last name')).fill('Amourette Sandbox');
  const zip = page.locator('#billingPostalCode'); if (await zip.count()) await zip.fill('10001');
  for (const frame of page.frames()) {
    const pay = frame.getByRole('button', { name: /^Pay\b/ });
    if (await pay.count().catch(() => 0)) { await pay.first().click(); break; }
  }
}

try {
  await installLaunchSchema(db);
  adapter = createServer((req, res) => {
    queue = queue.then(async () => {
      try {
        const chunks = []; for await (const chunk of req) chunks.push(chunk);
        const result = await rpc(req.url.split('/').at(-1), JSON.parse(Buffer.concat(chunks).toString() || '{}'));
        res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(result));
      } catch (error) { res.writeHead(400, { 'content-type': 'application/json' }); res.end(JSON.stringify({ code: error.code ?? 'XX000', message: error.message, details: null, hint: null })); }
    });
  });
  await new Promise(resolve => adapter.listen(0, '127.0.0.1', resolve));
  // Supabase REST goes to the disposable database; Stripe (node http) is untouched; nothing else leaves.
  const preload = join(directory, 'fetch.mjs');
  await writeFile(preload, `const original=globalThis.fetch;globalThis.fetch=(input,init)=>{const raw=typeof input==='string'?input:input instanceof URL?input.href:input.url;const url=new URL(raw);if(url.pathname.startsWith('/rest/v1/'))return original(process.env.LAUNCH_HTTP_RPC_URL+url.pathname+url.search,init);if(url.origin==='${origin}')return original(input,init);throw new Error('Unexpected external HTTP in channel journey: '+url.origin);};`);
  next = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '--hostname', '::1', '--port', '3000'], {
    env: { ...process.env, NODE_OPTIONS: `--import ${pathToFileURL(preload).href}`, LAUNCH_HTTP_RPC_URL: `http://127.0.0.1:${adapter.address().port}`,
      LAUNCH_SITE_ORIGIN: origin, LAUNCH_SECRET_KEY: randomBytes(32).toString('hex'), SUPABASE_SERVICE_ROLE_KEY: 'isolated-service',
      STRIPE_MODE: 'test', STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET: '', VERCEL: '0', VERCEL_ENV: 'development',
      LAUNCH_WORKER_SECRET: 'a'.repeat(64), LAUNCH_EMAIL_ENABLED: 'false' },
    stdio: ['ignore', 'pipe', 'pipe'] });
  next.stdout.on('data', c => { output += c; }); next.stderr.on('data', c => { output += c; });
  for (let i = 0; i < 100; i++) { try { if ((await fetch(`${local}/api/launch/return`, { redirect: 'manual' })).status === 303) break; } catch {} await new Promise(r => setTimeout(r, 100)); if (i === 99) throw Error('Next server did not start: ' + output.slice(-1000)); }
  browser = await chromium.launch({ headless: true, args: ['--host-resolver-rules=MAP localhost [::1]'] });
  const { night } = await fixture(db, { capacity: 5 });

  console.log('Journey 1: ?via=instagram, leave Stripe without paying, come back, resume, pay');
  const guest = await browser.newContext({ locale: 'en-US', viewport: { width: 390, height: 844 } });
  const page = await guest.newPage();
  const first = await startBooking(page, night, '?via=instagram');
  step(`reached Stripe test Checkout ${new URL(page.url()).origin}, reservation ${first.id.slice(0, 8)}`);
  assert.equal(await channelOf(first.id), 'instagram', 'channel stored before the payment redirect');
  // Stripe's cancel_url: the guest leaves Checkout and lands on their reservation page.
  await page.goto(`${origin}/api/launch/return?reservation=${first.id}`);
  await page.waitForURL(`${origin}/reservations/${first.id}`);
  await page.getByRole('button', { name: s.resume }).click();
  await page.waitForURL(/^https:\/\/checkout\.stripe\.com\//, { timeout: 30000 });
  step('resumed from the reservation page back to the same Checkout');
  await payOnStripe(page);
  await page.waitForURL(`${origin}/reservations/${first.id}`, { timeout: 60000 });
  step('paid with the 4242 test card; Stripe success_url returned to the reservation page');
  const events = await stripe.events.list({ type: 'checkout.session.completed', limit: 20 });
  const event = events.data.find(e => e.data.object.id === first.checkout);
  assert.ok(event, 'real Stripe completion event'); assert.equal(event.livemode, false);
  await handleLaunchEvent(rpc, stripe, account, event);
  assert.equal((await rpc('inspect_launch_checkout', { p_id: first.id })).state, 'confirmed');
  await page.reload(); await page.getByText(s.confirmed, { exact: true }).waitFor();
  assert.equal(await channelOf(first.id), 'instagram', 'channel unchanged after redirect, resume and payment');
  step('reservation confirmed, channel still instagram');

  console.log('Journey 2: ?via=tiktok (unknown) books normally with no channel');
  const second = await browser.newContext({ locale: 'en-US' });
  const other = await startBooking(await second.newPage(), night, '?via=tiktok');
  assert.equal(await channelOf(other.id), null);
  step('Checkout opened, channel recorded as absent');

  const counts = (await admin(db, 'select admin_launch_channel_counts($1) result', [night]))[0].result;
  assert.deepEqual(counts, { street: 0, instagram: 1, venue_flyer: 0, venue_story: 0, unspecified: 0 });
  console.log(`Founder totals (confirmed only): ${JSON.stringify(counts)}`);
  console.log('PASS channel survives the Stripe test-mode journey; unknown value stored as absent');
} catch (error) {
  console.error(error); if (output) console.error(output.slice(-2000)); process.exitCode = 1;
} finally {
  // Leave nothing open or charged in the test account.
  for (const id of sessions) {
    try {
      const session = await stripe.checkout.sessions.retrieve(id);
      if (session.status === 'open') await stripe.checkout.sessions.expire(id);
      if (session.payment_status === 'paid' && session.payment_intent) await stripe.refunds.create({ payment_intent: String(session.payment_intent) });
    } catch { console.error('Sandbox session cleanup requires inspection'); }
  }
  await browser?.close(); next?.kill('SIGTERM'); if (adapter) await new Promise(resolve => adapter.close(resolve));
  await pg.close(); await rm(directory, { recursive: true, force: true });
}
