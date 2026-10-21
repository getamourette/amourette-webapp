import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  launchFollowsEntry,
  productionVenueUrl,
  selectVenueNight,
  venueNightKey,
} from "../lib/admin-dashboard.ts";
import { groupWorkspaceNights, isNightScheduleLocked, isTerminalNight, workspaceNightStatus, isWorkspaceId, parseNightsHomeFilters, workspaceNightTiming, adminWorkspaceRouteResponse } from "../lib/admin-venue-workspace.ts";

const now = Date.parse("2026-07-29T12:00:00Z");
const night = (id, status, opens, closes, terminal = false, opened = null) => ({
  id,
  status,
  waiting_opens_at: opens,
  closes_at: closes,
  opened_at: opened,
  terminal_at: terminal ? closes : null,
});

const farFuture = night("far", "closed", "2026-08-20T18:00:00Z", "2026-08-21T02:00:00Z");
const nearFuture = night("near", "closed", "2026-07-30T18:00:00Z", "2026-07-31T02:00:00Z");
const waiting = night("waiting", "waiting", "2026-07-29T10:00:00Z", "2026-07-30T02:00:00Z");
const live = night("live", "live", "2026-07-29T09:00:00Z", "2026-07-30T01:00:00Z");
const historical = night("history", "closed", "2026-07-20T18:00:00Z", "2026-07-21T02:00:00Z", true);
const paused = night("paused", "closed", "2026-07-29T08:00:00Z", "2026-07-30T02:00:00Z", false, "2026-07-29T08:00:00Z");
const ended = { ...paused, id: "ended", terminal_at: "2026-07-29T11:00:00Z" };

assert.equal(selectVenueNight([farFuture, nearFuture, historical], now)?.id, "near");
assert.equal(selectVenueNight([farFuture, waiting, nearFuture], now)?.id, "waiting");
assert.equal(selectVenueNight([waiting, live, nearFuture], now)?.id, "live");
assert.equal(selectVenueNight([historical], now)?.id, "history");
assert.equal(selectVenueNight([farFuture, paused, nearFuture, historical], now)?.id, "paused");
assert.equal(selectVenueNight([paused, nearFuture], now)?.id, "paused");
assert.equal(selectVenueNight([paused, waiting, nearFuture], now)?.id, "waiting");
assert.equal(selectVenueNight([paused, waiting, live, nearFuture], now)?.id, "live");
assert.equal(selectVenueNight([ended, nearFuture, historical], now)?.id, "near");
assert.equal(selectVenueNight([historical, ended], now)?.id, "ended");
assert.equal(selectVenueNight([], now), undefined);
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
const workspacePaused = { ...workspaceRows[3], id: "paused", status: "closed" };
const expired = { ...workspaceRows[3], id: "expired", closes_at: "2026-07-29T12:00:00Z" };
const cancelled = { ...workspaceRows[0], id: "cancelled", terminal_at: "2026-07-28T12:00:00Z", terminal_reason: "cancelled" };
const rows = [...workspaceRows, workspacePaused, expired, cancelled];
const originalOrder = rows.map(row => row.id);
const groups = groupWorkspaceNights(rows, now);
assert.deepEqual(groups.upcoming.map(row => row.id), ["near", "far"]);
assert.deepEqual(new Set(groups.active.map(row => row.id)), new Set(["live", "waiting", "paused"]));
assert.deepEqual(new Set(groups.history.map(row => row.id)), new Set(["history", "expired", "cancelled"]));
assert.deepEqual(rows.map(row => row.id), originalOrder, "grouping must not reorder the source rows");
assert.equal(workspaceNightStatus(workspacePaused, now), "Paused");
assert.equal(workspaceNightStatus(expired, now), "Ended");
assert.equal(workspaceNightStatus(cancelled, now), "Cancelled");
assert.equal(isTerminalNight(expired, now), true, "expiry is authoritative before cron finalizes the row");
assert.equal(isNightScheduleLocked(workspaceRows[1], now), false);
assert.equal(isNightScheduleLocked(workspacePaused, now), true);
assert.equal(isNightScheduleLocked(cancelled, now), true);
const opening = { ...workspaceRows[1], waiting_opens_at: new Date(now).toISOString() };
assert.equal(isNightScheduleLocked(opening, now), true, "entry boundary locks scheduling");
assert.equal(workspaceNightStatus(opening, now), "Opening");
assert.equal(groupWorkspaceNights([opening], now).active.length, 1);
assert.deepEqual(groupWorkspaceNights([], now), { active: [], upcoming: [], history: [] });

