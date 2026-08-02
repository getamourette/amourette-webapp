#!/usr/bin/env node

import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

loadLocalEnv();
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !anonKey || !serviceKey) fail("Supabase URL, publishable key, and service-role key are required.");

const service = createClient(url, serviceKey, { auth: { persistSession: false } });
const client = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
let userId;

try {
  const { data, error } = await client.auth.signInAnonymously();
  if (error || !data.user) throw error ?? new Error("Anonymous sign-in returned no user");
  userId = data.user.id;
  const testAddress = `revocation-${randomUUID()}@example.com`;

  const { error: subscribeError } = await service.rpc("subscribe_to_marketing_email", {
    p_user_id: userId,
    p_email: testAddress,
    p_locale: "en",
    p_source: "landing",
    p_consent_version: "test-v1",
  });
  if (subscribeError) throw subscribeError;

  const { data: ownedRows, error: readError } = await client
    .from("email_subscriptions")
    .select("user_id,status")
    .eq("user_id", userId);
  if (readError) throw readError;
  equal(ownedRows.length, 1, "authenticated owner retains read access");

  await rejects(client.from("email_subscriptions").insert({
    user_id: userId,
    email: testAddress,
    locale: "en",
    source: "landing",
    consent_version: "test-v1",
  }), "authenticated insert");
  await rejects(client.from("email_subscriptions").update({ locale: "fr" }).eq("user_id", userId), "authenticated update");
  await rejects(client.from("email_subscriptions").delete().eq("user_id", userId), "authenticated delete");

  const { data: repeat, error: repeatError } = await service.rpc("subscribe_to_marketing_email", {
    p_user_id: userId,
    p_email: testAddress,
    p_locale: "en",
    p_source: "landing",
    p_consent_version: "test-v1",
  });
  if (repeatError) throw repeatError;
  equal(repeat.already_subscribed, true, "server subscription RPC remains operational");
  console.log("Email subscription post-revocation contract passed.");
} finally {
  if (userId) await service.auth.admin.deleteUser(userId);
}

async function rejects(query, label) {
  const { error } = await query;
  if (!error) throw new Error(`${label}: expected rejection`);
}

function equal(actual, expected, label) {
  if (actual !== expected) throw new Error(`${label}: expected ${expected}, got ${actual}`);
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
