#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import QRCode from "qrcode";
import {
  currentBranch,
  discoverPreviewUrl,
  loadLocalEnv,
  QA_VENUES,
  resolveVenue,
} from "./qa-support.mjs";

const TEST_SEED = "always-live-test-venues-v1";
const NEVER_EXPIRES = "9999-12-31T23:59:59.999Z";
const SHARED_WRITE_FLAG = "--confirm-shared-write";
const SHARED_RESET_FLAG = "--confirm-shared-reset";

loadLocalEnv();

const options = parseArgs(process.argv.slice(2));
if (options.help) {
  process.stdout.write(usage());
  process.exit(0);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  fail("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local.");
}
const supabase = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const selected = resolveVenue(options.venue);

try {
  if (options.command === "status") await statusCommand();
  if (options.command === "reset") await resetCommand();
  if (options.command === "prepare-match") await prepareMatchCommand();
  if (options.command === "reply") await replyCommand();
  if (options.command === "presence") await presenceCommand();
} catch (error) {
  fail(error.message);
}

async function statusCommand() {
  try {
    printPreview(selected);
  } catch (error) {
    process.stdout.write(
      `Branch: ${currentBranch()}\nSuggested venue: ${selected.venue} (${selected.reason})\nPreview unavailable: ${error.message}\n`,
    );
  }
  const report = await inspectFixtures();
  printFixtureReport(report);
  if (!report.healthy) process.exitCode = 1;
}

async function resetCommand() {
  requireFlag(SHARED_RESET_FLAG, "reset all shared QA-room interactions and synthetic users");
  process.stdout.write(
    "Resetting the shared development QA fixtures. This removes test-room presence, likes, matches, and messages for both founders.\n",
  );
  execFileSync("node", [fileURLToPath(new URL("./seed-test-venues.mjs", import.meta.url)), "seed", "--no-tester"], {
    stdio: "inherit",
  });
  const report = await inspectFixtures();
  printFixtureReport(report);
  if (!report.healthy) throw new Error("The reset completed but fixture verification failed.");
}

async function prepareMatchCommand() {
  requireFlag(SHARED_WRITE_FLAG, "replace the Maya match scenario in test-crowded");
  const fixtureReport = await inspectFixtures();
  if (!fixtureReport.healthy) {
    printFixtureReport(fixtureReport);
    throw new Error("Repair the QA fixtures before preparing a match.");
  }
  const crowded = fixtureReport.fixtures.find((fixture) => fixture.slug === "test-crowded");
  const preview = printPreview({ venue: "test-crowded", reason: "match scenarios require the crowded room" });
  const testerId = options.testerProfileId ?? (await detectTester(crowded, preview));
  const tester = await assertEligibleTester(testerId);
  const partners = await compatibleSeededPartners(tester, options.count);
  const partnerIds = partners.map((partner) => partner.id);

  const { data: existingMatches, error: matchLoadError } = await supabase
    .from("matches")
    .select("id, profile_a, profile_b")
    .eq("venue_night_id", crowded.night.id)
    .or(partnerIds.flatMap((id) => [`and(profile_a.eq.${id},profile_b.eq.${testerId})`, `and(profile_a.eq.${testerId},profile_b.eq.${id})`]).join(","));
  if (matchLoadError) throw new Error(`Could not inspect the synthetic match: ${matchLoadError.message}`);
  if (existingMatches.length > 0) {
    const { error } = await supabase.from("matches").delete().in("id", existingMatches.map((row) => row.id));
    if (error) throw new Error(`Could not reset the Maya match: ${error.message}`);
  }

  const { data: pairLikes, error: likeLoadError } = await supabase
    .from("likes")
    .select("id, liker_id, liked_id")
    .eq("venue_night_id", crowded.night.id)
    .or(partnerIds.flatMap((id) => [`and(liker_id.eq.${id},liked_id.eq.${testerId})`, `and(liker_id.eq.${testerId},liked_id.eq.${id})`]).join(","));
  if (likeLoadError) throw new Error(`Could not inspect synthetic likes: ${likeLoadError.message}`);
  if (pairLikes.length > 0) {
    const { error } = await supabase.from("likes").delete().in("id", pairLikes.map((row) => row.id));
    if (error) throw new Error(`Could not reset Maya likes: ${error.message}`);
  }

  const { data: testerPresence, error: presenceError } = await supabase
    .from("presence")
    .select("id")
    .eq("profile_id", testerId)
    .eq("venue_night_id", crowded.night.id)
    .is("left_at", null);
  if (presenceError || testerPresence.length !== 1) {
    throw new Error("The tester must be actively checked into test-crowded before preparing Maya.");
  }

  const { error: likeError } = await supabase.from("likes").insert(partners.map((partner) => ({
    liker_id: partner.id,
    liked_id: testerId,
    venue_id: crowded.venue.id,
    venue_night_id: crowded.night.id,
    expires_at: NEVER_EXPIRES,
  })));
  if (likeError) throw new Error(`Could not prepare synthetic likes: ${likeError.message}`);

  const { data: verified, error: verifyError } = await supabase
    .from("likes")
    .select("id")
    .in("liker_id", partnerIds)
    .eq("liked_id", testerId)
    .eq("venue_night_id", crowded.night.id)
  if (verifyError || verified?.length !== partners.length) throw new Error("The synthetic pre-likes could not be verified.");
  process.stdout.write(
    `\nMatch scenario ready for tester ${testerId}. Like ${partners.map((partner) => partner.first_name).join(", ")} in the UI to exercise ${partners.length} real reciprocal match path${partners.length === 1 ? "" : "s"}.\n`,
  );
}

