#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

loadLocalEnv();
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !anonKey || !serviceKey) fail("Supabase URL, anon key, and service-role key are required.");

const service = createClient(url, serviceKey, { auth: { persistSession: false } });
const runId = crypto.randomUUID().slice(0, 8);
const password = `Lifecycle-${crypto.randomUUID()}!`;
const userIds = [];
const venueIds = [];

try {
  const users = await Promise.all(Array.from({ length: 5 }, (_, index) => createUser(index)));
  const admin = users[0];
  await insert("admins", { user_id: admin.id });

  const venue = await createVenue("paris", "Europe/Paris");
  const nyVenue = await createVenue("nyc", "America/New_York");
  const clients = await Promise.all(users.map((user) => signIn(user.email)));

  await rejects(
    service.from("venue_nights").insert({
      venue_id: venue.id,
      waiting_opens_at: "2026-03-29T20:00:00Z",
      guaranteed_launch_at: "2026-03-29T19:00:00Z",
      closes_at: "2026-03-30T04:00:00Z",
    }),
    "invalid time ordering",
  );

  const now = Date.now();
  const night = await rpcOne(clients[0], "schedule_venue_night", {
    p_venue_id: venue.id,
    p_waiting_opens_at: new Date(now - 60_000).toISOString(),
    p_guaranteed_launch_at: new Date(now + 30 * 60_000).toISOString(),
    p_closes_at: new Date(now + 60 * 60_000).toISOString(),
  });
  equal(night.launch_threshold, 4, "default launch threshold");

  const editableVenue = await createVenue("editable", "Europe/Paris");
  const editable = await rpcOne(clients[0], "schedule_venue_night", {
    p_venue_id: editableVenue.id,
    p_waiting_opens_at: new Date(now + 2 * 60 * 60_000).toISOString(),
    p_guaranteed_launch_at: new Date(now + 3 * 60 * 60_000).toISOString(),
    p_closes_at: new Date(now + 4 * 60 * 60_000).toISOString(),
    p_launch_threshold: 7,
  });
  equal(editable.launch_threshold, 7, "custom launch threshold");
  const updated = await rpcOne(clients[0], "update_venue_night_schedule", {
    p_venue_night_id: editable.id,
    p_waiting_opens_at: new Date(now + 2.5 * 60 * 60_000).toISOString(),
    p_guaranteed_launch_at: new Date(now + 3.5 * 60 * 60_000).toISOString(),
    p_closes_at: new Date(now + 4.5 * 60 * 60_000).toISOString(),
    p_launch_threshold: 5,
  });
  equal(updated.launch_threshold, 5, "update before waiting opens");
  equal((await select(service.from("venue_night_configuration_audits").select("action").eq("venue_night_id", editable.id))).length, 2, "creation and update audited");
  await rejects(clients[1].rpc("update_venue_night_schedule", {
    p_venue_night_id: editable.id,
    p_waiting_opens_at: updated.waiting_opens_at,
    p_guaranteed_launch_at: updated.guaranteed_launch_at,
    p_closes_at: updated.closes_at,
    p_launch_threshold: 4,
  }), "non-admin schedule update rejection");
  await rejects(clients[1].rpc("admin_venue_night_participant_counts"), "non-admin counts rejection");
  equal((await select(clients[1].from("venue_night_configuration_audits").select("id"))).length, 0, "non-admin audit isolation");
  await rpc(clients[0], "open_venue_night", { p_venue_night_id: editable.id });
  await rejects(clients[0].rpc("update_venue_night_schedule", {
    p_venue_night_id: editable.id,
    p_waiting_opens_at: updated.waiting_opens_at,
    p_guaranteed_launch_at: updated.guaranteed_launch_at,
    p_closes_at: updated.closes_at,
    p_launch_threshold: 4,
  }), "update after waiting opened rejection");
  await rpc(clients[0], "cancel_venue_night", { p_venue_night_id: editable.id });

  await rejects(
    clients[0].rpc("schedule_venue_night", {
      p_venue_id: venue.id,
      p_waiting_opens_at: new Date(now).toISOString(),
      p_guaranteed_launch_at: new Date(now + 10 * 60_000).toISOString(),
      p_closes_at: new Date(now + 70 * 60_000).toISOString(),
      p_launch_threshold: 7,
    }),
    "overlapping schedule",
  );

  await rpc(service, "run_venue_night_lifecycle");
  equal((await loadNight(night.id)).status, "waiting", "scheduled opening");

  await Promise.all(clients.slice(1, 3).map((client) => rpc(client, "check_in", { p_venue_id: venue.id })));
  const waitingProfiles = await select(clients[1].from("profiles").select("id"));
  equal(waitingProfiles.length, 1, "waiting profile isolation");
  const waitingPresence = await select(clients[1].from("presence").select("profile_id"));
  equal(waitingPresence.length, 1, "waiting presence isolation");
  await rejects(
    clients[1].from("likes").insert({ liker_id: users[1].id, liked_id: users[2].id, venue_id: venue.id }),
    "waiting like rejection",
  );

  await Promise.all(clients.slice(3, 5).map((client) => rpc(client, "check_in", { p_venue_id: venue.id })));
  let launched = await loadNight(night.id);
  equal(launched.status, "live", "four concurrent check-ins launch");
  equal(launched.launch_reason, "threshold", "threshold launch reason");
  const launchEvents = await select(service.from("venue_night_transitions").select("id").eq("venue_night_id", night.id).eq("event", "launched"));
  equal(launchEvents.length, 1, "single launch audit event");
  await rpc(clients[0], "launch_venue_night", { p_venue_night_id: night.id });
  equal((await select(service.from("venue_night_transitions").select("id").eq("venue_night_id", night.id).eq("event", "launched"))).length, 1, "duplicate launch attempt is a no-op");
  await rpc(clients[1], "check_in", { p_venue_id: venue.id });
  equal((await loadNight(night.id)).launched_at, launched.launched_at, "launch is idempotent");

  const liveProfiles = await select(clients[1].from("profiles").select("id"));
  assert(liveProfiles.length >= 4, "live profile visibility");
  await must(clients[3].from("blocks").insert({ blocker_id: users[3].id, blocked_id: users[4].id, venue_id: venue.id, reason: "unsafe_behavior" }));
  const blockedView = await select(clients[3].from("profiles").select("id"));
  assert(!blockedView.some((profile) => profile.id === users[4].id), "blocks hide both profiles");
  await insertLike(clients[1], users[1].id, users[2].id, venue.id);
  await insertLike(clients[2], users[2].id, users[1].id, venue.id);
  const matches = await select(clients[1].from("matches").select("id, venue_night_id"));
  equal(matches.length, 1, "reciprocal likes create one match");
  equal(matches[0].venue_night_id, night.id, "match inherits exact night");
  await must(clients[1].from("messages").insert({ match_id: matches[0].id, sender_id: users[1].id, body: "hello" }));

  await must(clients[4].from("presence").update({ left_at: new Date().toISOString() }).eq("profile_id", users[4].id));
  equal((await loadNight(night.id)).status, "live", "attendance drop does not roll back launch");

  await rpc(clients[0], "close_venue_night", { p_venue_night_id: night.id });
  equal((await select(clients[1].from("matches").select("id"))).length, 0, "manual close hides matches");
  equal((await select(clients[1].from("messages").select("id").eq("match_id", matches[0].id))).length, 0, "manual close hides direct chat access");
  await rpc(clients[0], "reopen_venue_night", { p_venue_night_id: night.id });
  equal((await loadNight(night.id)).status, "live", "launched night reopens live");
  equal((await select(clients[1].from("matches").select("id"))).length, 1, "reopen restores interaction access");
  equal((await select(service.from("presence").select("id").eq("venue_night_id", night.id).is("left_at", null))).length, 0, "reopen requires fresh check-ins");

  await rpc(clients[0], "eject_from_venue", { p_profile_id: users[1].id, p_venue_id: venue.id, p_reason: "unsafe_behavior" });
  await rejects(rpcResult(clients[1], "check_in", { p_venue_id: venue.id }), "ejection blocks re-entry");
  await rpc(clients[0], "restore_to_venue", { p_profile_id: users[1].id, p_venue_id: venue.id });
  await rpc(clients[1], "check_in", { p_venue_id: venue.id });

  await rpc(clients[0], "cancel_venue_night", { p_venue_night_id: night.id });
  launched = await loadNight(night.id);
  equal(launched.terminal_reason, "cancelled", "cancellation is terminal");
  equal((await select(service.from("matches").select("id").eq("venue_night_id", night.id))).length, 0, "terminal cancellation expires matches");
  await rpc(clients[0], "reopen_venue_night", { p_venue_night_id: night.id });
  equal((await loadNight(night.id)).status, "closed", "terminal night cannot reopen");

  const guaranteed = await rpcOne(clients[0], "schedule_venue_night", {
    p_venue_id: venue.id,
    p_waiting_opens_at: new Date(now - 120_000).toISOString(),
    p_guaranteed_launch_at: new Date(now - 60_000).toISOString(),
    p_closes_at: new Date(now + 60 * 60_000).toISOString(),
    p_launch_threshold: 9,
  });
  await rpc(service, "run_venue_night_lifecycle");
  equal((await loadNight(guaranteed.id)).launch_reason, "guaranteed", "guaranteed launch");
  equal((await loadNight(guaranteed.id)).launch_threshold, 9, "custom launch threshold");
  await Promise.all(clients.slice(1, 3).map((client) => rpc(client, "check_in", { p_venue_id: venue.id })));
  await must(clients[1].from("likes").insert({ liker_id: users[1].id, liked_id: users[2].id, venue_id: venue.id, venue_night_id: night.id }));
  const scopedLike = (await select(service.from("likes").select("venue_night_id").eq("liker_id", users[1].id).eq("liked_id", users[2].id))).at(-1);
  equal(scopedLike?.venue_night_id, guaranteed.id, "cross-night scope cannot be forged");
  await rpc(clients[0], "cancel_venue_night", { p_venue_night_id: guaranteed.id });

  const manual = await rpcOne(clients[0], "schedule_venue_night", {
    p_venue_id: venue.id, p_waiting_opens_at: new Date(now - 60_000).toISOString(),
    p_guaranteed_launch_at: new Date(now + 20 * 60_000).toISOString(),
    p_closes_at: new Date(now + 40 * 60_000).toISOString(), p_launch_threshold: 7,
  });
  await rpc(service, "run_venue_night_lifecycle");
  await rpc(clients[0], "launch_venue_night", { p_venue_night_id: manual.id });
  equal((await loadNight(manual.id)).launch_reason, "manual", "manual launch");
  await rpc(clients[0], "cancel_venue_night", { p_venue_night_id: manual.id });

  // The public scheduler correctly refuses an already-ended configuration.
  // Seed this engine-only fixture through service_role to exercise overdue cron cleanup.
  const ended = await insert("venue_nights", {
    venue_id: venue.id, waiting_opens_at: new Date(now - 180_000).toISOString(),
    guaranteed_launch_at: new Date(now - 120_000).toISOString(),
    closes_at: new Date(now - 60_000).toISOString(), launch_threshold: 4,
    created_by: admin.id,
  }, true);
  await rpc(service, "run_venue_night_lifecycle");
  equal((await loadNight(ended.id)).terminal_reason, "scheduled_end", "scheduled close is terminal");

  await verifyDstSchedule(clients[0], venue.id, "2027-03-28T19:00:00.000Z", "2027-03-29T04:00:00.000Z", "Paris DST conversion");
  await verifyDstSchedule(clients[0], nyVenue.id, "2027-03-15T01:00:00.000Z", "2027-03-15T08:00:00.000Z", "New York DST conversion");

  const qaNights = await select(service.from("venue_nights").select("closes_at, status, venues!inner(slug)").in("venues.slug", ["test-crowded", "test-empty"]).is("terminal_at", null));
  assert(qaNights.length >= 2 && qaNights.every((row) => row.status === "live" && row.closes_at.startsWith("9999-12-31")), "QA permanent live nights");
  process.stdout.write("Venue-night lifecycle regression passed.\n");
} finally {
  for (const venueId of venueIds) await must(service.from("venues").delete().eq("id", venueId));
  for (const userId of userIds) await service.auth.admin.deleteUser(userId);
}

