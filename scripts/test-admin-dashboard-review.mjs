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

const { productionEventUrl, registrationClosesAt, nightTimeline, parseNightTab, availableNightTabs } = await import("../lib/admin-dashboard.ts");
assert.equal(productionEventUrl(routeNightId), `https://getamourette.com/events/${routeNightId}`);
assert.equal(registrationClosesAt("2026-10-20T18:00:00Z"), "2026-10-20T17:30:00.000Z");
assert.equal(registrationClosesAt("2026-10-25T01:15:00Z"), "2026-10-25T00:45:00.000Z", "cutoff is elapsed minutes across DST");
assert.equal(registrationClosesAt("2027-01-01T00:15:00Z"), "2026-12-31T23:45:00.000Z");
const timelineNight = { waiting_opens_at: "2026-10-20T18:00:00Z", guaranteed_launch_at: "2026-10-20T19:00:00Z", closes_at: "2026-10-21T00:00:00Z", launch_threshold: 12 };
const timeline = nightTimeline(timelineNight, "2026-10-10T12:00:00Z", Date.parse("2026-10-20T17:30:00Z"));
assert.deepEqual(timeline.map(step => step.label), ["Registration opens", "Registration closes", "Entry opens", "Matching starts", "Night closes"]);
assert.deepEqual(timeline.map(step => step.done), [true, true, false, false, false]);
assert.match(timeline[3].detail, /earlier once 12 people are checked in/);
assert.deepEqual(nightTimeline(timelineNight, null, Date.parse(timelineNight.closes_at)).map(step => [step.label, step.done]), [["Entry opens", true], ["Matching starts", true], ["Night closes", true]]);
for (const value of [null, "", "unknown", "Reservations", " reservations", "arrivals ", "../report"]) assert.equal(parseNightTab(value, true, true), "overview");
assert.deepEqual(availableNightTabs(false, false), ["overview"]);
assert.deepEqual(availableNightTabs(false, true), ["overview", "report"]);
assert.deepEqual(availableNightTabs(true, false), ["overview", "reservations", "waitlist", "arrivals", "activity"]);
for (const value of ["reservations", "waitlist", "arrivals", "activity"]) {
  assert.equal(parseNightTab(value, true, false), value);
  assert.equal(parseNightTab(value, false, true), "overview");
}
assert.equal(parseNightTab("report", true, false), "overview");
assert.equal(parseNightTab("report", false, true), "report");
console.log("Night dashboard tabs, timeline and production booking URL: all assertions passed");


const { formatWorkspaceDate } = await import("../lib/admin-venue-workspace.ts");
assert.equal(formatWorkspaceDate("2026-10-20T17:30:00Z", "Europe/Paris", Date.parse("2026-10-13T12:00:00Z"), true), "Tue 20 Oct, 19:30");
assert.equal(formatWorkspaceDate("2026-10-20T17:30:00Z", "Europe/Paris", Date.parse("2027-01-01T12:00:00Z"), true), "Tue, 20 Oct 2026, 19:30");
assert.equal(formatWorkspaceDate("2027-01-01T01:00:00Z", "Europe/Paris", newYearNow, true), "Fri 1 Jan, 02:00", "omit year when the venue is already in the new year");
assert.equal(formatWorkspaceDate("2027-01-01T06:00:00Z", "America/New_York", newYearNow, true), "Fri, 1 Jan 2027, 01:00", "retain year when the venue is still in the prior year");
console.log("Night dashboard timestamps use the venue-local current year: all assertions passed");

