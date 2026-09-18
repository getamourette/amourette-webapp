import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import type { Database } from '../lib/database.types';
// @ts-expect-error -- Node source entry.
import { disposeFixtures } from '../tests/helpers/fixture-cleanup.ts';
import type { SupabaseClient } from '@supabase/supabase-js';
// @ts-expect-error -- Node's type-stripping runner resolves explicit extensions.
import { fixtureAuth, signInFixture, authFailure } from '../tests/helpers/fixture-auth.ts';

const smoke = readFileSync('tests/onboarding/arrival-to-chat.spec.ts', 'utf8');
assert.match(smoke, /identity\("Alice", undefined, "anonymous"\)/);
assert.match(smoke, /identity\("Bob", "man", "anonymous"\)/);
assert.equal((smoke.match(/session.user.is_anonymous/g) ?? []).length, 2);
assert.match(readFileSync('.github/workflows/ci.yml', 'utf8'), /E2E_FIXTURE_AUTH: password/);
assert.equal(fixtureAuth(undefined), 'password');
assert.equal(fixtureAuth('password'), 'password');
assert.equal(fixtureAuth('anonymous'), 'anonymous');
for (const value of ['', ' password', 'PASSWORD', 'service_role']) assert.throws(() => fixtureAuth(value));
assert.match(authFailure({ status: 429 }).message, /rate limit/);
assert.match(authFailure({ message: 'Request rate limit reached' }).message, /rate limit/);
assert.doesNotMatch(authFailure({ status: 500 }).message, /rate limit/);

for (const mode of ['password', 'anonymous'] as const) {
  for (const failure of ['none', 'create', 'login', 'no-session', 'wrong-mode'] as const) {
    const calls: string[] = [], owned: string[] = [];
    const user = { id: 'owned-user', role: 'authenticated', is_anonymous: failure === 'wrong-mode' ? mode !== 'anonymous' : mode === 'anonymous' };
    const signIn = async () => {
      calls.push('login');
      return { data: { user, session: failure === 'no-session' ? null : { user } }, error: failure === 'login' ? { status: 429 } : null };
    };
    const service = { auth: { admin: { createUser: async (input: { email_confirm: boolean; app_metadata: { e2e_run: string } }) => {
      calls.push('create'); assert.equal(input.email_confirm, true); assert.equal(input.app_metadata.e2e_run, 'run');
      return { data: { user }, error: failure === 'create' ? { status: 429 } : null };
    } } } } as unknown as SupabaseClient;
    const client = { auth: {
      signInWithPassword: async () => { assert.equal(mode, 'password'); assert.deepEqual(owned, ['owned-user']); return signIn(); },
      signInAnonymously: async () => { assert.equal(mode, 'anonymous'); return signIn(); },
    } } as unknown as SupabaseClient;
    const operation = () => signInFixture(service, client, 'run', id => owned.push(id), mode);
    if (failure === 'none' || (failure === 'create' && mode === 'anonymous')) await operation();
    else await assert.rejects(operation);
    assert.deepEqual(owned, ['owned-user'], 'partial setup remains owned for teardown');
    assert.equal(calls.filter(call => call === 'login').length, failure === 'create' && mode === 'password' ? 0 : 1, 'no blind retry');
  }
}
console.log('Fixture Auth: mode validation, ordinary login, anonymous override and partial failure ownership passed.');

// Cleanup continues after Storage/report failures and still deletes all owned users.
for (const fail of [false, true]) {
  const calls: string[] = [];
  const service = {
    from: (table: string) => ({ delete: () => ({ eq: (_column: string, id: string) => {
      calls.push(`${table}:${id}`);
      if (table === 'reports') return Promise.resolve({ error: fail ? new Error('report failure') : null });
      return { eq: async (_key: string, slug: string) => { assert.equal(slug, 'e2e-run-venue'); return { error: null }; } };
    } }) }),
    storage: { from: () => ({
      list: async (id: string) => { calls.push(`list:${id}`); if (fail && id === 'first') throw new Error('storage unavailable'); return { data: [{ name: 'photo.png' }], error: null }; },
      remove: async (paths: string[]) => { calls.push(`remove:${paths[0]}`); return { error: null }; },
    }) },
    auth: { admin: { deleteUser: async (id: string) => { calls.push(`delete:${id}`); return { error: null }; } } },
  } as unknown as SupabaseClient<Database>;
  const cleanup = () => disposeFixtures(service, 'run', [{ id: 'venue-id', slug: 'e2e-run-venue' }], ['first', 'second']);
  if (fail) await assert.rejects(cleanup, AggregateError); else await cleanup();
  assert.ok(calls.includes('delete:first'));
  assert.ok(calls.includes('delete:second'));
  assert.ok(calls.includes('remove:second/photo.png'));
  assert.ok(calls.includes('venues:venue-id'));
  calls.length = 0;
  await assert.rejects(() => disposeFixtures(service, 'run', [{ id: 'qa', slug: 'test-crowded' }], []), /unowned/);
  assert.deepEqual(calls, [], 'shared QA venue is refused before effects');
}
console.log('Fixture cleanup: partial failures remain red, all owned IDs attempted, shared QA refused.');