async function replyCommand() {
  requireFlag(SHARED_WRITE_FLAG, "insert a synthetic incoming chat message from Maya");
  const report = await inspectFixtures();
  const crowded = report.fixtures.find((fixture) => fixture.slug === "test-crowded");
  const syntheticMatch = await detectSyntheticMatch(crowded, options.testerProfileId, options.matchId, options.partnerName);
  const body = options.message ?? `QA reply from ${syntheticMatch.partnerName} — realtime is working.`;
  const { error } = await supabase.from("messages").insert({
    match_id: syntheticMatch.id,
    sender_id: syntheticMatch.partnerId,
    body,
  });
  if (error) throw new Error(`Could not insert the synthetic reply: ${error.message}`);
  process.stdout.write(`Incoming message from ${syntheticMatch.partnerName} inserted for tester ${shortId(syntheticMatch.testerId)}. Check realtime and the unread badge.\n`);
}

async function presenceCommand() {
  requireFlag(SHARED_WRITE_FLAG, "toggle Ariel's synthetic presence in test-crowded");
  if (!new Set(["join", "leave"]).has(options.action)) {
    throw new Error("Presence requires --action join or --action leave.");
  }
  const report = await inspectFixtures();
  const crowded = report.fixtures.find((fixture) => fixture.slug === "test-crowded");
  const arielId = await seededUserId("profile-36");
  if (options.action === "leave") {
    const { error } = await supabase
      .from("presence")
      .update({ left_at: new Date().toISOString() })
      .eq("profile_id", arielId)
      .eq("venue_night_id", crowded.night.id)
      .is("left_at", null);
    if (error) throw new Error(`Could not make Ariel leave: ${error.message}`);
  } else {
    const { error } = await supabase.from("presence").insert({
      profile_id: arielId,
      venue_id: crowded.venue.id,
      venue_night_id: crowded.night.id,
      checked_in_at: new Date().toISOString(),
      last_seen_at: new Date().toISOString(),
      is_visible: true,
    });
    if (error) throw new Error(`Could not make Ariel join: ${error.message}`);
  }
  process.stdout.write(`Ariel is now ${options.action === "join" ? "present" : "absent"}. Observe the room update without refreshing.\n`);
}

