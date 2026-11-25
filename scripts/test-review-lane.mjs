import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { announced, evaluateLane, fastLineLimit, laneFor, opening, riskLine } from './review-lane.mjs';

const file = (path, extra = {}) => ({ path, status: 'modified', changes: 10, ...extra });
const lane = (...paths) => laneFor(paths.map(path => typeof path === 'string' ? file(path) : path));

// Fast: copy, ordinary docs, a small interface or logic fix with its test.
for (const paths of [
  ['lib/strings.ts'],
  ['docs/roadmap.md', 'docs/decisions/2026-11-25-something.md', 'README.md'],
  ['app/v/[venueSlug]/page.tsx', 'tests/room/empty-room.spec.ts'],
  ['lib/empty-room.ts', 'scripts/test-empty-room-states.mts'],
  ['components/ProfilePhoto.tsx', 'public/brand/logo.svg', 'emails/WelcomeEmail.tsx'],
  ['docs/brand/explorations/round-18/capture.png'],
]) assert.deepEqual(lane(...paths), { lane: 'fast', reasons: [] }, paths.join(' '));

// Sensitive, with the reason the founder reads.
for (const [path, reason] of [
  ['supabase/migrations/20261125000001_x.sql', 'database'],
  ['supabase/seed.sql', 'database'],
  ['scripts/input-validation-preflight.sql', 'database'],
  ['lib/database.types.ts', 'database'],
  ['AGENTS.md', 'agent rules'],
  ['CLAUDE.md', 'agent rules'],
  ['docs/workflow.md', 'agent rules'],
  ['.claude/skills/ship/SKILL.md', 'agent rules'],
  ['.codex/skills/pick/SKILL.md', 'agent rules'],
  ['.github/workflows/ci.yml', 'CI'],
  ['.github/pull_request_template.md', 'CI'],
  ['scripts/ci-plan.mjs', 'CI or database tooling'],
  ['scripts/seed-test-venues.mjs', 'CI or database tooling'],
  ['scripts/review-lane.mjs', 'CI or database tooling'],
  ['package.json', 'dependencies or configuration'],
  ['package-lock.json', 'dependencies or configuration'],
  ['proxy.ts', 'dependencies or configuration'],
  ['next.config.ts', 'dependencies or configuration'],
  ['vercel.json', 'dependencies or configuration'],
  ['.env.example', 'dependencies or configuration'],
  ['lib/auth.ts', 'auth or session'],
  ['lib/supabase.ts', 'auth or session'],
  ['lib/guest-session.ts', 'auth or session'],
  ['lib/security-headers.ts', 'auth or session'],
  ['app/api/admin/reports/route.ts', 'server code'],
  ['app/api/profile-photo/route.ts', 'server code'],
  ['lib/server/photo-service.ts', 'server code'],
  ['app/reservations/[id]/page.tsx', 'reservations and payments'],
  ['app/events/[slug]/page.tsx', 'reservations and payments'],
  ['components/booking/Checkout.tsx', 'reservations and payments'],
  ['components/ReservationQr.tsx', 'reservations and payments'],
  ['emails/ReservationAccessEmail.tsx', 'reservations and payments'],
  ['lib/launch-cancellation.ts', 'reservations and payments'],
  ['lib/booking-strings.ts', 'reservations and payments'],
  ['lib/free-cancellation.ts', 'reservations and payments'],
  ['docs/launch-reservation-policy.md', 'legal or production policy'],
  ['docs/production-cutover.md', 'legal or production policy'],
  ['lib/privacy-policy.ts', 'legal or production policy'],
  ['infra/terraform/main.tf', 'unclassified path'],
]) assert.deepEqual(lane(path), { lane: 'sensitive', reasons: [reason] }, path);

// One sensitive file is enough, and every reason is listed once.
assert.deepEqual(lane('lib/strings.ts', 'supabase/migrations/a.sql', 'supabase/migrations/b.sql', 'package.json'),
  { lane: 'sensitive', reasons: ['database', 'dependencies or configuration'] });

