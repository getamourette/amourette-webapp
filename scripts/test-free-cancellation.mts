import assert from "node:assert/strict";
// @ts-expect-error -- Node type-stripping tests resolve explicit extensions.
import { freeCancellationOver, freeCancellationText, lateAcknowledgementRequired } from "../lib/free-cancellation.ts";

// #439: a night whose registration opens less than 48 hours before its start is
// past its free-cancellation deadline from the first booking.
const deadline = "2026-11-23T08:00:00Z";
assert.equal(freeCancellationOver("2026-11-21T08:00:00Z", deadline), false, "before the deadline");
assert.equal(freeCancellationOver(deadline, deadline), false, "the deadline instant is still free");
assert.equal(freeCancellationOver("2026-11-23T08:00:00.001Z", deadline), true, "one millisecond later");
assert.equal(freeCancellationOver("2026-11-23T09:15:00+01:00", deadline), true, "the production reading: 09:15 Paris, deadline 09:00 Paris");

// #477: the 30-minute payment hold can end after the deadline, so the booking page asks for
// the late acknowledgement from 30 minutes before it, as the server requires.
assert.equal(lateAcknowledgementRequired("2026-11-23T07:30:00Z", deadline), false, "a hold ending at the deadline instant is still free");
assert.equal(lateAcknowledgementRequired("2026-11-23T07:30:00.001Z", deadline), true, "a hold ending after the deadline");
assert.equal(lateAcknowledgementRequired("2026-11-23T07:50:00Z", deadline), true, "ten minutes before the deadline");
assert.equal(lateAcknowledgementRequired("2026-11-23T09:15:00+01:00", deadline), true, "after the deadline");
assert.equal(lateAcknowledgementRequired("2026-11-23T07:00:00Z", deadline), false, "an hour before the deadline");

const date = "Monday, November 23, 2026 at 9:00 AM";
const before = { en: `until ${date}`, fr: `jusqu’au ${date}`, es: `hasta el ${date}` };
const after = { en: "no longer possible for this evening", fr: "plus possible pour cette soirée", es: "ya no es posible para esta noche" };
for (const locale of ["en", "fr", "es"] as const) {
  assert.equal(freeCancellationText(locale, false, date), before[locale]);
  const over = freeCancellationText(locale, true, date);
  assert.equal(over, after[locale]);
  assert.doesNotMatch(over, /\d|\{/, "a passed deadline prints no date and no placeholder");
}
// A formatted date is inserted as text, never as a replacement pattern.
assert.equal(freeCancellationText("en", false, "$& $1"), "until $& $1");
console.log("PASS free-cancellation wording before and after the deadline (en, fr, es), late acknowledgement from 30 minutes before it");
