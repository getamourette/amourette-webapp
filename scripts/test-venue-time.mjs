import assert from "node:assert/strict";
import { resolveVenueLocalDateTime } from "../lib/venue-time.ts";

const cases = [
  ["Europe/Paris", "2026-03-29T02:30", "nonexistent"],
  ["Europe/Paris", "2026-10-25T02:30", "ambiguous"],
  ["America/New_York", "2026-03-08T02:30", "nonexistent"],
  ["America/New_York", "2026-11-01T01:30", "ambiguous"],
];
for (const [zone, local, reason] of cases) {
  const result = resolveVenueLocalDateTime(local, zone);
  assert.equal(result.ok, false, `${zone} ${local}`);
  if (!result.ok) assert.equal(result.reason, reason);
}
assert.deepEqual(resolveVenueLocalDateTime("2026-07-24T21:00", "Europe/Paris"), {
  ok: true, iso: "2026-07-24T19:00:00.000Z", offsetLabel: "UTC+02:00",
});
assert.deepEqual(resolveVenueLocalDateTime("2026-07-24T21:00", "America/New_York"), {
  ok: true, iso: "2026-07-25T01:00:00.000Z", offsetLabel: "UTC-04:00",
});
console.log("venue-time: all assertions passed");