async function inspectFixtures() {
  const [{ data: venues, error: venueError }, seededIds] = await Promise.all([
    supabase.from("venues").select("id, slug, is_test_venue, is_live").in("slug", QA_VENUES),
    seededUserIds(),
  ]);
  if (venueError) throw new Error(`Could not inspect QA venues: ${venueError.message}`);
  const fixtures = [];
  for (const slug of QA_VENUES) {
    const venue = venues.find((row) => row.slug === slug);
    if (!venue) {
      fixtures.push({ slug, errors: ["venue is missing"] });
      continue;
    }
    const { data: nights, error: nightError } = await supabase
      .from("venue_nights")
      .select("id, status, closes_at, terminal_at, launch_threshold, guaranteed_launch_at")
      .eq("venue_id", venue.id)
      .is("terminal_at", null);
    if (nightError) throw new Error(`Could not inspect ${slug}: ${nightError.message}`);
    const night = nights[0];
    const errors = [];
    if (!venue.is_test_venue) errors.push("venue is not marked as test");
    if (nights.length !== 1) errors.push(`expected one active night, found ${nights.length}`);
    const expectedStatus = slug === "test-waiting" ? "waiting" : "live";
    if (night?.status !== expectedStatus) errors.push(`expected ${expectedStatus}, found ${night?.status ?? "none"}`);
    const expectedMirror = slug !== "test-waiting";
    if (venue.is_live !== expectedMirror) errors.push(`expected is_live ${expectedMirror}, found ${venue.is_live}`);
    if (!night?.closes_at?.startsWith("9999-12-31")) errors.push("night does not close in year 9999");
    if (slug === "test-waiting" && night?.launch_threshold !== 2147483647) {
      errors.push("waiting threshold is reachable");
    }
    if (slug === "test-waiting" && !night?.guaranteed_launch_at?.startsWith("9999-01-01")) {
      errors.push("waiting guaranteed launch is not pinned to year 9999");
    }
    let active = [];
    if (night) {
      const { data, error } = await supabase
        .from("presence")
        .select("id, profile_id, checked_in_at, last_seen_at")
        .eq("venue_night_id", night.id)
        .is("left_at", null);
      if (error) throw new Error(`Could not inspect ${slug} presence: ${error.message}`);
      active = data;
    }
    const syntheticCount = active.filter((row) => seededIds.has(row.profile_id)).length;
    const humanCount = active.length - syntheticCount;
    if (slug === "test-crowded" && syntheticCount !== 36) errors.push(`expected 36 synthetic profiles, found ${syntheticCount}`);
    if (slug !== "test-crowded" && syntheticCount !== 0) errors.push(`expected no synthetic profiles, found ${syntheticCount}`);
    fixtures.push({ slug, venue, night, active, syntheticCount, humanCount, seededIds, errors });
  }
  return { fixtures, healthy: fixtures.every((fixture) => fixture.errors.length === 0) };
}

async function detectTester(fixture, previewOrigin) {
  const baselinePresenceIds = new Set(fixture.active.map((row) => row.id));
  process.stdout.write(
    `\nWatching test-crowded for one new non-synthetic check-in for ${options.timeoutSeconds} seconds. Scan ${previewOrigin}/v/test-crowded and finish onboarding now. If already present, leave the room first and then rescan.\n`,
  );
  const deadline = Date.now() + options.timeoutSeconds * 1000;
  while (Date.now() < deadline) {
    await delay(2000);
    const { data, error } = await supabase
      .from("presence")
      .select("id, profile_id")
      .eq("venue_night_id", fixture.night.id)
      .is("left_at", null);
    if (error) throw new Error(`Could not watch tester presence: ${error.message}`);
    const arrivals = [...new Set(
      data
        .filter((row) => !fixture.seededIds.has(row.profile_id) && !baselinePresenceIds.has(row.id))
        .map((row) => row.profile_id),
    )];
    if (arrivals.length === 1) return arrivals[0];
    if (arrivals.length > 1) {
      throw new Error("Multiple new participants arrived; refusing to guess the tester identity. Use --tester-profile-id.");
    }
  }
  throw new Error("No unambiguous tester arrival was detected. Leave and rescan, or pass --tester-profile-id.");
}

