#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const TEST_SEED = "always-live-test-venues-v1";
const CROWDED_SLUG = "test-crowded";
const EMPTY_SLUG = "test-empty";
const PROFILE_COUNT = 36;
const NEVER_EXPIRES = "9999-12-31T23:59:59.999Z";

loadLocalEnv();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  fail(
    "Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the environment or .env.local.",
  );
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const { command, testerProfileId } = parseArguments(process.argv.slice(2));

if (command === "clear") {
  await clearSeededData();
  process.stdout.write("Test venue data cleared. The two rooms remain available.\n");
  process.exit(0);
}

const venues = await ensureTestVenues();
const venueNights = await ensureTestVenueNights(venues);
await clearSeededData(venues);
const tester = testerProfileId ? await loadTester(testerProfileId) : null;
const profiles = buildProfiles(tester);

process.stdout.write(`Creating ${profiles.length} test profiles…\n`);
const users = [];
for (const profile of profiles) {
  const { data, error } = await supabase.auth.admin.createUser({
    email: `${profile.seedKey}@seed.paramour.invalid`,
    password: `Test-only-${profile.seedKey}-2026!`,
    email_confirm: true,
    app_metadata: { test_seed: TEST_SEED },
    user_metadata: { test_profile: true },
  });
  if (error || !data.user) {
    fail(`Could not create ${profile.firstName}: ${error?.message ?? "unknown error"}`);
  }
  users.push({ ...profile, id: data.user.id });
}

await insertRows(
  "profiles",
  users.map((profile, index) => ({
    id: profile.id,
    first_name: profile.firstName,
    photo_url: `/test-profiles/portrait-${(index % 6) + 1}.svg`,
    bio: profile.bio,
    gender: profile.gender,
    interested_in: profile.interestedIn,
  })),
);

await insertRows(
  "profile_private",
  users.map((profile) => ({
    id: profile.id,
    adult_confirmed_at: new Date().toISOString(),
  })),
);

await insertRows(
  "presence",
  users.map((profile) => ({
    profile_id: profile.id,
    venue_id: venues.crowded.id,
    venue_night_id: venueNights.crowded.id,
    checked_in_at: new Date().toISOString(),
    last_seen_at: new Date().toISOString(),
    is_visible: true,
  })),
);

if (tester) {
  const { error: leaveError } = await supabase
    .from("presence")
    .update({ left_at: new Date().toISOString() })
    .eq("profile_id", tester.id)
    .is("left_at", null);
  if (leaveError) fail(`Could not reset tester presence: ${leaveError.message}`);
  await insertRows("presence", [
    {
      profile_id: tester.id,
      venue_id: venues.crowded.id,
      venue_night_id: venueNights.crowded.id,
      checked_in_at: new Date().toISOString(),
      last_seen_at: new Date().toISOString(),
      is_visible: true,
    },
  ]);
  const matchReady = users[0];
  await insertRows("likes", [
    {
      liker_id: matchReady.id,
      liked_id: tester.id,
      venue_id: venues.crowded.id,
      venue_night_id: venueNights.crowded.id,
      expires_at: NEVER_EXPIRES,
    },
  ]);
  process.stdout.write(
    `Match prepared: like ${matchReady.firstName} from tester ${tester.id}.\n`,
  );
}

process.stdout.write(
  `Seed complete. /v/${CROWDED_SLUG} has ${PROFILE_COUNT} profiles; /v/${EMPTY_SLUG} is empty.\n`,
);

function loadLocalEnv() {
  try {
    const contents = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
    for (const line of contents.split(/\r?\n/)) {
      const match = line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/);
      if (!match || process.env[match[1]]) continue;
      process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
    }
  } catch {
    // Environment variables are also supported directly (CI and one-off use).
  }
}

