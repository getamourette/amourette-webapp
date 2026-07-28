#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

loadLocalEnv();
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !anonKey || !serviceKey) fail("Supabase URL, publishable key, and service-role key are required.");

const service = createClient(url, serviceKey, { auth: { persistSession: false } });
const clients = [newClient(), newClient()];
const userIds = [];

try {
  for (const client of clients) {
    const { data, error } = await client.auth.signInAnonymously();
    if (error || !data.user) throw error ?? new Error("Anonymous sign-in returned no user");
    userIds.push(data.user.id);
  }

  const first = clients[0];
  const second = clients[1];
  const now = new Date().toISOString();
  await succeeds(first.from("email_subscriptions").insert({
    user_id: userIds[0], email: "first@example.com", locale: "en",
    source: "landing", consent_version: "test-v1", status: "subscribed",
    subscribed_at: now,
  }), "profile-less landing subscription");

  equal((await rows(first.from("email_subscriptions").select("user_id,email,status"))).length, 1, "owner can read one row");
  await rejects(first.from("email_subscriptions").insert({
    user_id: userIds[0], email: "second@example.com", locale: "en",
    source: "landing", consent_version: "test-v1",
  }), "one row per owner");
  await rejects(second.from("email_subscriptions").insert({
    user_id: userIds[1], email: " Not-Normalized@Example.com ", locale: "en",
    source: "landing", consent_version: "test-v1",
  }), "normalized email constraint");

  equal((await rows(second.from("email_subscriptions").select("user_id"))).length, 0, "other owner cannot select");
  equal((await rows(second.from("email_subscriptions").update({ email: "stolen@example.com" }).eq("user_id", userIds[0]).select("user_id"))).length, 0, "other owner cannot update");
  equal((await rows(second.from("email_subscriptions").delete().eq("user_id", userIds[0]).select("user_id"))).length, 0, "other owner cannot delete");

  const unsubscribedAt = new Date(Date.now() + 1).toISOString();
  await succeeds(first.from("email_subscriptions").update({
    status: "unsubscribed", unsubscribed_at: unsubscribedAt,
  }).eq("user_id", userIds[0]), "unsubscribe transition");
  await succeeds(first.from("email_subscriptions").update({
    email: "replacement@example.com", locale: "fr", source: "room_popup",
    consent_version: "test-v2", status: "subscribed", subscribed_at: new Date().toISOString(),
    unsubscribed_at: null,
  }).eq("user_id", userIds[0]), "address replacement and re-subscription");
  const final = (await rows(first.from("email_subscriptions").select("email,locale,source,status,unsubscribed_at").single()));
  equal(final.email, "replacement@example.com", "replacement persisted");
  equal(final.status, "subscribed", "re-subscribed status");
  equal(final.unsubscribed_at, null, "re-subscription clears unsubscribe time");

  console.log("Email subscription and RLS regression passed.");
} finally {
  for (const id of userIds) await service.auth.admin.deleteUser(id);
}

function newClient() {
  return createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function rows(query) {
  const { data, error } = await query;
  if (error) throw error;
  return data;
}

async function succeeds(query, label) {
  const { error } = await query;
  if (error) throw new Error(`${label}: ${error.message}`);
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
