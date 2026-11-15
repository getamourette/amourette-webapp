#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { requireTesterMatchingPreferences } from "./qa-matching.mjs";
import {
  DEMO_PHOTO_DIR,
  DEMO_ROSTER,
  DEMO_SEED,
  DEMO_SLUG,
  DEMO_VENUE_NAME,
  armedFor,
  checkInTimes,
  feedFor,
  validateRoster,
} from "./demo-venue-roster.mjs";

// Venue-pitch demo room, separate from the QA rooms: it never touches
// test-crowded/test-empty/test-waiting or their synthetic users, and the QA
// seed never touches it (different slug and seed tag).
const NEVER_EXPIRES = "9999-12-31T23:59:59.999Z";
const SHARED_WRITE_FLAG = "--confirm-shared-write";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

loadLocalEnv();
const options = parseArguments(process.argv.slice(2));
if (options.help) {
  process.stdout.write(usage());
  process.exit(0);
}
validateRoster(DEMO_ROSTER);

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceRoleKey) {
  fail("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the environment or .env.local.");
}
const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

if (options.command !== "status" && !options.flags.has(SHARED_WRITE_FLAG)) {
  fail(`Refusing to ${options.command} the demo room without ${SHARED_WRITE_FLAG}. The Supabase database is shared.`);
}

try {
  if (options.command === "seed") await seedCommand();
  if (options.command === "arm") await armCommand();
  if (options.command === "status") await statusCommand();
  if (options.command === "clear") await clearCommand();
} catch (error) {
  fail(error.message);
}

async function seedCommand() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) fail("Set the publishable Supabase key for synthetic participant consent.");
  const venue = await ensureDemoVenue();
  const night = await ensureLiveNight(venue);
  await clearDemoData(venue);

  process.stdout.write(`Creating ${DEMO_ROSTER.length} demo profiles…\n`);
  const users = [];
  for (const profile of DEMO_ROSTER) {
    const { data, error } = await supabase.auth.admin.createUser({
      email: `${profile.key}@seed.amourette.invalid`,
      password: demoPassword(profile.key),
      email_confirm: true,
      app_metadata: { test_seed: DEMO_SEED },
      user_metadata: { test_profile: true },
    });
    if (error || !data.user) fail(`Could not create ${profile.firstName}: ${error?.message ?? "unknown error"}`);
    users.push({ ...profile, id: data.user.id });
  }

  const photos = users.map((profile, index) => photoFor(profile, index));
  await insertRows("profiles", users.map((profile, index) => ({
    id: profile.id,
    first_name: profile.firstName,
    photo_url: photos[index],
    bio: profile.bio,
    gender: null,
    interested_in: null,
  })));

  // Same owner consent command as the QA seed: no privileged consent bypass.
  for (const profile of users) {
    const participant = createClient(supabaseUrl, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { error: loginError } = await participant.auth.signInWithPassword({
      email: `${profile.key}@seed.amourette.invalid`, password: demoPassword(profile.key),
    });
    if (loginError) fail("Could not authenticate a synthetic demo participant for consent.");
    const { error } = await participant.rpc("grant_my_matching_consent", {
      p_consent: true, p_version: "matching-v2-draft", p_locale: "fr",
      p_gender: profile.gender, p_interested_in: profile.interestedIn, p_expected_revision: null, p_request_id: randomUUID(),
    });
    if (error) fail(`Could not record synthetic matching consent for ${profile.firstName}.`);
    await participant.auth.signOut();
  }

  await insertRows("profile_private", users.map((profile) => ({
    id: profile.id,
    adult_confirmed_at: new Date().toISOString(),
  })));

  const times = checkInTimes(users.length);
  await insertRows("presence", users.map((profile, index) => ({
    profile_id: profile.id,
    venue_id: venue.id,
    venue_night_id: night.id,
    checked_in_at: times[index],
    last_seen_at: new Date().toISOString(),
    is_visible: true,
  })));

  const placeholders = photos.filter((photo) => photo.startsWith("/test-profiles/")).length;
  process.stdout.write(`Seed complete: /v/${DEMO_SLUG} (“${DEMO_VENUE_NAME}”) has ${users.length} demo profiles.\n`);
  if (placeholders > 0) {
    process.stdout.write(`${placeholders} profile(s) use placeholder portraits: add public/${DEMO_PHOTO_DIR}/<key>.jpg and reseed.\n`);
  }
  if (placeholders < photos.length) {
    process.stdout.write(`Demo photos must be deployed on the domain the QR opens (merge to main for getamourette.com).\n`);
  }
  process.stdout.write(`Next: open /v/${DEMO_SLUG} on the demo phone, finish onboarding, then run arm.\n`);
}

