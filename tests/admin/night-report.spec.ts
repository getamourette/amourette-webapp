import { test, expect, type Page } from "@playwright/test";
import type { NightReport } from "../../lib/night-report";

const venueId = "00000000-0000-4000-8000-000000000001";
const nightId = "00000000-0000-4000-8000-000000000002";
const report: NightReport = {
  venue_id: venueId, venue_night_id: nightId, version: 1, finalized_at: null,
  partial: false, timezone: "Europe/Paris", scanners: 6, preexisting_profiles: 2,
  incomplete_scanners: 4, completed_profiles: 3, dropoffs: 1, scan_entrants: 5,
  participants: 5, likes: 7, like_senders: 4, likes_distribution: [1, 2, 1, 1],
  matches: 3, matched_participants: 4, matches_distribution: [1, 3, 0, 1],
  conversations: 2, replies: 1, arrival_distribution: [1, 1, 1], arrival_observations: 3,
  first_match_sample: 4, first_match_median_seconds: 180, peak: 5,
  attendance: [{ at: "2026-09-15T20:00:00Z", count: 3 }, { at: "2026-09-15T20:30:00Z", count: 5 }],
  gender_mix: { woman: 3, man: 2, nonbinary: 0 }, likes_by_gender: [
    { gender: "woman", participants: 3, sent: 6, received: 6, senders: 3, receivers: 3 },
    { gender: "man", participants: 2, sent: 1, received: 1, senders: 1, receivers: 1 },
    { gender: "nonbinary", participants: 0, sent: 0, received: 0, senders: 0, receivers: 0 },
  ],
};

type StatsScenario = {
  responses?: Record<string, unknown>;
  reports?: Record<string, NightReport>;
  reportRequests?: string[];
};

async function mockAdmin(page: Page, result: NightReport, wait: Promise<void> = Promise.resolve(), fail = false, scenario: StatsScenario = {}) {
  // Every backend request is intercepted; this suite never touches shared fixtures.
  await page.route("**/rest/v1/**", async route => {
    const endpoint = new URL(route.request().url()).pathname.split("/").at(-1);
    let data: unknown = [];
    if (endpoint === "am_i_admin") data = true;
    if (endpoint === "venues") data = [{ id: venueId, name: "Le Salon", city: "Paris", timezone: "Europe/Paris", is_test_venue: true }];
    if (endpoint === "venue_nights") data = [{ id: nightId, venue_id: venueId, status: result.finalized_at ? "closed" : "live", waiting_opens_at: "2026-09-15T18:00:00Z", opened_at: "2026-09-15T18:00:00Z", closes_at: "2099-09-15T23:00:00Z", terminal_at: result.finalized_at, terminal_reason: result.finalized_at ? "scheduled_end" : null }];
    if (endpoint === "admin_venue_night_participant_counts") data = [{ venue_night_id: nightId, participant_count: 1 }];
    if (endpoint === "admin_venue_night_gender_counts") data = [{ venue_night_id: nightId, women_count: 1, men_count: 0, nonbinary_count: 0 }];
    if (endpoint && scenario.responses && Object.hasOwn(scenario.responses, endpoint)) data = scenario.responses[endpoint];
    if (endpoint === "admin_venue_night_report") {
      const requestedId: unknown = route.request().postDataJSON().p_venue_night_id;
      if (typeof requestedId !== "string") throw new Error("Missing report night ID");
      expect(route.request().postDataJSON()).toEqual({ p_venue_night_id: requestedId });
      scenario.reportRequests?.push(requestedId);
      const requestedReport = scenario.reports ? scenario.reports[requestedId] : result;
      expect(requestedReport?.venue_night_id).toBe(requestedId);
      await wait;
      if (fail) return route.fulfill({status: 500, contentType: "application/json", body: JSON.stringify({message: "Synthetic report failure"})});
      data = [requestedReport];
    }
    await route.fulfill({ contentType: "application/json", body: JSON.stringify(data) });
  });
  await page.routeWebSocket(/\/realtime\/v1\/websocket/, socket => socket.close());
  await page.goto("/admin");
  await page.getByRole("button", { name: /Stats/ }).click();
}

