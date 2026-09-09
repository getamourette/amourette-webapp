#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { deepStrictEqual } from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
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
  // Register every identity before continuing, so partial setup cannot race teardown.
  const users = [];
  for (let index = 0; index < 7; index += 1) users.push(await createUser(index));
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
  const waitingPublicState = await select(clients[1]
    .from("venue_night_public_state")
    .select("venue_night_id, status, participant_count, terminal_reason")
    .eq("venue_night_id", night.id));
  equal(waitingPublicState.length, 1, "waiting participant can read aggregate state");
  equal(waitingPublicState[0].participant_count, 2, "waiting aggregate count includes eligible participants");
  equal(waitingPublicState[0].status, "waiting", "waiting aggregate lifecycle state");
  equal((await select(clients[0].from("venue_night_public_state").select("venue_night_id").eq("venue_night_id", night.id))).length, 0, "aggregate state requires participation");
  await rejects(
    clients[1].from("likes").insert({ liker_id: users[1].id, liked_id: users[2].id, venue_id: venue.id }),
    "waiting like rejection",
  );

  await Promise.all(clients.slice(3, 5).map((client) => rpc(client, "check_in", { p_venue_id: venue.id })));
  let launched = await loadNight(night.id);
  equal(launched.status, "live", "four concurrent check-ins launch");
  equal(launched.launch_reason, "threshold", "threshold launch reason");
  const launchedPublicState = await select(clients[1]
    .from("venue_night_public_state")
    .select("status, participant_count")
    .eq("venue_night_id", night.id));
  equal(launchedPublicState[0].status, "live", "aggregate state follows threshold launch");
  equal(launchedPublicState[0].participant_count, 4, "aggregate count follows concurrent arrivals");
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
  let matchPresence = (await rpcOne(clients[1], "match_presence_state", { p_match_id: matches[0].id }))[0];
  equal(matchPresence.me_is_present, true, "chat reports current participant present");
  equal(matchPresence.other_is_present, true, "chat reports matched participant present");

  const publicStateBeforePause = (await select(clients[1]
    .from("venue_night_public_state")
    .select("participant_count, updated_at")
    .eq("venue_night_id", night.id)))[0];
  await must(clients[2].from("presence").update({ is_visible: false }).eq("profile_id", users[2].id).eq("venue_night_id", night.id).is("left_at", null));
  const publicStateAfterPause = (await select(clients[1]
    .from("venue_night_public_state")
    .select("participant_count, updated_at")
    .eq("venue_night_id", night.id)))[0];
  assert(publicStateAfterPause.updated_at > publicStateBeforePause.updated_at, "visibility pause advances public state revision");
  equal(publicStateAfterPause.participant_count, publicStateBeforePause.participant_count, "visibility pause preserves aggregate count");
  equal((await select(clients[4].from("profiles").select("id").eq("id", users[2].id))).length, 0, "visibility pause immediately hides profile from an unmatched participant");
  await must(clients[1].from("messages").insert({ match_id: matches[0].id, sender_id: users[1].id, body: "still here" }));
  equal((await select(clients[1].from("matches").select("id").eq("id", matches[0].id))).length, 1, "visibility pause preserves match access");
  equal((await select(clients[1].from("messages").select("id").eq("match_id", matches[0].id))).length, 2, "visibility pause preserves conversation access");
  await must(clients[2].from("presence").update({ is_visible: true }).eq("profile_id", users[2].id).eq("venue_night_id", night.id).is("left_at", null));
  const publicStateAfterResume = (await select(clients[1]
    .from("venue_night_public_state")
    .select("participant_count, updated_at")
    .eq("venue_night_id", night.id)))[0];
  assert(publicStateAfterResume.updated_at > publicStateAfterPause.updated_at, "visibility resume advances public state revision");
  equal(publicStateAfterResume.participant_count, publicStateBeforePause.participant_count, "visibility resume preserves aggregate count");
  equal((await select(clients[4].from("profiles").select("id").eq("id", users[2].id))).length, 1, "visibility resume restores profile visibility");

  await must(clients[1].from("presence").update({ left_at: new Date().toISOString() }).eq("profile_id", users[1].id).eq("venue_night_id", night.id).is("left_at", null));
  equal((await select(clients[2].from("venue_night_public_state").select("participant_count").eq("venue_night_id", night.id)))[0].participant_count, 3, "departure removes participant from aggregate count");
  equal((await select(service.from("likes").select("id").eq("venue_night_id", night.id))).length, 2, "departure preserves likes");
  equal((await select(service.from("matches").select("id").eq("venue_night_id", night.id))).length, 1, "departure preserves matches");
  equal((await select(service.from("messages").select("id").eq("match_id", matches[0].id))).length, 2, "departure preserves messages");
  matchPresence = (await rpcOne(clients[2], "match_presence_state", { p_match_id: matches[0].id }))[0];
  equal(matchPresence.other_is_present, false, "chat reports matched participant departed");
  await rejects(clients[2].from("messages").insert({ match_id: matches[0].id, sender_id: users[2].id, body: "after departure" }), "message while participant absent");
  await rpc(clients[1], "check_in", { p_venue_id: venue.id });
  const reentryPresence = await select(service.from("presence").select("id, left_at").eq("profile_id", users[1].id).eq("venue_night_id", night.id));
  equal(reentryPresence.length, 2, "re-entry creates a new presence period");
  equal(reentryPresence.filter((presence) => presence.left_at === null).length, 1, "re-entry leaves exactly one active presence");
  equal((await select(clients[1].from("matches").select("id").eq("id", matches[0].id))).length, 1, "re-entry restores preserved matches");
  equal((await select(clients[1].from("messages").select("id").eq("match_id", matches[0].id))).length, 2, "re-entry restores preserved messages");
  await must(clients[2].from("messages").insert({ match_id: matches[0].id, sender_id: users[2].id, body: "welcome back" }));
  equal((await select(clients[1].from("venue_night_public_state").select("participant_count").eq("venue_night_id", night.id)))[0].participant_count, 4, "re-entry restores aggregate count");

  await must(clients[4].from("presence").update({ left_at: new Date().toISOString() }).eq("profile_id", users[4].id));
  equal((await loadNight(night.id)).status, "live", "attendance drop does not roll back launch");
  equal((await select(clients[1].from("venue_night_public_state").select("participant_count").eq("venue_night_id", night.id)))[0].participant_count, 3, "aggregate count follows departure");

  await rpc(clients[0], "close_venue_night", { p_venue_night_id: night.id });
  const pausedPublicState = (await select(clients[1].from("venue_night_public_state").select("status, participant_count, terminal_reason").eq("venue_night_id", night.id)))[0];
  equal(pausedPublicState.status, "closed", "aggregate state follows manual pause");
  equal(pausedPublicState.participant_count, 0, "manual pause clears aggregate attendance");
  equal(pausedPublicState.terminal_reason, null, "manual pause stays non-terminal");
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
  equal((await select(clients[1].from("venue_night_public_state").select("terminal_reason").eq("venue_night_id", night.id)))[0].terminal_reason, "cancelled", "aggregate state exposes safe cancellation reason");
  equal((await select(service.from("matches").select("id").eq("venue_night_id", night.id))).length, 0, "terminal cancellation expires matches");
  equal((await select(service.from("likes").select("id").eq("venue_night_id", night.id))).length, 0, "terminal cancellation deletes likes");
  equal((await select(service.from("messages").select("id").eq("match_id", matches[0].id))).length, 0, "terminal cancellation cascades message deletion");
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

  await verifyPopulatedNightCleanup(users, clients);

  const qaNights = await select(service.from("venue_nights").select("closes_at, status, launch_threshold, guaranteed_launch_at, venues!inner(slug)").in("venues.slug", ["test-crowded", "test-empty", "test-waiting"]).is("terminal_at", null));
  const liveQaNights = qaNights.filter((row) => row.venues.slug !== "test-waiting");
  assert(liveQaNights.length >= 2 && liveQaNights.every((row) => row.status === "live" && row.closes_at.startsWith("9999-12-31")), "QA permanent live nights");
  const waitingQaNight = qaNights.find((row) => row.venues.slug === "test-waiting");
  assert(waitingQaNight?.status === "waiting" && waitingQaNight.guaranteed_launch_at.startsWith("9999-01-01") && waitingQaNight.launch_threshold === 2147483647, "QA permanent waiting night");
  process.stdout.write("Venue-night lifecycle regression passed.\n");
} finally {
  const cleanupErrors = [];
  const clean = async (operation) => {
    try { await must(operation()); } catch (error) { cleanupErrors.push(error); }
  };
  for (const venueId of venueIds) {
    await clean(() => service.from("reports").delete().eq("venue_id", venueId));
    await clean(() => service.from("venues").delete().eq("id", venueId).like("slug", `lifecycle-${runId}-%`));
  }
  for (const userId of userIds) await clean(() => service.auth.admin.deleteUser(userId));
  if (cleanupErrors.length) throw new AggregateError(cleanupErrors, `Lifecycle cleanup failed for run ${runId}`);
  process.stdout.write(`Lifecycle fixtures removed for run ${runId}.\n`);
}