async function armCommand() {
  const venue = await loadDemoVenue();
  const night = await loadLiveNight(venue);
  const users = await demoUsers();
  const tester = await resolveTester(night, users);
  requireTesterMatchingPreferences(tester);

  // A manager who tried the room on their own phone must not stay visible to
  // the next one: end every other human presence in the demo room.
  const { data: active, error: activeError } = await supabase
    .from("presence").select("id, profile_id").eq("venue_night_id", night.id).is("left_at", null);
  if (activeError) throw new Error(`Could not inspect demo presence: ${activeError.message}`);
  const guests = active.filter((row) => !users.byId.has(row.profile_id) && row.profile_id !== tester.id);
  if (guests.length > 0) {
    const { error } = await supabase.from("presence").update({ left_at: new Date().toISOString() }).in("id", guests.map((row) => row.id));
    if (error) throw new Error(`Could not end guest presence: ${error.message}`);
    process.stdout.write(`Ended ${guests.length} guest presence(s) in the demo room.\n`);
  }

  const demoIds = [...users.byId.keys()];
  const pairFilter = (a, b) => demoIds.flatMap((id) => [`and(${a}.eq.${id},${b}.eq.${tester.id})`, `and(${a}.eq.${tester.id},${b}.eq.${id})`]).join(",");
  // Deleting matches cascades the previous demos' messages.
  const { error: matchError } = await supabase.from("matches").delete().eq("venue_night_id", night.id).or(pairFilter("profile_a", "profile_b"));
  if (matchError) throw new Error(`Could not reset demo matches: ${matchError.message}`);
  const { error: likeError } = await supabase.from("likes").delete().eq("venue_night_id", night.id).or(pairFilter("liker_id", "liked_id"));
  if (likeError) throw new Error(`Could not reset demo likes: ${likeError.message}`);

  const viewer = { gender: tester.gender, interestedIn: tester.interested_in };
  const armed = armedFor(viewer).map((profile) => users.byKey.get(profile.key)).filter(Boolean);
  if (armed.length === 0) throw new Error("No armed demo profile is compatible with this tester's preferences.");
  await insertRows("likes", armed.map((profile) => ({
    liker_id: profile.id,
    liked_id: tester.id,
    venue_id: venue.id,
    venue_night_id: night.id,
    expires_at: NEVER_EXPIRES,
  })));
  process.stdout.write(`Armed ${armed.length} match(es) for tester ${tester.id}.\n`);
  printCheatSheet(viewer, new Set(armed.map((profile) => profile.key)));
}