async function createUser(index) {
  const email = `lifecycle-${runId}-${index}@test.paramour.invalid`;
  const { data, error } = await service.auth.admin.createUser({ email, password, email_confirm: true });
  if (error || !data.user) throw error ?? new Error("user creation failed");
  userIds.push(data.user.id);
  await insert("profiles", { id: data.user.id, first_name: `Lifecycle ${index}`, photo_url: "/test-profiles/portrait-1.svg", gender: index % 2 ? "woman" : "man", interested_in: ["woman", "man"] });
  await insert("profile_private", { id: data.user.id, adult_confirmed_at: new Date().toISOString() });
  return { id: data.user.id, email };
}

async function createVenue(suffix, timezone) {
  const row = await insert("venues", { slug: `lifecycle-${runId}-${suffix}`, name: `Lifecycle ${suffix}`, timezone, is_test_venue: true }, true);
  venueIds.push(row.id); return row;
}

async function verifyDstSchedule(client, venueId, opensAt, closesAt, label) {
  const night = await rpcOne(client, "schedule_venue_night", { p_venue_id: venueId, p_waiting_opens_at: opensAt, p_guaranteed_launch_at: new Date(Date.parse(opensAt) + 60_000).toISOString(), p_closes_at: closesAt, p_launch_threshold: 4 });
  equal(Date.parse(night.waiting_opens_at), Date.parse(opensAt), label); await rpc(client, "cancel_venue_night", { p_venue_night_id: night.id });
}

