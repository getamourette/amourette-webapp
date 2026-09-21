import assert from 'node:assert/strict';
import { mock } from 'node:test';
// @ts-expect-error Node's type stripping requires the explicit source extension.
import { createModerationRefresh, isModerationSignal } from '../lib/moderation-refresh.ts';

mock.timers.enable({ apis: ['setTimeout'] });
const flush = async () => { await Promise.resolve(); await Promise.resolve(); };
let calls = 0;
let release: () => void = () => {};
let signal: AbortSignal | undefined;
const refresh = createModerationRefresh(async nextSignal => {
  calls++;
  signal = nextSignal;
  await new Promise<void>(resolve => { release = resolve; });
});
for (let i = 0; i < 100; i++) refresh.request();
mock.timers.tick(199);
assert.equal(calls, 0);
mock.timers.tick(1);
assert.equal(calls, 1, 'a burst creates one read');
for (let i = 0; i < 100; i++) refresh.request(true);
mock.timers.tick(1000);
assert.equal(calls, 1, 'no overlapping reads');
release(); await flush();
mock.timers.tick(200);
assert.equal(calls, 2, 'changes during the read cause one follow-up');
release(); await flush();
mock.timers.tick(1000);
assert.equal(calls, 2, 'settled queue stops fetching');
refresh.request();
refresh.request(true);
mock.timers.tick(0);
assert.equal(calls, 3, 'foreground/manual recovery bypasses debounce');
refresh.request();
refresh.dispose();
assert.equal(signal?.aborted, true);
release(); await flush();
refresh.request(true);
mock.timers.tick(1000);
assert.equal(calls, 3, 'unmount cancels in-flight work and queued follow-up');

assert.equal(isModerationSignal({ version: 1 }), true);
const messageId = '9539e8da-5822-4c91-8cf5-21a8f5074722';
assert.equal(isModerationSignal({ id: messageId, version: 1 }), true, 'accept the deployed realtime.send envelope');
for (const id of [null, undefined, 1, '', 'report-id', ` ${messageId}`, `${messageId} `, messageId.repeat(2)]) {
  assert.equal(isModerationSignal({ version: 1, id }), false);
}
assert.equal(isModerationSignal({ version: 1, id: messageId, note: 'private' }), false);
for (const value of [null, undefined, [], '1', 1, {}, { version: '1' }, { version: 0 }, { version: 2 }, { version: null }, { version: 1, note: 'private' }]) {
  assert.equal(isModerationSignal(value), false);
}
mock.timers.reset();
console.log('moderation refresh: burst, race, recovery, disposal and signal validation passed');
