import assert from 'node:assert/strict';
// @ts-expect-error -- executed by node --experimental-strip-types, not bundled.
import { PHOTO_REASONS, photoQueuePriority, photoStoragePath, validPhotoBytes } from '../lib/photo-moderation.ts';
assert.equal(PHOTO_REASONS.length, 5);
assert.equal(photoQueuePriority({ correction_required: true, displayed_status: 'rejected' }), 0);
assert.equal(photoQueuePriority({ correction_required: false, displayed_status: 'unverified' }), 1);
assert.equal(photoQueuePriority({ correction_required: false, displayed_status: 'approved' }), 2);
assert.equal(photoStoragePath('https://project.supabase.co/storage/v1/object/public/profile-photos/owner/photo.jpg'), 'owner/photo.jpg');
assert.equal(photoStoragePath('/test-profiles/portrait-1.svg'), null);
assert.equal(validPhotoBytes(new Uint8Array([137,80,78,71,13,10,26,10]), 'image/png'), true);
assert.equal(validPhotoBytes(new Uint8Array([137,80,78,71]), 'image/png'), false);
assert.equal(validPhotoBytes(new Uint8Array([255,216,255]), 'image/jpeg'), true);
assert.equal(validPhotoBytes(new Uint8Array(5 * 1024 * 1024 + 1), 'image/jpeg'), false);
assert.equal(validPhotoBytes(new TextEncoder().encode('<svg/>'), 'image/svg+xml'), false);
console.log('Photo queue, path compatibility and upload preflight checks passed.');