async function statusCommand() {
  const venue = await loadDemoVenue();
  const night = await loadLiveNight(venue);
  const users = await demoUsers();
  const { data: active, error } = await supabase
    .from("presence").select("profile_id").eq("venue_night_id", night.id).is("left_at", null);
  if (error) throw new Error(`Could not inspect demo presence: ${error.message}`);
  const synthetic = active.filter((row) => users.byId.has(row.profile_id)).length;
  const humans = active.filter((row) => !users.byId.has(row.profile_id)).map((row) => row.profile_id);
  process.stdout.write(`/v/${DEMO_SLUG} (“${venue.name}”): night ${night.status}; ${synthetic} demo profile(s); ${humans.length} human(s).\n`);
  if (humans.length !== 1) {
    process.stdout.write(humans.length === 0 ? "No demo phone is checked in yet.\n" : "Several humans are present: arm ends guest presences once the tester is identified.\n");
    return;
  }
  const tester = await loadProfile(humans[0]);
  const { data: pending, error: likeError } = await supabase
    .from("likes").select("liker_id").eq("venue_night_id", night.id).eq("liked_id", tester.id).in("liker_id", [...users.byId.keys()]);
  if (likeError) throw new Error(`Could not inspect armed likes: ${likeError.message}`);
  const { data: matches, error: matchError } = await supabase
    .from("matches").select("profile_a, profile_b").eq("venue_night_id", night.id).or(`profile_a.eq.${tester.id},profile_b.eq.${tester.id}`);
  if (matchError) throw new Error(`Could not inspect demo matches: ${matchError.message}`);
  const matched = new Set(matches.map((row) => (row.profile_a === tester.id ? row.profile_b : row.profile_a)));
  const remaining = new Set(pending.filter((row) => !matched.has(row.liker_id)).map((row) => users.byId.get(row.liker_id).key));
  process.stdout.write(`Tester ${tester.id}: ${remaining.size} armed match(es) left, ${matched.size} already used.\n`);
  printCheatSheet({ gender: tester.gender, interestedIn: tester.interested_in ?? [] }, remaining);
}

async function clearCommand() {
  const venue = await loadDemoVenue();
  await clearDemoData(venue);
  process.stdout.write(`Demo room data cleared. /v/${DEMO_SLUG} remains available and live.\n`);
}

function printCheatSheet(viewer, armedKeys) {
  const feed = feedFor(viewer);
  process.stdout.write("\nFeed order on the demo phone (★ = armed, liking it opens a match):\n");
  for (const profile of feed) {
    process.stdout.write(`  ${String(profile.position).padStart(2)}. ${armedKeys.has(profile.key) ? "★" : " "} ${profile.firstName}\n`);
  }
  process.stdout.write("A matched profile leaves the feed; the cards below it move up by one.\n");
}

async function ensureDemoVenue() {
  const { data: existing, error: existingError } = await supabase
    .from("venues").select("id, is_test_venue").eq("slug", DEMO_SLUG).maybeSingle();
  if (existingError) fail(`Could not inspect /${DEMO_SLUG}: ${existingError.message}`);
  if (existing && !existing.is_test_venue) fail(`Safety check failed: /${DEMO_SLUG} already belongs to a non-test venue.`);
  const { data, error } = await supabase
    .from("venues")
    .upsert({
      slug: DEMO_SLUG,
      name: DEMO_VENUE_NAME,
      city: "Paris",
      timezone: "Europe/Paris",
      is_test_venue: true,
      rollover_disabled: true,
    }, { onConflict: "slug" })
    .select("id, slug, name, is_test_venue")
    .single();
  if (error) fail(`Could not create the demo venue: ${error.message}`);
  if (!data.is_test_venue) fail("Safety check failed: the demo venue must be marked as test.");
  return data;
}

