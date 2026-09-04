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
assert.match(waitingRoom, /source="waiting_room"/, "waiting room records its acquisition source");
assert.match(
  waitingRoom,
  /emailActionVisible \|\| emailSubscribed/,
  "waiting room keeps the confirmation visible for an existing subscriber"
);

const roomCards = readFileSync("app/v/[venueSlug]/RoomCards.tsx", "utf8");
assert.match(roomCards, /subscribeEmail\(email, locale, source\)/, "shared room card records its acquisition source");
assert.match(roomCards, /instanceof InvalidEmailError/, "shared room card distinguishes invalid email input");
assert.match(roomCards, /<form onSubmit=\{submit\} noValidate>/, "shared room card bypasses browser-locale validation");
assert.match(roomCards, /if \(!isValidEmail\(email\)\)[\s\S]*?copy\.emailInvalid/, "shared room card localizes invalid email validation");
assert.match(roomCards, /if \(!consent\)[\s\S]*?copy\.emailConsentRequired/, "shared room card requires explicit consent with localized feedback");
assert.match(roomCards, /if \(!subscribed\) onOffered\(\)/, "shared room card marks a new offer when presented");
assert.match(roomCards, /setOpen\(false\)[\s\S]*?onDismissed\(\)/, "not-now collapses the form and records a separate dismissal");
assert.match(roomCards, /text-blush[\s\S]*?>\s*✓/, "success uses the shared soft confirmation treatment");
assert.match(roomCards, /setState\(result\.alreadySubscribed \? "already" : "success"\);\s*setOpen\(false\)/, "success collapses the form card before showing confirmation");

const roomPage = readFileSync("app/v/[venueSlug]/page.tsx", "utf8");
assert.match(roomPage, /amourette-email-waiting-room-offered/, "waiting-room offer has a dedicated marker");
assert.match(roomPage, /emailPromptDismissKey\(venue\.timezone\)/, "not-now shares the nightly dismissal marker");
assert.match(roomPage, /!offeredInWaitingRoom/, "a waiting-room offer suppresses the live prompt");
assert.match(roomPage, /setWaitingRoomEmailVisible\(!subscribed\)/, "dismissal keeps the waiting-room action available");
assert.match(roomPage, /catch \(emailSubscriptionError\)[\s\S]*?setEmailPromptEligible\(false\)[\s\S]*?setWaitingRoomEmailVisible\(false\)/, "email-read failure hides marketing UI without blocking check-in");

const stringsSource = readFileSync("lib/strings.ts", "utf8");
for (const copy of [
  "You're on the list. Enjoy your night.",
  "C'est noté, profite de ta soirée.",
  "Anotado, disfruta de tu noche.",
]) {
  assert.ok(stringsSource.includes(copy), `room email confirmation is localized: ${copy}`);
}
for (const copy of [
  "More nights like this one?",
  "D'autres soirées comme celle-ci ?",
  "¿Más noches como esta?",
]) {
  assert.ok(stringsSource.includes(copy), `waiting-room copy is localized: ${copy}`);
}

console.log("Email management and waiting-room UI contracts passed.");
