import { test, expect, type Page } from "@playwright/test";

const venueId = "00000000-0000-4000-8000-000000000010";
const testVenueId = "00000000-0000-4000-8000-000000000020";
const newYorkId = "00000000-0000-4000-8000-000000000030";
const nightId = "00000000-0000-4000-8000-000000000011";
const now = "2026-10-01T12:00:00Z";
const path = "/admin/nights/new";
const schedulePayload = { p_venue_id: venueId, p_waiting_opens_at: "2026-10-23T18:00:00.000Z", p_guaranteed_launch_at: "2026-10-23T19:00:00.000Z", p_closes_at: "2026-10-24T00:00:00.000Z", p_launch_threshold: 4 };
const configurationPayload = { p_night: nightId, p_opens: "2026-10-22T08:00:00.000Z", p_capacity: 40, p_amount: 1250, p_currency: "eur", p_policy: "launch-v1" };

async function creation(page: Page, query = `?venue=${venueId}`) {
  await page.clock.setFixedTime(new Date(now));
  if (process.env.E2E_BASE_URL && process.env.E2E_VERCEL_BYPASS) {
    const origin = new URL(process.env.E2E_BASE_URL).origin;
    await page.route(url => url.origin === origin, route => route.continue({ headers: { ...route.request().headers(), "x-vercel-protection-bypass": process.env.E2E_VERCEL_BYPASS! } }));
  }
  const venues = [
    { id: testVenueId, name: "A Test Bar", slug: "test-bar", city: "Paris", timezone: "Europe/Paris", is_test_venue: true },
    { id: venueId, name: "Le Salon", slug: "le-salon", city: "Paris", timezone: "Europe/Paris", is_test_venue: false },
    { id: newYorkId, name: "New York Salon", slug: "new-york-salon", city: "New York", timezone: "America/New_York", is_test_venue: false },
  ];
  const state = {
    nights: [] as { id: string; venue_id: string; waiting_opens_at: string; guaranteed_launch_at: string; closes_at: string; launch_threshold: number; status: string; opened_at: null; terminal_at: null; terminal_reason: null }[],
    commands: [] as { endpoint: string; payload: Record<string, unknown> }[],
    reads: [] as { endpoint: string; venue: string | null; select: string | null }[],
    failSchedule: false, failReservations: false, failOverlap: false,
    holdSchedule: null as Promise<void> | null,
    holdOverlap: null as Promise<void> | null,
    event: null as null | { night_id: string; registration_opens_at: string; capacity: number; deposit_minor: number; currency: string; policy_version: string; cancelled_at: null; cancellation_reason: null },
  };
  await page.routeWebSocket(/.*/, socket => {
    const url = new URL(socket.url());
    if (url.host === new URL(page.url()).host && url.pathname.startsWith("/_next/")) socket.connectToServer(); else socket.close();
  });
  await page.route("**/auth/v1/**", route => route.abort());
  await page.route("**/rest/v1/**", async route => {
    const url = new URL(route.request().url());
    const endpoint = url.pathname.split("/").at(-1)!;
    const reply = (value: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(value) });
    if (endpoint === "am_i_admin") return reply(true);
    if (endpoint === "venues") return reply(url.searchParams.has("id") ? venues.filter(venue => `eq.${venue.id}` === url.searchParams.get("id")) : venues);
    if (endpoint === "venue_nights") {
      state.reads.push({ endpoint, venue: url.searchParams.get("venue_id"), select: url.searchParams.get("select") });
      if (url.searchParams.has("venue_id")) {
        // Capture before waiting so switching venues can race an old response.
        const nights = state.nights.filter(night => `eq.${night.venue_id}` === url.searchParams.get("venue_id"));
        const fail = state.failOverlap;
        await state.holdOverlap;
        return fail ? reply({ message: "Synthetic overlap read refusal" }, 500) : reply(nights);
      }
      return reply(url.searchParams.has("id") ? state.nights.filter(night => `eq.${night.id}` === url.searchParams.get("id")) : state.nights);
    }
    if (endpoint === "admin_launch_overview") return reply({ now, event: state.event, allocations: 0, finance: [] });
    if (endpoint === "admin_venue_night_participant_counts") return reply([]);
    if (endpoint === "admin_search_launch_reservations" || endpoint === "admin_launch_list") return reply([]);
    const payload = route.request().postDataJSON() as Record<string, unknown>;
    state.commands.push({ endpoint, payload });
    if (endpoint === "schedule_venue_night") {
      await state.holdSchedule;
      if (state.failSchedule) return reply({ message: "Synthetic schedule refusal" }, 400);
      const night = { id: nightId, venue_id: String(payload.p_venue_id), waiting_opens_at: String(payload.p_waiting_opens_at), guaranteed_launch_at: String(payload.p_guaranteed_launch_at), closes_at: String(payload.p_closes_at), launch_threshold: Number(payload.p_launch_threshold), status: "closed", opened_at: null, terminal_at: null, terminal_reason: null };
      state.nights.push(night);
      return reply(night);
    }
    if (endpoint === "admin_configure_launch_event") {
      if (state.failReservations) return reply({ message: "Synthetic reservation refusal" }, 400);
      state.event = { night_id: String(payload.p_night), registration_opens_at: String(payload.p_opens), capacity: Number(payload.p_capacity), deposit_minor: Number(payload.p_amount), currency: String(payload.p_currency), policy_version: String(payload.p_policy), cancelled_at: null, cancellation_reason: null };
      return reply(null);
    }
    throw new Error(`Unexpected backend request: ${endpoint}`);
  });
  await page.goto(`${path}${query}`);
  await expect(page.getByRole("heading", { name: "When and where?" })).toBeVisible();
  return state;
}
async function when(page: Page) {
  await page.getByLabel("Night date", { exact: true }).fill("2026-10-23");
  await expect(page.getByText("Loading this venue’s schedule…", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.getByRole("heading", { name: "How do people get in?" })).toBeVisible();
}
async function reservations(page: Page) {
  await page.getByRole("radio", { name: /Reservations with deposit/ }).check();
  await page.getByLabel("Reservation capacity", { exact: true }).fill("40");
  await page.getByLabel("Deposit amount", { exact: true }).fill("12.50");
  await page.getByLabel("Currency", { exact: true }).selectOption("eur");
  await page.getByLabel("Registration opens", { exact: true }).fill("2026-10-22T10:00");
}
async function review(page: Page, reserve = false) {
  await when(page);
  if (reserve) await reservations(page);
  else await page.getByRole("radio", { name: /Walk-in only/ }).check();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Check before scheduling" })).toBeVisible();
}
async function scheduled(page: Page) {
  await expect(page).toHaveURL(new RegExp(`/admin/nights/${nightId}\\?scheduled=1`));
  await expect(page.getByRole("tab", { name: "Overview", exact: true })).toHaveAttribute("aria-selected", "true");
}

test("walk-in creation uses the venue's zone and navigates to the new overview", async ({ page }) => {
  const state = await creation(page);
  await review(page);
  await expect(page.getByRole("complementary", { name: "The night at a glance" })).toHaveCount(0);
  await expect(page.getByRole("region", { name: "When review" })).toContainText("Fri 23 Oct");
  await expect(page.getByRole("region", { name: "When review" })).toContainText("closes 02:00 (next day)");
  await expect(page.getByRole("region", { name: "When review" })).toContainText("4 people checked in");
  await page.getByRole("button", { name: "Schedule night", exact: true }).click();
  await scheduled(page);
  await expect(page.getByRole("status")).toContainText("Night scheduled.");
  expect(state.commands).toEqual([{ endpoint: "schedule_venue_night", payload: schedulePayload }]);
  expect(state.reads.filter(read => read.venue)).toEqual([{ endpoint: "venue_nights", venue: `eq.${venueId}`, select: "id,venue_id,waiting_opens_at,closes_at" }]);
  await expect(page.getByRole("button", { name: "Set up reservations" })).toBeVisible();
  await page.getByRole("navigation", { name: "Night navigation" }).getByRole("link", { name: "Le Salon", exact: true }).click();
  await expect(page.getByRole("link", { name: /View night Fri.*23 Oct/ })).toBeVisible();
});

test("reservation creation submits both normalized payloads in order", async ({ page }) => {
  const state = await creation(page);
  await review(page, true);
  const summary = page.getByRole("region", { name: "Reservations review" });
  await expect(summary).toContainText("40 places · EUR 12.50 deposit");
  await expect(summary).toContainText("Registration Thu 22 Oct, 10:00 → Fri 23 Oct, 19:30");
  await expect(page.getByRole("region", { name: "Reservations review" })).toContainText("launch-v1");
  await page.getByRole("button", { name: "Schedule night", exact: true }).click();
  await scheduled(page);
  await expect(page.getByRole("tab", { name: "Reservations", exact: true })).toBeVisible();
  expect(state.commands).toEqual([{ endpoint: "schedule_venue_night", payload: schedulePayload }, { endpoint: "admin_configure_launch_event", payload: configurationPayload }]);
});

test("step validation refuses empty fields, launch order, overlap and threshold without effects", async ({ page }) => {
  const state = await creation(page);
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByText("Choose a night date.", { exact: true })).toBeVisible();
  await page.getByLabel("Night date", { exact: true }).fill("2026-10-23");
  await expect(page.locator("#date-error")).toHaveCount(0);
  for (const value of ["19:00", "20:00"]) {
    await page.getByLabel("Matching starts by", { exact: true }).fill(value);
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.locator("#launch-error")).toContainText("later than entry");
  }
  await page.getByLabel("Matching starts by", { exact: true }).fill("21:00");
  await expect(page.locator("#launch-error")).toHaveCount(0);
  await expect(page.getByLabel("Matching starts by", { exact: true })).toHaveAttribute("aria-invalid", "false");
  for (const value of ["0", "1.5", "2147483648"]) {
    await page.getByLabel("Start matching early at", { exact: true }).fill(value);
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.locator("#threshold-error")).toContainText("integer from 1 to 2147483647");
  }
  await page.getByLabel("Start matching early at", { exact: true }).fill("4");
  await expect(page.locator("#threshold-error")).toHaveCount(0);
  state.nights.push({ id: nightId, venue_id: testVenueId, waiting_opens_at: schedulePayload.p_waiting_opens_at, guaranteed_launch_at: schedulePayload.p_guaranteed_launch_at, closes_at: schedulePayload.p_closes_at, launch_threshold: 4, status: "closed", opened_at: null, terminal_at: null, terminal_reason: null });
  await page.getByLabel("Venue", { exact: true }).selectOption(testVenueId);
  await expect.poll(() => state.reads.at(-1)?.venue).toBe(`eq.${testVenueId}`);
  await expect(page.getByText("Loading this venue’s schedule…")).toHaveCount(0);
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.locator("#date-error")).toContainText("overlaps");
  expect(state.commands).toHaveLength(0);
});