function parseArguments(args) {
  const command = args[0]?.startsWith("--") ? "seed" : (args[0] ?? "seed");
  if (!new Set(["seed", "clear"]).has(command)) {
    fail("Usage: npm run seed:test-venues -- [seed|clear] [--tester-profile-id UUID]");
  }

  const testerFlag = args.indexOf("--tester-profile-id");
  const testerProfileId =
    testerFlag === -1
      ? process.env.QA_TESTER_PROFILE_ID?.trim() || null
      : args[testerFlag + 1];
  if (testerFlag !== -1 && !testerProfileId) {
    fail("--tester-profile-id requires a profile UUID.");
  }
  if (
    testerProfileId &&
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      testerProfileId,
    )
  ) {
    fail("The tester profile id must be a valid UUID.");
  }
  return { command, testerProfileId };
}

async function ensureTestVenues() {
  const venueRows = [
    {
      slug: CROWDED_SLUG,
      name: "Test Lab · Crowded",
      city: "Paris",
      timezone: "Europe/Paris",
      is_test_venue: true,
    },
    {
      slug: EMPTY_SLUG,
      name: "Test Lab · Empty",
      city: "Paris",
      timezone: "Europe/Paris",
      is_test_venue: true,
    },
  ];
  const { data: existing, error: existingError } = await supabase
    .from("venues")
    .select("slug, is_test_venue")
    .in("slug", [CROWDED_SLUG, EMPTY_SLUG]);
  if (existingError) fail(`Could not inspect test venue slugs: ${existingError.message}`);
  const collision = existing.find((venue) => !venue.is_test_venue);
  if (collision) {
    fail(`Safety check failed: /${collision.slug} already belongs to a non-test venue.`);
  }

  const { data, error } = await supabase
    .from("venues")
    .upsert(venueRows, { onConflict: "slug" })
    .select("id, slug, is_test_venue");
  if (error) fail(`Could not create test venues: ${error.message}`);

  const crowded = data.find((venue) => venue.slug === CROWDED_SLUG);
  const empty = data.find((venue) => venue.slug === EMPTY_SLUG);
  if (!crowded?.is_test_venue || !empty?.is_test_venue) {
    fail("Safety check failed: both seed targets must be marked as test venues.");
  }
  return { crowded, empty };
}

async function ensureTestVenueNights(venues) {
  const venueIds = [venues.crowded.id, venues.empty.id];
  const { data: existing, error: loadError } = await supabase
    .from("venue_nights")
    .select("id, venue_id, status, closes_at, terminal_at")
    .in("venue_id", venueIds)
    .is("terminal_at", null);
  if (loadError) fail(`Could not inspect test venue nights: ${loadError.message}`);

  for (const venueId of venueIds) {
    if (existing.some((night) => night.venue_id === venueId)) continue;
    const { error } = await supabase.from("venue_nights").insert({
      venue_id: venueId,
      waiting_opens_at: "2000-01-01T00:00:00.000Z",
      guaranteed_launch_at: "2000-01-01T00:01:00.000Z",
      closes_at: NEVER_EXPIRES,
      launch_threshold: 4,
    });
    if (error) fail(`Could not create permanent test venue night: ${error.message}`);
  }

  const { error: engineError } = await supabase.rpc("run_venue_night_lifecycle");
  if (engineError) fail(`Could not launch permanent test venue nights: ${engineError.message}`);

  const { data, error } = await supabase
    .from("venue_nights")
    .select("id, venue_id, status, closes_at, terminal_at")
    .in("venue_id", venueIds)
    .is("terminal_at", null);
  if (error) fail(`Could not load permanent test venue nights: ${error.message}`);
  const crowded = data.find((night) => night.venue_id === venues.crowded.id);
  const empty = data.find((night) => night.venue_id === venues.empty.id);
  if (!crowded || !empty || crowded.status !== "live" || empty.status !== "live") {
    fail("Both permanent test venue nights must be live.");
  }
  if (!crowded.closes_at.startsWith("9999-12-31") || !empty.closes_at.startsWith("9999-12-31")) {
    fail("Test venue nights must use the explicit year-9999 close time.");
  }
  return { crowded, empty };
}

