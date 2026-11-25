import { test, expect, type Page } from "@playwright/test";
import { openDoor, door, scan, ids, secret, otherSecret } from "../helpers/door-scan";

// #520: the instant a code is read, the door shows that it was read, a verdict
// (colour, icon, one short line) and the next action. A scan alone never confirms
// an arrival: confirming requests the deposit refund, so it stays a deliberate tap.
// Camera scans run on Chromium only: Playwright's Linux WebKit cannot play the
// simulated camera (#349). The manual-lookup verdicts below also run on WebKit.
const cameraScan = () => test.skip(test.info().project.name.startsWith("webkit"), "Simulated camera cannot play in Playwright's WebKit");
test.use({ viewport: { width: 390, height: 844 } });

const verdict = (page: Page) => door(page).locator("[data-verdict]");
const confirmButton = (page: Page) => door(page).getByRole("button", { name: "Confirm arrival", exact: true });
const vibrations = (page: Page) => page.evaluate(() => (window as unknown as { __vibrations: unknown[] }).__vibrations);
async function expectVerdict(page: Page, tone: string, title: string) {
  await expect(verdict(page)).toHaveAttribute("data-verdict", tone);
  await expect(verdict(page)).toContainText(title);
  await expect(verdict(page)).toBeInViewport();
}

test("a valid code shows a green verdict and waits for a deliberate Confirm arrival", async ({ page }) => {
  cameraScan();
  const state = await openDoor(page);
  // A slow answer shows the read itself before the verdict.
  await page.route("**/rest/v1/rpc/admin_inspect_launch_arrival", async route => { await new Promise(resolve => setTimeout(resolve, 800)); await route.fallback(); });
  await scan(page);
  await expect(door(page).locator("[data-capture]")).toBeVisible();
  await expect(door(page).getByText("Code read", { exact: true })).toBeVisible();
  await expect(door(page).getByRole("status")).toHaveText("Checking reservation…");
  await expectVerdict(page, "go", "Valid reservation");
  await expect(door(page).getByRole("heading", { name: "Alexandra", exact: true })).toBeVisible();
  await expect(confirmButton(page)).toBeInViewport();
  // Money rule: nothing is confirmed, however long the verdict stays on screen.
  await page.waitForTimeout(2000);
  expect(state.commands).toHaveLength(0);
  expect(state.row.arrival).toBeNull();
  await confirmButton(page).click();
  await expectVerdict(page, "done", "Arrived");
  expect(state.commands).toEqual([{ endpoint: "admin_confirm_launch_arrival", payload: expect.objectContaining({ p_id: ids.reservation, p_method: "qr", p_secret: secret }) }]);
  await expect(door(page).getByRole("button", { name: "Next guest", exact: true })).toBeVisible();
  // Haptics on Chromium: one short pulse for the valid code, then the arrival.
  expect(await vibrations(page)).toEqual([60, [40, 60, 40]]);
});

test("a code already used tonight says Already arrived and offers no confirmation", async ({ page }) => {
  cameraScan();
  const state = await openDoor(page, { row: { arrival: "verified", verified_at: "2026-10-21T19:14:00Z", verified_by: ids.founder, method: "qr", revision: 1, refund_state: "queued" } });
  await scan(page);
  await expectVerdict(page, "wait", "Already arrived");
  await expect(verdict(page)).toContainText("Checked in Wed, 21 Oct 2026, 21:14");
  await expect(confirmButton(page)).toHaveCount(0);
  expect(state.commands).toHaveLength(0);
  expect(await vibrations(page)).toEqual([[120, 80, 120]]);
});

for (const [name, options, tone, title, reason] of [
  ["a booking for another night", { code: otherSecret, otherNight: "not_started" }, "wait", "Wrong night", "Booked for another night"],
  ["a cancelled booking for another night", { code: otherSecret, otherNight: "cancelled" }, "stop", "Cancelled", "Cancelled booking, and it was for another night"],
  ["an unknown code", { code: otherSecret }, "stop", "Unknown code", "No reservation for this night matches"],
  ["a QR that is not a reservation", { code: "https://getamourette.com/v/le-salon" }, "stop", "Not a reservation QR", "This is not a personal reservation QR"],
  ["a code that could not be checked", { offline: true }, "unchecked", "Not checked", "Connection problem"],
] as const) test(`${name} shows the ${title} verdict, its reason and the way back to scanning`, async ({ page }) => {
  cameraScan();
  const state = await openDoor(page, options);
  await scan(page);
  await expectVerdict(page, tone, title);
  await expect(door(page).getByRole("alert")).toContainText(reason);
  if (tone !== "stop" || title !== "Not a reservation QR") await expect(door(page).getByRole("alert")).toContainText("No arrival was confirmed");
  await expect(door(page).getByRole("heading", { name: "Alexandra", exact: true })).toHaveCount(0);
  await expect(confirmButton(page)).toHaveCount(0);
  await expect(door(page).getByRole("button", { name: "Scan personal QR" })).toBeInViewport();
  expect(state.commands).toHaveLength(0);
});

test("a cancelled booking for tonight shows a red verdict without confirmation", async ({ page }) => {
  cameraScan();
  const state = await openDoor(page, { row: { state: "cancelled", availability: "cancelled", can_correct: false, refund_state: "succeeded" } });
  await scan(page);
  await expectVerdict(page, "stop", "Cancelled");
  await expect(door(page)).toContainText("This reservation was cancelled. Its QR cannot confirm arrival.");
  await expect(confirmButton(page)).toHaveCount(0);
  await expect(door(page).getByRole("button", { name: "Next guest", exact: true })).toBeInViewport();
  expect(state.commands).toHaveLength(0);
});