test("reservation choice is explicit and capacity/deposit bounds refuse effects", async ({ page }) => {
  const state = await creation(page);
  await when(page);
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.locator("#mode-error")).toContainText("Choose reservations");
  await page.getByRole("radio", { name: /Reservations with deposit/ }).check();
  await expect(page.locator("#mode-error")).toHaveCount(0);
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.locator("#opens-error")).toBeVisible();
  await page.getByLabel("Registration opens", { exact: true }).fill("2026-10-22T10:00");
  await expect(page.locator("#opens-error")).toHaveCount(0);
  await reservations(page);
  for (const value of ["0", "100001", "1.5"]) {
    await page.getByLabel("Reservation capacity", { exact: true }).fill(value);
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.locator("#capacity-error")).toContainText("1–100,000");
  }
  await page.getByLabel("Reservation capacity", { exact: true }).fill("100000");
  await expect(page.locator("#capacity-error")).toHaveCount(0);
  for (const value of ["0", "0.001", "1000000"]) {
    await page.getByLabel("Deposit amount", { exact: true }).fill(value);
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.locator("#amount-error")).toContainText("0.01 to 999,999.99");
  }
  await page.getByLabel("Deposit amount", { exact: true }).fill("0.01");
  await expect(page.locator("#amount-error")).toHaveCount(0);
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { name: "Check before scheduling" })).toBeVisible();
  expect(state.commands).toHaveLength(0);
});

