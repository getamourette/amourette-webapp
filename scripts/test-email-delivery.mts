import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
// @ts-expect-error -- Node type stripping resolves explicit source extensions.
import { isRetryableResendStatus, retryAt } from "../lib/email-transport-policy.ts";
// @ts-expect-error -- Node type stripping resolves explicit source extensions.
import { verifySvixSignature } from "../lib/resend-webhook.ts";

assert.equal(isRetryableResendStatus(429), true);
assert.equal(isRetryableResendStatus(503), true);
assert.equal(isRetryableResendStatus(400), false);
assert.equal(retryAt(0, 0), "1970-01-01T00:00:30.000Z");
assert.equal(retryAt(20, 0), "1970-01-01T01:00:00.000Z", "backoff is capped");

const payload = JSON.stringify({ type: "email.delivered" });
const id = "evt_test";
const timestamp = "1000";
const secretBytes = Buffer.from("test webhook secret");
const secret = `whsec_${secretBytes.toString("base64")}`;
const signature = createHmac("sha256", secretBytes).update(`${id}.${timestamp}.${payload}`).digest("base64");
assert.equal(verifySvixSignature(payload, id, timestamp, `v1,${signature}`, secret, 1_000_000), true);
assert.equal(verifySvixSignature(`${payload} `, id, timestamp, `v1,${signature}`, secret, 1_000_000), false, "raw body changes invalidate signature");
assert.equal(verifySvixSignature(payload, id, timestamp, `v1,${signature}`, secret, 1_301_000), false, "stale signatures are rejected");

const transport = readFileSync("lib/server/email-delivery.ts", "utf8");
assert.match(transport, /status: "unknown"/, "ambiguous network errors become unknown");
assert.match(transport, /retryable && delivery\.attempt_count < 2/, "definite transient failures are retried with a bound");
assert.doesNotMatch(transport, /console\./, "recipient data is not logged");
const template = readFileSync("emails/WelcomeEmail.tsx", "utf8");
for (const locale of ["en", "fr", "es"]) assert.match(template, new RegExp(`\\b${locale}: \\{`));
assert.doesNotMatch(template, /tracking|pixel|utm_/i);

const migration = readFileSync("supabase/migrations/20260729000001_resend_email_delivery_foundation.sql", "utf8");
assert.match(migration, /on conflict do nothing/, "webhook replay is idempotent");
assert.match(migration, /provider_event_at <= p_event_created_at/, "out-of-order events cannot roll state backward");
assert.match(migration, /email_suppressions/, "operational suppression is durable");
console.log("Email delivery transport and webhook contracts passed.");
