import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, readdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import ts from 'typescript';
import { automaticBrowserResumesAt, browserExemption, browserShards, changedPaths, fullSuiteAreas, isCopyOnly, maxRepeatedSpecs, needsBrowser, overflowSweep, loadTimings, repeatEach, repeatedSpecs, repeatSummary, selectedSpecs, selectPlan, shardSpecs, specWeight, smoke, undeclaredAreas } from './ci-plan.mjs';
import { specSeconds } from './browser-timings.mjs';

for (const path of ['app/chat/page.tsx', 'lib/auth.ts']) {
  const plan = selectPlan([path]);
  assert.equal(plan.checks, true, 'non-browser validation remains required');
  assert.equal(needsBrowser(plan, 'pull_request', false, automaticBrowserResumesAt - 1), false);
  assert.match(browserExemption(plan, 'pull_request', false, automaticBrowserResumesAt - 1), /temporarily suspended.*No browser coverage/);
  for (const now of [automaticBrowserResumesAt - 1, automaticBrowserResumesAt, automaticBrowserResumesAt + 1]) {
    assert.equal(needsBrowser(plan, 'workflow_dispatch', true, now), true, 'manual runs always execute');
    assert.equal(needsBrowser(plan, 'workflow_dispatch', false, now), true);
    assert.equal(browserExemption(plan, 'workflow_dispatch', false, now), '');
    assert.equal(needsBrowser(plan, 'pull_request', true, now), needsBrowser(plan, 'pull_request', false, now), 'drafts get the same coverage as ready PRs');
  }
  assert.equal(needsBrowser(plan, 'pull_request', false, automaticBrowserResumesAt), true, 'resume at exact UTC boundary');
  assert.equal(needsBrowser(plan, 'pull_request', false, automaticBrowserResumesAt + 1), true);
  assert.equal(browserExemption(plan, 'pull_request', false, automaticBrowserResumesAt), '');
}
for (const plan of [selectPlan(['docs/decisions.md']), selectPlan(['lib/strings.ts'], new Set(['lib/strings.ts']))]) {
  assert.equal(browserExemption(plan, 'pull_request', false, automaticBrowserResumesAt - 1), '');
}
assert.equal(needsBrowser(selectPlan(['docs/decisions.md']), 'pull_request', false, automaticBrowserResumesAt), false, 'the documentation exemption remains');