// Mirrors the permanent live QA night: a year-9999 close keeps the room live
// through the lifecycle job, and the reset restores it if a founder paused it.
async function ensureLiveNight(venue) {
  const { data: existing, error: loadError } = await supabase
    .from("venue_nights").select("id").eq("venue_id", venue.id).is("terminal_at", null);
  if (loadError) fail(`Could not inspect demo nights: ${loadError.message}`);
  if (existing.length === 0) {
    const { error } = await supabase.from("venue_nights").insert({
      venue_id: venue.id,
      waiting_opens_at: "2000-01-01T00:00:00.000Z",
      guaranteed_launch_at: "2000-01-01T00:01:00.000Z",
      closes_at: NEVER_EXPIRES,
      launch_threshold: 4,
    });
    if (error) fail(`Could not create the permanent demo night: ${error.message}`);
    const { error: engineError } = await supabase.rpc("run_venue_night_lifecycle");
    if (engineError) fail(`Could not launch the demo night: ${engineError.message}`);
  }
  const { error: liveError } = await supabase
    .from("venue_nights")
    .update({
      waiting_opens_at: "2000-01-01T00:00:00.000Z",
      guaranteed_launch_at: "2000-01-01T00:01:00.000Z",
      closes_at: NEVER_EXPIRES,
      launch_threshold: 4,
      status: "live",
      opened_at: "2000-01-01T00:00:00.000Z",
      launched_at: "2000-01-01T00:01:00.000Z",
      launch_reason: "guaranteed",
    })
    .eq("venue_id", venue.id)
    .is("terminal_at", null);
  if (liveError) fail(`Could not restore the live demo night: ${liveError.message}`);
  const { error: mirrorError } = await supabase.from("venues").update({ is_live: true }).eq("id", venue.id);
  if (mirrorError) fail(`Could not restore the demo venue mirror: ${mirrorError.message}`);
  return loadLiveNight(venue);
}

async function loadDemoVenue() {
  const { data, error } = await supabase
    .from("venues").select("id, slug, name, is_test_venue").eq("slug", DEMO_SLUG).maybeSingle();
  if (error) throw new Error(`Could not load /${DEMO_SLUG}: ${error.message}`);
  if (!data) throw new Error(`/${DEMO_SLUG} does not exist yet. Run seed first.`);
  if (!data.is_test_venue) throw new Error(`Safety check failed: /${DEMO_SLUG} is not marked as test.`);
  return data;
}

async function loadLiveNight(venue) {
  const { data, error } = await supabase
    .from("venue_nights").select("id, status, closes_at").eq("venue_id", venue.id).is("terminal_at", null);
  if (error) throw new Error(`Could not load the demo night: ${error.message}`);
  if (data.length !== 1) throw new Error(`Expected one active demo night, found ${data.length}. Run seed.`);
  const night = data[0];
  if (night.status !== "live" || !night.closes_at.startsWith("9999-12-31")) {
    throw new Error("The demo night is not permanently live. Run seed to restore it.");
  }
  return night;
}

async function clearDemoData(venue) {
  // Every delete is scoped to the test-marked demo venue or to demo-tagged users.
  for (const table of [
    "analytics_events",
    "venue_conversation_events",
    "venue_scan_events",
    "venue_chat_start_events",
    "venue_match_events",
    "venue_ejections",
    "reports",
    "likes",
    "matches",
    "presence",
  ]) {
    const { error } = await supabase.from(table).delete().eq("venue_id", venue.id);
    if (error) fail(`Could not clear ${table}: ${error.message}`);
  }
  for (const user of await listDemoAuthUsers()) {
    const { error } = await supabase.auth.admin.deleteUser(user.id);
    if (error) fail(`Could not delete demo auth user ${user.id}: ${error.message}`);
  }
}

async function listDemoAuthUsers() {
  const users = [];
  for (let page = 1; ; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) fail(`Could not list auth users: ${error.message}`);
    users.push(...data.users.filter((user) => user.app_metadata?.test_seed === DEMO_SEED));
    if (data.users.length < 1000) break;
  }
  return users;
}

async function demoUsers() {
  const byId = new Map();
  const byKey = new Map();
  for (const user of await listDemoAuthUsers()) {
    const key = user.email?.split("@")[0];
    const profile = DEMO_ROSTER.find((entry) => entry.key === key);
    if (!profile) continue;
    byId.set(user.id, { ...profile, id: user.id });
    byKey.set(key, { ...profile, id: user.id });
  }
  if (byId.size !== DEMO_ROSTER.length) {
    throw new Error(`Expected ${DEMO_ROSTER.length} demo users, found ${byId.size}. Run seed.`);
  }
  return { byId, byKey };
}

