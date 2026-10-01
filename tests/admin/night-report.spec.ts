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

async function mockAdmin(page: Page, result: NightReport, wait: Promise<void> = Promise.resolve(), fail = false) {
  // Every backend request is intercepted; this suite never touches shared fixtures.
  await page.route("**/rest/v1/**", async route => {
    const endpoint = new URL(route.request().url()).pathname.split("/").at(-1);
    let data: unknown = [];
    if (endpoint === "am_i_admin") data = true;
    if (endpoint === "venues") data = [{ id: venueId, name: "Le Salon", city: "Paris", timezone: "Europe/Paris", is_test_venue: true }];
    if (endpoint === "venue_nights") data = [{ id: nightId, venue_id: venueId, status: result.finalized_at ? "closed" : "live", waiting_opens_at: "2026-09-15T18:00:00Z", opened_at: "2026-09-15T18:00:00Z", closes_at: "2099-09-15T23:00:00Z", terminal_at: result.finalized_at, terminal_reason: result.finalized_at ? "scheduled_end" : null }];
    if (endpoint === "admin_venue_night_participant_counts") data = [{ venue_night_id: nightId, participant_count: 1 }];
    if (endpoint === "admin_venue_night_gender_counts") data = [{ venue_night_id: nightId, women_count: 1, men_count: 0, nonbinary_count: 0 }];
    if (endpoint === "admin_venue_night_report") {
      expect(route.request().postDataJSON()).toEqual({ p_venue_night_id: nightId });
      await wait;
      if (fail) return route.fulfill({status: 500, contentType: "application/json", body: JSON.stringify({message: "Synthetic report failure"})});
      data = [result];
    }
    await route.fulfill({ contentType: "application/json", body: JSON.stringify(data) });
  });
  await page.routeWebSocket(/.*/, socket => socket.close());
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