const covers = (plan, path) => plan.mode === 'full' || plan.suites.some(suite => path === suite || path.startsWith(`${suite}/`));
assert.equal(selectPlan(['docs/decisions.md', 'AGENTS.md']).mode, 'docs');
// One file per decision stays documentation-only; code in that folder does not.
assert.equal(selectPlan(['docs/decisions/2026-11-23-one-file-per-decision.md']).mode, 'docs');
assert.equal(selectPlan(['docs/decisions/build.mjs']).mode, 'full');
assert.equal(selectPlan(['docs/brand/build.mjs']).mode, 'full');
assert.equal(selectPlan(['lib/strings.ts'], new Set(['lib/strings.ts'])).mode, 'copy');
for (const path of ['lib/auth.ts', 'lib/supabase.ts', 'lib/input-validation.ts', 'lib/entry-cycle.ts', 'lib/venue-time.ts', 'lib/useLocale.ts', 'app/globals.css', 'app/layout.tsx', 'components/ui/button.tsx', 'package-lock.json', 'supabase/migrations/new.sql', 'supabase/migrations/20261025000001_launch_reservation_hardening.sql', 'tests/helpers/fixtures.ts', 'playwright.config.ts', '.github/workflows/ci.yml', 'new-area/unknown.ts']) {
  assert.equal(selectPlan([path]).mode, 'full', path);
}
for (const [path, expected] of [
  ['app/profile/ProfileEditor.tsx', 'tests/profile/editor-back.spec.ts'],
  ['app/profile/OnboardingWizard.tsx', 'tests/moderation/photos.spec.ts'],
  ['app/chat/[matchId]/page.tsx', 'tests/match-chat/chat.spec.ts'],
  ['lib/chat-delivery.ts', 'tests/profile/chat-preview.spec.ts'],
  ['app/v/[venueSlug]/page.tsx', 'tests/match-chat/chat.spec.ts'],
  ['components/ProfilePhoto.tsx', 'tests/moderation/photos.spec.ts'],
  ['app/admin/PhotoQueue.tsx', 'tests/profile/chat-preview.spec.ts'],
  ['app/admin/ProfileReview.module.css', 'tests/admin/profile-review-layout.spec.ts'],
  ['app/admin/NightPage.tsx', 'tests/admin/night-page.spec.ts'],
  ['app/admin/AdminShell.tsx', 'tests/moderation/live-queue.spec.ts'],
  ['app/admin/(console)/venues/page.tsx', 'tests/security/headers.spec.ts'],
  ['app/admin/ArrivalCamera.tsx', 'tests/security/camera-permission.spec.ts'],
  ['app/api/admin/launch/refunds/route.ts', 'tests/admin/reservation-operations.spec.ts'],
  ['lib/admin-dashboard.ts', 'tests/admin/night-page.spec.ts'],
  ['lib/night-report.ts', 'tests/admin/night-report.spec.ts'],
  ['app/api/launch/checkout/route.ts', 'tests/reservations/booking.spec.ts'],
  ['app/api/launch/arrival-qr/route.ts', 'tests/api/reservation-qr.spec.ts'],
  ['app/events/[nightId]/page.tsx', 'tests/reservations/booking.spec.ts'],
  ['app/reservations/access/page.tsx', 'tests/reservations/booking.spec.ts'],
  ['app/preview/reservation-qr/page.tsx', 'tests/api/reservation-qr.spec.ts'],
  ['components/booking/EventBooking.tsx', 'tests/reservations/booking.spec.ts'],
  ['components/ReservationQr.tsx', 'tests/api/reservation-qr.spec.ts'],
  ['lib/booking.ts', 'tests/reservations/booking.spec.ts'],
  ['lib/launch-operations.ts', 'tests/admin/arrival-operations.spec.ts'],
  ['lib/server/launch-engine.ts', 'tests/reservations/booking.spec.ts'],
  ['lib/cancellation-strings.ts', 'tests/reservations/booking.spec.ts'],
  ['lib/reservation-configuration.ts', 'tests/admin/reservation-operations.spec.ts'],
  ['app/reservation-terms/page.tsx', 'tests/onboarding/legal-pages.spec.ts'],
  ['app/reservation-terms/page.tsx', 'tests/reservations/booking.spec.ts'],
  ['app/v/[venueSlug]/RoomCards.tsx', 'tests/room/venue-listing.spec.ts'],
  ['lib/empty-room.ts', 'tests/room/feedback.spec.ts'],
  ['app/admin/(console)/layout.tsx', 'tests/profile/unified-profile-review-ui.spec.ts'],
  ['app/admin/(console)/moderation/page.tsx', 'tests/profile/text-corrections-ui.spec.ts'],
  ['lib/booking-privacy.ts', 'tests/onboarding/privacy-policy.spec.ts'],
  ['lib/booking-privacy.ts', 'tests/reservations/booking.spec.ts'],
  ['app/terms/page.tsx', 'tests/onboarding/legal-pages.spec.ts'],
  ['app/legal/page.tsx', 'tests/onboarding/legal-pages.spec.ts'],
  ['app/privacy/page.tsx', 'tests/onboarding/privacy-policy.spec.ts'],
  ['components/LegalDocument.tsx', 'tests/onboarding/legal-pages.spec.ts'],
  ['app/api/profile-photo/route.ts', 'tests/validation/photo-api.spec.ts'],
  ['app/api/profile-photo/upload/route.ts', 'tests/validation/photo-staging.spec.ts'],
  ['app/api/profile-photo/source/route.ts', 'tests/validation/photo-source.spec.ts'],
  ['app/api/email/subscribe/route.ts', 'tests/validation/api.spec.ts'],
  ['app/page.tsx', smoke],
  ['app/(landing)/page.tsx', 'tests/validation/api.spec.ts'],
  ['app/(landing)/layout.tsx', 'tests/validation/api.spec.ts'],
  ['tests/profile/editor-back.spec.ts', 'tests/profile/editor-back.spec.ts'],
]) {
  const plan = selectPlan([path]);
  assert.equal(plan.mode, 'targeted', path);
  assert.ok(covers(plan, smoke), `${path} retains the common journey`);
  assert.ok(covers(plan, expected), `${path} covers ${expected}`);
}
// The founder console no longer drags the participant profile and chat suites.
assert.ok(!covers(selectPlan(['app/admin/NightPage.tsx']), 'tests/profile/editor-back.spec.ts'));
// Shared helpers that only look like a mapped area keep the full suite.
for (const path of ['lib/admin-password-recovery.ts', 'lib/admin-venue-workspace.ts', 'lib/venue-session.ts', 'lib/legal.ts', 'emails/ReservationAccessEmail.tsx', 'lib/launch/nested.ts']) {
  assert.equal(selectPlan([path]).mode, 'full', path);
}

