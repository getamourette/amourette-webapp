import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEVELOPMENT_PROJECT_REF, assertBrowserTestTarget, assertDevelopmentTarget, browserTestTargetRefusal, developmentTargetRefusal } from './development-target.mjs';

// #367 / SEC-004: seed, QA and real-database test tooling runs with a key that
// bypasses RLS. It must refuse every project except the development one, so a
// production URL in the environment can never be seeded, reset or tested.
const development = `https://${DEVELOPMENT_PROJECT_REF}.supabase.co`;
assert.equal(developmentTargetRefusal(development), null);
assert.equal(developmentTargetRefusal(`${development}/`), null);
assert.doesNotThrow(() => assertDevelopmentTarget(development));

const refused = [
  'https://abcdefghijklmnopqrst.supabase.co', // any other project, production included
  `https://${DEVELOPMENT_PROJECT_REF}.supabase.co.example.com`,
  `https://${DEVELOPMENT_PROJECT_REF}.example.com`,
  `https://x${DEVELOPMENT_PROJECT_REF}.supabase.co`,
  `https://${DEVELOPMENT_PROJECT_REF}.supabase.com`,
  `http://${DEVELOPMENT_PROJECT_REF}.supabase.co`,
  `https://${DEVELOPMENT_PROJECT_REF}.supabase.co:8443`,
  `https://user:secret@${DEVELOPMENT_PROJECT_REF}.supabase.co`,
  `https://example.com/${DEVELOPMENT_PROJECT_REF}.supabase.co`,
  'https://api.getamourette.com',
  'http://127.0.0.1:54321',
  `${DEVELOPMENT_PROJECT_REF}.supabase.co`,
  ` ${development}x`,
  'not a url',
  '',
  undefined,
  null,
];
for (const url of refused) {
  assert.match(developmentTargetRefusal(url) ?? '', /^Refusing to run/, `must refuse ${url}`);
  assert.throws(() => assertDevelopmentTarget(url), /Refusing to run/);
}
// The message never echoes the refused URL or any key.
assert.doesNotMatch(developmentTargetRefusal('https://abcdefghijklmnopqrst.supabase.co'), /abcdefghijklmnopqrst/);

// The browser test helper also accepts the disposable stack a CI runner starts
// on its own loopback: exactly http://127.0.0.1:54321, nothing near it.
const localStack = 'http://127.0.0.1:54321';
for (const url of [development, `${development}/`, localStack, `${localStack}/`]) {
  assert.equal(browserTestTargetRefusal(url), null, `must accept ${url}`);
  assert.doesNotThrow(() => assertBrowserTestTarget(url));
}
const refusedLocal = [
  'http://localhost:54321',
  'https://127.0.0.1:54321',
  'http://127.0.0.1',
  'http://127.0.0.1:54322',
  'http://127.0.0.1:5432',
  'http://127.0.0.2:54321',
  'http://0.0.0.0:54321',
  'http://[::1]:54321',
  'http://192.168.1.10:54321',
  'http://user:secret@127.0.0.1:54321',
  'http://user@127.0.0.1:54321',
  'http://127.0.0.1.example.com:54321',
  'http://example.com:54321',
  '127.0.0.1:54321',
];
for (const url of [...refused.filter(url => url !== localStack), ...refusedLocal]) {
  assert.match(browserTestTargetRefusal(url) ?? '', /^Refusing to run/, `browser helper must refuse ${url}`);
  assert.throws(() => assertBrowserTestTarget(url), /Refusing to run/);
  assert.match(developmentTargetRefusal(url) ?? '', /^Refusing to run/, `strict guard must refuse ${url}`);
}

// Every tool that reads the service-role key from the environment must check
// its target before it can build a client. Application code under app/ and
// lib/ is out of scope: it has to run against production.
const root = fileURLToPath(new URL('..', import.meta.url));
const exempt = new Map([
  ['scripts/development-target.mjs', 'the guard itself'],
  ['scripts/test-development-target.mjs', 'this test'],
  ['scripts/test-launch-http.mjs', 'passes a placeholder key to an isolated local server; no Supabase project is contacted'],
  ['scripts/preview-profile-review.mjs', 'blanks the key for a stubbed local preview'],
  ['tests/helpers/fixtures.ts', 'receives the key from testEnv(), which is guarded'],
]);
const files = [];
const walk = directory => {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) walk(path);
    else if (/\.(mjs|mts|ts|js)$/.test(entry.name)) files.push(path);
  }
};
walk(join(root, 'scripts'));
walk(join(root, 'tests'));

const guard = /\b(?:developmentTargetRefusal|assertDevelopmentTarget|browserTestTargetRefusal|assertBrowserTestTarget)\(/;
// The loopback exception belongs to the browser test helper alone.
const localException = /\b(?:browserTestTargetRefusal|assertBrowserTestTarget)\b/;
const localExceptionUsers = [];
const guarded = [];
for (const path of files) {
  const name = relative(root, path);
  const source = readFileSync(path, 'utf8');
  if (localException.test(source)) localExceptionUsers.push(name);
  if (!/SERVICE_ROLE|serviceKey|serviceRoleKey/.test(source)) continue;
  if (exempt.has(name)) continue;
  const check = source.search(guard);
  assert.ok(check > -1, `${name}: uses the service-role key without the development-target guard`);
  const client = source.indexOf('createClient(');
  if (client > -1) assert.ok(check < client, `${name}: the target check must precede the first Supabase client`);
  guarded.push(name);
}
// The list is explicit so that removing a guard, or a file silently leaving
// the scan, fails here instead of passing unnoticed.
assert.deepEqual(guarded.sort(), [
  'scripts/qa.mjs',
  'scripts/rotate-seed-passwords.mjs',
  'scripts/seed-demo-venue.mjs',
  'scripts/seed-test-venues.mjs',
  'scripts/test-email-delivery-e2e.mjs',
  'scripts/test-email-subscription-revocation.mjs',
  'scripts/test-email-subscriptions.mjs',
  'scripts/test-venue-night-lifecycle.mjs',
  'tests/helpers/env.ts',
]);
assert.deepEqual(localExceptionUsers.sort(), ['scripts/development-target.mjs', 'scripts/test-development-target.mjs', 'tests/helpers/env.ts']);
for (const name of exempt.keys()) assert.ok(files.some(path => relative(root, path) === name), `${name}: stale exemption`);

// The opt-in variable from #370 is gone: one fixed target, nothing to configure.
for (const name of ['.env.example', 'scripts/seed-accounts.mjs']) {
  assert.doesNotMatch(readFileSync(join(root, name), 'utf8'), /SEED_ALLOWED_PROJECT_REF/, `${name}: retired variable`);
}

process.stdout.write('development target: ok\n');
