import { createClient } from "@supabase/supabase-js";
import { mkdir } from "node:fs/promises";
import type { Locator, Page } from "@playwright/test";
import { test, expect, type TestData, type TestIdentity } from "../helpers/fixtures";
import { captureFolder } from "../helpers/text-overflow";
import type { Database } from "../../lib/database.types";

// #234: a removal from the door and the moderation queue's decisions all land in
// one append-only history that founders read in the moderation view, and that
// participants cannot read.
const as = (data: TestData, who: TestIdentity) => createClient<Database>(data.env.url, data.env.publishableKey, {
  accessToken: async () => who.session.access_token,
  auth: { persistSession: false, autoRefreshToken: false },
});

async function capture(page: Page, target: Locator, name: string) {
  await target.evaluate(element => element.scrollIntoView({ block: "center" }));
  await mkdir(captureFolder, { recursive: true });
  await page.screenshot({ path: `${captureFolder}/${name}-${test.info().project.name}.png` });
}

test("door and queue actions build one founder-only history", async ({ data, contextFor }) => {
  test.setTimeout(180_000);
  const founder = await data.identity("HistoryFounder");
  await data.founder(founder);
  const venue = await data.venue();
  const alice = await data.identity("Alice", "woman");
  const bob = await data.identity("Bob", "man");
  await data.checkIn(venue, [alice, bob]);
  const page = await (await contextFor(founder)).newPage();

  // Door screen: removed without a report.
  await page.goto(`/admin/tonight?night=${venue.nightId}`);
  await page.getByLabel("Show test venues").check();
  const door = page.getByRole("region", { name: "Remove someone" });
  await door.getByRole("button", { name: "Show participants", exact: true }).click();
  await door.getByRole("button", { name: "Remove Bob for tonight", exact: true }).click({ timeout: 30_000 });
  const confirm = page.getByRole("dialog", { name: "Remove Bob for tonight?" });
  await confirm.getByLabel("Reason").selectOption("harassment");
  await confirm.getByRole("button", { name: "Remove for tonight", exact: true }).click();
  await expect(door.getByRole("status")).toContainText("Bob was removed for tonight.");

  // A guest's report reaches the queue afterwards.
  expect((await as(data, alice).rpc("submit_report", { p_reported_id: bob.id, p_venue_night_id: venue.nightId, p_reason: "unsafe_behavior" })).error).toBeNull();

  await page.goto("/admin");
  await page.getByRole("navigation", { name: "Admin", exact: true }).getByRole("link", { name: "Moderation", exact: true }).click();
  // Other journeys share the database: keep to this test's venue.
  const venueName = (await data.service.from("venues").select("name").eq("id", venue.id).single()).data?.name ?? "";
  const history = page.getByRole("region", { name: "Action history", exact: true });
  const ours = history.getByRole("listitem").filter({ hasText: venueName });
  await expect(ours).toHaveCount(1, { timeout: 30_000 });
  await expect(ours).toContainText("Removed for the night · harassment · Bob");
  await expect(ours).toContainText("by you");
  await expect(ours).toContainText("without a report");
  await capture(page, history, "moderation-history-page");

  // Queue: remove from the report, then give access back.
  await page.getByRole("button").filter({ hasText: "Unsafe behavior" }).first().click();
  const detail = page.getByRole("dialog", { name: "Report details" });
  const trail = detail.getByRole("region", { name: "Action history for this person" });
  await expect(trail.getByRole("listitem")).toHaveCount(1);
  await detail.getByRole("button", { name: "Block until end of night" }).click();
  await expect(trail.getByRole("listitem")).toHaveCount(2);
  await detail.getByRole("button", { name: "Restore access" }).click();
  await expect(trail.getByRole("listitem")).toHaveCount(3);
  await expect(trail.getByRole("listitem").nth(0)).toContainText("Access restored");
  await expect(trail.getByRole("listitem").nth(0)).toContainText("from a report");
  await expect(trail.getByRole("listitem").nth(1)).toContainText("Removed for the night · unsafe behavior");
  await expect(trail.getByRole("listitem").nth(2)).toContainText("Removed for the night · harassment");
  await capture(page, trail, "moderation-history-report");

  // An action taken elsewhere (another tab, the other founder) shows after Refresh.
  await detail.getByRole("button", { name: "Close" }).first().click();
  expect((await as(data, founder).rpc("eject_from_venue", { p_profile_id: alice.id, p_venue_id: venue.id, p_reason: "other" })).error).toBeNull();
  await page.getByRole("button", { name: "Refresh", exact: true }).click();
  await expect(ours).toHaveCount(4);
  await expect(ours.first()).toContainText("Removed for the night · other · Alice");

  // Participants read nothing, neither the removed guest nor the reporter.
  for (const who of [bob, alice]) {
    const read = await as(data, who).rpc("admin_moderation_history", {});
    expect(read.error?.message).toBe("not authorized");
    expect(read.data).toBeNull();
  }
  const { data: rows, error } = await as(data, founder).rpc("admin_moderation_history", { p_profile_id: bob.id, p_venue_night_id: venue.nightId });
  expect(error).toBeNull();
  expect(rows?.map(row => [row.action, row.reason, row.by_me])).toEqual([
    ["access_restored", null, true], ["removed_for_night", "unsafe_behavior", true], ["removed_for_night", "harassment", true],
  ]);
});

