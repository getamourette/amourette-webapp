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
const clients = [newClient(), newClient(), newClient()];
const userIds = [];

try {
  for (const client of clients) {
    const { data, error } = await client.auth.signInAnonymously();
    if (error || !data.user) throw error ?? new Error("Anonymous sign-in returned no user");
    userIds.push(data.user.id);
  }

  const [first, second, third] = clients;
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
  await rejects(third.from("email_subscriptions").insert({
    user_id: userIds[2], email: " Not-Normalized@Example.com ", locale: "en",
    source: "landing", consent_version: "test-v1",
  }), "normalized email constraint");

  await succeeds(second.from("email_subscriptions").insert({
    user_id: userIds[1], email: "first@example.com", locale: "fr",
    source: "room_popup", consent_version: "test-v1", status: "subscribed",
    subscribed_at: now,
  }), "second identity with duplicate address");
  await succeeds(third.from("email_subscriptions").insert({
    user_id: userIds[2], email: "third@example.com", locale: "es",
    source: "landing", consent_version: "test-v1", status: "subscribed",
    subscribed_at: now,
  }), "unrelated address");

  equal((await rows(second.from("email_subscriptions").select("user_id"))).length, 1, "owner reads only own row");
  equal((await rows(second.from("email_subscriptions").update({ email: "stolen@example.com" }).eq("user_id", userIds[0]).select("user_id"))).length, 0, "other owner cannot update");
  equal((await rows(second.from("email_subscriptions").delete().eq("user_id", userIds[0]).select("user_id"))).length, 0, "other owner cannot delete");

  const token = await rpcValue(service, "issue_email_unsubscribe_token", { p_email: "first@example.com" });
  equal(typeof token, "string", "service role issues opaque token");
  equal(token.includes("="), false, "token is unpadded base64url");
  equal(await rpcValue(first, "validate_email_unsubscribe_token", { p_token: token }), true, "public token validation");
  equal(await rpcValue(first, "unsubscribe_email_by_token", { p_token: token }), "unsubscribed", "token globally unsubscribes");
  equal((await rows(first.from("email_subscriptions").select("status").single())).status, "unsubscribed", "first duplicate suppressed");
  equal((await rows(second.from("email_subscriptions").select("status").single())).status, "unsubscribed", "second duplicate suppressed");
  equal((await rows(third.from("email_subscriptions").select("status").single())).status, "subscribed", "unrelated address unaffected");
  equal(await rpcValue(first, "unsubscribe_email_by_token", { p_token: token }), "already_unsubscribed", "second token use is idempotent");
  equal(await rpcValue(first, "unsubscribe_email_by_token", { p_token: "not-a-token" }), "invalid_token", "invalid token rejected");

  const expiredToken = await rpcValue(service, "issue_email_unsubscribe_token", {
    p_email: "third@example.com", p_expires_at: new Date(Date.now() + 5_000).toISOString(),
  });
  await new Promise((resolve) => setTimeout(resolve, 5_500));
  equal(await rpcValue(first, "unsubscribe_email_by_token", { p_token: expiredToken }), "invalid_token", "expired token rejected");
  equal((await rows(third.from("email_subscriptions").select("status").single())).status, "subscribed", "expired token does not mutate");

  const revokedToken = await rpcValue(service, "issue_email_unsubscribe_token", { p_email: "third@example.com" });
  equal(await rpcValue(service, "revoke_email_unsubscribe_token", { p_token: revokedToken }), true, "service role revokes token");
  equal(await rpcValue(first, "unsubscribe_email_by_token", { p_token: revokedToken }), "invalid_token", "revoked token rejected");
  equal((await rows(third.from("email_subscriptions").select("status").single())).status, "subscribed", "revoked token does not mutate");

  await succeeds(first.from("email_subscriptions").update({
    locale: "fr", source: "subscription_management", consent_version: "email-preferences-v1",
    status: "subscribed", subscribed_at: new Date().toISOString(), unsubscribed_at: null,
  }).eq("user_id", userIds[0]), "explicit owner re-subscription");
  const resubscribed = await rows(first.from("email_subscriptions").select("source,consent_version,status,unsubscribed_at").single());
  equal(resubscribed.status, "subscribed", "owner re-subscribed");
  equal(resubscribed.source, "subscription_management", "fresh consent source recorded");
  equal(resubscribed.unsubscribed_at, null, "re-subscription clears unsubscribe time");
  equal((await rows(second.from("email_subscriptions").select("status").single())).status, "unsubscribed", "re-subscription stays owner-scoped");
  equal(await rpcValue(first, "unsubscribe_email_by_token", { p_token: token }), "unsubscribed", "older valid token suppresses re-subscription");

  await succeeds(third.rpc("unsubscribe_my_email_subscription"), "owner global unsubscribe RPC");
  equal((await rows(third.from("email_subscriptions").select("status").single())).status, "unsubscribed", "owner RPC uses stored address");

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

async function rpcValue(client, name, args) {
  const { data, error } = await client.rpc(name, args);
  if (error) throw error;
  return data;
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