// Anything that disables a check.
assert.deepEqual(lane(file('tests/room/like.spec.ts', { status: 'removed' })).reasons, ['test removed']);
assert.deepEqual(lane(file('scripts/test-like-sql.mjs', { status: 'removed' })).reasons, ['test removed']);
for (const line of ['+  test.skip(true, "later");', "+test.fixme('reveals the match', async () => {", '+  test.only("x", () => {});', "+describe.skip('suite', () => {"]) {
  assert.deepEqual(lane(file('tests/room/like.spec.ts', { patch: `@@ -1 +1 @@\n context\n${line}` })).reasons, ['test disabled'], line);
}
// Removing a skip, or a skip already there, is not disabling one.
assert.equal(lane(file('tests/room/like.spec.ts', { patch: '@@ -1 +1 @@\n-  test.skip(true, "later");\n   test.fixme("old");' })).lane, 'fast');
// A removed page or helper is an ordinary change.
assert.equal(lane(file('app/profile/Old.tsx', { status: 'removed' }), file('tests/helpers/old.ts', { status: 'removed' })).lane, 'fast');

// Small means small: tests and docs do not count, application code does.
assert.equal(lane(file('app/v/x.tsx', { changes: fastLineLimit })).lane, 'fast');
assert.deepEqual(lane(file('app/v/x.tsx', { changes: fastLineLimit - 9 }), file('lib/empty-room.ts', { changes: 10 })).reasons,
  [`more than ${fastLineLimit} changed lines of application code`]);
assert.equal(lane(file('app/v/x.tsx', { changes: 50 }), file('tests/room/x.spec.ts', { changes: 2000 }), file('docs/roadmap.md', { changes: 900 })).lane, 'fast');

// The founder card.
const card = risk => `**What changes:** Something.\n\n**Review:** Hosted reviewer: fine.\n\n${risk}\n\n**Your action:** Nothing.\n`;
assert.equal(riskLine(card('**Risk:** Fast lane. No migration.\r')), 'Fast lane. No migration.');
assert.equal(riskLine('no card'), null);
assert.equal(announced('Fast lane. No migration.'), 'fast');
assert.equal(announced('sensitive lane (database): additive migration.'), 'sensitive');
assert.equal(announced('No migration. Fast lane.'), null, 'the lane opens the line');
assert.equal(announced('Fastlane'), null);
assert.equal(announced(null), null);
assert.equal(opening(lane('lib/strings.ts')), 'Fast lane.');
assert.equal(opening(lane('supabase/a.sql', 'package.json')), 'Sensitive lane (database, dependencies or configuration).');

const fast = [file('app/v/x.tsx')];
const sensitive = [file('supabase/migrations/a.sql')];
const level = (body, files, draft = false) => evaluateLane({ draft, body, files }).level;

// The untouched template announces no lane.
const template = readFileSync('.github/pull_request_template.md', 'utf8');
assert.equal(riskLine(template), '');
assert.equal(level(template, fast), 'fail');

// A draft is never blocked.
assert.equal(level(template, sensitive, true), 'pass');
assert.equal(level(card('**Risk:** Fast lane.'), sensitive, true), 'pass');

// Ready: the lane must be there and must not understate the files.
assert.equal(level(card('**Risk:** No migration.'), fast), 'fail');
assert.equal(level('', fast), 'fail');
assert.equal(level(card('**Risk:** Fast lane. No migration.'), fast), 'pass');
assert.equal(level(card('**Risk:** Fast lane. No migration.'), sensitive), 'fail');
assert.equal(level(card('**Risk:** Sensitive lane (database): additive migration.'), sensitive), 'pass');
// Escalating is always allowed.
assert.equal(level(card('**Risk:** Sensitive lane (product invariant): touches the like reveal.'), fast), 'pass');

const failure = evaluateLane({ draft: false, body: card('**Risk:** Fast lane.'), files: [...sensitive, file('package.json')] }).message;
assert.match(failure, /Sensitive lane \(database, dependencies or configuration\)\./, 'the failure gives the opening to write');

console.log('review-lane: all assertions passed');
