// Night end time shown in the room header and the chat opener (#483, Z6-I2).
import assert from "node:assert/strict";
// @ts-expect-error Node's direct TypeScript runner requires the file extension.
import { nightEndTime } from "../lib/night-end-time.ts";

// 01:00 UTC on a winter night is 02:00 in Paris and 20:00 in New York.
assert.equal(nightEndTime("2026-12-05T01:00:00Z", "Europe/Paris", "fr"), "02:00");
assert.equal(nightEndTime("2026-12-05T01:00:00Z", "Europe/Paris", "en"), "02:00");
assert.equal(nightEndTime("2026-12-05T01:00:00Z", "America/New_York", "en"), "20:00");
// Midnight is 00:00, never 24:00 or 12:00 AM.
assert.equal(nightEndTime("2026-12-04T23:00:00Z", "Europe/Paris", "es"), "00:00");
// Missing or broken input shows nothing instead of a wrong time.
assert.equal(nightEndTime(null, "Europe/Paris", "fr"), null);
assert.equal(nightEndTime("2026-12-05T01:00:00Z", null, "fr"), null);
assert.equal(nightEndTime("not a date", "Europe/Paris", "fr"), null);
assert.equal(nightEndTime("2026-12-05T01:00:00Z", "Mars/Olympus", "fr"), null);
console.log("Night end time: venue zone, 24-hour clock, nothing on bad input.");
