import assert from 'node:assert/strict';
// @ts-expect-error -- Node source entry.
import { signHeicSourceTicket, verifyHeicSourceTicket, signHeicPreviewTicket, signPhotoTicket, verifyPhotoTicket, verifyHeicPreviewTicket } from '../lib/server/photo-ticket.ts';

// #278: the reference to a stored HEIC conversion is owner-bound, short-lived
// and cannot stand in for (or be replaced by) another kind of photo ticket.
const owner = '10000000-0000-0000-0000-000000000001', other = '20000000-0000-0000-0000-000000000001';
const file = '30000000-0000-0000-0000-000000000001';
const secret = 'test-secret', now = Date.now();
const ticket = { purpose: 'heic-source' as const, owner, path: `${owner}/${file}.png`, expires: now + 600_000 };
const signed = signHeicSourceTicket(ticket, secret);
assert.deepEqual(verifyHeicSourceTicket(signed, owner, secret, now), ticket);
assert.throws(() => verifyHeicSourceTicket(signed, other, secret, now), /invalid_ticket/);
assert.throws(() => verifyHeicSourceTicket(signed, owner, 'other-secret', now), /invalid_ticket/);
assert.throws(() => verifyHeicSourceTicket(signed, owner, secret, ticket.expires), /invalid_ticket/);
assert.throws(() => verifyHeicSourceTicket(signed + 'x', owner, secret, now), /invalid_ticket/);
for (const forged of [
  { ...ticket, path: `${other}/${file}.png` }, { ...ticket, path: `${owner}/${file}.heic` }, { ...ticket, path: `${owner}/../${file}.png` },
  { ...ticket, expires: now + 600_001 }, { ...ticket, purpose: 'heic-preview' }, { ...ticket, size: 1 },
]) assert.throws(() => verifyHeicSourceTicket(signHeicSourceTicket(forged as typeof ticket, secret), owner, secret, now), /invalid_ticket/);
// No cross-use with the preview or final upload tickets.
assert.throws(() => verifyPhotoTicket(signed, owner, secret, now));
assert.throws(() => verifyHeicPreviewTicket(signed, owner, secret, now));
const preview = signHeicPreviewTicket({ purpose: 'heic-preview', owner, path: `${owner}/${file}.heic`, type: 'image/heic', size: 10, expires: ticket.expires }, secret);
assert.throws(() => verifyHeicSourceTicket(preview, owner, secret, now), /invalid_ticket/);
const upload = signPhotoTicket({ owner, path: `${owner}/${file}.png`, type: 'image/png', size: 10, revision: 0, expires: ticket.expires }, secret);
assert.throws(() => verifyHeicSourceTicket(upload, owner, secret, now), /invalid_ticket/);
console.log('HEIC source tickets: owner, path, expiry and purpose bound; no cross-use with preview or upload tickets.');