async function detectSyntheticMatch(fixture, requestedTesterId, requestedMatchId, requestedPartnerName) {
  const { data, error } = await supabase
    .from("matches")
    .select("id, profile_a, profile_b")
    .eq("venue_night_id", fixture.night.id);
  if (error) throw new Error(`Could not inspect synthetic matches: ${error.message}`);
  const activeHumans = new Set(
    fixture.active
      .map((row) => row.profile_id)
      .filter((id) => !fixture.seededIds.has(id)),
  );
  const candidates = data.flatMap((match) => {
    const aSynthetic = fixture.seededIds.has(match.profile_a);
    const bSynthetic = fixture.seededIds.has(match.profile_b);
    if (aSynthetic === bSynthetic) return [];
    const partnerId = aSynthetic ? match.profile_a : match.profile_b;
    const testerId = aSynthetic ? match.profile_b : match.profile_a;
    if (!activeHumans.has(testerId) || (requestedTesterId && testerId !== requestedTesterId) || (requestedMatchId && match.id !== requestedMatchId)) return [];
    return [{ ...match, partnerId, testerId }];
  });
  const { data: partners, error: partnerError } = await supabase
    .from("profiles")
    .select("id, first_name")
    .in("id", candidates.map((candidate) => candidate.partnerId));
  if (partnerError) throw new Error(`Could not load synthetic match partners: ${partnerError.message}`);
  const named = candidates.map((candidate) => ({
    ...candidate,
    partnerName: partners.find((partner) => partner.id === candidate.partnerId)?.first_name,
  }));
  const selected = requestedPartnerName
    ? named.filter((candidate) => candidate.partnerName?.toLowerCase() === requestedPartnerName.toLowerCase())
    : named;
  if (selected.length !== 1) {
    throw new Error(`Expected exactly one targeted human/synthetic match, found ${selected.length}. Pass --match-id or --partner-name.`);
  }
  return selected[0];
}

async function assertEligibleTester(id) {
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, gender, interested_in")
    .eq("id", id)
    .maybeSingle();
  if (profileError || !profile) throw new Error(`Tester ${id} has no complete profile.`);
  // Do not inspect profile_private: service_role intentionally has no SELECT
  // grant on that PII table. The active presence check below is the safe proof
  // that the product's check_in RPC accepted profile and adult eligibility.
  return profile;
}

async function compatibleSeededPartners(tester, count) {
  const seededIds = [...(await seededUserIds())];
  const { data, error } = await supabase
    .from("profiles")
    .select("id, first_name, gender, interested_in")
    .in("id", seededIds)
    .order("created_at");
  if (error) throw new Error(`Could not inspect synthetic compatibility: ${error.message}`);
  const partners = data.filter(
    (candidate) =>
      tester.interested_in.includes(candidate.gender) &&
      candidate.interested_in.includes(tester.gender),
  );
  if (partners.length < count) throw new Error(`Only ${partners.length} compatible synthetic profiles exist; ${count} requested.`);
  return partners.slice(0, count);
}

async function seededUserIds() {
  const ids = new Set();
  for (let page = 1; ; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(`Could not inspect seeded users: ${error.message}`);
    for (const user of data.users) {
      if (user.app_metadata?.test_seed === TEST_SEED) ids.add(user.id);
    }
    if (data.users.length < 1000) break;
  }
  return ids;
}

async function seededUserId(seedKey) {
  for (let page = 1; ; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(`Could not inspect seeded users: ${error.message}`);
    const user = data.users.find(
      (candidate) => candidate.app_metadata?.test_seed === TEST_SEED && candidate.email === `${seedKey}@seed.paramour.invalid`,
    );
    if (user) return user.id;
    if (data.users.length < 1000) break;
  }
  throw new Error(`Synthetic user ${seedKey} is missing. Run the guarded reset.`);
}

function printPreview(choice) {
  const origin = discoverPreviewUrl();
  const url = `${origin}/v/${choice.venue}`;
  process.stdout.write(`Branch: ${currentBranch()}\nSuggested venue: ${choice.venue} (${choice.reason})\nPreview: ${url}\n`);
  QRCode.toString(url, { type: "terminal", small: true }, (error, qr) => {
    if (!error) process.stdout.write(`${qr}\n`);
  });
  return origin;
}

