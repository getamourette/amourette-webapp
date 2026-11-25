// The door camera reads the arrival QR exactly as the confirmation email shows it (#484).
// The QR image is the PNG the email worker attaches, displayed at the width the
// rendered email gives it. A simulated phone camera films that screen in a dim room;
// each frame goes through the door scanner's regions (`lib/arrival-frame.ts`), drawn
// the way a canvas `drawImage` does (bilinear sampling), and jsQR must read it.
import './email-render-hooks.mjs';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import jsQR from 'jsqr';
import sharp from 'sharp';

process.env.LAUNCH_SECRET_KEY ??= randomBytes(32).toString('hex');
const { renderReservationLifecycleEmail } = await import('../emails/ReservationLifecycleEmail.tsx');
const { getLaunchArrivalEmailAsset } = await import('../lib/server/launch-arrival.ts');
const { sealCredential } = await import('../lib/server/launch-secrets.ts');
const { arrivalScanRegions } = await import('../lib/arrival-frame.ts');
type Region = { sx: number; sy: number; sw: number; sh: number; width: number; height: number };

// 1. The email: its QR attachment and the width the guest's mail app displays it at.
const id = randomUUID(), night = randomUUID(), arrival = randomBytes(32).toString('hex');
const envelope = sealCredential({ id, management: randomBytes(32).toString('hex'), arrival, issued: Date.now() }, 'delivery');
const asset = await getLaunchArrivalEmailAsset(async () => ({
  reservation_id: id, night_id: night, recipient_email: 'guest@example.com', locale: 'en', timezone: 'Europe/Paris',
  starts_at: '2026-12-04T20:00:00.000Z', ends_at: '2026-12-05T01:00:00.000Z', verified_at: null, envelope,
}), id);
let emailWidth = 0;
for (const locale of ['en', 'fr', 'es'] as const) {
  const mail = await renderReservationLifecycleEmail({
    reservation_id: id, night_id: night, kind: 'confirmed', recipient: 'guest@example.com', locale, origin: 'https://example.com',
    version: 'a'.repeat(64), payload_envelope: null, venue_name: 'Test bar', city: 'Paris', address: '1 rue de Test', timezone: 'Europe/Paris',
    starts_at: '2026-12-04T20:00:00.000Z', ends_at: '2026-12-05T01:00:00.000Z', cancellation_deadline: '2026-12-03T20:00:00.000Z',
    before_deadline: true, state: 'confirmed', cancellation_refundable: null, event_reason: null, amount_minor: 1000, currency: 'eur',
    refund_state: null, refund_eligible: false, qr_eligible: true,
  }, 'https://example.com/manage', '2026-12-05T01:00:00.000Z', true);
  const tag = mail.html.match(/<img[^>]*src="cid:reservation-qr"[^>]*>/)?.[0];
  assert.ok(tag, `${locale} confirmation shows the QR attachment`);
  const width = Number(tag.match(/\bwidth="(\d+)"/)?.[1]);
  assert.ok(width > 0 && Number(tag.match(/\bheight="(\d+)"/)?.[1]) === width, `${locale} QR has a square display size`);
  assert.ok(emailWidth === 0 || emailWidth === width, 'every locale shows the QR at the same size');
  emailWidth = width;
}
const { width: assetWidth } = await sharp(asset.content).metadata();
assert.ok(emailWidth <= assetWidth!, 'the email never upscales the QR image');

