import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import sharp from 'sharp';
// @ts-expect-error -- Node source entry.
import { convertHeic } from '../lib/server/heic-conversion.ts';
// @ts-expect-error -- Node source entry.
import { preparePhoto, prepareRoundPhoto } from '../lib/server/prepare-photo.ts';
// @ts-expect-error -- Node source entry.
import { hasHeicBrand, normalizePhotoFileType } from '../lib/heic.ts';
// @ts-expect-error -- Node source entry.
import { signPhotoTicket, verifyPhotoTicket, signHeicPreviewTicket, verifyHeicPreviewTicket, parseHeicPreviewManifest } from '../lib/server/photo-ticket.ts';

const bytes = (name: string) => readFileSync(`tests/fixtures/heic/${name}.heic`);
const photo = (name: string, type = 'image/heic') => new File([bytes(name)], `${name}.heic`, { type });
const png = async (file: File) => Buffer.from(await (await convertHeic(file)).arrayBuffer());
const raw = (data: Buffer) => sharp(data, { ignoreIcc: true }).toColourspace('rgb16').raw({ depth: 'ushort' }).toBuffer();
const source = bytes('p3-10');
assert.ok(hasHeicBrand(source.subarray(0, 4096)));
assert.equal((await normalizePhotoFileType(photo('p3-10', ''))).type, 'image/heic');
assert.equal((await normalizePhotoFileType(photo('p3-10', 'application/octet-stream'))).type, 'image/heic');
const renamed = new File([new Uint8Array([1, 2, 3])], 'fake.heic', { type: '' });
assert.equal((await normalizePhotoFileType(renamed)).type, '');
const converted = await png(photo('p3-10'));
const metadata = await sharp(converted).metadata();
assert.equal(metadata.width, 128); assert.equal(metadata.height, 96);
assert.equal(metadata.bitsPerSample, 16);
assert.ok(metadata.icc && source.includes(metadata.icc));
assert.equal(metadata.exif, undefined); assert.equal(metadata.xmp, undefined);
const pixels = await raw(converted);
const samples = new Uint16Array(pixels.buffer, pixels.byteOffset, pixels.byteLength / 2);
// An 8-bit intermediate would quantize all samples to multiples of 257.
assert.ok(samples.some(sample => sample % 257 !== 0));
assert.ok(new Set(samples).size > 256);
assert.ok((await png(photo('p3-10', 'image/heif'))).equals(converted));

const upright = await png(photo('p3-orientation-1'));
const uprightPixels = await raw(upright);
for (let orientation = 1; orientation <= 8; orientation++) {
  const fixture = photo(`p3-orientation-${orientation}`);
  assert.ok(bytes(`p3-orientation-${orientation}`).includes(Buffer.from('private-test-marker')));
  const oriented = await png(fixture);
  assert.equal(oriented.includes(Buffer.from('private-test-marker')), false);
  const expected = Buffer.alloc(uprightPixels.length);
  for (let y = 0; y < 96; y++) for (let x = 0; x < 128; x++) {
    const locations = [[x,y],[127-x,y],[127-x,95-y],[x,95-y],[y,x],[95-y,x],[95-y,127-x],[y,127-x]];
    const [ox, oy] = locations[orientation - 1];
    uprightPixels.copy(expected, (oy * (orientation >= 5 ? 96 : 128) + ox) * 6, (y * 128 + x) * 6, (y * 128 + x + 1) * 6);
  }
  assert.ok((await raw(oriented)).equals(expected), `orientation ${orientation}`);
}

const crop = { x: 25, y: 0, width: 50, height: 100 };
const round = { x: 0, y: 0, width: 75, height: 100 };
const prepared = await preparePhoto(photo('p3-10'), crop);
// The existing metadata scrubber also removes non-rendering PNG chunks such as
// pixel density; the retained samples and colour profile must remain identical.
assert.ok((await raw(prepared.source.bytes)).equals(await raw(converted)));
assert.deepEqual((await sharp(prepared.source.bytes).metadata()).icc, metadata.icc);
assert.ok((await raw(prepared.bytes)).equals(await sharp(converted, { ignoreIcc: true }).pipelineColourspace('rgb16')
  .extract({ left: 32, top: 0, width: 64, height: 96 }).toColourspace('rgb16').raw({ depth: 'ushort' }).toBuffer()));
