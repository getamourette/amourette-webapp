import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DEMO_SEED } from './demo-venue-roster.mjs';
import {
  TEST_SEED, randomSeedPassword, retiredTemplatePasswords, seedAccounts, seedScope,
} from './seed-accounts.mjs';

// #370 / SEC-007: this repository is public, so a seeded account must never
// accept a password that can be worked out from it.
const read = file => readFileSync(new URL(file, import.meta.url), 'utf8');
const seedScripts = ['./seed-test-venues.mjs', './seed-demo-venue.mjs'];

for (const file of seedScripts) {
  const source = read(file);
  // Every account password is the per-run random secret: no literal, no
  // template and no value derived from a profile key.
  const assigned = [...source.matchAll(/\bpassword\s*[:=]\s*([^,;\n}]+)/g)].map(match => match[1].trim());
  assert.ok(assigned.length >= 2, `${file}: expected an account password and its consent sign-in`);
  for (const value of assigned) {
    assert.ok(['randomSeedPassword()', 'profile.password'].includes(value), `${file}: password must be random per run, found ${value}`);
  }
  assert.match(source, /const password = randomSeedPassword\(\);\s+const \{ data, error \} = await supabase\.auth\.admin\.createUser\(/);
  assert.equal((source.match(/admin\.createUser\(/g) ?? []).length, 1, `${file}: one guarded account constructor`);
  assert.doesNotMatch(source, /-only-|-2026!/, `${file}: retired template must not come back`);
  // The development-target guard (scripts/test-development-target.mjs) runs
  // before any client exists, so before account creation too.
  assert.ok(source.indexOf('developmentTargetRefusal(supabaseUrl)') > -1, `${file}: must check the target project`);
  assert.ok(source.indexOf('developmentTargetRefusal(supabaseUrl)') < source.indexOf('admin.createUser('), `${file}: target check precedes creation`);
}

// The rotation command never reuses a template and writes only behind its flag.
const rotation = read('./rotate-seed-passwords.mjs');
assert.match(rotation, /updateUserById\(user\.id, \{ password: randomSeedPassword\(\) \}\)/);
assert.equal((rotation.match(/updateUserById\(/g) ?? []).length, 1);
assert.ok(rotation.indexOf('if (!options.confirmed)') < rotation.indexOf('updateUserById('));
assert.doesNotMatch(rotation, /deleteUser|\.from\(/, 'rotation changes passwords only');

const passwords = new Set(Array.from({ length: 200 }, randomSeedPassword));
assert.equal(passwords.size, 200, 'each account gets its own secret');
for (const password of passwords) {
  assert.ok(password.length >= 40 && Buffer.byteLength(password) <= 72, 'long, within the bcrypt input limit');
  assert.match(password, /^[A-Za-z0-9_-]{43}aA1!$/);
}

// Rotation selects synthetic accounts only: a founder or an anonymous
// participant is never in scope.
const users = [
  { id: 't2', email: 'profile-02@seed.amourette.invalid', app_metadata: { test_seed: TEST_SEED } },
  { id: 't1', email: 'profile-01@seed.amourette.invalid', app_metadata: { test_seed: TEST_SEED } },
  { id: 'd1', email: 'demo-01@seed.amourette.invalid', app_metadata: { test_seed: DEMO_SEED } },
  { id: 'o1', email: 'profile-09@seed.paramour.invalid', app_metadata: {} },
  { id: 'o2', email: 'old@example.com', app_metadata: { test_seed: 'retired-seed-v0' } },
  { id: 'founder', email: 'founder@example.com', app_metadata: { provider: 'email' } },
  { id: 'anonymous', is_anonymous: true, app_metadata: {} },
  { id: 'e2e', email: 'e2e-1@example.com', app_metadata: { e2e_run: 'run' } },
  { id: 'lookalike', email: 'profile-01@seed.amourette.invalid.example.com', app_metadata: {} },
];
const ids = scope => seedAccounts(users, scope).map(entry => entry.user.id);
assert.deepEqual(ids('test'), ['t1', 't2']);
assert.deepEqual(ids('demo'), ['d1']);
assert.deepEqual(ids('other'), ['o2', 'o1']);
assert.deepEqual(ids('all'), ['d1', 'o2', 'o1', 't1', 't2']);
for (const id of ['founder', 'anonymous', 'e2e', 'lookalike']) assert.equal(seedScope(users.find(user => user.id === id)), null);

// verify probes exactly the templates published before the fix.
assert.deepEqual(retiredTemplatePasswords(users[1]), ['Test-only-profile-01-2026!', 'Demo-only-profile-01-2026!']);
assert.deepEqual(retiredTemplatePasswords(users[5]), []);
assert.deepEqual(retiredTemplatePasswords(users[6]), []);

process.stdout.write('seed accounts: ok\n');
