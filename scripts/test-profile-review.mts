import assert from 'node:assert/strict';
// @ts-expect-error Node's direct TypeScript runner requires the source extension.
import { REVIEW_FIELDS, correctionMessage, orderedReviews, reviewCorrection, reviewCounts, reviewReady, reviewReasonOptions, type ReviewProfile } from '../lib/profile-review.ts';
// @ts-expect-error Node's direct TypeScript runner requires source extensions.
import { parseReviewPage, parseOwnerReview } from '../lib/profile-review-data.ts';

const profile = (id: string, status: ReviewProfile['status'], resubmission = false, submittedAt = '2026-10-01T18:00:00Z'): ReviewProfile => ({
  id, status, resubmission, submittedAt, revision: 'revision', firstName: 'Camille',
  bio: null, photoPath: null, approvedFields: [], changedFields: [], correction: null,
});
const profiles = [profile('b', 'needs_review'), profile('a', 'needs_review'),
  profile('resubmitted', 'needs_review', true, '2026-10-03T18:00:00Z'),
  profile('waiting', 'awaiting_changes'), profile('approved', 'approved')];
assert.deepEqual(reviewCounts(profiles), { needs_review: 3, awaiting_changes: 1, approved: 1, all: 5 });
assert.deepEqual(reviewCounts([]), { needs_review: 0, awaiting_changes: 0, approved: 0, all: 0 });
assert.deepEqual(orderedReviews(profiles, 'needs_review').map(row => row.id), ['resubmitted', 'a', 'b']);
assert.deepEqual(orderedReviews(profiles, 'awaiting_changes').map(row => row.id), ['waiting']);
assert.deepEqual(orderedReviews(profiles, 'approved').map(row => row.id), ['approved']);
assert.equal(orderedReviews(profiles, 'all').length, 5);
assert.equal(profiles[0].id, 'b', 'Ordering must not mutate the incoming snapshot');

// All seven nonempty field combinations produce one deterministic message,
// independent of click order. A reason from another field must be rejected.
for (let mask = 1; mask < 8; mask++) {
  const corrections = REVIEW_FIELDS.filter((_field, index) => mask & (1 << index))
    .map(field => reviewCorrection(field, reviewReasonOptions(field)[0].value)!);
  const message = correctionMessage(corrections);
  assert.equal(message, correctionMessage([...corrections].reverse()));
  assert.equal((message.match(/Please update/g) ?? []).length, 1);
  for (const correction of corrections) assert.ok(message.includes(correction.field === 'first_name' ? 'name' : correction.field === 'photo' ? 'profile picture' : 'bio'));
  const changed = corrections.map(item => item.field);
  assert.equal(reviewReady(corrections, changed, true), true);
  assert.equal(reviewReady(corrections, changed.slice(1), true), false, 'Partial updates cannot submit');
  assert.equal(reviewReady(corrections, changed, false), false, 'UI cannot override server readiness');
}
assert.equal(correctionMessage([]), '');
assert.equal(reviewCorrection('bio', 'face_unclear'), null);
assert.equal(reviewCorrection('photo', 'hateful'), null);
assert.equal(reviewCorrection('first_name', ' inappropriate '), null);
assert.equal(reviewCorrection('photo', 'FACE_UNCLEAR'), null);
assert.equal(reviewCorrection('photo', 'legacy_unknown'), null, 'A historical missing reason is not a new request preset');
assert.equal(reviewCorrection('bio', ''), null);
assert.deepEqual(reviewCorrection('photo', 'face_unclear'), { field: 'photo', reason: 'face_unclear' });
assert.equal(reviewReady([], [], true), false);
assert.equal(reviewReady([{ field: 'bio', reason: 'harassment' }], ['first_name', 'photo'], true), false);
assert.equal(reviewReady([{ field: 'bio', reason: 'harassment' }, { field: 'bio', reason: 'harassment' }], ['bio'], true), false);
const id = '00000000-0000-4000-8000-000000000001';
const valid = { ...profile(id, 'needs_review'), revision: id };
const page = { venueId: id, filter: 'needs_review', offset: 0, counts: { needs_review: 1, awaiting_changes: 0, approved: 0, all: 1 }, profiles: [valid] };
assert.equal(parseReviewPage(page, id, 'needs_review', 0).profile?.id, id);
for (const changed of [null, [], { ...page, venueId: 'wrong' }, { ...page, filter: 'all' }, { ...page, offset: 1 },
  { ...page, counts: { ...page.counts, all: 2 } }, { ...page, counts: { ...page.counts, all: '1' } },
  { ...page, profiles: [valid, valid] }, { ...page, profiles: [{ ...valid, revision: null }] },
  { ...page, profiles: [{ ...valid, resubmission: null }] }, { ...page, profiles: [{ ...valid, firstName: '😀'.repeat(31) }] },
  { ...page, profiles: [{ ...valid, changedFields: ['bio','bio'] }] }, { ...page, profiles: [{ ...valid, status: 'awaiting_changes' }] }]) {
  assert.throws(() => parseReviewPage(changed, id, 'needs_review', 0));
}
const owner = { profileId: id, requestId: id, revision: id, status: 'awaiting_changes', fields: [{ field: 'bio', reason: 'harassment' }], updatedFields: [], canSubmit: false, notification: true };
assert.equal(parseOwnerReview(null, id), null);
assert.equal(parseOwnerReview(owner, id)?.canSubmit, false);
assert.deepEqual(parseOwnerReview({ ...owner, fields: [{ field: 'photo', reason: 'legacy_unknown' }] }, id)?.fields, [{ field: 'photo', reason: 'legacy_unknown' }]);
for (const changed of [{ ...owner, profileId: 'foreign' }, { ...owner, canSubmit: 'true' }, { ...owner, fields: [] }, { ...owner, status: 'approved' },
  { ...owner, fields: [{ field: 'bio', reason: 'face_unclear' }] }, { ...owner, fields: [{ field: 'bio', reason: 'legacy_unknown' }] }, { ...owner, fields: [{ field: 'photo', reason: null }] }, { ...owner, fields: [{ field: 'bio', reason: 'harassment', extra: true }] }]) {
  assert.throws(() => parseOwnerReview(changed, id));
}
console.log('Profile review: presentation rules and malformed transport refusals passed.');