async function verifyPopulatedNightCleanup(users, clients) {
  const expiringVenue = await createVenue("cleanup", "Europe/Paris");
  const controlVenue = await createVenue("control", "America/New_York");
  const nights = [];
  const now = Date.now();
  for (const venue of [expiringVenue, controlVenue]) {
    nights.push(await rpcOne(clients[0], "schedule_venue_night", {
      p_venue_id: venue.id,
      p_waiting_opens_at: new Date(now - 120_000).toISOString(),
      p_guaranteed_launch_at: new Date(now - 60_000).toISOString(),
      p_closes_at: new Date(now + 3_600_000).toISOString(),
      p_launch_threshold: 9,
    }));
  }
  const [night, control] = nights;
  await rpc(service, "run_venue_night_lifecycle");
  for (const index of [1, 2, 3, 4]) await rpc(clients[index], "check_in", { p_venue_id: expiringVenue.id });
  for (const index of [5, 6]) await rpc(clients[index], "check_in", { p_venue_id: controlVenue.id });

  const matchIds = [];
  for (const [venue, venueNight, a, b] of [[expiringVenue, night, 1, 2], [controlVenue, control, 5, 6]]) {
    await insertLike(clients[a], users[a].id, users[b].id, venue.id);
    await insertLike(clients[b], users[b].id, users[a].id, venue.id);
    const match = (await must(clients[a].from("matches").select("id").eq("venue_night_id", venueNight.id).single())).data;
    matchIds.push(match.id);
    for (const sender of [a, b]) {
      await must(clients[sender].from("messages").insert({ match_id: match.id, sender_id: users[sender].id, body: "Cleanup regression" }));
    }
  }
  const [matchId, controlMatchId] = matchIds;
  await insertLike(clients[1], users[1].id, users[3].id, expiringVenue.id);
  await rpc(clients[1], "record_chat_started", { p_match_id: matchId });
  await must(clients[4].from("blocks").insert({ blocker_id: users[4].id, blocked_id: users[3].id, venue_id: expiringVenue.id, reason: "unsafe_behavior" }));
  const reportId = await rpcOne(clients[3], "submit_report", {
    p_reported_id: users[4].id, p_venue_night_id: night.id, p_reason: "unsafe_behavior",
  });
  await rpc(clients[0], "eject_from_venue", {
    p_profile_id: users[4].id, p_venue_id: expiringVenue.id, p_reason: "unsafe_behavior",
  });

  const count = async (table, key, value, client = service) =>
    (await select(client.from(table).select("id").eq(key, value))).length;
  const interactions = async () => ({
    likes: await count("likes", "venue_night_id", night.id),
    matches: await count("matches", "venue_night_id", night.id),
    messages: await count("messages", "match_id", matchId),
    ejections: await count("venue_ejections", "venue_night_id", night.id),
  });
  const populated = { likes: 3, matches: 1, messages: 2, ejections: 1 };
  deepStrictEqual(await interactions(), populated, "populated cleanup fixture");

  await rpc(clients[0], "close_venue_night", { p_venue_night_id: night.id });
  deepStrictEqual(await interactions(), populated, "temporary close physically preserves interactions and ejections");
  equal(await count("matches", "venue_night_id", night.id, clients[1]), 0, "temporary close hides match access");
  equal(await count("messages", "match_id", matchId, clients[1]), 0, "temporary close hides message access");
  await rpc(service, "run_venue_night_lifecycle");
  equal((await loadNight(night.id)).status, "closed", "cron does not reopen a manually paused night");
  deepStrictEqual(await interactions(), populated, "cron preserves a paused night's interactions");
  await rpc(clients[0], "reopen_venue_night", { p_venue_night_id: night.id });
  deepStrictEqual(await interactions(), populated, "reopen preserves stored interactions");
  equal(await count("matches", "venue_night_id", night.id, clients[1]), 1, "reopen restores matched access");
  equal(await count("messages", "match_id", matchId, clients[1]), 2, "reopen restores conversation history");
  equal((await select(service.from("presence").select("id").eq("venue_night_id", night.id).is("left_at", null))).length, 0, "reopen does not resurrect presence");
  for (const index of [1, 2, 3]) await rpc(clients[index], "check_in", { p_venue_id: expiringVenue.id });
  await rejects(clients[4].rpc("check_in", { p_venue_id: expiringVenue.id }), "ejection survives temporary close and reopen");

  const rows = async (client, table, columns, key, value) =>
    select(client.from(table).select(columns).eq(key, value).order("id"));
  const durableSnapshot = async () => ({
    profiles: await select(service.from("profiles").select("id, first_name").in("id", users.map((user) => user.id)).order("id")),
    blocks: await rows(clients[4], "blocks", "id, blocker_id, blocked_id, reason", "venue_id", expiringVenue.id),
    reports: await rows(clients[0], "reports", "id, case_id, reason, interaction_evidence", "id", reportId),
    cases: await rows(clients[0], "moderation_cases", "id, status", "venue_night_id", night.id),
    configuration: await rows(service, "venue_night_configuration_audits", "id, action, after_values", "venue_night_id", night.id),
    // record_venue_scan deliberately ignores test venues. Exercise retention
    // with the match/chat/conversation events these fixtures actually produce.
    matches: await rows(service, "venue_match_events", "id", "venue_night_id", night.id),
    chats: await rows(service, "venue_chat_start_events", "id", "venue_night_id", night.id),
    conversations: await rows(service, "venue_conversation_events", "id, message_count, participant_count", "venue_night_id", night.id),
  });
  const durableBefore = await durableSnapshot();
  for (const [name, records] of Object.entries(durableBefore)) assert(records.length > 0, `${name} retention fixture is nonempty`);
  const controlSnapshot = async () => ({
    night: await loadNight(control.id),
    venue: await rows(service, "venues", "id, is_live, profile_preview_enabled", "id", controlVenue.id),
    presence: await rows(service, "presence", "id, left_at", "venue_night_id", control.id),
    likes: await rows(service, "likes", "id, expires_at", "venue_night_id", control.id),
    matches: await rows(service, "matches", "id, expires_at", "venue_night_id", control.id),
    messages: await rows(service, "messages", "id", "match_id", controlMatchId),
  });
  const controlBefore = await controlSnapshot();
  equal(controlBefore.likes.length, 2, "control night contains likes");
  equal(controlBefore.matches.length, 1, "control night contains a match");
  equal(controlBefore.messages.length, 2, "control night contains messages");
  assert(controlBefore.presence.length === 2 && controlBefore.presence.every((row) => row.left_at === null), "control participants are present");

  // Only accelerate this owned fixture, keeping interaction expiry aligned. Real
  // admin schedule edits remain forbidden after opening. Use the DB clock, then
  // expire at :10 to leave a window before the live one-minute cron's next tick.
  // A concurrent engine run must fail the pre-cleanup guard, never silently skip it.
  const clockRow = (await must(service.from("venue_nights").update({ launch_threshold: 9 })
    .eq("id", night.id).select("updated_at").single())).data;
  const closesAt = Math.ceil(Date.parse(clockRow.updated_at) / 60_000) * 60_000 + 10_000;
  const closesIso = new Date(closesAt).toISOString();
  for (const table of ["likes", "matches"]) {
    await must(service.from(table).update({ expires_at: closesIso }).eq("venue_night_id", night.id));
  }
  await must(service.from("venues").update({ profile_preview_enabled: true }).eq("id", expiringVenue.id));
  const shortened = (await must(service.from("venue_nights").update({ closes_at: closesIso })
    .eq("id", night.id).select("updated_at").single())).data;
  const remaining = closesAt - Date.parse(shortened.updated_at);
  const expiryMonotonic = performance.now() + remaining;
  assert(remaining > 3_000, "expiry window is still in the future after setup");
  const presenceBefore = await rows(service, "presence", "id, left_at", "venue_night_id", night.id);
  const historyBefore = await rows(service, "venue_night_transitions", "id, event", "venue_night_id", night.id);
  equal(await count("likes", "venue_night_id", night.id, clients[1]), 2, "likes readable before deadline");
  equal(await count("matches", "venue_night_id", night.id, clients[1]), 1, "match readable before deadline");
  equal(await count("messages", "match_id", matchId, clients[1]), 2, "messages readable before deadline");
  await rejects(clients[1].rpc("run_venue_night_lifecycle"), "participants cannot invoke global lifecycle", "42501");
  process.stdout.write(`Waiting ${Math.ceil(remaining / 1_000)}s for fixture expiry, then for the scheduled cron.\n`);
  await delay(Math.max(0, expiryMonotonic - performance.now()) + 1_000);

  equal((await loadNight(night.id)).terminal_at, null, "pre-cleanup guard: cron has not processed fixture");
  equal(await count("likes", "venue_night_id", night.id, clients[1]), 0, "deadline hides likes before cleanup");
  equal(await count("matches", "venue_night_id", night.id, clients[1]), 0, "deadline hides match before cleanup");
  equal(await count("messages", "match_id", matchId, clients[1]), 0, "deadline hides messages before cleanup");
  equal(await count("profiles", "id", users[2].id, clients[1]), 0, "deadline hides other participant's profile");
  await rejects(clients[1].from("messages").insert({ match_id: matchId, sender_id: users[1].id, body: "After expiry" }), "deadline rejects new messages before cleanup", "42501");
  await rejects(clients[3].from("likes").insert({ liker_id: users[3].id, liked_id: users[2].id, venue_id: expiringVenue.id }), "deadline rejects a new, nonduplicate like before cleanup", "P0001");
  await rejects(clients[1].rpc("check_in", { p_venue_id: expiringVenue.id }), "deadline rejects check-in before cleanup", "P0001");
  deepStrictEqual(await interactions(), populated, "expired interactions still physically exist during access checks");
  deepStrictEqual(await rows(service, "presence", "id, left_at", "venue_night_id", night.id), presenceBefore, "presence has not yet been closed by cron");
  equal((await loadNight(night.id)).terminal_at, null, "pre-cleanup guard: access was denied independently of cron");

  // Observe the actual scheduled worker; do not call the RPC to make it pass.
  process.stdout.write("Access expiry verified; waiting for the real scheduled cleanup.\n");
  const deadline = performance.now() + 90_000;
  let ended = await loadNight(night.id);
  while (ended.terminal_at === null && performance.now() < deadline) {
    await delay(1_000);
    ended = await loadNight(night.id);
  }
  equal(ended.status, "closed", "scheduled worker closes the populated night");
  equal(ended.terminal_reason, "scheduled_end", "scheduled worker records terminal reason");
  assert(Date.parse(ended.terminal_at) >= closesAt, "terminal timestamp is at or after configured end");
  deepStrictEqual(await interactions(), { likes: 0, matches: 0, messages: 0, ejections: 0 }, "scheduled worker deletes all ephemeral interactions");
  const presenceAfter = await rows(service, "presence", "id, left_at", "venue_night_id", night.id);
  deepStrictEqual(presenceAfter, presenceBefore.map((row) => ({ ...row, left_at: row.left_at ?? ended.terminal_at })), "cleanup closes active presence and preserves prior history");
  const closedVenue = (await rows(service, "venues", "id, is_live, profile_preview_enabled", "id", expiringVenue.id))[0];
  equal(closedVenue.is_live, false, "cleanup disables venue");
  equal(closedVenue.profile_preview_enabled, false, "cleanup disables profile preview");
  deepStrictEqual(await durableSnapshot(), durableBefore, "cleanup preserves identity, safety, audits and analytics");
  deepStrictEqual(await controlSnapshot(), controlBefore, "cleanup leaves the other live night untouched");
  const historyAfter = await rows(service, "venue_night_transitions", "id, event", "venue_night_id", night.id);
  equal(historyAfter.length, historyBefore.length + 1, "cleanup appends one transition");
  equal(historyAfter.filter((row) => row.event === "ended").length, 1, "exactly one ended event");

  await rpc(service, "run_venue_night_lifecycle");
  deepStrictEqual(await loadNight(night.id), ended, "repeat cleanup leaves terminal night unchanged");
  deepStrictEqual(await rows(service, "venue_night_transitions", "id, event", "venue_night_id", night.id), historyAfter, "repeat cleanup adds no audit event");
  deepStrictEqual(await rows(service, "presence", "id, left_at", "venue_night_id", night.id), presenceAfter, "repeat cleanup preserves closure timestamps");
  deepStrictEqual(await durableSnapshot(), durableBefore, "repeat cleanup preserves durable records");
  deepStrictEqual(await controlSnapshot(), controlBefore, "repeat cleanup preserves control night");
  process.stdout.write("Populated-night cleanup, retention and idempotency passed.\n");
}

async function createUser(index) {
  const email = `lifecycle-${runId}-${index}@test.amourette.invalid`;
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
async function rejects(promise,label,code) { const result=await promise; if(!result.error) throw new Error(`${label}: expected failure`); if(code && result.error.code !== code) throw new Error(`${label}: expected ${code}, got ${result.error.code}`); process.stdout.write(`✓ ${label}\n`); }
function assert(value,label) { if(!value) throw new Error(label); process.stdout.write(`✓ ${label}\n`); }
function equal(actual,expected,label) { assert(actual===expected,`${label}: expected ${expected}, got ${actual}`); }
function fail(message) { process.stderr.write(`${message}\n`); process.exit(1); }
function loadLocalEnv() { try { const body=readFileSync(new URL("../.env.local",import.meta.url),"utf8"); for(const line of body.split(/\r?\n/)){const match=line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/); if(match&&!process.env[match[1]]) process.env[match[1]]=match[2].replace(/^['"]|['"]$/g,"");} } catch {} }