for (const value of ["", "not-a-uuid", "00000000-0000-4000-8000-999999999999", ` ${venueId}`, venueId.toUpperCase().replace(/^0/, "F")]) {
  test(`untrusted venue fallback: ${value || "absent"}`, async ({ page }) => {
    const state = await creation(page, value ? `?venue=${encodeURIComponent(value)}` : "");
    await expect(page.getByLabel("Venue", { exact: true })).toHaveValue("");
    await expect(page.getByRole("link", { name: "Close", exact: true })).toHaveAttribute("href", "/admin");
    expect(state.reads).toHaveLength(0);
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.locator("#venue-error")).toHaveText("Choose a venue.");
    expect(state.commands).toHaveLength(0);
  });
}

test("preselection includes labeled test venues, sorts real venues first and returns to the source venue", async ({ page }) => {
  await creation(page, `?venue=${testVenueId}`);
  const select = page.getByLabel("Venue", { exact: true });
  await expect(select).toHaveValue(testVenueId);
  await expect(select.locator("option")).toHaveText(["Choose a venue", "Le Salon · Paris", "New York Salon · New York", "A Test Bar · Paris (Test venue)"]);
  await select.selectOption(newYorkId);
  await expect(page.getByText("Times are in America/New_York.", { exact: true })).toBeVisible();
  await when(page);
  await page.getByRole("radio", { name: /Reservations with deposit/ }).check();
  await expect(page.getByLabel("Currency", { exact: true })).toHaveValue("usd");
  await expect(page.getByRole("link", { name: "Close", exact: true })).toHaveAttribute("href", `/admin/venues/${testVenueId}`);
});