async function clearSeededData(knownVenues) {
  const venues = knownVenues ?? (await loadTestVenues());
  const venueIds = [venues.crowded.id, venues.empty.id];

  // Every delete is constrained to an explicitly test-marked venue. Matches
  // cascade to messages; auth-user deletion cascades to profiles/private data.
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
    const { error } = await supabase.from(table).delete().in("venue_id", venueIds);
    if (error) fail(`Could not clear ${table}: ${error.message}`);
  }

  for (const user of await listSeededUsers()) {
    const { error } = await supabase.auth.admin.deleteUser(user.id);
    if (error) fail(`Could not delete seeded auth user ${user.id}: ${error.message}`);
  }
}

async function loadTestVenues() {
  const { data, error } = await supabase
    .from("venues")
    .select("id, slug, is_test_venue")
    .in("slug", [CROWDED_SLUG, EMPTY_SLUG]);
  if (error) fail(`Could not load test venues: ${error.message}`);
  const crowded = data.find((venue) => venue.slug === CROWDED_SLUG);
  const empty = data.find((venue) => venue.slug === EMPTY_SLUG);
  if (!crowded || !empty) fail("Apply the always-live test venue migration first.");
  if (!crowded.is_test_venue || !empty.is_test_venue) {
    fail("Safety check failed: refusing to clear a venue not marked as test.");
  }
  return { crowded, empty };
}

async function listSeededUsers() {
  const seeded = [];
  for (let page = 1; ; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) fail(`Could not list auth users: ${error.message}`);
    seeded.push(
      ...data.users.filter((user) => user.app_metadata?.test_seed === TEST_SEED),
    );
    if (data.users.length < 1000) break;
  }
  return seeded;
}

async function loadTester(id) {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, gender, interested_in")
    .eq("id", id)
    .maybeSingle();
  if (error) fail(`Could not load tester profile: ${error.message}`);
  if (!data) fail(`Tester profile ${id} does not exist.`);
  const { data: privateProfile, error: privateError } = await supabase
    .from("profile_private")
    .select("adult_confirmed_at")
    .eq("id", id)
    .maybeSingle();
  if (privateError) fail(`Could not load tester eligibility: ${privateError.message}`);
  if (!privateProfile?.adult_confirmed_at) {
    fail(`Tester profile ${id} must be adult-confirmed.`);
  }
  return data;
}

function buildProfiles(tester) {
  const names = [
    "Maya", "Nora", "Inès", "Sofia", "Lina", "Jade", "Clara", "Amara", "Zoé", "Leïla", "Eva", "Mila",
    "Noah", "Adam", "Léo", "Sam", "Hugo", "Eli", "Louis", "Nils", "Oscar", "Amir", "Theo", "Max",
    "Alex", "Charlie", "Robin", "Sasha", "Camille", "Lou", "Morgan", "Andrea", "Yaël", "Sol", "Billie", "Ariel",
  ];
  const genders = ["woman", "man", "nonbinary"];
  const bios = [
    "Here for one good conversation and a terrible dance move.",
    "Ask me what I ordered. The answer changes every ten minutes.",
    "Usually near the music, occasionally pretending I know the lyrics.",
    "I came for one drink. We both know how that story goes.",
    "Looking for someone brave enough to say hi first.",
    "Good stories, dry humour, and absolutely no small talk résumé.",
  ];

  return names.map((firstName, index) => {
    let gender = genders[Math.floor(index / 12)];
    let interestedIn = [...genders];
    if (index === 0 && tester) {
      gender = tester.interested_in[0];
      interestedIn = [tester.gender];
    }
    return {
      seedKey: `profile-${String(index + 1).padStart(2, "0")}`,
      firstName,
      gender,
      interestedIn,
      bio: bios[index % bios.length],
    };
  });
}

async function insertRows(table, rows) {
  const { error } = await supabase.from(table).insert(rows);
  if (error) fail(`Could not insert ${table}: ${error.message}`);
}

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}
