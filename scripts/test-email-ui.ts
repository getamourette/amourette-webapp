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

console.log("Email management route and localized UI contract passed.");
