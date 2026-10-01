import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  launchFollowsEntry,
  productionVenueUrl,
  selectVenueNight,
  venueNightKey,
} from "../lib/admin-dashboard.ts";
import { groupWorkspaceNights, isNightScheduleLocked, isTerminalNight, workspaceNightStatus } from "../lib/admin-venue-workspace.ts";

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
assert.match(migration, /select vn\.venue_id into target_venue_id/);
assert.match(migration, /p_action not in \('review','remove_for_night','restore'\)/);
assert.doesNotMatch(moderationUi, /suspend_30m|Block 30 min/);
// #257 replaces active-room ratios with the durable night report; behavioral
// denominator and rendering checks live in test-night-reports and Playwright.
assert.match(statsUi, /NightReportPanel venueNightId=\{currentNight.id\}/);
assert.doesNotMatch(statsUi, /is_test_venue \? peopleInRoom/);
assert.doesNotMatch(statsUi, /row\.night ===/);
// #162 replaces source-shape checks with the actual grouping/lock rules.
// The admin browser spec also checks that historical nights expose no mutations.
const workspaceRows = [farFuture, nearFuture, historical, live, waiting].map(row => ({
  ...row, opened_at: ["live", "waiting"].includes(row.status) ? row.waiting_opens_at : null,
  terminal_reason: row.terminal_at ? "scheduled_end" : null,
}));
const paused = { ...workspaceRows[3], id: "paused", status: "closed" };
const expired = { ...workspaceRows[3], id: "expired", closes_at: "2026-07-29T12:00:00Z" };
const cancelled = { ...workspaceRows[0], id: "cancelled", terminal_at: "2026-07-28T12:00:00Z", terminal_reason: "cancelled" };
const rows = [...workspaceRows, paused, expired, cancelled];
const originalOrder = rows.map(row => row.id);
const groups = groupWorkspaceNights(rows, now);
assert.deepEqual(groups.upcoming.map(row => row.id), ["near", "far"]);
assert.deepEqual(new Set(groups.active.map(row => row.id)), new Set(["live", "waiting", "paused"]));
assert.deepEqual(new Set(groups.history.map(row => row.id)), new Set(["history", "expired", "cancelled"]));
assert.deepEqual(rows.map(row => row.id), originalOrder, "grouping must not reorder the source rows");
assert.equal(workspaceNightStatus(paused, now), "Paused");
assert.equal(workspaceNightStatus(expired, now), "Ended");
assert.equal(workspaceNightStatus(cancelled, now), "Cancelled");
assert.equal(isTerminalNight(expired, now), true, "expiry is authoritative before cron finalizes the row");
assert.equal(isNightScheduleLocked(workspaceRows[1], now), false);
assert.equal(isNightScheduleLocked(paused, now), true);
assert.equal(isNightScheduleLocked(cancelled, now), true);
const opening = { ...workspaceRows[1], waiting_opens_at: new Date(now).toISOString() };
assert.equal(isNightScheduleLocked(opening, now), true, "entry boundary locks scheduling");
assert.equal(workspaceNightStatus(opening, now), "Opening");
assert.equal(groupWorkspaceNights([opening], now).active.length, 1);
assert.deepEqual(groupWorkspaceNights([], now), { active: [], upcoming: [], history: [] });

console.log("admin review regressions: all assertions passed");
