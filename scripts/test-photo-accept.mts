import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
// @ts-expect-error -- Node source entry.
import { PHOTO_ACCEPT } from '../lib/heic.ts';

// iOS keeps an iPhone photo as HEIC when the picker lists a HEIC type, and
// hands over a JPEG copy when it does not. Listing HEIC sends every iPhone
// photo through the slow server conversion, so the picker must not offer it.
const offered = PHOTO_ACCEPT.split(',');
assert.deepEqual(offered, ['image/jpeg', 'image/png', 'image/webp']);
for (const entry of offered) assert.doesNotMatch(entry, /hei[cf]/i, `picker offers ${entry}`);

// Every photo file input must use that list, so no picker brings HEIC back.
const files = (dir: string): string[] => readdirSync(dir, { withFileTypes: true })
  .flatMap(entry => entry.isDirectory() ? files(join(dir, entry.name)) : /\.tsx$/.test(entry.name) ? [join(dir, entry.name)] : []);
const inputs = files('app').flatMap(file => (readFileSync(file, 'utf8').match(/<input[^>]*type="file"[^>]*>/g) ?? []).map(tag => ({ file, tag })));
assert.ok(inputs.length >= 3, 'photo file inputs found');
for (const { file, tag } of inputs) assert.match(tag, /accept=\{PHOTO_ACCEPT\}/, `${file} has a file input without PHOTO_ACCEPT`);
console.log(`Photo picker: offers JPEG, PNG and WebP only, used by all ${inputs.length} file inputs.`);