test("failed scheduling keeps all inputs and allows an explicit retry", async ({ page }) => {
  const state = await creation(page);
  state.failSchedule = true;
  await review(page, true);
  await page.getByRole("button", { name: "Schedule night", exact: true }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("Synthetic schedule refusal");
  await expect(page).toHaveURL(`${path}?venue=${venueId}`);
  expect(state.commands.map(command => command.endpoint)).toEqual(["schedule_venue_night"]);
  await page.getByRole("button", { name: "Edit when" }).click();
  await expect(page.getByLabel("Night date", { exact: true })).toHaveValue("2026-10-23");
  await expect(page.getByLabel("Matching starts by", { exact: true })).toHaveValue("21:00");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByLabel("Reservation capacity", { exact: true })).toHaveValue("40");
  await expect(page.getByLabel("Deposit amount", { exact: true })).toHaveValue("12.50");
  await expect(page.getByLabel("Registration opens", { exact: true })).toHaveValue("2026-10-22T10:00");
  await page.getByRole("button", { name: "Continue" }).click();
  state.failSchedule = false;
  await page.getByRole("button", { name: "Schedule night", exact: true }).click();
  await scheduled(page);
  expect(state.commands).toEqual([{ endpoint: "schedule_venue_night", payload: schedulePayload }, { endpoint: "schedule_venue_night", payload: schedulePayload }, { endpoint: "admin_configure_launch_event", payload: configurationPayload }]);
});

