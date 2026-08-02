#!/usr/bin/env node

import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

loadLocalEnv();
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const appUrl = process.env.EMAIL_E2E_APP_URL ?? "https://getamourette.com";
if (!url || !anonKey || !serviceKey) fail("Supabase URL, publishable key, and service-role key are required.");

const label = process.argv[2] ?? `${Date.now()}-${randomUUID().slice(0, 8)}`;
const service = createClient(url, serviceKey, { auth: { persistSession: false } });
const users = [];

try {
  const cases = [
    ["delivered", `delivered+${label}@resend.dev`],
    ["bounced", `bounced+${label}@resend.dev`],
    ["complained", `complained+${label}@resend.dev`],
    ["suppressed", "suppressed@resend.dev"],
  ];
  const deliveries = new Map();

  for (const [kind, address] of cases) {
    const identity = await createIdentity();
    users.push(identity.userId);
    const first = await subscribe(identity.token, address);
    equal(first.alreadySubscribed, false, `${kind} first subscription creates consent`);
    const repeat = await subscribe(identity.token, address);
    equal(repeat.alreadySubscribed, true, `${kind} repeated subscription is idempotent`);
    const rows = await deliveryRows(identity.userId);
    equal(rows.length, 1, `${kind} creates exactly one welcome delivery`);
    deliveries.set(kind, { ...rows[0], userId: identity.userId, address });
  }

  await waitFor(async () => {
    for (const [kind, expected] of [["delivered", "delivered"], ["bounced", "suppressed"], ["complained", "suppressed"], ["suppressed", "suppressed"]]) {
      const row = await deliveryById(deliveries.get(kind).id);
      if (row.status !== expected) return false;
    }
    return true;
  }, 180_000);

  equal(await suppressionReason(deliveries.get("bounced").address), "hard_bounce", "hard bounce creates suppression");
  equal(await suppressionReason(deliveries.get("complained").address), "complaint", "complaint creates suppression");
  equal(await suppressionReason(deliveries.get("suppressed").address), "provider_suppression", "provider suppression is durable");

  const repeatIdentity = await createIdentity();
  users.push(repeatIdentity.userId);
  await subscribe(repeatIdentity.token, deliveries.get("bounced").address);
  const suppressedRows = await deliveryRows(repeatIdentity.userId);
  equal(suppressedRows.length, 1, "suppressed address creates one audited delivery");
  equal(suppressedRows[0].status, "suppressed", "new identity using suppressed address is suppressed immediately");

  for (const [kind, delivery] of deliveries) {
    console.log(`${kind}: user=${delivery.userId} delivery=${delivery.id}`);
  }
  console.log(`suppressed-repeat: user=${repeatIdentity.userId} delivery=${suppressedRows[0].id}`);
  console.log("Production Resend delivery lifecycle passed without printing recipient addresses or secrets.");
} finally {
  for (const userId of users) await service.auth.admin.deleteUser(userId);
}

async function createIdentity() {
  const client = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await client.auth.signInAnonymously();
  if (error || !data.user || !data.session) throw error ?? new Error("Anonymous sign-in returned no session");
  return { userId: data.user.id, token: data.session.access_token };
}

async function subscribe(token, email) {
  const response = await fetch(`${appUrl}/api/email/subscribe`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ email, locale: "en", source: "landing" }),
  });
  if (!response.ok) throw new Error(`Subscription route returned ${response.status}`);
  return response.json();
}

async function deliveryRows(userId) {
  const { data, error } = await service.from("email_deliveries")
    .select("id,status,last_error_code")
    .eq("payload->>user_id", userId);
  if (error) throw error;
  return data;
}

async function deliveryById(id) {
  const { data, error } = await service.from("email_deliveries")
    .select("id,status,last_error_code")
    .eq("id", id)
    .single();
  if (error) throw error;
  return data;
}

async function suppressionReason(email) {
  const { data, error } = await service.from("email_suppressions")
    .select("reason")
    .eq("email", email)
    .maybeSingle();
  if (error) throw error;
  return data?.reason;
}

async function waitFor(predicate, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 5_000));
  }
  throw new Error("Timed out waiting for Resend webhook lifecycle");
}

function equal(actual, expected, labelText) {
  if (actual !== expected) throw new Error(`${labelText}: expected ${expected}, got ${actual}`);
}

function loadLocalEnv() {
  try {
    for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
      const match = line.match(/^([^#=]+)=(.*)$/);
      if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
    }
  } catch {}
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