console.log("admin review regressions: all assertions passed");

assert.equal(isWorkspaceId("00000000-0000-4000-8000-000000000010"), true);
for (const value of [null, undefined, [], {}, 10, "", "../admin", " 00000000-0000-4000-8000-000000000010", "00000000-0000-4000-8000-00000000001Z", "F0000000-0000-4000-8000-000000000010"]) {
  assert.equal(isWorkspaceId(value), false, "route IDs require the exact lowercase UUID form");
}

const venueId = "00000000-0000-4000-8000-000000000010";
assert.deepEqual(parseNightsHomeFilters("past", venueId, [venueId]), { view: "past", venueId });
for (const view of [null, "", "upcoming", "future", "PAST", " past", "past "]) {
  assert.equal(parseNightsHomeFilters(view, null, [venueId]).view, "upcoming");
}
for (const value of [null, "", "not-a-uuid", ` ${venueId}`, `${venueId} `, "f0000000-0000-4000-8000-000000000010"]) {
  assert.equal(parseNightsHomeFilters("past", value, [venueId]).venueId, null);
}
assert.equal(parseNightsHomeFilters("past", venueId, []).venueId, null, "hidden test venues must not silently filter the schedule");
const timing = workspaceNightTiming({ ...nearFuture, terminal_reason: null }, "Europe/Paris", now);
assert.equal(timing.hours, "20:00 → 04:00 (+1 day)");
assert.equal(timing.relative, "tomorrow");
assert.equal(timing.date, "Thu 30 Jul");
assert.equal(workspaceNightTiming(nearFuture, "Europe/Paris", Date.parse("2027-01-01T12:00:00Z")).date, "Thu, 30 Jul 2026");
const newYearNight = { ...nearFuture, waiting_opens_at: "2027-01-01T01:00:00Z" };
const newYearNow = Date.parse("2026-12-31T23:30:00Z");
assert.equal(workspaceNightTiming(newYearNight, "Europe/Paris", newYearNow).date, "Fri 1 Jan", "compare years in the venue timezone, not UTC");
assert.equal(workspaceNightTiming(newYearNight, "America/New_York", newYearNow).date, "Thu 31 Dec");
const nextYearNight = { ...nearFuture, waiting_opens_at: "2027-01-01T06:00:00Z" };
assert.equal(workspaceNightTiming(nextYearNight, "America/New_York", newYearNow).date, "Fri, 1 Jan 2027", "keep the year when the venue is still in the prior year");
const dstNight = { ...nearFuture, waiting_opens_at: "2026-10-25T19:00:00Z", closes_at: "2026-10-26T01:00:00Z" };
assert.equal(workspaceNightTiming(dstNight, "Europe/Paris", Date.parse("2026-10-24T18:00:00Z")).relative, "tomorrow", "relative dates count calendar days across DST");
assert.equal(workspaceNightTiming(dstNight, "America/New_York", Date.parse("2026-10-25T01:00:00Z")).relative, "tomorrow", "relative day uses the venue timezone rather than UTC");
assert.equal(workspaceNightTiming(dstNight, "Europe/Paris", Date.parse("2026-10-25T20:00:00Z")).relative, "Today");
console.log("Nights home filters and venue-local timing: all assertions passed");


const routeNightId = "00000000-0000-4000-8000-000000000012";
assert.deepEqual(adminWorkspaceRouteResponse(`/admin/venues/${venueId}/nights/${routeNightId}`), {
  status: 308, location: `/admin/nights/${routeNightId}`,
});
for (const badId of ["not-a-uuid", "F0000000-0000-4000-8000-000000000010", `%20${venueId}`, "%ZZ", "%2F"]) {
  for (const path of [`/admin/venues/${badId}`, `/admin/nights/${badId}`,
    `/admin/venues/${badId}/nights/${routeNightId}`, `/admin/venues/${venueId}/nights/${badId}`]) {
    assert.deepEqual(adminWorkspaceRouteResponse(path), { status: 404 });
  }
}
for (const path of ["/admin", "/admin/venues", "/admin/moderation", "/admin/stats", "/admin/feedback",
  "/admin/reset-password", "/admin/workspace-preview", `/admin/venues/${venueId}`, `/admin/nights/${routeNightId}`,
  `/admin/nights/${routeNightId}/`, `/admin/venues/${venueId.replace(/^0/, "%30")}`, "/v/le-salon"]) {
  assert.equal(adminWorkspaceRouteResponse(path), null, `${path} must keep its existing rendering and access checks`);
}
console.log("Admin route HTTP decisions: all assertions passed");