// A logic test adds no browser suite; the code it travels with still selects its own.
assert.deepEqual(selectPlan(['scripts/test-launch-guest.mjs']), { mode: 'targeted', checks: true, suites: [overflowSweep, smoke] });
assert.ok(covers(selectPlan(['scripts/test-launch-guest.mjs', 'lib/launch-contract.ts']), 'tests/reservations/booking.spec.ts'));
for (const path of ['scripts/launch-test-database.mjs', 'scripts/ci-reuse.mjs', 'scripts/test-fixtures/data.mjs']) {
  assert.equal(selectPlan([path]).mode, 'full', path);
}

// Every file under app/ is either mapped to suites or full-suite on purpose, so
// a new area cannot silently fall back to the full suite (or be forgotten).
const undeclared = undeclaredAreas(readdirSync('app', { recursive: true, withFileTypes: true })
  .filter(entry => entry.isFile()).map(entry => `${entry.parentPath}/${entry.name}`.replaceAll('\\', '/')));
assert.deepEqual(undeclared, [], `Undeclared app files: ${undeclared.join(', ')}. Map their area to its browser suites in suitesFor (scripts/ci-plan.mjs), or add them to fullSuiteAreas if the full suite is intended.`);
for (const entry of fullSuiteAreas) {
  assert.ok(existsSync(entry), `${entry} is listed in fullSuiteAreas but no longer exists`);
  assert.equal(selectPlan([entry]).mode, 'full', entry);
}
assert.deepEqual(undeclaredAreas(['app/new-area/page.tsx', 'app/api/new-endpoint/route.ts', 'app/(public)/help/page.tsx', 'app/NewShared.tsx', 'app/admin/Anything.tsx', 'app/layout.tsx']),
  ['app/new-area/page.tsx', 'app/api/new-endpoint/route.ts', 'app/(public)/help/page.tsx', 'app/NewShared.tsx']);

