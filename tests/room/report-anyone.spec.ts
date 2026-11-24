import type { Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../../lib/database.types";
import { test, expect, type TestData, type TestIdentity } from "../helpers/fixtures";
import { t } from "../../lib/strings";

// #482: a guest can always report someone from tonight, whatever the feed shows,
// and a repeated report is a confirmation, never a generic error.
const s = t.en.room;

async function enter(page: Page, slug: string, expected: string) {
  await page.addInitScript(() => localStorage.setItem("amourette-room-hint-dismissed", "1"));
  await page.goto(`/v/${slug}`);
  await expect(page.getByTestId("profile-feed").getByText(expected, { exact: true })).toBeVisible({ timeout: 30_000 });
}

const menuButton = (page: Page) => page.getByRole("button", { name: "Night options", exact: true });
const menu = (page: Page) => page.locator("#room-overflow-menu");
// Found by its title element, not its name: a background refresh blanks the
// name of someone no longer in the feed (rejected-text rule), the target stays.
const reportDialog = (page: Page) => page.getByRole("dialog").filter({ has: page.locator("#report-title") });

// A participant's own client: blocks are written and read under the owner policies.
const as = (data: TestData, who: TestIdentity) => createClient<Database>(data.env.url, data.env.publishableKey, {
  auth: { persistSession: false, autoRefreshToken: false },
  global: { headers: { Authorization: `Bearer ${who.session.access_token}` } },
});

async function reports(data: TestData, reporter: TestIdentity, reported: TestIdentity) {
  const { data: rows, error } = await data.service.from("reports").select("reason,note")
    .eq("reporter_id", reporter.id).eq("reported_id", reported.id);
  expect(error).toBeNull();
  return rows ?? [];
}

test("after being blocked, a guest can still report the person who blocked her", async ({ data, contextFor }) => {
  const venue = await data.venue();
  const alice = await data.identity("Alice", "woman");
  const bob = await data.identity("Bob", "man");
  await data.checkIn(venue, [alice, bob]);
  const page = await (await contextFor(alice)).newPage();
  await enter(page, venue.slug, "Bob");

  // Bob blocks Alice first: he leaves her feed and nothing on screen names him.
  const blocked = await as(data, bob).from("blocks").insert({ blocker_id: bob.id, blocked_id: alice.id, venue_id: venue.id, reason: "other" });
  expect(blocked.error).toBeNull();
  await page.reload();
  await expect(page.getByTestId("profile-feed")).toHaveCount(0);
  await expect(page.getByText("Bob", { exact: true })).toHaveCount(0);

  await menuButton(page).click();
  await menu(page).getByRole("button", { name: s.reportSomeone, exact: true }).click();
  const picker = page.getByRole("dialog", { name: s.reportSomeoneTitle });
  await picker.getByRole("button", { name: s.reportSomeoneChoose("Bob"), exact: true }).click();
  await expect(picker).toHaveCount(0);

  const dialog = reportDialog(page);
  await dialog.getByRole("textbox").fill("He kept following me after I said no.");
  await dialog.getByRole("button", { name: s.reportSubmit, exact: true }).click();
  await expect(dialog.getByText(s.reportSuccess, { exact: true })).toBeVisible();
  expect(await reports(data, alice, bob)).toEqual([{ reason: "harassment", note: "He kept following me after I said no." }]);
});

test("a hidden guest can report from her hidden screen, and a second report says it is already with the founders", async ({ data, contextFor }) => {
  const venue = await data.venue();
  const alice = await data.identity("Alice", "woman");
  const bob = await data.identity("Bob", "man");
  await data.checkIn(venue, [alice, bob]);
  const page = await (await contextFor(alice)).newPage();
  await enter(page, venue.slug, "Bob");

  // First report from Bob's card, with a slow answer: a double tap sends one request.
  let requests = 0;
  await page.route("**/rest/v1/rpc/submit_report", async route => {
    requests++;
    await new Promise(resolve => setTimeout(resolve, 400));
    await route.continue();
  });
  await menuButton(page).click();
  await menu(page).getByRole("button", { name: s.report, exact: true }).click();
  const first = page.getByRole("dialog", { name: s.reportTitle("Bob") });
  const send = first.getByRole("button", { name: s.reportSubmit, exact: true });
  await send.evaluate((button: HTMLButtonElement) => { button.click(); button.click(); });
  await expect(first.getByRole("button", { name: s.reportSending, exact: true })).toBeDisabled();
  await expect(first.getByText(s.reportSuccess, { exact: true })).toBeVisible();
  expect(requests).toBe(1);
  await first.getByRole("button", { name: s.reportClose, exact: true }).click();

  // She hides her profile to feel safe: the entry is still there.
  await menuButton(page).click();
  await menu(page).getByRole("button", { name: s.goInvisible, exact: true }).click();
  await expect(page.getByRole("heading", { name: s.invisibleTitle })).toBeVisible();
  await page.getByRole("button", { name: s.reportSomeone, exact: true }).click();
  await page.getByRole("dialog", { name: s.reportSomeoneTitle })
    .getByRole("button", { name: s.reportSomeoneChoose("Bob"), exact: true }).click();
  const second = reportDialog(page);
  await second.getByRole("textbox").fill("It got worse, he is waiting by the door.");
  await second.getByRole("button", { name: s.reportSubmit, exact: true }).click();
  await expect(second.getByText(s.reportAlready, { exact: true })).toBeVisible();
  await expect(second.getByText(s.reportError, { exact: true })).toHaveCount(0);
  expect(requests).toBe(2);
  expect(await reports(data, alice, bob)).toHaveLength(1);
});

test("the block dialog can report at the same time", async ({ data, contextFor }) => {
  const venue = await data.venue();
  const alice = await data.identity("Alice", "woman");
  const bob = await data.identity("Bob", "man");
  await data.checkIn(venue, [alice, bob]);
  const page = await (await contextFor(alice)).newPage();
  await enter(page, venue.slug, "Bob");

  await menuButton(page).click();
  await menu(page).getByRole("button", { name: s.block, exact: true }).click();
  const dialog = page.getByRole("dialog", { name: s.blockTitle("Bob") });
  await dialog.getByRole("checkbox", { name: s.blockAlsoReport }).check();
  await dialog.getByRole("button", { name: s.blockSubmit, exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(await reports(data, alice, bob)).toEqual([{ reason: "unsafe_behavior", note: null }]);
  const { data: blocks, error } = await as(data, alice).from("blocks").select("blocker_id").eq("blocker_id", alice.id).eq("blocked_id", bob.id);
  expect(error).toBeNull();
  expect(blocks).toHaveLength(1);

  // Blocked from her side too, he stays reportable from tonight's list.
  await menuButton(page).click();
  await menu(page).getByRole("button", { name: s.reportSomeone, exact: true }).click();
  await expect(page.getByRole("dialog", { name: s.reportSomeoneTitle })
    .getByRole("button", { name: s.reportSomeoneChoose("Bob"), exact: true })).toBeVisible();
});
