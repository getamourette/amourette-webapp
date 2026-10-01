import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import ts from 'typescript';
import { changedPaths, isCopyOnly, selectPlan, smoke } from './ci-plan.mjs';

const covers = (plan, path) => plan.mode === 'full' || plan.suites.some(suite => path === suite || path.startsWith(`${suite}/`));
assert.equal(selectPlan(['docs/decisions.md', 'AGENTS.md']).mode, 'docs');
assert.equal(selectPlan(['docs/brand/build.mjs']).mode, 'full');
assert.equal(selectPlan(['lib/strings.ts'], new Set(['lib/strings.ts'])).mode, 'copy');
for (const path of ['lib/auth.ts', 'lib/supabase.ts', 'lib/input-validation.ts', 'lib/entry-cycle.ts', 'lib/venue-time.ts', 'lib/useLocale.ts', 'lib/strings.ts', 'app/globals.css', 'app/layout.tsx', 'components/ui/button.tsx', 'package-lock.json', 'supabase/migrations/new.sql', 'tests/helpers/fixtures.ts', 'playwright.config.ts', '.github/workflows/ci.yml', 'new-area/unknown.ts']) {
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
  ['app/api/profile-photo/route.ts', 'tests/validation/photo-api.spec.ts'],
  ['app/api/profile-photo/upload/route.ts', 'tests/validation/photo-staging.spec.ts'],
  ['app/api/profile-photo/source/route.ts', 'tests/validation/photo-source.spec.ts'],
  ['app/api/email/subscribe/route.ts', 'tests/validation/api.spec.ts'],
  ['app/page.tsx', smoke],
  ['app/admin/EmailCampaigns.tsx', 'tests/admin/email-campaigns.spec.ts'],
  ['app/admin/AdminClient.tsx', 'tests/admin/email-campaigns.spec.ts'],
  ['lib/server/email-delivery.ts', 'tests/admin/email-campaigns.spec.ts'],
  ['app/api/admin/email-campaigns/route.ts', 'tests/admin/email-campaigns.spec.ts'],
  ['emails/UpcomingNightsEmail.tsx', 'tests/admin/email-campaigns.spec.ts'],
  ['tests/profile/editor-back.spec.ts', 'tests/profile/editor-back.spec.ts'],
]) {
  const plan = selectPlan([path]);
  assert.equal(plan.mode, 'targeted', path);
  assert.ok(covers(plan, smoke), `${path} retains the common journey`);
  assert.ok(covers(plan, expected), `${path} covers ${expected}`);
}
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
  assert.equal(JSON.parse(run(copyEnv, ['--run'])).mode, 'copy');
  assert.equal(JSON.parse(run({ ...copyEnv, CI_BASE: fixtureBase })).mode, 'full', 'new dictionaries cannot be exempt');
  writeFileSync(join(directory, 'lib/strings.ts'), before.replace('paris', 'london'));
  git('add', 'lib'); git('commit', '-qm', 'locale behavior');
  assert.equal(JSON.parse(run({ ...copyEnv, CI_HEAD: git('rev-parse', 'HEAD') })).mode, 'full');

} finally {
  process.chdir(original);
  rmSync(directory, { recursive: true, force: true });
}
console.log('CI selection: scope unions, common journey, safe copy edits, fallback and Git boundaries passed.');
