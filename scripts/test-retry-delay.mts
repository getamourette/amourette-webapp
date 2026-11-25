import assert from 'node:assert/strict';
// @ts-expect-error Node strips types and requires source extensions.
import { backoffDelay } from '../lib/retry-delay.ts';

// #486: retries after a shared outage must spread out and grow, not hit the
// backend from every phone in the same second.
const low = () => 0, high = () => 1;
assert.equal(backoffDelay(0, 2000, 30000, low), 1000, 'first retry waits at least half the base');
assert.equal(backoffDelay(0, 2000, 30000, high), 2000, 'first retry waits at most the base');
assert.equal(backoffDelay(1, 2000, 30000, high), 4000, 'each failure doubles the ceiling');
assert.equal(backoffDelay(3, 2000, 30000, low), 8000);
assert.equal(backoffDelay(10, 2000, 30000, high), 30000, 'the ceiling caps the wait');
assert.equal(backoffDelay(10, 2000, 30000, low), 15000, 'even at the cap, phones stay spread over half of it');
assert.equal(backoffDelay(-1, 2000, 30000, high), 2000, 'a negative count is treated as zero');
const spread = new Set(Array.from({ length: 50 }, () => backoffDelay(2, 2000, 30000)));
assert.ok(spread.size > 10, 'the default jitter spreads retries');
for (const value of spread) assert.ok(value >= 4000 && value <= 8000);
console.log('retry delay: growth, cap and jitter passed');
