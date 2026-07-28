import assert from "node:assert/strict";
// @ts-expect-error Node's direct TypeScript runner requires the file extension.
import { resolveEntryCycle, type EntryPresence } from "../lib/entry-cycle.ts";

const active: EntryPresence = { id: "active", left_at: null, is_visible: true };
const ended: EntryPresence = {
  id: "ended",
  left_at: "2026-07-28T20:00:00.000Z",
  is_visible: true,
};

assert.deepEqual(resolveEntryCycle([], false), { kind: "check-in" }, "first arrival");
assert.deepEqual(resolveEntryCycle([active], false), { kind: "resume", presence: active }, "active presence");
assert.deepEqual(resolveEntryCycle([ended], false), { kind: "checked-out" }, "historical departure");
assert.deepEqual(resolveEntryCycle([ended], false), { kind: "checked-out" }, "refresh remains checked out");
assert.deepEqual(resolveEntryCycle([ended], true), { kind: "check-in" }, "confirmed re-entry");
assert.deepEqual(resolveEntryCycle([], false), { kind: "check-in" }, "new venue-night");

process.stdout.write("Entry-cycle resolver regression passed.\n");