test("night report uses all participants, shows small samples and handles loading", async ({ page }) => {
  let release!: () => void;
  const waiting = new Promise<void>(resolve => { release = resolve; });
  await mockAdmin(page, report, waiting);
  await expect(page.getByRole("status")).toHaveText("Loading night report…");
  release();
  const panel = page.getByRole("region", { name: "Night report", exact: true });
  await expect(page.getByText("100% of the room", { exact: true })).toBeVisible();
  await expect(panel.getByText("80% (4/5) of participants sent at least one")).toBeVisible();
  await expect(panel.getByText("75% (3/4) of initially incomplete scanners")).toBeVisible();
  await expect(panel.getByText("3.0 min")).toBeVisible();
  await expect(panel.getByRole("heading", { name: "Gender mix across the night" }).locator("..").getByText("60% (3/5)", { exact: true })).toBeVisible();
  await expect(panel.getByRole("heading", { name: "Women · likes" })).toBeVisible();
  await expect(panel.getByRole("list", { name: "Attendance by half hour" }).getByRole("listitem")).toHaveCount(2);
  await page.setViewportSize({ width: 320, height: 740 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: test.info().outputPath("night-report-mobile.png"), fullPage: true });
});

test("pausing the current night keeps its metrics selected ahead of a future schedule", async ({ page }) => {
  const futureId = "00000000-0000-4000-8000-000000000003";
  const current = { id: nightId, venue_id: venueId, status: "live", waiting_opens_at: "2026-09-15T18:00:00Z", opened_at: "2026-09-15T18:00:00Z", closes_at: "2099-09-15T23:00:00Z", terminal_at: null, terminal_reason: null };
  const future = { ...current, id: futureId, status: "closed", waiting_opens_at: "2099-09-16T18:00:00Z", opened_at: null, closes_at: "2099-09-16T23:00:00Z" };
  const reportRequests: string[] = [];
  const scenario: StatsScenario = {
    responses: {
      venue_nights: [future, current],
      admin_venue_night_participant_counts: [{ venue_night_id: nightId, participant_count: 5 }, { venue_night_id: futureId, participant_count: 42 }],
      admin_venue_night_gender_counts: [{ venue_night_id: nightId, women_count: 3, men_count: 2, nonbinary_count: 0 }, { venue_night_id: futureId, women_count: 0, men_count: 42, nonbinary_count: 0 }],
      admin_venue_activity: [{ venue_night_id: nightId, active_participants: 5, arrivals_15m: 2, trend_score: 9 }, { venue_night_id: futureId, active_participants: 0, arrivals_15m: 0, trend_score: 0 }],
    },
    reports: { [nightId]: report, [futureId]: { ...report, venue_night_id: futureId, likes: 99, matches: 88, conversations: 77 } },
    reportRequests,
  };
  await mockAdmin(page, report, Promise.resolve(), false, scenario);
  const room = page.locator(".admin-stats-room");
  const panel = page.getByRole("region", { name: "Night report", exact: true });
  await expect(page.getByText("Live", { exact: true })).toBeVisible();
  await expect(room.getByText("5", { exact: true })).toBeVisible();
  await expect(panel.getByRole("article").filter({ has: page.getByRole("heading", { name: "Likes sent", exact: true }) }).getByText("7", { exact: true })).toBeVisible();

  current.status = "closed";
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(page.getByText("Paused", { exact: true })).toBeVisible();
  await expect(room.getByText("5", { exact: true })).toBeVisible();
  await expect(room.getByText("60% of the room", { exact: true })).toBeVisible();
  await expect(room.getByText("40% of the room", { exact: true })).toBeVisible();
  await expect(room.getByText("42", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Le Salon" })).toContainText("🔥");
  await expect(panel.getByRole("article").filter({ has: page.getByRole("heading", { name: "Mutual matches", exact: true }) }).getByText("3", { exact: true })).toBeVisible();
  await expect(panel.getByRole("article").filter({ has: page.getByRole("heading", { name: "Matches with a first message", exact: true }) }).getByText("2", { exact: true })).toBeVisible();

  // A fresh visit must choose the paused night too, without relying on prior selection.
  await page.reload();
  await page.getByRole("button", { name: /Stats/ }).click();
  await expect(page.getByText("Paused", { exact: true })).toBeVisible();
  await expect(room.getByText("5", { exact: true })).toBeVisible();
  await expect(panel.getByText("80% (4/5) of participants sent at least one")).toBeVisible();
  expect(reportRequests.length).toBeGreaterThanOrEqual(2);
  expect(reportRequests.every(id => id === nightId)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: test.info().outputPath("paused-night-stats.png"), fullPage: true });
});

test("arrival notification disappears when the selected venue night changes", async ({ page }) => {
  const nextId = "00000000-0000-4000-8000-000000000003";
  const counts = [{ venue_night_id: nightId, participant_count: 1 }, { venue_night_id: nextId, participant_count: 9 }];
  const current = { id: nightId, venue_id: venueId, status: "live", waiting_opens_at: "2026-09-15T18:00:00Z", opened_at: "2026-09-15T18:00:00Z", closes_at: "2099-09-15T23:00:00Z", terminal_at: null as string | null, terminal_reason: null as string | null };
  const next = { ...current, id: nextId, status: "closed", waiting_opens_at: "2099-09-16T18:00:00Z", opened_at: null, closes_at: "2099-09-16T23:00:00Z" };
  let release!: () => void;
  const delayedReport = new Promise<void>(resolve => { release = resolve; });
  await mockAdmin(page, report, delayedReport, false, {
    responses: { venue_nights: [next, current], admin_venue_night_participant_counts: counts },
    reports: { [nightId]: report, [nextId]: { ...report, venue_night_id: nextId, likes: 99 } },
  });
  const room = page.locator(".admin-stats-room");
  await expect(room.locator(".text-8xl")).toHaveText("1");
  counts[0].participant_count = 3;
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(room.getByRole("status")).toHaveText("🎉+2");

  current.status = "closed";
  current.terminal_at = "2026-09-15T23:00:00Z";
  current.terminal_reason = "scheduled_end";
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(room.getByText("9", { exact: true })).toBeVisible();
  await expect(room.getByRole("status")).toHaveCount(0);
  release();
  const panel = page.getByRole("region", { name: "Night report", exact: true });
  await expect(panel.getByRole("article").filter({ has: page.getByRole("heading", { name: "Likes sent", exact: true }) }).getByText("99", { exact: true })).toBeVisible();
});

test("arrival notification expires after an unchanged refresh", async ({ page }) => {
  const counts = [{ venue_night_id: nightId, participant_count: 1 }];
  await mockAdmin(page, report, Promise.resolve(), false, {
    responses: { admin_venue_night_participant_counts: counts },
  });
  const room = page.locator(".admin-stats-room");
  await expect(room.locator(".text-8xl")).toHaveText("1");
  counts[0].participant_count = 3;
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(room.getByRole("status")).toHaveText("🎉+2");
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(room.getByRole("status")).toHaveCount(0);
});

test("final partial report preserves known counts and labels missing measurements", async ({ page }) => {
  await mockAdmin(page, { ...report, finalized_at: "2026-09-15T23:00:00Z", partial: true,
    likes: null, like_senders: null, likes_distribution: null, matched_participants: null,
    matches_distribution: null, preexisting_profiles: null, incomplete_scanners: null,
    completed_profiles: null, dropoffs: null, arrival_distribution: null, arrival_observations: null,
    first_match_sample: null, first_match_median_seconds: null, likes_by_gender: null,
  });
  await expect(page.getByRole("heading", { name: "Night report · Final" })).toBeVisible();
  await expect(page.getByText(/Partial history: available counts/)).toBeVisible();
  await expect(page.getByRole("article").filter({has: page.getByRole("heading", {name: "Mutual matches", exact: true})})).toContainText("3");
  await expect(page.getByText("Likes by gender: not available.")).toBeVisible();
});

test("empty night has zero counts and no denominator percentage", async ({ page }) => {
  await mockAdmin(page, { ...report, scanners: 0, preexisting_profiles: 0, incomplete_scanners: 0, completed_profiles: 0, dropoffs: 0, scan_entrants: 0,
    participants: 0, likes: 0, like_senders: 0, likes_distribution: [0,0,0,0], matches: 0,
    matched_participants: 0, matches_distribution: [0,0,0,0], conversations: 0, replies: 0,
    arrival_distribution: [0,0,0], arrival_observations: 0, first_match_sample: 0,
    first_match_median_seconds: null, peak: 0, attendance: [], likes_by_gender: ["woman","man","nonbinary"].map(gender => ({ gender, participants: 0, sent: 0, received: 0, senders: 0, receivers: 0 })),
  });
  await expect(page.getByText("— of participants sent at least one")).toBeVisible();
  await expect(page.getByText("No attendance interval yet.")).toBeVisible();
});

test("report failure is shown instead of zero-filled statistics", async ({ page }) => {
  await mockAdmin(page, report, Promise.resolve(), true);
  await expect(page.getByRole("alert").filter({ hasText: "Could not load the night report" })).toHaveText("Could not load the night report. Retrying automatically.");
  await expect(page.getByRole("heading", {name: "Likes sent", exact: true})).toHaveCount(0);
});