const rounded = await prepareRoundPhoto(prepared.source, round);
assert.equal(rounded.side, 96);
const recropped = await preparePhoto(new File([new Uint8Array(prepared.source.bytes)], 'source.png', { type: 'image/png' }), crop, undefined, true);
assert.ok((await raw(recropped.bytes)).equals(await raw(prepared.bytes)));
assert.deepEqual((await sharp(prepared.bytes).metadata()).icc, metadata.icc);
assert.deepEqual((await sharp(rounded.bytes).metadata()).icc, metadata.icc);

for (const name of ['pq-10', 'hlg-10']) await assert.rejects(() => convertHeic(photo(name)), /unsupported_heic/);
await assert.rejects(() => convertHeic(new File([], 'empty.heic', { type: 'image/heic' })), /invalid_photo/);
await assert.rejects(() => convertHeic(new File([new Uint8Array(20 * 1024 * 1024 + 1)], 'huge.heic', { type: 'image/heic' })), /invalid_photo/);
await assert.rejects(() => convertHeic(new File([source.subarray(0, source.length / 2)], 'truncated.heic', { type: 'image/heic' })), /invalid_photo/);
const huge = Buffer.from(source);
for (let offset = huge.indexOf('ispe'); offset !== -1; offset = huge.indexOf('ispe', offset + 4)) huge.writeUInt32BE(25_000_001, offset + 8);
await assert.rejects(() => convertHeic(new File([huge], 'pixels.heic', { type: 'image/heic' })), /invalid_photo/);
const sequence = Buffer.from(source); sequence.write('msf1', 8);
await assert.rejects(() => convertHeic(new File([sequence], 'sequence.heic', { type: 'image/heic' })), /unsupported_heic/);
const abort = new AbortController(); abort.abort();
await assert.rejects(() => convertHeic(photo('p3-10'), abort.signal));
const during = new AbortController();
const cancelled = convertHeic(photo('p3-10'), during.signal);
setTimeout(() => during.abort(), 1);
await assert.rejects(cancelled);
assert.ok((await png(photo('p3-10'))).length); // cancellation releases the worker slot

const owner = '10000000-0000-0000-0000-000000000001', other = '20000000-0000-0000-0000-000000000001';
const now = Date.now(), secret = 'test-secret';
const ticket = { purpose: 'heic-preview' as const, owner, path: `${owner}/${other}.heic`, type: 'image/heic' as const, size: source.length, expires: now + 600_000 };
const signed = signHeicPreviewTicket(ticket, secret);
assert.deepEqual(verifyHeicPreviewTicket(signed, owner, secret, now), ticket);
assert.throws(() => verifyHeicPreviewTicket(signed, other, secret, now));
assert.throws(() => verifyHeicPreviewTicket(signed, owner, secret, ticket.expires));
assert.throws(() => verifyHeicPreviewTicket(signed + 'x', owner, secret, now));
assert.throws(() => verifyPhotoTicket(signed, owner, secret, now));
const final = signPhotoTicket({ owner, path: ticket.path, type: ticket.type, size: source.length, expires: ticket.expires, revision: 0 }, secret);
assert.throws(() => verifyHeicPreviewTicket(final, owner, secret, now));
assert.equal(verifyPhotoTicket(final, owner, secret, now).type, 'image/heic');
for (const input of [{ type: 'image/png', size: 1 }, { type: 'image/heic', size: 0 }, { type: 'image/heic', size: 20971521 },
  { type: 'image/heic', size: 1, revision: 0 }, { type: 'image/heic', size: '1' }, null]) assert.throws(() => parseHeicPreviewManifest(input));
assert.deepEqual(parseHeicPreviewManifest({ type: 'image/heic', size: 20971520 }), { type: 'image/heic', size: 20971520 });
console.log('HEIC: native precision/profile retention, eight orientations, private metadata removal, independent crops/recrop, HDR/corrupt/pixel/byte refusals, cancellation and purpose-bound tickets passed.');