const { validateNightSchedule, closingLocal, preselectedVenue, creationSummary, creationNotice } = await import("../lib/admin-night-creation.ts");
const { validateReservationConfiguration } = await import("../lib/reservation-configuration.ts");
const draft = { date: "2026-10-23", entry: "20:00", launch: "21:00", close: "02:00", threshold: 4 };
const scheduleCheck = (patch = {}, rows = [], zone = "Europe/Paris") => validateNightSchedule({ ...draft, ...patch }, zone, venueId, rows);
assert.deepEqual(scheduleCheck().errors, {});
assert.deepEqual(scheduleCheck().instants, ["2026-10-23T18:00:00.000Z", "2026-10-23T19:00:00.000Z", "2026-10-24T00:00:00.000Z"]);
assert.equal(closingLocal("2026-12-31", "21:00", "02:00"), "2027-01-01T02:00");
assert.equal(closingLocal("2026-10-23", "21:00", "23:00"), "2026-10-23T23:00");
for (const launch of ["19:00", "20:00", ""]) assert.match(scheduleCheck({ launch }).errors.launch, /later than entry/);
for (const threshold of [0, -1, 1.5, NaN, Infinity, 2147483648]) assert.match(scheduleCheck({ threshold }).errors.threshold, /integer/);
for (const threshold of [1, 2147483647]) assert.equal(scheduleCheck({ threshold }).errors.threshold, undefined);
assert.match(scheduleCheck({ date: "" }).errors.date, /Choose/);
assert.match(scheduleCheck({ date: "2026-10-24", close: "02:30" }).errors.close, /twice/, "ambiguous closing must be refused");
assert.match(scheduleCheck({ date: "2026-03-28", close: "02:30" }).errors.close, /does not exist/);
const overlapping = { id: routeNightId, venue_id: venueId, waiting_opens_at: "2026-10-23T19:00:00.000Z", closes_at: "2026-10-24T01:00:00.000Z" };
assert.match(scheduleCheck({}, [overlapping]).errors.date, /overlaps/);
assert.equal(scheduleCheck({}, [{ ...overlapping, venue_id: "another" }]).errors.date, undefined);
assert.equal(scheduleCheck({}, [{ ...overlapping, waiting_opens_at: "2026-10-24T00:00:00.000Z" }]).errors.date, undefined, "adjacent nights are allowed");
assert.equal(validateNightSchedule(draft, "Europe/Paris", venueId, [overlapping], routeNightId).errors.date, undefined, "editing excludes itself");
assert.deepEqual(scheduleCheck({}, [], "America/New_York").instants, ["2026-10-24T00:00:00.000Z", "2026-10-24T01:00:00.000Z", "2026-10-24T06:00:00.000Z"]);
assert.equal(preselectedVenue(venueId, [venueId]), venueId);
for (const value of [null, undefined, {}, [], 1, "", "bad", ` ${venueId}`, venueId.replace(/^0/, "f")]) assert.equal(preselectedVenue(value, [venueId]), "");
assert.equal(preselectedVenue(venueId, []), "");
assert.equal(adminWorkspaceRouteResponse("/admin/nights/new"), null);
assert.equal(adminWorkspaceRouteResponse("/admin/nights/new/"), null);
assert.deepEqual(adminWorkspaceRouteResponse("/admin/venues/new"), { status: 404 });
const reservationDraft = { opens: "2026-10-22T10:00", capacity: "50", amount: "10.00", currency: "eur", policy: "launch-v1" };
const reservationCheck = (patch = {}, allocations = 0) => validateReservationConfiguration({ ...reservationDraft, ...patch }, "Europe/Paris", allocations);
assert.deepEqual(reservationCheck().payload, { p_opens: "2026-10-22T08:00:00.000Z", p_capacity: 50, p_amount: 1000, p_currency: "eur", p_policy: "launch-v1" });
for (const capacity of ["", "0", "-1", "1.5", "100001", " 50", "1e2"]) { assert.ok(reservationCheck({ capacity }).errors.capacity); assert.equal(reservationCheck({ capacity }).payload, null); }
for (const capacity of ["1", "100000"]) assert.equal(reservationCheck({ capacity }).errors.capacity, undefined);
assert.ok(reservationCheck({ capacity: "10" }, 11).errors.capacity);
assert.equal(reservationCheck({ capacity: "11" }, 11).errors.capacity, undefined);
for (const amount of ["", "0", "-1", "0.001", "1000000", "10,00", " 10", "1e2"]) { assert.ok(reservationCheck({ amount }).errors.amount); assert.equal(reservationCheck({ amount }).payload, null); }
assert.equal(reservationCheck({ amount: "0.01" }).payload.p_amount, 1);
assert.equal(reservationCheck({ amount: "999999.99" }).payload.p_amount, 99999999);
assert.equal(reservationCheck({ amount: "1.15" }).payload.p_amount, 115);
assert.ok(reservationCheck({ currency: "EUR" }).errors.currency);
assert.equal(reservationCheck({ currency: "usd" }).payload.p_currency, "usd");
assert.ok(reservationCheck({ opens: "2026-10-25T02:30" }).errors.opens);
for (const policy of ["", "x".repeat(81), " launch-v1", "😃"]) assert.ok(reservationCheck({ policy }).errors.policy);
const summaryNow = Date.parse("2026-10-01T12:00:00Z");
const walkInSummary = creationSummary(draft, "Europe/Paris", null, summaryNow);
assert.equal(walkInSummary.entry, "Walk-in only");
assert.equal(walkInSummary.hours, "Entry 20:00 → matching by 21:00 → closes 02:00 (next day)");
const reservationSummary = creationSummary(draft, "Europe/Paris", reservationDraft, summaryNow);
assert.equal(reservationSummary.entry, "50 places · EUR 10.00 deposit");
assert.equal(reservationSummary.registration, "Registration Thu 22 Oct, 10:00 → Fri 23 Oct, 19:30");
assert.equal(creationSummary({ ...draft, date: "", entry: "" }, "Europe/Paris", reservationDraft).registration.endsWith("Choose entry time"), true);
assert.equal(walkInSummary.date, "Fri 23 Oct");
assert.equal(walkInSummary.closingDate, "Sat 24 Oct");
assert.equal(creationSummary({ ...draft, close: "23:00" }, "Europe/Paris", null, summaryNow).hours, "Entry 20:00 → matching by 21:00 → closes 23:00");
const olderSummary = creationSummary(draft, "Europe/Paris", reservationDraft, Date.parse("2027-01-01T12:00:00Z"));
assert.equal(olderSummary.date, "Fri, 23 Oct 2026");
assert.equal(olderSummary.registration, "Registration Thu, 22 Oct 2026, 10:00 → Fri, 23 Oct 2026, 19:30");
const yearBoundaryDraft = { ...draft, date: "2027-01-01", entry: "00:15", launch: "01:00" };
const yearBoundaryNow = Date.parse("2026-12-31T23:30:00Z");
assert.equal(creationSummary(yearBoundaryDraft, "Europe/Paris", null, yearBoundaryNow).date, "Fri 1 Jan", "current year is determined in the venue zone");
assert.equal(creationSummary(yearBoundaryDraft, "America/New_York", null, yearBoundaryNow).date, "Fri, 1 Jan 2027", "New York is still in the prior year");
assert.equal(creationSummary(yearBoundaryDraft, "America/New_York", { ...reservationDraft, opens: "2026-12-30T10:00" }, yearBoundaryNow).registration, "Registration Wed 30 Dec, 10:00 → Thu 31 Dec, 23:45", "cutoff rolls back across the local date/year boundary");
assert.equal(creationSummary({ ...draft, date: "2026-10-25", entry: "03:15" }, "Europe/Paris", { ...reservationDraft, opens: "2026-10-24T10:00" }, summaryNow).registration, "Registration Sat 24 Oct, 10:00 → Sun 25 Oct, 02:45", "cutoff is an instant formatted in the venue zone across DST");
assert.equal(creationSummary({ ...draft, date: "" }, "Europe/Paris", null, summaryNow).date, "Choose a date");
assert.match(creationSummary(draft, "Europe/Paris", { ...reservationDraft, opens: "2026-10-25T02:30" }, summaryNow).registration, /Choose opening time/, "ambiguous wall times are not presented as resolved dates");
assert.equal(creationNotice(null, "failure"), null);
assert.deepEqual(creationNotice("1", null), { partial: false, message: "Night scheduled." });
assert.equal(creationNotice("1", " refused ").message, "Night scheduled, but reservations were not set up: refused. Set them up from Reservations & deposits.");
assert.equal(creationNotice("1", "x".repeat(1001)).partial, false);
assert.equal(creationNotice("1", "😀".repeat(1000)).partial, true);
console.log("Guided night creation: shared validation, summary, routes and notices passed");
