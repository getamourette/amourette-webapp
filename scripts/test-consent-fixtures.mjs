import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { randomUUID } from 'node:crypto';
import { hasMatchingPreferences, requireTesterMatchingPreferences, matchingPreferencesCompatible } from './qa-matching.mjs';

const valid = { gender: 'woman', interested_in: ['man'] };
const absent = { gender: null, interested_in: null };
for (const invalid of [null, absent, { ...valid, interested_in: [] }, { ...valid, interested_in: 'man' },
  { ...valid, gender: null }, { ...valid, interested_in: ['man', 'man'] }, { ...valid, interested_in: ['unknown'] }]) {
  assert.equal(hasMatchingPreferences(invalid), false);
  assert.throws(() => requireTesterMatchingPreferences(invalid), /explicitly agree/);
  assert.equal(matchingPreferencesCompatible(valid, invalid), false);
  assert.equal(matchingPreferencesCompatible(invalid, valid), false);
}
assert.equal(matchingPreferencesCompatible(valid, { gender: 'man', interested_in: ['woman'] }), true);
assert.equal(matchingPreferencesCompatible(valid, { gender: 'man', interested_in: ['man'] }), false);

// Execute the actual seeding preflight with read/write stand-ins. Never access
// shared fixtures: an invalid tester must fail before the first venue mutation.
const seed = readFileSync(new URL('./seed-test-venues.mjs', import.meta.url), 'utf8');
const preflight = seed.slice(seed.indexOf('const { error: consentMigrationError }'), seed.indexOf('process.stdout.write(`Creating'));
assert.ok(preflight.includes('clearSeededData'));
for (const tester of [absent, valid, null]) {
  const effects = [];
  const run = runInNewContext(`(async () => { ${preflight} })()`, {
    supabase: { rpc: async () => ({ error: { code: '42501' } }) },
    process: { env: { NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'synthetic' } },
    testerProfileId: tester ? 'synthetic-tester' : null,
    loadTester: async () => tester,
    requireTesterMatchingPreferences,
    buildProfiles: profile => profile ? [profile.interested_in[0]] : [],
    ensureTestVenues: async () => { effects.push('venues'); return []; },
    ensureTestVenueNights: async () => { effects.push('nights'); return []; },
    clearSeededData: async () => { effects.push('clear'); },
    fail: message => { throw new Error(message); },
  });
  if (tester === absent) {
    await assert.rejects(run, /explicitly agree/);
    assert.deepEqual(effects, []);
  } else {
    await run;
    assert.deepEqual(effects, ['venues', 'nights', 'clear']);
  }
}

// Exercise the lifecycle script's real fixture constructor: absent preferences
// are inserted first, then only the authenticated participant grants agreement.
const lifecycle = readFileSync(new URL('./test-venue-night-lifecycle.mjs', import.meta.url), 'utf8');
const constructor = lifecycle.slice(lifecycle.indexOf('async function createUser(index)'), lifecycle.indexOf('async function createVenue('));
for (const index of [0, 1]) {
  const effects = [], userIds = [], client = {};
  const user = await runInNewContext(`(async () => { ${constructor}; return createUser(${index}); })()`, {
    runId: 'synthetic', password: 'synthetic', userIds, crypto: { randomUUID }, assert,
    service: { auth: { admin: { createUser: async () => ({ data: { user: { id: `user-${index}` } } }) } } },
    insert: async (table, row) => {
      effects.push(table);
      if (table === 'profiles') { assert.equal(row.gender, null); assert.equal(row.interested_in, null); }
    },
    signIn: async () => { effects.push('sign-in'); return client; },
    rpcOne: async (actor, name, args) => {
      assert.equal(actor, client); assert.equal(name, 'grant_my_matching_consent');
      assert.equal(args.p_consent, true); assert.equal(args.p_gender, index % 2 ? 'woman' : 'man');
      assert.equal(args.p_expected_revision, null);
      effects.push('consent'); return [{ status: 'saved', active: true }];
    },
  });
  assert.deepEqual(effects, ['profiles', 'profile_private', 'sign-in', 'consent']);
  assert.deepEqual(userIds, [`user-${index}`]);
  assert.equal(user.client, client);
}
console.log('Consent QA preflight, nullable compatibility and lifecycle fixture construction passed without shared writes.');
