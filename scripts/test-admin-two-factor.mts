import assert from 'node:assert/strict';
// @ts-expect-error -- Node's type-stripping runner resolves explicit extensions.
import { normalizeTotpCode, secondFactorState, verifyTotpCode } from '../lib/admin-two-factor.ts';

// #374: the code input contract (docs/reports/input-validation-audit.md).
assert.equal(normalizeTotpCode('123456'), '123456');
assert.equal(normalizeTotpCode(' 123 456 '), '123456');
assert.equal(normalizeTotpCode('012345'), '012345', 'leading zero kept');
for (const refused of ['', '12345', '1234567', '12345a', '１２３４５６', '123-456', '12 34 5']) {
  assert.equal(normalizeTotpCode(refused), null, `refused: ${JSON.stringify(refused)}`);
}
console.log('TOTP code: six ASCII digits after removing spaces; other input refused before any request.');

// Each authenticator enrolled separately has its own secret: the code is tried
// on every verified TOTP factor, stops at the first that accepts it, and an
// unreadable factor list is reported apart from a wrong code.
type Outcome = 'verified' | 'invalid' | 'unavailable';
async function run(factors: string[] | null, accepting: string | null): Promise<{ result: Outcome; tried: string[] }> {
  const tried: string[] = [];
  const auth = { mfa: {
    listFactors: async () => factors
      ? { data: { all: factors.map(id => ({ id, factor_type: 'totp', status: 'verified' })), totp: factors.map(id => ({ id, factor_type: 'totp', status: 'verified' })) }, error: null }
      : { data: null, error: new Error('network') },
    challengeAndVerify: async ({ factorId }: { factorId: string }) => {
      tried.push(factorId);
      return factorId === accepting ? { data: {}, error: null } : { data: null, error: new Error('Invalid TOTP code entered') };
    },
    getAuthenticatorAssuranceLevel: async () => ({ data: null, error: null }),
  } };
  return { result: await verifyTotpCode(auth, '123456'), tried };
}
assert.deepEqual(await run(['phone', 'tablet'], 'phone'), { result: 'verified', tried: ['phone'] });
assert.deepEqual(await run(['phone', 'tablet'], 'tablet'), { result: 'verified', tried: ['phone', 'tablet'] });
assert.deepEqual(await run(['phone', 'tablet'], null), { result: 'invalid', tried: ['phone', 'tablet'] });
assert.deepEqual(await run([], null), { result: 'invalid', tried: [] });
assert.deepEqual(await run(null, null), { result: 'unavailable', tried: [] });
console.log('TOTP verification: every authenticator tried, first match wins, wrong code and unreadable account kept apart.');

const state = (currentLevel: string | null, nextLevel: string | null) => secondFactorState({ mfa: {
  listFactors: async () => ({ data: null, error: null }),
  challengeAndVerify: async () => ({ data: null, error: null }),
  getAuthenticatorAssuranceLevel: async () => ({ data: { currentLevel, nextLevel }, error: null }),
} });
assert.equal(await state('aal1', 'aal2'), 'challenge');
assert.equal(await state('aal2', 'aal2'), 'satisfied');
assert.equal(await state('aal1', 'aal1'), 'none');
assert.equal(await state(null, null), 'unknown', 'no session');
assert.equal(await secondFactorState({ mfa: {
  listFactors: async () => ({ data: null, error: null }),
  challengeAndVerify: async () => ({ data: null, error: null }),
  getAuthenticatorAssuranceLevel: async () => { throw new Error('Invalid JWT structure'); },
} }), 'unknown', 'an undecodable token never blocks the gate');
console.log('Second-factor state: challenge only for a one-factor session of an enrolled account.');
