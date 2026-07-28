import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
// Node's type-stripping runner requires the source extension; the application
// tsconfig deliberately does not enable TS-extension imports.
// @ts-expect-error -- executed by node --experimental-strip-types, not bundled.
import { emailPreferenceStrings } from "../lib/email-preference-strings.ts";

for (const locale of ["en", "fr", "es"] as const) {
  const strings = emailPreferenceStrings[locale];
  for (const key of [
    "publicConfirm", "publicUnsubscribed", "publicAlready", "publicInvalid",
    "publicError", "noSubscription", "subscribed", "unsubscribed", "privacy",
    "rights",
  ] as const) {
    assert.ok(strings[key].trim(), `${locale}.${key} is present`);
  }
}

const route = readFileSync("app/api/unsubscribe/route.ts", "utf8");
for (const status of ["unsubscribed", "already_unsubscribed", "invalid_token", "failure"]) {
  assert.match(route, new RegExp(`\\b${status}\\b`), `route supports ${status}`);
}
assert.doesNotMatch(route, /console\.|analytics/i, "route does not log or track sensitive requests");

const publicUi = readFileSync("app/unsubscribe/UnsubscribeClient.tsx", "utf8");
assert.match(publicUi, /validation === "valid" \? "confirm"/, "GET validation leads to an explicit confirmation state");
assert.match(publicUi, /validation === "invalid" \? "invalid_token" : "failure"/, "GET failures stay distinct from invalid tokens");
assert.match(publicUi, /method: "POST"/, "only confirmation sends the mutation POST");
assert.doesNotMatch(publicUi, /api\/unsubscribe\?token/, "raw token is not copied into the API URL");

const publicPage = readFileSync("app/unsubscribe/page.tsx", "utf8");
assert.doesNotMatch(publicPage, /<UnsubscribeClient[^>]*token=/, "raw token is not serialized into the client payload");

const waitingRoom = readFileSync("app/v/[venueSlug]/PreLaunchWaitingRoom.tsx", "utf8");
assert.match(waitingRoom, /subscribeEmail\(email, locale, "waiting_room"\)/, "waiting room records its acquisition source");
assert.match(waitingRoom, /instanceof InvalidEmailError/, "waiting room distinguishes invalid email input");
assert.match(waitingRoom, /<form onSubmit=\{submit\} noValidate>/, "waiting room bypasses browser-locale validation");
assert.match(waitingRoom, /if \(!isValidEmail\(email\)\)[\s\S]*?copy\.emailInvalid/, "waiting room localizes invalid email validation");
assert.match(waitingRoom, /if \(!consent\)[\s\S]*?copy\.emailConsentRequired/, "waiting room requires explicit consent with localized feedback");
assert.match(waitingRoom, /onOffered\(\)/, "waiting room marks the offer when presented");
assert.match(waitingRoom, /onClick=\{onDismissed\}/, "not-now records a separate dismissal");

const roomPage = readFileSync("app/v/[venueSlug]/page.tsx", "utf8");
assert.match(roomPage, /amourette-email-waiting-room-offered/, "waiting-room offer has a dedicated marker");
assert.match(roomPage, /emailPromptDismissKey\(venue\.timezone\)/, "not-now shares the nightly dismissal marker");
assert.match(roomPage, /!offeredInWaitingRoom/, "a waiting-room offer suppresses the live prompt");
assert.match(roomPage, /catch \(emailSubscriptionError\)[\s\S]*?setEmailPromptEligible\(false\)[\s\S]*?setWaitingRoomEmailVisible\(false\)/, "email-read failure hides marketing UI without blocking check-in");

const stringsSource = readFileSync("lib/strings.ts", "utf8");
for (const copy of [
  "Tell me about the next nights",
  "Me prévenir des prochaines soirées",
  "Avísame de las próximas noches",
]) {
  assert.ok(stringsSource.includes(copy), `waiting-room copy is localized: ${copy}`);
}

console.log("Email management and waiting-room UI contracts passed.");
