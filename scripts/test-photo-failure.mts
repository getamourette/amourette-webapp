import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
// @ts-expect-error -- Node source entry.
import { convertHeic } from '../lib/server/heic-conversion.ts';
// @ts-expect-error -- Node source entry.
import { photoFailure } from '../lib/server/photo-failure.ts';

// Saturate the real converter: it holds at most two conversions per instance,
// so a third concurrent photo gets its genuine busy error (#485).
const source = readFileSync('tests/fixtures/heic/p3-10.heic');
const photo = () => new File([source], 'photo.heic', { type: 'image/heic' });
const results = await Promise.allSettled([convertHeic(photo()), convertHeic(photo()), convertHeic(photo())]);
const busy = results.find(result => result.status === 'rejected');
assert.ok(busy && busy.status === 'rejected', 'a third concurrent conversion must be refused');
assert.equal((busy.reason as Error).message, 'decoder_busy');

// A busy, stalled or crashed converter is temporary: retryable 503, never "invalid photo".
for (const reason of [busy.reason, new Error('conversion_timeout'), new Error('decoder_unavailable')]) {
  assert.deepEqual(photoFailure(reason), { status: 503, error: 'converter_busy' }, (reason as Error).message);
}
// Genuine refusals keep their status and code.
for (const code of ['crop_too_large', 'bio_too_long', 'unsupported_heic', 'heic_too_large']) {
  assert.deepEqual(photoFailure(new Error(code)), { status: 400, error: code });
}
assert.deepEqual(photoFailure(new Error('invalid_photo')), { status: 400, error: 'invalid_photo' });
assert.deepEqual(photoFailure(new Error('conversion_cancelled')), { status: 400, error: 'invalid_photo' });
assert.deepEqual(photoFailure(new Error('stale')), { status: 409, error: 'invalid_photo' });
assert.deepEqual(photoFailure('not an error'), { status: 400, error: 'invalid_photo' });
console.log('Photo failures: a saturated, stalled or crashed HEIC converter answers a retryable 503; refusals keep their 400/409.');