test("partial failure persists on the night page and the existing dialog recovers it", async ({ page }) => {
  const state = await creation(page);
  state.failReservations = true;
  await review(page, true);
  await page.getByRole("button", { name: "Schedule night", exact: true }).click();
  await scheduled(page);
  const message = "Night scheduled, but reservations were not set up: Synthetic reservation refusal. Set them up from Reservations & deposits.";
  await expect(page.getByRole("main").getByRole("alert")).toHaveText(message);
  await page.reload();
  await expect(page.getByRole("main").getByRole("alert")).toHaveText(message);
  expect(state.commands.map(command => command.endpoint)).toEqual(["schedule_venue_night", "admin_configure_launch_event"]);
  await page.getByRole("button", { name: "Set up reservations" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Registration opens", { exact: true }).fill("2026-10-22T10:00");
  state.failReservations = false;
  await dialog.getByRole("button", { name: "Save reservation settings" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByText(message, { exact: true })).toHaveCount(0);
  expect(state.commands.filter(command => command.endpoint === "schedule_venue_night")).toHaveLength(1);
});

test("a synchronous submit guard prevents repeated RPCs while scheduling", async ({ page }) => {
  const state = await creation(page);
  let release = () => {};
  state.holdSchedule = new Promise<void>(resolve => { release = resolve; });
  await review(page, true);
  // Dispatch twice in one task, before React can disable the button.
  await page.locator("main form").evaluate(form => {
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
  await expect(page.getByRole("button", { name: "Scheduling…" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Back", exact: true })).toBeDisabled();
  await expect.poll(() => state.commands.length).toBe(1);
  release();
  await scheduled(page);
  expect(state.commands).toEqual([{ endpoint: "schedule_venue_night", payload: schedulePayload }, { endpoint: "admin_configure_launch_event", payload: configurationPayload }]);
});

test("failed or pending overlap reads block continuation and stale responses cannot replace the selected venue", async ({ page }) => {
  const state = await creation(page);
  state.failOverlap = true;
  await page.getByLabel("Venue", { exact: true }).selectOption(testVenueId);
  await expect(page.getByRole("main").getByRole("alert")).toContainText("Could not load");
  await page.getByLabel("Night date", { exact: true }).fill("2026-10-23");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { name: "When and where?" })).toBeVisible();
  state.failOverlap = false;
  let release = () => {};
  state.holdOverlap = new Promise<void>(resolve => { release = resolve; });
  await page.getByRole("button", { name: "Try again" }).click();
  await expect.poll(() => state.reads.filter(read => read.venue === `eq.${testVenueId}`).length).toBe(2);
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.locator("#venue-error")).toContainText("Wait for this venue’s schedule");
  state.holdOverlap = null;
  await page.getByLabel("Venue", { exact: true }).selectOption(newYorkId);
  await expect(page.getByText("Loading this venue’s schedule…")).toHaveCount(0);
  const staleResponse = page.waitForResponse(response => {
    const url = new URL(response.url());
    return url.pathname.endsWith("/venue_nights") && url.searchParams.get("venue_id") === `eq.${testVenueId}`;
  });
  release();
  await staleResponse;
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { name: "How do people get in?" })).toBeVisible();
  expect(state.commands).toHaveLength(0);
});

for (const width of [320, 390]) {
  test(`all creation steps fit ${width}px with 44px targets`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await creation(page);
    const geometry = async (step: number) => {
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      const targets = page.locator("main").locator("a, button, input, select");
      for (const target of await targets.all()) {
        if (!await target.isVisible()) continue;
        const radio = await target.getAttribute("type") === "radio";
        if (radio) {
          const indicator = await target.boundingBox();
          expect(indicator!.width).toBe(20);
          expect(indicator!.height).toBe(20);
          const title = await target.locator("..").locator("strong").boundingBox();
          expect(Math.abs(indicator!.y - title!.y)).toBeLessThanOrEqual(1);
        }
        // The radio's label card is the full clickable target, not its indicator.
        const bounds = await (radio ? target.locator("..") : target).boundingBox();
        expect(bounds!.height, await target.getAttribute("id") ?? await target.innerText()).toBeGreaterThanOrEqual(44);
        expect(bounds!.width).toBeGreaterThanOrEqual(44);
      }
      const summary = page.getByRole("complementary", { name: "The night at a glance" });
      if (step === 3) await expect(summary).toHaveCount(0);
      else {
        const summaryBounds = await summary.boundingBox();
        const formBounds = await page.locator("main form").boundingBox();
        expect(summaryBounds!.y + summaryBounds!.height).toBeLessThanOrEqual(formBounds!.y);
      }
      await page.screenshot({ path: test.info().outputPath(`create-night-${step}-${width}.png`), fullPage: true });
    };
    await geometry(1);
    await when(page);
    await reservations(page);
    await expect(page.getByRole("complementary", { name: "The night at a glance" })).toContainText("Registration Thu 22 Oct, 10:00 → Fri 23 Oct, 19:30");
    await geometry(2);
    await page.getByRole("button", { name: "Continue" }).click();
    await geometry(3);
    await page.getByRole("button", { name: "Edit reservations" }).click();
    await expect(page.getByLabel("Deposit amount", { exact: true })).toHaveValue("12.50");
    await page.getByRole("button", { name: "Back", exact: true }).click();
    await expect(page.getByLabel("Night date", { exact: true })).toHaveValue("2026-10-23");
  });
}

// Native Chromium date controls expose separate month/day/year segments.
// Explicit arrows avoid pointer or DOM value writes.
async function keyboardDate(page: Page) {
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.type("2030");
  await page.keyboard.press("Tab");
}

test.describe("Keyboard navigation", () => {
  test.use({ isMobile: false, hasTouch: false, viewport: { width: 1280, height: 900 } });

test("keyboard-only walk-in completion keeps step focus and supports the radio group", async ({ page }) => {
  const state = await creation(page);
  await expect(page.getByRole("heading", { name: "When and where?" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByLabel("Venue", { exact: true })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByLabel("Night date", { exact: true })).toBeFocused();
  await keyboardDate(page);
  await expect(page.getByLabel("Night date", { exact: true })).toHaveValue(/^2030-\d{2}-\d{2}$/);
  // Reach actions through actual tab order, including the native time segments.
  const next = page.getByRole("button", { name: "Continue", exact: true });
  for (let count = 0; count < 25 && !await next.evaluate(element => element === document.activeElement); count++) await page.keyboard.press("Tab");
  await expect(next).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "How do people get in?" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("radio", { name: /Reservations with deposit/ })).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("radio", { name: /Walk-in only/ })).toBeChecked();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Back", exact: true })).toBeFocused();
  await page.keyboard.press("Tab");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "Check before scheduling" })).toBeFocused();
  for (let count = 0; count < 4; count++) await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Schedule night", exact: true })).toBeFocused();
  await page.keyboard.press("Enter");
  await scheduled(page);
  expect(state.commands.map(command => command.endpoint)).toEqual(["schedule_venue_night"]);
});

});