// 2. The camera. 1280x720 frames (what ArrivalCamera requests). `cameraPxPerCssPx` is
// how many sensor pixels one CSS pixel of the guest's screen covers: 0.81 at about
// 20 cm (a 240 px email QR then gets 4.3 sensor px per module, as measured in the
// 2026-11-20 review), 0.55 when the guest holds the phone further away. Each frame
// adds a random tilt (±8°) and offset (±60 px), dim-light contrast and sensor noise,
// then the optical blur, which also stands for the phone's denoising.
const W = 1280, H = 720;
const scenarios = [
  { name: 'close, slightly out of focus', cameraPxPerCssPx: 0.81, blur: 2.5, noise: 10 },
  { name: 'held further away', cameraPxPerCssPx: 0.55, blur: 1.5, noise: 8 },
];
const trials = 10;
function random(seed: number) {
  return () => { seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
async function film(scenario: typeof scenarios[number], seed: number) {
  const next = random(seed), side = Math.round(emailWidth * scenario.cameraPxPerCssPx), background = { r: 18, g: 10, b: 15 };
  const screen = await sharp(await sharp(asset.content).resize(side, side, { kernel: 'cubic' }).png().toBuffer())
    .rotate((next() - 0.5) * 16, { background }).png().toBuffer();
  const { width = 0, height = 0 } = await sharp(screen).metadata();
  const scene = await sharp({ create: { width: W, height: H, channels: 3, background } })
    .composite([{ input: screen, left: Math.round((W - width) / 2 + (next() - 0.5) * 120), top: Math.round((H - height) / 2 + (next() - 0.5) * 120) }])
    .toColourspace('b-w').raw().toBuffer();
  const sensor = Buffer.alloc(W * H);
  for (let i = 0; i < sensor.length; i++) {
    const grain = Math.sqrt(-2 * Math.log(Math.max(1e-9, next()))) * Math.cos(2 * Math.PI * next()) * scenario.noise;
    sensor[i] = Math.max(0, Math.min(255, Math.round(30 + scene[i] * 140 / 255 + grain)));
  }
  return sharp(sensor, { raw: { width: W, height: H, channels: 1 } }).blur(scenario.blur).toColourspace('b-w').raw().toBuffer();
}
// canvas.drawImage(video, sx, sy, sw, sh, 0, 0, width, height) with bilinear sampling.
function draw(frame: Buffer, r: Region) {
  const out = new Uint8ClampedArray(r.width * r.height * 4), fx = r.sw / r.width, fy = r.sh / r.height;
  for (let y = 0; y < r.height; y++) for (let x = 0; x < r.width; x++) {
    const sx = r.sx + Math.min(r.sw - 1, Math.max(0, (x + 0.5) * fx - 0.5)), sy = r.sy + Math.min(r.sh - 1, Math.max(0, (y + 0.5) * fy - 0.5));
    const x0 = Math.floor(sx), y0 = Math.floor(sy), x1 = Math.min(W - 1, x0 + 1), y1 = Math.min(H - 1, y0 + 1), ax = sx - x0, ay = sy - y0;
    const v = (frame[y0 * W + x0] * (1 - ax) + frame[y0 * W + x1] * ax) * (1 - ay) + (frame[y1 * W + x0] * (1 - ax) + frame[y1 * W + x1] * ax) * ay;
    const o = (y * r.width + x) * 4; out[o] = out[o + 1] = out[o + 2] = v; out[o + 3] = 255;
  }
  return out;
}

// 3. The scanner: a frame counts as read when one of the regions the camera cycles
// through decodes the exact arrival token (never another value).
const regions: Region[] = arrivalScanRegions(W, H);
assert.ok(regions.length > 0 && regions.every(r => r.sx >= 0 && r.sy >= 0 && r.sx + r.sw <= W && r.sy + r.sh <= H), 'regions stay inside the frame');
const failures: string[] = [];
for (const scenario of scenarios) {
  let read = 0;
  for (let seed = 1; seed <= trials; seed++) {
    const frame = await film(scenario, seed);
    const values = regions.map(r => jsQR(draw(frame, r), r.width, r.height, { inversionAttempts: 'dontInvert' })?.data).filter(Boolean);
    for (const value of values) assert.equal(value, arrival, 'the scanner reads the exact arrival token');
    if (values.length) read++;
  }
  console.log(`${read}/${trials} frames read: ${scenario.name} (email QR ${emailWidth} px, ${regions.length} scan region${regions.length > 1 ? 's' : ''})`);
  if (read < trials - 1) failures.push(scenario.name);
}
assert.deepEqual(failures, [], 'the door reads the email QR in at least 9 of 10 frames in every scenario');

// 4. The scene is hard enough to tell the difference: the scanner before #484 (whole
// frame shrunk to 800 px) fails on the email QR as it was shown before (240 px).
let before = 0;
const legacy: Region = { sx: 0, sy: 0, sw: W, sh: H, width: 800, height: 450 }, legacyWidth = 240;
const shown = emailWidth;
emailWidth = legacyWidth;
for (const scenario of scenarios) for (let seed = 1; seed <= trials; seed++) {
  if (jsQR(draw(await film(scenario, seed), legacy), 800, 450, { inversionAttempts: 'dontInvert' })) before++;
}
emailWidth = shown;
console.log(`${before}/${trials * scenarios.length} frames read by the pre-#484 scanner on the 240 px email QR`);
assert.ok(before <= 2, 'the simulated scene defeats the pre-#484 scanner and email size');
console.log('PASS the door camera reads the confirmation email QR');