async function signIn(email) { const client=createClient(url,anonKey,{auth:{persistSession:false}}); const {error}=await client.auth.signInWithPassword({email,password}); if(error) throw error; return client; }
async function insert(table,row,returning=false) { const query=service.from(table).insert(row); if(returning) return (await must(query.select().single())).data; await must(query); }
async function insertLike(client,liker,liked,venue) { await must(client.from("likes").insert({liker_id:liker,liked_id:liked,venue_id:venue})); }
async function loadNight(id) { return (await must(service.from("venue_nights").select("*").eq("id",id).single())).data; }
async function select(query) { return (await must(query)).data ?? []; }
async function rpc(client,name,args={}) { await must(client.rpc(name,args)); }
async function rpcOne(client,name,args={}) { return (await must(client.rpc(name,args))).data; }
function rpcResult(client,name,args={}) { return client.rpc(name,args); }
async function must(promise) { const result=await promise; if(result.error) throw result.error; return result; }
async function rejects(promise,label) { const result=await promise; if(!result.error) throw new Error(`${label}: expected failure`); process.stdout.write(`✓ ${label}\n`); }
function assert(value,label) { if(!value) throw new Error(label); process.stdout.write(`✓ ${label}\n`); }
function equal(actual,expected,label) { assert(actual===expected,`${label}: expected ${expected}, got ${actual}`); }
function fail(message) { process.stderr.write(`${message}\n`); process.exit(1); }
function loadLocalEnv() { try { const body=readFileSync(new URL("../.env.local",import.meta.url),"utf8"); for(const line of body.split(/\r?\n/)){const match=line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/); if(match&&!process.env[match[1]]) process.env[match[1]]=match[2].replace(/^['"]|['"]$/g,"");} } catch {} }
