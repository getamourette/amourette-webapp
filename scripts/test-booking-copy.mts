import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
// @ts-expect-error -- Node type-stripping tests resolve explicit extensions.
import { bookingStrings } from "../lib/booking-strings.ts";
// @ts-expect-error -- Node type-stripping tests resolve explicit extensions.
import { cancellationStrings } from "../lib/cancellation-strings.ts";

// #478: every locale states, before payment, that a late cancellation or a no-show
// keeps the deposit, and that the evening is 18+.
for (const locale of ["en", "fr", "es"] as const) {
  const s = bookingStrings[locale];
  for (const key of ["retention", "adults"] as const) assert.ok(s[key]?.trim(), `${locale}.${key} is missing`);
  assert.match(s.adults, /18/, `${locale}.adults names the age`);
  assert.doesNotMatch(s.retention, /\{/, `${locale}.retention has no placeholder`);
}

// The French deposit is a "caution", never a "dépôt"; a retained deposit is "not
// refunded", never "conservé(e)" / "se conserva", which read as "kept safe for you".
const guestCopy = [
  ["booking", JSON.stringify(bookingStrings.fr), JSON.stringify(bookingStrings.es)],
  ["cancellation", JSON.stringify(cancellationStrings.fr), JSON.stringify(cancellationStrings.es)],
  ["lifecycle email", readFileSync(new URL("../emails/ReservationLifecycleEmail.tsx", import.meta.url), "utf8"), ""],
];
for (const [surface, fr, es] of guestCopy) {
  assert.doesNotMatch(fr, /dépôt/i, `${surface}: French says "caution"`);
  assert.doesNotMatch(fr, /(caution|dépôt)[^."]*conserv/i, `${surface}: French never says the deposit is "conservé"`);
  assert.doesNotMatch(fr + es, /se conserva\b/, `${surface}: Spanish never says the deposit "se conserva"`);
}
assert.match(bookingStrings.fr.reserve, /caution/);
console.log("PASS booking copy: retention and 18+ in every locale, French \"caution\", no ambiguous \"conservé\"");