test("a failed history read says so, and Retry brings the history back", async ({ data, contextFor }) => {
  test.setTimeout(120_000);
  const founder = await data.identity("HistoryFounder");
  await data.founder(founder);
  const venue = await data.venue();
  const bob = await data.identity("Bob", "man");
  await data.checkIn(venue, [bob]);
  expect((await as(data, founder).rpc("eject_from_venue", { p_profile_id: bob.id, p_venue_id: venue.id, p_reason: "underage" })).error).toBeNull();
  const venueName = (await data.service.from("venues").select("name").eq("id", venue.id).single()).data?.name ?? "";

  const page = await (await contextFor(founder)).newPage();
  let failing = true;
  await page.route("**/rest/v1/rpc/admin_moderation_history*", route => failing
    ? route.fulfill({ status: 503, json: { message: "unavailable" } })
    : route.continue());
  await page.goto("/admin");
  await page.getByRole("navigation", { name: "Admin", exact: true }).getByRole("link", { name: "Moderation", exact: true }).click();
  const history = page.getByRole("region", { name: "Action history", exact: true });
  const alert = history.getByRole("alert");
  await expect(alert).toContainText("Could not load the action history.", { timeout: 30_000 });
  await expect(history.getByRole("listitem")).toHaveCount(0);
  await capture(page, alert, "moderation-history-error");

  // A live signal (another worker's report on CI) or the periodic recovery also
  // rereads the history; if one lands after the read is restored, the alert is
  // gone before Retry is clicked. Hold the queue read those paths depend on, so
  // only Retry rereads the history.
  await page.route("**/rest/v1/rpc/admin_moderation_queue*", route => route.fulfill({ status: 503, json: { message: "unavailable" } }));
  // A queue read already in flight can still succeed and reread the history.
  // Queue reads run one at a time, so once a read started after the hold has
  // failed, none is left that could reread the history before Retry.
  const refresh = page.getByRole("button", { name: "Refresh", exact: true });
  await refresh.click();
  await expect(page.getByText("Updates interrupted. Showing the last successful queue.")).toBeVisible({ timeout: 30_000 });
  await expect(refresh).toBeEnabled();
  await expect(alert).toContainText("Could not load the action history.");
  failing = false;
  await alert.getByRole("button", { name: "Retry" }).click();
  await expect(alert).toHaveCount(0);
  await expect(history.getByRole("listitem").filter({ hasText: venueName })).toContainText("Removed for the night · underage concern · Bob");
});
