import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  launchFollowsEntry,
  productionVenueUrl,
  selectVenueNight,
  venueNightKey,
} from "../lib/admin-dashboard.ts";

const now = Date.parse("2026-07-29T12:00:00Z");
const night = (id, status, opens, closes, terminal = false) => ({
  id,
  status,
  waiting_opens_at: opens,
  closes_at: closes,
  terminal_at: terminal ? closes : null,
});

const farFuture = night("far", "closed", "2026-08-20T18:00:00Z", "2026-08-21T02:00:00Z");
const nearFuture = night("near", "closed", "2026-07-30T18:00:00Z", "2026-07-31T02:00:00Z");
const waiting = night("waiting", "waiting", "2026-07-29T10:00:00Z", "2026-07-30T02:00:00Z");
const live = night("live", "live", "2026-07-29T09:00:00Z", "2026-07-30T01:00:00Z");
const historical = night("history", "closed", "2026-07-20T18:00:00Z", "2026-07-21T02:00:00Z", true);

assert.equal(selectVenueNight([farFuture, nearFuture, historical], now)?.id, "near");
assert.equal(selectVenueNight([farFuture, waiting, nearFuture], now)?.id, "waiting");
assert.equal(selectVenueNight([waiting, live, nearFuture], now)?.id, "live");
assert.equal(selectVenueNight([historical], now)?.id, "history");
assert.equal(venueNightKey(live, "Europe/Paris"), "2026-07-30");

assert.equal(productionVenueUrl("chez-jeannette"), "https://getamourette.com/v/chez-jeannette");
assert.equal(productionVenueUrl("chez-jeannette").includes("vercel.app"), false);
assert.equal(launchFollowsEntry("2026-07-29", "20:00", "21:00"), true);
assert.equal(launchFollowsEntry("2026-07-29", "20:00", "19:00"), false);
assert.equal(launchFollowsEntry("2026-07-29", "20:00", "20:00"), false);

const migration = readFileSync(
  new URL("../supabase/migrations/20260729000001_admin_review_corrections.sql", import.meta.url),
  "utf8"
);
const moderationUi = readFileSync(new URL("../app/admin/ModerationQueue.tsx", import.meta.url), "utf8");
const statsUi = readFileSync(new URL("../app/admin/Stats.tsx", import.meta.url), "utf8");
const venueUi = readFileSync(new URL("../app/admin/VenueWorkspace.tsx", import.meta.url), "utf8");
assert.match(migration, /select vn\.venue_id into target_venue_id/);
assert.match(migration, /p_action not in \('review','remove_for_night','restore'\)/);
assert.doesNotMatch(moderationUi, /suspend_30m|Block 30 min/);
assert.match(statsUi, /Likes per active participant/);
assert.match(statsUi, /Mutual matches/);
assert.doesNotMatch(statsUi, /is_test_venue \? peopleInRoom/);
assert.match(statsUi, /row\.venue_night_id === currentNight\?\.id/);
assert.doesNotMatch(statsUi, /row\.night ===/);
assert.match(venueUi, /night\?\.terminal_at \|\|/);
assert.match(venueUi, /scheduleOpen && !editingNight\?\.terminal_at/);

console.log("admin review regressions: all assertions passed");
