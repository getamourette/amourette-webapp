import assert from "node:assert/strict";
// @ts-expect-error Node's direct TypeScript runner requires the file extension.
import { createVenueSession, venueEffect, venueResources, coalesceVenueChecks, presenceHasEnded } from "../lib/venue-session.ts";

const session = createVenueSession();
const oldEntry = session.signal;
const feed = venueEffect(oldEntry);
const social = venueEffect(oldEntry);
let cleaned = 0;
feed.signal.addEventListener("abort", () => cleaned++);
social.signal.addEventListener("abort", () => cleaned++);
feed.stop();
assert.equal(social.signal.aborted, false, "hiding/unmounting a feed does not stop social resources");
session.stop();
session.stop();
assert.equal(cleaned, 2, "cleanup is synchronous and idempotent");
const newEntry = session.restart();
assert.equal(oldEntry.aborted, true, "late results from the previous entry remain invalid");
assert.equal(newEntry.aborted, false, "explicit re-entry has a fresh generation");
assert.equal(venueEffect(oldEntry).signal.aborted, true, "old effects cannot restart");
let resolveLate!: (value: string) => void;
const lateResponse = new Promise<string>(resolve => { resolveLate = resolve; });
let rendered = "left";
const pendingResult = lateResponse.then(value => { if (!oldEntry.aborted) rendered = value; });
resolveLate("ready");
await pendingResult;
assert.equal(rendered, "left", "a delayed result cannot restore a departed screen");

for (const status of ["left", "ended", "cancelled", "loading", "error", "notfound"]) {
  assert.deepEqual(venueResources(status), { lifecycle: false, heartbeat: false, feed: false, social: false });
}
assert.deepEqual(venueResources("ready"), { lifecycle: true, heartbeat: true, feed: true, social: true });
assert.deepEqual(venueResources("invisible"), { lifecycle: true, heartbeat: true, feed: false, social: true });
assert.deepEqual(venueResources("waiting"), { lifecycle: true, heartbeat: true, feed: false, social: false });
assert.deepEqual(venueResources("paused"), { lifecycle: true, heartbeat: false, feed: false, social: false });

let release!: () => void;
const gate = new Promise<void>(resolve => { release = resolve; });
const forces: boolean[] = [];
let concurrency = 0;
const run = coalesceVenueChecks(newEntry, async force => {
  assert.equal(++concurrency, 1);
  forces.push(force);
  if (forces.length === 1) await gate;
  concurrency--;
}, () => assert.fail("unexpected error"));
const first = run();
await run();
await run(true);
await run();
assert.deepEqual(forces, [false]);
release();
await first;
assert.deepEqual(forces, [false, true], "coalescing preserves a forced check that arrived during a request");
let attempts = 0;
let errors = 0;
const retry = coalesceVenueChecks(newEntry, async () => {
  if (++attempts === 1) throw new Error("network");
}, () => { errors++; });
await retry();
await retry();
assert.equal(errors, 1);
assert.equal(attempts, 2, "failure does not wedge the queue");
session.stop();
await retry(true);
assert.equal(attempts, 2, "stopped sessions cannot start new reads");
console.log("Venue resource lifecycle and coalescing regressions passed.");

const presenceId = "a591a07f-d331-4c99-a544-6ddf49092f78";
assert.equal(presenceHasEnded(null, presenceId), true);
assert.equal(presenceHasEnded({ id: presenceId, left_at: null }, presenceId), false);
assert.equal(presenceHasEnded({ id: presenceId, left_at: "2026-09-18T20:00:00.123456+00:00" }, presenceId), true);
for (const invalid of [undefined, [], {}, { id: presenceId }, { id: "other", left_at: null },
  { id: presenceId, left_at: false }, { id: presenceId, left_at: "yesterday" },
  { id: presenceId, left_at: "" }, { id: presenceId, left_at: "2026-09-18T" + "0".repeat(70) }]) {
  assert.throws(() => presenceHasEnded(invalid, presenceId), /Invalid/);
}

// @ts-expect-error Node's direct TypeScript runner requires the file extension.
const { releaseVenueChannel } = await import("../lib/venue-channel.ts");
for (const result of ["ok", "error", "timed out", "reject"]) {
  let teardown = 0;
  let localClose = 0;
  let failures = 0;
  await releaseVenueChannel({
    async unsubscribe(timeout?: number) { assert.equal(timeout, 0); localClose++; return "ok"; },
    teardown() { teardown++; },
  }, async () => {
    if (result === "reject") throw new Error("transport");
    return result;
  }, () => { failures++; });
  assert.equal(failures, result === "ok" ? 0 : 1);
  assert.equal(teardown, result === "ok" ? 0 : 1);
  assert.equal(localClose, result === "ok" ? 0 : 1);
}