// Non-copy dictionary edits stay targeted: the build type-checks every key.
assert.deepEqual(selectPlan(['lib/strings.ts']), { mode: 'targeted', checks: true, suites: [overflowSweep, smoke] });
// #420: a longer string is the usual cause of overflowing text. Copy-only changes
// run the overflow sweep and nothing else; every other selection includes it.
const copyPlan = selectPlan(['lib/strings.ts'], new Set(['lib/strings.ts']));
assert.deepEqual(copyPlan, { mode: 'copy', checks: true, suites: [overflowSweep] });
assert.equal(needsBrowser(copyPlan, 'pull_request', false, automaticBrowserResumesAt), true, 'copy changes run the overflow sweep');
assert.equal(needsBrowser(copyPlan, 'pull_request', true, automaticBrowserResumesAt), true);
assert.deepEqual(browserShards(copyPlan), [1]);
assert.ok(covers(selectPlan(['app/chat/[matchId]/page.tsx']), 'tests/layout/text-overflow.spec.ts'));
assert.equal(needsBrowser(selectPlan(['docs/workflow.md']), 'pull_request', false, automaticBrowserResumesAt), false, 'documentation stays exempt');
// A spec in any suite folder, including one created later, selects itself.
for (const spec of ['tests/room/empty-room.spec.ts', 'tests/admin/dashboard.spec.ts', 'tests/future-area/journey.spec.ts']) {
  assert.deepEqual(selectPlan([spec]), { mode: 'targeted', checks: true, suites: [spec, smoke, overflowSweep].sort() });
}
assert.equal(selectPlan(['tests/helpers/fixtures.ts']).mode, 'full');
// The full suite splits across runners; a targeted selection stays on one.
assert.deepEqual(browserShards(selectPlan(['lib/strings.ts'])), [1]);
// A large targeted selection splits too, one runner per 12 spec files, capped at four.
const sized = files => browserShards({ mode: 'targeted', suites: ['tests/area'] }, () => files);
assert.deepEqual([1, 12, 13, 24, 25, 37, 400].map(files => sized(files).length), [1, 1, 2, 2, 3, 4, 4]);
assert.ok(browserShards(selectPlan(['app/admin/NightPage.tsx'])).length > 1, 'the console selection is too large for one runner');
assert.deepEqual(browserShards(selectPlan([], new Set(), true)), [1, 2, 3, 4]);
// A spec the pull request adds or changes is repeated; helpers, logic tests,
// deleted specs and duplicates are not. Real paths: the spec must exist at head.
// Shards balanced on measured durations: every selected spec runs exactly once,
// and no shard carries much more than its share.
{
  const timings = loadTimings();
  const all = selectedSpecs(selectPlan([], new Set(), true));
  const onDisk = readdirSync('tests', { recursive: true }).map(name => `tests/${String(name)}`).filter(path => /\.(?:spec|test)\.[cm]?[jt]sx?$/.test(path)).sort();
  assert.deepEqual(all, onDisk, 'the full suite selects every spec file under tests/');
  for (const [spec, seconds] of Object.entries(timings)) {
    assert.ok(all.includes(spec), `${spec} is in scripts/browser-timings.json but no longer exists: refresh the table`);
    assert.ok(Number.isInteger(seconds) && seconds > 0, spec);
  }
  // Each shard passes its files to Playwright as filters, which match by substring.
  for (const spec of all) assert.deepEqual(all.filter(other => other.includes(spec)), [spec], `${spec} would also select another spec`);
  // A spec added since the last refresh weighs the median: it must not fail this
  // test before the table is refreshed.
  const weight = specWeight(all, timings);
  const loads = split => split.map(files => files.reduce((sum, file) => sum + weight(file), 0));
  const withUnknown = [...all, 'tests/new-area/new.spec.ts'].sort();
  for (const total of [1, 2, 3, 4]) {
    const split = shardSpecs(all, total, timings);
    assert.equal(split.length, total);
    assert.deepEqual(split.flat().sort(), all, `${total} shards: each spec exactly once`);
    assert.deepEqual(shardSpecs([...all].reverse(), total, timings), split, 'every shard job computes the same split');
    const sum = loads(split).reduce((a, b) => a + b, 0);
    assert.ok(Math.max(...loads(split)) <= sum / total * 1.1, `${total} shards are balanced: ${loads(split)}`);
    const unknownLoads = shardSpecs(withUnknown, total, timings).map(files => files.reduce((sum, file) => sum + specWeight(withUnknown, timings)(file), 0));
    assert.ok(unknownLoads.every(Number.isFinite) && Math.max(...unknownLoads) <= unknownLoads.reduce((a, b) => a + b, 0) / total * 1.1, `${total} shards with an unknown spec: ${unknownLoads}`);
  }
  // Playwright's count-based split of the same files, for comparison.
  const byCount = Array.from({ length: 4 }, (_, index) => all.slice(Math.floor(index * all.length / 4), Math.floor((index + 1) * all.length / 4)));
  assert.ok(Math.max(...loads(shardSpecs(all, 4, timings))) < Math.max(...loads(byCount)));
  // An unknown spec weighs the median and still runs once; a selection smaller
  // than the shard count leaves a shard empty instead of duplicating a file.
  const withNew = shardSpecs([...all, 'tests/new-area/new.spec.ts'], 4, timings);
  assert.equal(withNew.flat().filter(file => file === 'tests/new-area/new.spec.ts').length, 1);
  assert.deepEqual(shardSpecs(['tests/a/one.spec.ts'], 2, {}), [['tests/a/one.spec.ts'], []]);
  // Targeted suites expand to their files without duplicates.
  const listed = suite => suite.endsWith('.spec.ts') ? [suite] : [`${suite}/a.spec.ts`, `${suite}/b.spec.ts`];
  assert.deepEqual(selectedSpecs({ mode: 'targeted', suites: ['tests/x', 'tests/x/a.spec.ts', 'tests/y/c.spec.ts'] }, listed),
    ['tests/x/a.spec.ts', 'tests/x/b.spec.ts', 'tests/y/c.spec.ts']);
  // The refresh script reads Playwright's list reporter, retries included.
  assert.deepEqual(specSeconds([
    '2026-11-28T16:07:10Z   ✓    1 [chromium-mobile] › tests/reservations/booking.spec.ts:77:5 › a hold (693ms)',
    '  ✘    2 [chromium-mobile] › tests/reservations/booking.spec.ts:102:5 › a channel (1.5s)',
    '  ✓    3 [chromium-mobile] › tests/reservations/booking.spec.ts:102:5 › a channel (retry #1) (2.0s)',
    '  ✓    4 [chromium-mobile] › tests/room/x.spec.ts:1:1 › slow (1.2m)',
    '  -    5 [chromium-mobile] › tests/room/y.spec.ts:1:1 › skipped',
  ].join('\n')), { 'tests/reservations/booking.spec.ts': 4.193, 'tests/room/x.spec.ts': 72 });
}
assert.equal(repeatEach, 10);
assert.deepEqual(repeatedSpecs(['tests/room/session-refresh.spec.ts', 'tests/helpers/fixtures.ts', 'scripts/test-like-sql.mjs', 'tests/room/deleted-journey.spec.ts', 'tests/room/session-refresh.spec.ts', 'tests/admin/night-page.spec.ts', 'app/admin/NightPage.tsx']),
  { specs: ['tests/admin/night-page.spec.ts', 'tests/room/session-refresh.spec.ts'], skipped: [] });
