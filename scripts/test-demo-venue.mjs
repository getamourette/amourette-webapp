import assert from 'node:assert/strict';
import { DEMO_ROSTER, MAX_ARMED, armedFor, checkInTimes, feedFor, validateRoster } from './demo-venue-roster.mjs';

validateRoster(DEMO_ROSTER);

// The demo phone's feed: 12 cards, armed exactly at positions 3 to 10.
const founder = { gender: 'man', interestedIn: ['woman'] };
const feed = feedFor(founder);
assert.equal(feed.length, 12);
assert.deepEqual(feed.filter(card => card.armed).map(card => card.position), [3, 4, 5, 6, 7, 8, 9, 10]);
assert.equal(armedFor(founder).length, 8);

// "The third card is always armed" holds while armed matches remain, because a
// matched card leaves the feed and the order is stable.
let remaining = feed.map(card => ({ ...card }));
for (let demo = 1; demo <= 8; demo += 1) {
  assert.equal(remaining[2].armed, true, `demo ${demo}: third card must be armed`);
  remaining = remaining.filter((_, index) => index !== 2);
}
assert.equal(remaining[2].armed, false, 'after eight demos the third card is a plain profile');

// Armed profiles are only those the demo phone can actually see.
for (const viewer of [{ gender: 'woman', interestedIn: ['man'] }, { gender: 'nonbinary', interestedIn: ['woman', 'man', 'nonbinary'] }]) {
  assert.ok(feedFor(viewer).length >= 3, `a ${viewer.gender} trying the room still sees a populated feed`);
  for (const card of armedFor(viewer)) assert.ok(card.interestedIn.includes(viewer.gender));
}

const times = checkInTimes(DEMO_ROSTER.length, Date.parse('2026-11-11T16:00:00Z'));
assert.ok(times.every((time, index) => index === 0 || time > times[index - 1]), 'check-ins are strictly increasing');
assert.ok(Date.parse(times.at(-1)) < Date.parse('2026-11-11T16:00:00Z') - 10 * 60_000, 'no seeded card shows as just arrived');

const sample = DEMO_ROSTER[0];
assert.throws(() => validateRoster([sample, { ...sample, key: 'demo-99' }]), /Duplicate first name/);
assert.throws(() => validateRoster([{ ...sample, firstName: 'x'.repeat(31) }]), /Invalid first name/);
assert.throws(() => validateRoster([{ ...sample, bio: ' padded' }]), /Invalid bio/);
assert.throws(() => validateRoster([{ ...sample, interestedIn: [] }]), /Invalid interestedIn/);
assert.throws(() => validateRoster(Array.from({ length: MAX_ARMED + 1 }, (_, index) => ({ ...sample, key: `demo-${String(index + 10)}`, firstName: `N${index}`, armed: true }))), /At most/);

process.stdout.write('demo venue roster: ok\n');