// The demo phone is the only human checked in after seed; with several, the
// founder passes --tester-profile-id instead of letting the script guess.
async function resolveTester(night, users) {
  if (options.testerProfileId) return loadProfile(options.testerProfileId, night);
  const { data, error } = await supabase
    .from("presence").select("profile_id").eq("venue_night_id", night.id).is("left_at", null);
  if (error) throw new Error(`Could not inspect demo presence: ${error.message}`);
  const humans = [...new Set(data.map((row) => row.profile_id).filter((id) => !users.byId.has(id)))];
  if (humans.length === 0) throw new Error(`No human is checked into /v/${DEMO_SLUG}. Open it on the demo phone first.`);
  if (humans.length > 1) throw new Error(`${humans.length} humans are checked in; pass --tester-profile-id UUID.`);
  return loadProfile(humans[0], night);
}

async function loadProfile(id, night) {
  const { data, error } = await supabase
    .from("profiles").select("id, gender, interested_in").eq("id", id).maybeSingle();
  if (error) throw new Error(`Could not load profile ${id}: ${error.message}`);
  if (!data) throw new Error(`Profile ${id} does not exist.`);
  if (night) {
    const { data: presence, error: presenceError } = await supabase
      .from("presence").select("id").eq("profile_id", id).eq("venue_night_id", night.id).is("left_at", null);
    if (presenceError) throw new Error(`Could not inspect tester presence: ${presenceError.message}`);
    if (presence.length !== 1) throw new Error(`The tester must be checked into /v/${DEMO_SLUG} before arming.`);
  }
  return data;
}

function photoFor(profile, index) {
  for (const extension of ["jpg", "webp", "png"]) {
    const file = `${profile.key}.${extension}`;
    if (existsSync(new URL(`../public/${DEMO_PHOTO_DIR}/${file}`, import.meta.url))) return `/${DEMO_PHOTO_DIR}/${file}`;
  }
  return `/test-profiles/portrait-${(index % 6) + 1}.svg`;
}

function demoPassword(key) {
  return `Demo-only-${key}-2026!`;
}

async function insertRows(table, rows) {
  const { error } = await supabase.from(table).insert(rows);
  if (error) fail(`Could not insert ${table}: ${error.message}`);
}

function parseArguments(args) {
  const result = { command: "status", flags: new Set() };
  let index = 0;
  if (args[0] && !args[0].startsWith("--")) {
    result.command = args[0];
    index = 1;
  }
  if (!new Set(["seed", "arm", "status", "clear"]).has(result.command)) fail(usage());
  for (; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === SHARED_WRITE_FLAG) result.flags.add(arg);
    else if (arg === "--help") result.help = true;
    else if (arg === "--tester-profile-id" && result.command === "arm") {
      const value = args[++index];
      if (!value || !UUID.test(value)) fail("--tester-profile-id requires a profile UUID.");
      result.testerProfileId = value;
    } else fail(`Unknown option: ${arg}\n\n${usage()}`);
  }
  return result;
}

function usage() {
  return `Usage: npm run demo:venue -- [command] [options]

Commands:
  status   Read-only: room health, armed matches left and the feed cheat sheet (default)
  seed     Create or reset /v/${DEMO_SLUG} with the roster in scripts/demo-venue-roster.mjs
  arm      Reset the demo phone's likes/matches/chats, end guest presences, re-arm the ★ profiles
  clear    Remove demo profiles and interactions; the room stays live

Options:
  ${SHARED_WRITE_FLAG}   Required by seed, arm and clear (shared database)
  --tester-profile-id UUID  arm only, when several humans are checked in
`;
}

function loadLocalEnv() {
  try {
    const contents = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
    for (const line of contents.split(/\r?\n/)) {
      const match = line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/);
      if (!match || process.env[match[1]]) continue;
      process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
    }
  } catch {
    // Environment variables are also supported directly.
  }
}

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}