assert.deepEqual(repeatedSpecs(['docs/workflow.md', 'tests/helpers/fixtures.ts']), { specs: [], skipped: [] });
assert.equal(repeatSummary({ specs: [], skipped: [] }), '', 'no changed spec: nothing to repeat or report');
// Over the cap, the first specs in sorted order are repeated and the rest are named.
const many = Array.from({ length: maxRepeatedSpecs + 2 }, (_, index) => `tests/area/journey-${index}.spec.ts`);
const capped = repeatedSpecs(many.toReversed(), () => true);
assert.deepEqual(capped, { specs: many.slice(0, maxRepeatedSpecs), skipped: many.slice(maxRepeatedSpecs) });
assert.match(repeatSummary(capped), /repeated 10 times without retry: `tests\/area\/journey-0\.spec\.ts`.*\nOver the cap of 6, NOT repeated .*`tests\/area\/journey-7\.spec\.ts`/s);
// Each repetition counts as one file for sharding: one changed spec next to the
// common journey and the sweep takes two runners; the full suite stays at four.
assert.deepEqual(browserShards(selectPlan(['tests/room/session-refresh.spec.ts'])), [1], 'without repetition one runner suffices');
assert.deepEqual(browserShards(selectPlan(['tests/room/session-refresh.spec.ts']), undefined, 1), [1, 2]);
assert.deepEqual(browserShards(selectPlan([], new Set(), true), undefined, maxRepeatedSpecs), [1, 2, 3, 4]);
assert.ok(covers(selectPlan(['lib/photo-strings.ts']), 'tests/moderation/photos.spec.ts'));
assert.deepEqual(selectPlan(['lib/email-preference-strings.ts']).suites, ['tests/layout', 'tests/onboarding/arrival-to-chat.spec.ts', 'tests/validation/api.spec.ts']);
assert.equal(selectPlan(['lib/strings.ts', 'lib/auth.ts']).mode, 'full');
assert.equal(needsBrowser(selectPlan(['lib/strings.ts']), 'schedule', false), true, 'nightly runs always execute');
assert.equal(needsBrowser(selectPlan(['docs/roadmap.md']), 'merge_group', undefined), true, 'merge queue entries always execute');
const mixed = selectPlan(['docs/decisions.md', 'app/chat/[matchId]/page.tsx', 'app/profile/ProfileEditor.tsx']);
assert.ok(covers(mixed, 'tests/match-chat/chat.spec.ts'));
assert.ok(covers(mixed, 'tests/profile/editor-back.spec.ts'));
assert.equal(selectPlan(['docs/decisions.md'], new Set(), true).mode, 'full');
assert.equal(selectPlan([]).mode, 'full');
assert.equal(selectPlan(['lib/strings.ts', 'lib/auth.ts'], new Set(['lib/strings.ts'])).mode, 'full');