function printFixtureReport(report) {
  process.stdout.write("\nShared QA fixture health:\n");
  for (const fixture of report.fixtures) {
    const detail = fixture.night
      ? `${fixture.night.status}; ${fixture.syntheticCount} synthetic; ${fixture.humanCount} human`
      : "missing";
    process.stdout.write(`- ${fixture.errors.length === 0 ? "OK" : "FAIL"} ${fixture.slug}: ${detail}\n`);
    for (const error of fixture.errors) process.stdout.write(`  - ${error}\n`);
  }
}

function parseArgs(args) {
  const result = {
    command: "status",
    venue: "auto",
    timeoutSeconds: 120,
    count: 1,
    flags: new Set(),
  };
  let index = 0;
  if (args[0] && !args[0].startsWith("--")) {
    result.command = args[0];
    index = 1;
  }
  if (!new Set(["status", "reset", "prepare-match", "reply", "presence"]).has(result.command)) {
    throw new Error(`Unknown QA command: ${result.command}`);
  }
  for (; index < args.length; index += 1) {
    const arg = args[index];
    if ([SHARED_WRITE_FLAG, SHARED_RESET_FLAG, "--help"].includes(arg)) {
      result.flags.add(arg);
      if (arg === "--help") result.help = true;
      continue;
    }
    const value = args[++index];
    if (!value || value.startsWith("--")) throw new Error(`Missing value for ${arg}`);
    if (arg === "--venue") result.venue = normalizeVenue(value);
    else if (arg === "--tester-profile-id") result.testerProfileId = value;
    else if (arg === "--timeout") result.timeoutSeconds = Number(value);
    else if (arg === "--message") result.message = value;
    else if (arg === "--count") result.count = Number(value);
    else if (arg === "--match-id") result.matchId = value;
    else if (arg === "--partner-name") result.partnerName = value;
    else if (arg === "--action") result.action = value;
    else throw new Error(`Unknown option: ${arg}`);
  }
  if (!Number.isFinite(result.timeoutSeconds) || result.timeoutSeconds < 5 || result.timeoutSeconds > 600) {
    throw new Error("--timeout must be between 5 and 600 seconds.");
  }
  if (result.testerProfileId && !/^[0-9a-f-]{36}$/i.test(result.testerProfileId)) {
    throw new Error("--tester-profile-id must be a UUID.");
  }
  if (!Number.isInteger(result.count) || result.count < 1 || result.count > 4) {
    throw new Error("--count must be an integer between 1 and 4.");
  }
  if (result.matchId && !/^[0-9a-f-]{36}$/i.test(result.matchId)) {
    throw new Error("--match-id must be a UUID.");
  }
  return result;
}

function normalizeVenue(value) {
  if (value === "crowded" || value === "empty" || value === "waiting") return `test-${value}`;
  return value;
}

function requireFlag(flag, action) {
  if (!options.flags.has(flag)) {
    throw new Error(`Refusing to ${action} without ${flag}. The Supabase development database is shared.`);
  }
}

function usage() {
  return `Usage: npm run qa -- [command] [options]

Commands:
  status                 Inspect fixtures and print the real preview QR (default)
  reset                  Reset all three fixtures; requires ${SHARED_RESET_FLAG}
  prepare-match          Detect a tester and prepare one or more synthetic pre-likes
  reply                  Insert a safe incoming message into a targeted match
  presence               Toggle Ariel for a Realtime presence check

Options:
  --venue auto|crowded|empty|waiting
  --tester-profile-id UUID
  --timeout SECONDS
  --message TEXT
  --count 1..4
  --match-id UUID
  --partner-name NAME
  --action join|leave
  ${SHARED_WRITE_FLAG}
  ${SHARED_RESET_FLAG}
`;
}

function shortId(id) {
  return `${id.slice(0, 8)}…`;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}
