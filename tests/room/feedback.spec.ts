import type { Page } from "@playwright/test";
import { test, expect } from "../helpers/fixtures";

async function openRoomMenu(page: Page) {
  const menu = page.getByRole("button", { name: "Night options" });
  await expect(menu).toBeVisible();
  await menu.click();
  return page.locator("#room-overflow-menu");
}

test("venue feedback submits once and returns to the leave confirmation", async ({ data, contextFor }) => {
  const venue = await data.venue();
  const alice = await data.identity("Alice", "woman");
  const bob = await data.identity("Bob", "man");
  await data.checkIn(venue, [alice, bob]);

  const alicePage = await (await contextFor(alice)).newPage();
  await alicePage.addInitScript(() => localStorage.setItem("amourette-room-hint-dismissed", "1"));
  await alicePage.goto(`/v/${venue.slug}`);
  const aliceMenu = await openRoomMenu(alicePage);
  await aliceMenu.getByRole("button", { name: "Give feedback", exact: true }).click();

  const dialog = alicePage.getByRole("dialog", { name: "How was tonight?" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText(
    "Your feedback is private: only the Amourette founders can read it. Your profile helps us understand the context.",
  )).toBeVisible();
  const textarea = dialog.getByPlaceholder("Your feedback", { exact: true });
  await textarea.fill("😀".repeat(501));
  await dialog.getByRole("button", { name: "Send feedback", exact: true }).click();
  await expect(dialog.getByRole("alert")).toHaveText("Write up to 500 characters before sending.");
  const refused = await data.service.from("venue_feedback").select("id", { count: "exact", head: true })
    .eq("profile_id", alice.id).eq("venue_night_id", venue.nightId);
  expect(refused.error).toBeNull();
  expect(refused.count).toBe(0);

  await textarea.fill("The room felt welcoming.");
  await alicePage.route("**/rest/v1/rpc/submit_venue_feedback", async route => {
    await new Promise(resolve => setTimeout(resolve, 250));
    await route.continue();
  }, { times: 1 });
  await dialog.getByRole("button", { name: "Send feedback", exact: true }).click();
  await expect(dialog.getByRole("button", { name: "Sending…", exact: true })).toBeDisabled();
  await expect(dialog.getByText("Thanks for helping us improve Amourette.", { exact: true })).toBeVisible();
  const stored = await data.service.from("venue_feedback")
    .select("body").eq("profile_id", alice.id).eq("venue_night_id", venue.nightId).single();
  expect(stored.error).toBeNull();
  expect(stored.data?.body).toBe("The room felt welcoming.");
  await dialog.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(dialog).toHaveCount(0);

  const statusRequest = alicePage.waitForResponse(response =>
    response.url().includes("/rest/v1/rpc/has_submitted_venue_feedback") && response.request().method() === "POST",
  );
  await alicePage.reload();
  await statusRequest;
  const refreshedMenu = await openRoomMenu(alicePage);
  await expect(refreshedMenu.getByRole("button", { name: "Give feedback", exact: true })).toHaveCount(0);

  const bobPage = await (await contextFor(bob)).newPage();
  await bobPage.addInitScript(() => localStorage.setItem("amourette-room-hint-dismissed", "1"));
  await bobPage.goto(`/v/${venue.slug}`);
  const bobMenu = await openRoomMenu(bobPage);
  await bobMenu.getByRole("button", { name: "Leave", exact: true }).click();
  const leaveDialog = bobPage.getByRole("dialog", { name: "Leave?", exact: true });
  await leaveDialog.getByRole("button", { name: "Give feedback before leaving", exact: true }).click();
  const leaveFeedback = bobPage.getByRole("dialog", { name: "How was tonight?" });
  await leaveFeedback.getByPlaceholder("Your feedback", { exact: true }).fill("More quiet areas would help.");
  await leaveFeedback.getByRole("button", { name: "Send feedback", exact: true }).click();
  await expect(leaveFeedback.getByText("Thanks for helping us improve Amourette.", { exact: true })).toBeVisible();
  await leaveFeedback.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(leaveDialog).toBeVisible();
});

test("a failed feedback-status check never exposes the feedback actions", async ({ data, contextFor }) => {
  const venue = await data.venue();
  const alice = await data.identity("Alice", "woman");
  const bob = await data.identity("Bob", "man");
  await data.checkIn(venue, [alice, bob]);
  const page = await (await contextFor(alice)).newPage();
  await page.addInitScript(() => localStorage.setItem("amourette-room-hint-dismissed", "1"));
  let attempts = 0;
  await page.route("**/rest/v1/rpc/has_submitted_venue_feedback", async route => {
    attempts += 1;
    await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ message: "unavailable" }) });
  });
  await page.goto(`/v/${venue.slug}`);
  await expect.poll(() => attempts).toBe(3);
  const menu = await openRoomMenu(page);
  await expect(menu.getByRole("button", { name: "Give feedback", exact: true })).toHaveCount(0);
  await menu.getByRole("button", { name: "Leave", exact: true }).click();
  const leaveDialog = page.getByRole("dialog", { name: "Leave?", exact: true });
  await expect(leaveDialog.getByRole("button", { name: "Give feedback before leaving", exact: true })).toHaveCount(0);
});