test("reduced motion keeps the verdict and drops its animation", async ({ page }) => {
  cameraScan();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openDoor(page);
  await scan(page);
  await expectVerdict(page, "go", "Valid reservation");
  expect(await verdict(page).evaluate(element => getComputedStyle(element).animationName)).toBe("none");
  await page.emulateMedia({ reducedMotion: "no-preference" });
  expect(await verdict(page).evaluate(element => getComputedStyle(element).animationName)).not.toBe("none");
});

// Runs on WebKit too: the same verdicts on a manual lookup, where Safari has no vibration.
for (const [name, row, tone, title, confirmable] of [
  ["a valid booking", {}, "go", "Valid reservation", true],
  ["a cancelled booking", { state: "cancelled", availability: "cancelled", can_correct: false }, "stop", "Cancelled", false],
] as const) test(`manual lookup of ${name} shows the ${title} verdict`, async ({ page }) => {
  const state = await openDoor(page, { row });
  await page.getByRole("main").getByRole("button", { name: "Find a guest without QR", exact: true }).click();
  await door(page).getByLabel("Name, email or reservation reference").fill("Alexandra");
  await door(page).getByRole("button", { name: "Find guest", exact: true }).click();
  await door(page).getByRole("button", { name: /Alexandra alexandra@example.com/ }).click();
  await expectVerdict(page, tone, title);
  await expect(confirmButton(page)).toHaveCount(confirmable ? 1 : 0);
  expect(state.commands).toHaveLength(0);
  expect(await vibrations(page)).toEqual([]);
});

// #534: the read moment. The frame freezes with the code marked for a short hold,
// and the lookup already runs during it: the hold never adds to a slow answer.
async function markTimes(page: Page) {
  await page.addInitScript(() => {
    const marks: Record<string, number> = {};
    (window as unknown as { __marks: Record<string, number> }).__marks = marks;
    new MutationObserver(() => {
      const at = performance.now();
      if (document.querySelector("[data-capture]")) marks.capture ??= at;
      else if (marks.capture !== undefined) marks.captureEnd ??= at;
      if (document.querySelector('[data-verdict="reading"]')) marks.reading ??= at;
      if (document.querySelector('[data-verdict]:not([data-verdict="reading"])')) marks.verdict ??= at;
    }).observe(document, { subtree: true, childList: true });
  });
}
const marks = (page: Page) => page.evaluate(() => (window as unknown as { __marks: Record<string, number> }).__marks);
const slowLookup = (page: Page, ms: number) => page.route("**/rest/v1/rpc/admin_inspect_launch_arrival", async route => {
  await new Promise(resolve => setTimeout(resolve, ms)); await route.fallback();
});

test("a read freezes the frame with the code marked, then shows the verdict (#534)", async ({ page }) => {
  cameraScan();
  await markTimes(page);
  const state = await openDoor(page);
  await scan(page);
  await expect(door(page).locator("[data-capture] img")).toBeVisible();
  const frame = await door(page).locator("[data-capture] span").boundingBox();
  const picture = await door(page).locator("[data-capture]").boundingBox();
  // The simulated camera draws the QR in the middle half of a 640×480 frame.
  expect(frame!.width / picture!.width).toBeGreaterThan(0.35);
  expect(frame!.width / picture!.width).toBeLessThan(0.6);
  await expect(verdict(page)).toHaveCount(0);
  await expectVerdict(page, "go", "Valid reservation");
  await expect(door(page).locator("[data-capture]")).toHaveCount(0);
  const { capture, verdict: shown } = await marks(page);
  // A fast answer waits for the hold (350 ms from the read; the frame itself paints a little after it), and no longer.
  expect(shown - capture).toBeGreaterThan(200);
  expect(shown - capture).toBeLessThan(900);
  expect(state.commands).toHaveLength(0);
});

test("the lookup runs during the hold, so a slow answer is not delayed further (#534)", async ({ page }) => {
  cameraScan();
  await markTimes(page);
  await openDoor(page);
  await slowLookup(page, 1500);
  await scan(page);
  await expectVerdict(page, "go", "Valid reservation");
  const { capture, captureEnd, reading, verdict: shown } = await marks(page);
  // The frozen frame stays until the answer, about 1500 ms after the read, with no extra panel.
  expect(reading).toBeUndefined();
  expect(captureEnd - capture).toBeGreaterThan(1300);
  expect(shown - capture).toBeGreaterThan(1300);
  // In series it would be the hold plus the answer: measured 1762 ms with the lookup started after the hold.
  expect(shown - capture).toBeLessThan(1600);
});

test("reduced motion keeps the frozen frame and drops its flash and closing frame (#534)", async ({ page }) => {
  cameraScan();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openDoor(page);
  await slowLookup(page, 600);
  await scan(page);
  await expect(door(page).locator("[data-capture] span")).toBeVisible();
  expect(await door(page).locator("[data-capture] span").evaluate(element => getComputedStyle(element).animationName)).toBe("none");
  expect(await door(page).locator("[data-capture]").evaluate(element => getComputedStyle(element, "::after").animationName)).toBe("none");
  await expectVerdict(page, "go", "Valid reservation");
});
