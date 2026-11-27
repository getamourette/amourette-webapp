// Runs every fast logic test: each `scripts/test-*.{mjs,mts,ts}` file except the
// integration scripts listed below. Adding a logic test means adding a file with
// that name; package.json does not change. `--list` prints the files without
// running them.
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const scriptsDir = new URL('.', import.meta.url).pathname;

// Scripts that need a real database, a deployed service or secrets, or that are
// modules imported by such a script. They run through their own npm command.
const integration = new Set([
  'test-email-delivery-e2e.mjs', // deployed email endpoint and Resend
  'test-email-subscription-revocation.mjs', // development Supabase project
  'test-email-subscriptions.mjs', // development Supabase project
  'test-launch-channel-journey.mjs', // .env.local, a build and the Stripe test sandbox
  'test-launch-concurrency.mjs', // PostgreSQL 17, imported by test-like-concurrency
  'test-launch-http.mjs', // own CI step after the build
  'test-launch-sandbox.mjs', // .env.local and the Stripe test sandbox
  'test-photo-routes-http.mjs', // own CI step after the build
  'test-like-concurrency.mjs', // PostgreSQL 17 (LIKE_TEST_DATABASE_URL)
  'test-name-concurrency.mjs', // imported by test-like-concurrency
  'test-participant-concurrency.mjs', // imported by test-like-concurrency
  'test-profile-edit-concurrency.mjs', // imported by test-like-concurrency
  'test-text-moderation-concurrency.mjs', // imported by test-like-concurrency
  'test-venue-night-lifecycle.mjs', // development Supabase project and pg_cron
]);

for (const name of integration) {
  if (!existsSync(join(scriptsDir, name))) throw new Error(`Integration list names a missing file: scripts/${name}`);
}

const tests = readdirSync(scriptsDir)
  .filter(name => /^test-[^/]+\.(?:mjs|mts|ts)$/.test(name) && !integration.has(name))
  .sort()
  .map(name => `scripts/${name}`);

if (tests.length === 0) throw new Error('No logic test found under scripts/test-*.');

if (process.argv.includes('--list')) {
  console.log(tests.join('\n'));
  process.exit(0);
}

const failed = [];
for (const test of tests) {
  console.log(`\n▶ ${test}`);
  const { status, signal } = spawnSync(process.execPath, ['--experimental-strip-types', test], { stdio: 'inherit' });
  if (status !== 0) failed.push(`${test} (${signal ?? `exit ${status}`})`);
}

console.log(`\n${tests.length - failed.length}/${tests.length} logic test files passed.`);
if (failed.length) {
  console.error(`Failed:\n${failed.map(test => `  ${test}`).join('\n')}`);
  process.exit(1);
}