const before = 'const cities = ["paris"]; export const t = { en: { title: "Hello", nested: { send: "Send" }, count: (n) => `${n} people` } };';
assert.ok(isCopyOnly(ts, before, before.replace('Hello', 'Welcome').replace('"Send"', '`Submit`'), 't'));
for (const after of [
  before.replace('paris', 'london'), before.replace('title:', 'label:'),
  before.replace('en:', 'fr:'), before.replace('${n}', '${n + 1}'),
  before.replace('"Hello"', 'getTitle()'), before.replace('"Hello"', 'null'),
  before.replace('nested:', 'other:'), before + '\nrunEffect();',
  before.replace('"Hello"', '"unterminated'),
]) assert.equal(isCopyOnly(ts, before, after, 't'), false, after);
assert.equal(isCopyOnly(ts, 'const t = {};', 'const t = {};', 't'), false);

// Real Git histories ensure earlier PR commits, renames, deletions and unusual
// filenames cannot disappear through a latest-commit-only or line-based diff.
const directory = mkdtempSync(join(tmpdir(), 'amourette-ci-plan-'));
const original = process.cwd();
const script = resolve('scripts/ci-plan.mjs');
const git = (...args) => execFileSync('git', args, { cwd: directory, encoding: 'utf8' }).trim();
try {
  git('init', '-q');
  git('config', 'user.email', 'ci-plan@example.com');
  git('config', 'user.name', 'CI plan test');
  writeFileSync(join(directory, 'auth.ts'), 'auth');
  git('add', '.'); git('commit', '-qm', 'initial');
  const base = git('rev-parse', 'HEAD');
  git('mv', 'auth.ts', 'renamed\nfile.ts'); git('commit', '-qm', 'rename');
  writeFileSync(join(directory, 'README.md'), 'copy');
  git('add', '.'); git('commit', '-qm', 'docs');
  const head = git('rev-parse', 'HEAD');
  process.chdir(directory);
  assert.deepEqual(changedPaths(base, head).sort(), ['README.md', 'auth.ts', 'renamed\nfile.ts'].sort());
  assert.throws(() => changedPaths('--help', head), /commit SHAs/);
  assert.throws(() => changedPaths(undefined, head), /commit SHAs/);
  assert.throws(() => changedPaths('0'.repeat(40), head));
  const run = (env, args = []) => execFileSync(process.execPath, [script, ...args], { encoding: 'utf8', env: { ...process.env, GITHUB_OUTPUT: '', GITHUB_STEP_SUMMARY: '', ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
  assert.throws(() => run({ GITHUB_EVENT_NAME: 'pull_request', CI_BASE: '', CI_HEAD: head }));
  assert.throws(() => run({ GITHUB_EVENT_NAME: 'push', CI_BASE: base, CI_HEAD: head }));
  assert.equal(JSON.parse(run({ GITHUB_EVENT_NAME: 'workflow_dispatch', CI_BASE: '', CI_HEAD: '' })).mode, 'full');
  const prEnv = { GITHUB_EVENT_NAME: 'pull_request', CI_BASE: base, CI_HEAD: head };
  assert.throws(() => run(prEnv, ['--unknown']));
  assert.throws(() => run(prEnv, ['--run', '--paths-only']));

  // Exercise the CLI end to end, including a runner output file, without a DB.
  const fixtureBase = head;
  writeFileSync(join(directory, 'README.md'), 'new docs');
  git('add', '.'); git('commit', '-qm', 'docs only');
  const output = join(directory, 'outputs');
  const summary = join(directory, 'summary');
  const docsEnv = { ...prEnv, CI_BASE: fixtureBase, CI_HEAD: git('rev-parse', 'HEAD'), GITHUB_OUTPUT: output, GITHUB_STEP_SUMMARY: summary };
  assert.equal(JSON.parse(run(docsEnv, ['--run'])).mode, 'docs');
  assert.match(readFileSync(output, 'utf8'), /checks=false/);
  assert.match(readFileSync(summary, 'utf8'), /Documentation only/);
  mkdirSync(join(directory, 'lib'));
  writeFileSync(join(directory, 'lib/strings.ts'), before);
  git('add', 'lib'); git('commit', '-qm', 'dictionary');
  const copyBase = git('rev-parse', 'HEAD');
  writeFileSync(join(directory, 'lib/strings.ts'), before.replace('Hello', 'Welcome'));
  git('add', 'lib'); git('commit', '-qm', 'copy');
  const copyEnv = { ...prEnv, CI_BASE: copyBase, CI_HEAD: git('rev-parse', 'HEAD') };
  assert.equal(JSON.parse(run(copyEnv)).mode, 'copy');
  assert.equal(JSON.parse(run(copyEnv, ['--paths-only'])).checks, true);
  // No --run here: a copy change now starts the browser sweep, which needs the application.
  assert.deepEqual(JSON.parse(run(copyEnv)).suites, [overflowSweep]);
  assert.equal(JSON.parse(run({ ...copyEnv, CI_BASE: fixtureBase })).mode, 'targeted', 'new dictionaries are never copy-exempt');
  writeFileSync(join(directory, 'lib/strings.ts'), before.replace('paris', 'london'));
  git('add', 'lib'); git('commit', '-qm', 'locale behavior');
  assert.equal(JSON.parse(run({ ...copyEnv, CI_HEAD: git('rev-parse', 'HEAD') })).mode, 'targeted', 'dictionary behavior runs the common journey');
  assert.equal(JSON.parse(run({ GITHUB_EVENT_NAME: 'schedule', CI_BASE: '', CI_HEAD: '' })).mode, 'full');

} finally {
  process.chdir(original);
  rmSync(directory, { recursive: true, force: true });
}
console.log('CI selection: scope unions, common journey, safe copy edits, fallback and Git boundaries passed.');
