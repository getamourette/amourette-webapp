import { test, expect, type Page } from "@playwright/test";

const venueId = "00000000-0000-4000-8000-000000000010";
const id = (value: number) => `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
const now = new Date("2026-10-01T20:00:00Z");
function fixtureNight(value: number, date: string, status = "closed", terminal = false) {
  return { id: id(value), venue_id: venueId, status,
    waiting_opens_at: `${date}T18:00:00Z`, guaranteed_launch_at: `${date}T19:00:00Z`,
    closes_at: new Date(Date.parse(`${date}T00:00:00Z`) + 86_400_000).toISOString(),
    launch_threshold: 4, opened_at: status !== "closed" || terminal ? `${date}T18:00:00Z` : null,
    terminal_at: terminal ? `${date}T23:59:00Z` : null, terminal_reason: terminal ? "scheduled_end" : null,
  };
}
async function workspace(page: Page, testVenue = false) {
  await page.clock.setFixedTime(now);
  if (process.env.E2E_BASE_URL && process.env.E2E_VERCEL_BYPASS) {
    const origin = new URL(process.env.E2E_BASE_URL).origin;
    await page.route(url => url.origin === origin, route => route.continue({
      headers: { ...route.request().headers(), "x-vercel-protection-bypass": process.env.E2E_VERCEL_BYPASS! },
    }));
  }
  const state = {
    venue: { id: venueId, name: "Le Salon", slug: "le-salon", city: "Paris", timezone: "Europe/Paris", is_test_venue: testVenue, address: "12 rue du Salon" as string | null },
    extraVenues: [] as { id: string; name: string; slug: string; city: string; timezone: string; is_test_venue: boolean; address: string | null }[],
    removed: false,
    failAddress: false,
    failDelete: false,
    reads: [] as string[],
    nights: [fixtureNight(13, "2026-10-03"), fixtureNight(12, "2026-10-02"), fixtureNight(11, "2026-10-01", "live"), fixtureNight(14, "2026-09-26", "closed", true)],
    commands: [] as { endpoint: string; payload: Record<string, unknown> }[],
    failSave: false,
    failLoad: false,
  };
  await page.routeWebSocket(/.*/, socket => {
    // Local Next development hydration needs its HMR connection; Supabase stays mocked.
    const url = new URL(socket.url());
    if (url.host === new URL(page.url()).host && url.pathname.startsWith("/_next/")) socket.connectToServer();
    else socket.close();
  });
  // These tests never create a session or touch shared database fixtures.
  await page.route("**/auth/v1/**", route => route.abort());
  await page.route("**/rest/v1/**", async route => {
    const endpoint = new URL(route.request().url()).pathname.split("/").at(-1)!;
    const reply = (data: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(data) });
    if (endpoint === "admin_launch_overview") state.reads.push(endpoint);
    if (endpoint === "admin_launch_overview") return reply({ event: null, now: now.toISOString(), allocations: 0, finance: [] });
    if (endpoint === "admin_search_launch_reservations") return reply([]);
    if (endpoint === "am_i_admin") return reply(true);
    if (["venues", "venue_nights", "admin_launch_overview"].includes(endpoint)) state.reads.push(endpoint);
    if (endpoint === "venues") {
      const requested = new URL(route.request().url()).searchParams.get("id")?.slice(3);
      const venues = [...(state.removed ? [] : [state.venue]), ...state.extraVenues];
      return reply(requested ? venues.filter(venue => venue.id === requested) : venues);
    }
    if (endpoint === "venue_nights") {
      const requested = new URL(route.request().url()).searchParams.get("id")?.slice(3);
      const venue = new URL(route.request().url()).searchParams.get("venue_id")?.slice(3);
      return state.failLoad ? reply({ message: "Synthetic refresh failure" }, 500) : reply(state.nights.filter(night => (!requested || night.id === requested) && (!venue || night.venue_id === venue)));
    }
    if (endpoint === "admin_venue_night_participant_counts") return reply([{ venue_night_id: id(11), participant_count: 18 }]);
    const payload = route.request().postDataJSON() as Record<string, unknown>;
    state.commands.push({ endpoint, payload });
    if (endpoint === "admin_set_venue_address") {
      if (state.failAddress) return reply({ message: "Address frozen" }, 400);
      state.venue.address = payload.p_address as string | null;
      return reply(null);
    }
    if (endpoint === "delete_venue_configuration") {
      if (state.failDelete) return reply({ message: "Venues with reservation history cannot be deleted." }, 400);
      state.removed = true;
      return reply(null);
    }
    if (endpoint === "save_venue_details") {
      if (state.failSave) return reply({ message: "Synthetic save refusal" }, 400);
      state.venue = { ...state.venue, address: payload.p_venue_id === null ? null : state.venue.address, id: payload.p_venue_id === null ? id(30) : state.venue.id, name: String(payload.p_name), city: String(payload.p_city), timezone: String(payload.p_timezone), slug: String(payload.p_slug) };
      return reply(state.venue);
    }
    if (endpoint === "update_venue_night_schedule" || endpoint === "schedule_venue_night") {
      const row = fixtureNight(20, "2026-10-04");
      const changes = { waiting_opens_at: String(payload.p_waiting_opens_at), guaranteed_launch_at: String(payload.p_guaranteed_launch_at), closes_at: String(payload.p_closes_at), launch_threshold: Number(payload.p_launch_threshold) };
      if (endpoint === "schedule_venue_night") state.nights.push({ ...row, ...changes });
      else state.nights = state.nights.map(night => night.id === payload.p_venue_night_id ? { ...night, ...changes } : night);
      return reply(row.id);
    }
    if (["launch_venue_night", "close_venue_night", "reopen_venue_night"].includes(endpoint)) {
      state.nights = state.nights.map(night => night.id === payload.p_venue_night_id ? { ...night, status: endpoint === "close_venue_night" ? "closed" : "live", opened_at: night.waiting_opens_at } : night);
      return reply(null);
    }
    if (endpoint === "cancel_venue_night") {
      state.nights = state.nights.map(night => night.id === payload.p_venue_night_id ? { ...night, terminal_at: now.toISOString(), terminal_reason: "cancelled" } : night);
      return reply(null);
    }
    throw new Error(`Unexpected backend request: ${endpoint}`);
  });
  await page.goto("/admin/venues");
  if (testVenue) await page.getByLabel("Show test venues").check();
  await page.getByRole("link", { name: /Le Salon/ }).click();
  await expect(page.getByRole("heading", { name: "Le Salon", exact: true })).toBeVisible();
  return state;
}

const venuePath = `/admin/venues/${venueId}`;
const goVenue = async (page: Page) => {
  await page.goto(venuePath);
  await expect(page.getByRole("region", { name: "Venue details", exact: true })).toBeVisible();
};
const editUpcoming = async (page: Page) => {
  await page.goto(`/admin/nights/${id(12)}`);
  await page.getByRole("button", { name: "Edit schedule", exact: true }).click();
};
const refresh = (page: Page) => page.evaluate(() => window.dispatchEvent(new Event("focus")));

test("venue page separates details and nights, retains production QR and save recovery", async ({ page }) => {
  const state = await workspace(page);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const details = page.getByRole("region", { name: "Venue details", exact: true });
  await expect(details).toBeVisible();
  const rows = page.getByRole("region", { name: "Upcoming", exact: true }).getByRole("link", { name: /^View night/ });
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0)).toHaveAccessibleName(/2 Oct/);
  await expect(rows.nth(1)).toHaveAccessibleName(/3 Oct/);
  await page.getByRole("navigation", { name: "Venue navigation" }).getByRole("link", { name: "Venues", exact: true }).click();
  await expect(page.getByRole("link", { name: /Le Salon/ })).toContainText("Live now");
  await page.getByRole("link", { name: /Le Salon/ }).click();
  const qr = page.getByRole("region", { name: "Entrance QR" });
  await expect(qr.getByText("https://getamourette.com/v/le-salon", { exact: true })).toBeVisible();
  await expect(qr.getByRole("img", { name: "Permanent QR code for Le Salon" })).toBeVisible();
  await expect(qr.getByRole("link", { name: "Download PNG" })).toHaveAttribute("href", /^data:image\/png;base64,/);
  await page.evaluate(() => Object.defineProperty(navigator, "clipboard", { configurable: true, value: {
    writeText: async (value: string) => { document.body.dataset.copiedUrl = value; },
  } }));
  await qr.getByRole("button", { name: "Copy link" }).click();
  await expect(qr.getByRole("button", { name: "Copied" })).toBeVisible();
  await expect(page.locator("body")).toHaveAttribute("data-copied-url", "https://getamourette.com/v/le-salon");
  await details.getByRole("button", { name: "Edit", exact: true }).click();
  await details.getByLabel("Venue name", { exact: true }).fill("x".repeat(121));
  await details.getByRole("button", { name: "Save venue details" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("1 to 120 characters");
  expect(state.commands).toHaveLength(0);
  await details.getByLabel("Venue name", { exact: true }).fill("  Le Salon Updated  ");
  state.failSave = true;
  await details.getByRole("button", { name: "Save venue details" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("Synthetic save refusal");
  await refresh(page);
  await expect(page.getByRole("main").getByRole("alert")).toContainText("Synthetic save refusal");
  await expect(details.getByLabel("Venue name", { exact: true })).toHaveValue("  Le Salon Updated  ");
  state.failSave = false;
  await details.getByRole("button", { name: "Save venue details" }).click();
  await expect(page.getByRole("heading", { name: "Le Salon Updated", exact: true })).toBeVisible();
  expect(state.commands.map(command => command.endpoint)).toEqual(["save_venue_details", "save_venue_details"]);
  expect(state.commands[1].payload.p_name).toBe("Le Salon Updated");
  await editUpcoming(page);
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByLabel("Night date", { exact: true })).toHaveValue("2026-10-02");
  await page.keyboard.press("Escape");
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: test.info().outputPath(`venue-${width}.png`), fullPage: true });
  }
});

test("schedule editing rejects invalid order, saves separately and returns to the venue", async ({ page }) => {
  const state = await workspace(page);
  await editUpcoming(page);
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Guaranteed launch", { exact: true }).fill("19:00");
  await expect(page.getByRole("main").getByRole("alert")).toContainText("later than entry");
  await expect(dialog.getByRole("button", { name: "Save schedule" })).toBeDisabled();
  expect(state.commands).toHaveLength(0);
  await dialog.getByLabel("Guaranteed launch", { exact: true }).fill("21:30");
  await dialog.getByRole("button", { name: "Save schedule" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Night schedule" })).toContainText("21:30");
  expect(state.commands).toEqual([{ endpoint: "update_venue_night_schedule", payload: {
    p_venue_night_id: id(12), p_waiting_opens_at: "2026-10-02T18:00:00.000Z", p_guaranteed_launch_at: "2026-10-02T19:30:00.000Z", p_closes_at: "2026-10-03T00:00:00.000Z", p_launch_threshold: 4,
  } }]);
  await goVenue(page);
  await page.getByRole("link", { name: "Schedule a night here", exact: true }).click();
  await expect(page).toHaveURL(`/admin/nights/new?venue=${venueId}`);
  await expect(page.getByLabel("Venue", { exact: true })).toHaveValue(venueId);
  await expect(page.getByRole("link", { name: "Close", exact: true })).toHaveAttribute("href", venuePath);
  // Creation payload and validation assertions live in create-night.spec.ts.
  expect(state.commands).toHaveLength(1);
});

test("history is read-only and refreshed lifecycle state locks an open editor", async ({ page }) => {
  const state = await workspace(page);
  await page.locator("summary").filter({ hasText: "Past nights" }).click();
  await page.getByRole("link", { name: /View night Sat.*26 Sep/ }).click();
  const dialog = page.getByRole("dialog");
  await expect(page.getByText("This night is part of venue history.", { exact: false })).toBeVisible();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Edit schedule|Save|Launch|Pause|Reopen|Cancel scheduled/ })).toHaveCount(0);
  await page.setViewportSize({ width: 320, height: 740 });
  await page.screenshot({ path: test.info().outputPath("history-320.png") });
  await page.keyboard.press("Escape");
  await editUpcoming(page);
  state.nights = state.nights.map(night => night.id === id(12) ? { ...night, status: "waiting", opened_at: now.toISOString() } : night);
  await refresh(page);
  await expect(dialog.getByRole("button", { name: "Launch now" })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Save schedule" })).toHaveCount(0);
  await expect(dialog.locator("input")).toHaveCount(0);
  state.nights = state.nights.map(night => night.id === id(12) ? { ...night, status: "live", closes_at: now.toISOString() } : night);
  await refresh(page);
  await expect(dialog.getByRole("heading", { name: "Night details", exact: true })).toBeVisible();
  await expect(dialog.getByRole("button", { name: /Launch|Pause|Reopen/ })).toHaveCount(0);
  expect(state.commands).toHaveLength(0);
});

test("pause and reopen keep venue context; cancellation requires confirmation", async ({ page }) => {
  const state = await workspace(page);
  await page.getByRole("link", { name: /View night Thu.*1 Oct/ }).click();
  const dialog = page.getByRole("dialog");
  await page.getByRole("button", { name: "Pause room", exact: true }).click();
  await dialog.getByRole("button", { name: "Pause room", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByText("Paused", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Reopen room", exact: true }).click();
  await dialog.getByRole("button", { name: "Reopen room", exact: true }).click();
  await expect(page.getByText("Live", { exact: true })).toBeVisible();
  await editUpcoming(page);
  await dialog.getByRole("button", { name: "Cancel scheduled night", exact: true }).click();
  expect(state.commands.map(command => command.endpoint)).toEqual(["close_venue_night", "reopen_venue_night"]);
  await dialog.getByRole("button", { name: "Keep night", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await page.getByRole("button", { name: "Cancel scheduled night", exact: true }).click();
  await dialog.getByRole("button", { name: "Confirm cancellation", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByText("Cancelled", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Edit schedule" })).toHaveCount(0);
  expect(state.commands[2]).toEqual({ endpoint: "cancel_venue_night", payload: { p_venue_night_id: id(12) } });
  await goVenue(page);
  await page.locator("summary").filter({ hasText: "Delete venue" }).click();
  await page.getByRole("button", { name: "Delete venue…", exact: true }).click();
  await expect(dialog.getByRole("button", { name: "Delete permanently" })).toBeDisabled();
  await dialog.getByLabel("Type Le Salon to confirm").fill("Le Salon ");
  await expect(dialog.getByRole("button", { name: "Delete permanently" })).toBeDisabled();
  await dialog.getByLabel("Type Le Salon to confirm").fill("Le Salon");
  await expect(dialog.getByRole("button", { name: "Delete permanently" })).toBeEnabled();
  await dialog.getByRole("button", { name: "Keep venue" }).click();
  expect(state.commands).toHaveLength(3);
});

test("test venue settings are protected and a failed refresh has explicit recovery", async ({ page }) => {
  const state = await workspace(page, true);
  await expect(page.getByRole("button", { name: "Edit", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^Delete venue/ })).toHaveCount(0);
  await expect(page.getByText("Permanent test venue details are protected.", { exact: true })).toBeVisible();
  state.failLoad = true;
  await refresh(page);
  await expect(page.getByRole("main").getByRole("alert")).toContainText("Could not refresh the venue");
  await expect(page.getByRole("heading", { name: "Le Salon", exact: true })).toBeVisible();
  state.failLoad = false;
  state.nights = [];
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(page.getByText("No nights yet")).toBeVisible();
  await expect(page.getByRole("main").getByRole("alert")).toHaveCount(0);
});

test("creating a venue opens its empty page without creating a night", async ({ page }) => {
  const state = await workspace(page);
  await page.getByRole("navigation", { name: "Venue navigation" }).getByRole("link", { name: "Venues", exact: true }).click();
  await page.getByRole("link", { name: "Add venue", exact: true }).click();
  const dialog = page.getByRole("form", { name: "Add venue", exact: true });
  await dialog.getByLabel("Venue name", { exact: true }).fill("  New York Salon  ");
  await dialog.getByLabel("Rollout location").selectOption("New York");
  await dialog.getByRole("button", { name: "Add venue", exact: true }).click();
  await expect(page).toHaveURL(`/admin/venues/${id(30)}`);
  await expect(page.getByRole("heading", { name: "New York Salon", exact: true })).toBeVisible();
  await expect(page.getByText("No nights yet")).toBeVisible();
  expect(state.commands).toEqual([{ endpoint: "save_venue_details", payload: {
    p_venue_id: null, p_name: "New York Salon", p_slug: "new-york-salon", p_city: "New York", p_timezone: "America/New_York",
  } }]);
  await page.getByRole("link", { name: "Schedule a night here", exact: true }).click();
  await expect(page.getByText("Times are in America/New_York.", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Night date", { exact: true })).toHaveValue("");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByText("Choose a night date.", { exact: true })).toBeVisible();
  expect(state.commands).toHaveLength(1);
});

for (const width of [1440, 820, 390, 320]) {
  test(`visual review of venue pages and dialogs at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: width < 500 ? 844 : 1000 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    const state = await workspace(page);
    await page.addStyleTag({ content: "nextjs-portal { display: none; }" });
    await page.evaluate(() => document.fonts.ready);
    const capture = async (name: string) => {
      const dialog = page.getByRole("dialog");
      const modal = await dialog.count() > 0;
      if (!modal) await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({ path: test.info().outputPath(`${name}-${width}.png`), fullPage: !modal, scale: "css" });
      expect.soft(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${name}: page must not overflow`).toBe(true);
      if (modal) expect.soft(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth), `${name}: dialog must not overflow`).toBe(true);
    };
    const details = page.getByRole("region", { name: "Venue details", exact: true });
    const nights = page.getByRole("region", { name: "Nights at this venue", exact: true });
    const detailsBounds = await details.boundingBox();
    const nightsBounds = await nights.boundingBox();
    expect(detailsBounds && nightsBounds && (width > 1000
      ? detailsBounds.x >= nightsBounds.x + nightsBounds.width
      : detailsBounds.y >= nightsBounds.y + nightsBounds.height),
    "Venue details and nights occupy separate columns on desktop and stack on mobile").toBe(true);
    await expect(page.getByRole("region", { name: "Entrance QR" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Schedule a night here", exact: true })).toBeVisible();
    await expect(nights.getByRole("heading", { name: "Happening now", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: /^Delete venue/ })).toHaveCount(0);
    await capture("overview");
    await editUpcoming(page);
    const dialog = page.getByRole("dialog");
    await capture("schedule");
    const thresholdInput = dialog.getByLabel("People needed to launch");
    await thresholdInput.focus();
    expect.soft(await thresholdInput.evaluate(element => {
      const bounds = element.getBoundingClientRect();
      return document.elementFromPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2) === element;
    }), "Focused threshold must not be covered by the sticky actions").toBe(true);
    await capture("schedule-focused");
    await dialog.getByRole("button", { name: "Save schedule", exact: true }).focus();
    await page.keyboard.press("Tab");
    await expect(dialog.getByRole("button", { name: "Close dialog" })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("button", { name: "Edit schedule", exact: true })).toBeFocused();
    await capture("scheduled-night");
    await goVenue(page);
    await page.getByRole("button", { name: "Edit", exact: true }).click();
    state.failSave = true;
    await details.getByRole("button", { name: "Save venue details" }).click();
    await expect(page.getByRole("main").getByRole("alert")).toContainText("Synthetic save refusal");
    await capture("save-error");
    await details.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(details.getByRole("button", { name: "Edit", exact: true })).toBeFocused();
    state.failSave = false;
    await expect(page.getByRole("region", { name: "Entrance QR" }).getByRole("img")).toBeVisible();
    await capture("qr");
    state.venue.name = "Le Salon des Rencontres Extraordinaires on the Lower East Side";
    await refresh(page);
    await expect(page.getByRole("heading", { name: state.venue.name, exact: true })).toBeVisible();
    await capture("long-name");
    await page.getByRole("navigation", { name: "Venue navigation" }).getByRole("link", { name: "Venues", exact: true }).click();
    await capture("venue-list");
    await page.getByRole("link", { name: /Le Salon des Rencontres/ }).click();
    state.nights = [fixtureNight(11, "2026-10-01", "waiting")];
    await refresh(page);
    await expect(page.getByText("Waiting", { exact: true })).toBeVisible();
    await capture("waiting");
    await page.getByRole("link", { name: /View night Thu.*1 Oct/ }).click();
    await capture("night-page");
    await page.getByRole("button", { name: "Launch now" }).click();
    await dialog.getByRole("button", { name: "Launch now", exact: true }).click();
    await expect(dialog).toHaveCount(0);
    expect(state.commands.at(-1)).toEqual({ endpoint: "launch_venue_night", payload: { p_venue_night_id: id(11) } });
    state.nights = [];
    await goVenue(page);
    await refresh(page);
    await expect(page.getByText("No nights yet")).toBeVisible();
    await capture("empty");
    state.venue.name = "W".repeat(120);
    await refresh(page);
    await expect(page.getByRole("heading", { name: state.venue.name, exact: true })).toBeVisible();
    await page.locator("summary").filter({ hasText: "Delete venue" }).click();
    await page.getByRole("button", { name: "Delete venue…", exact: true }).click();
    await capture("long-delete");
    await page.keyboard.press("Escape");
    await page.getByRole("navigation", { name: "Venue navigation" }).getByRole("link", { name: "Venues", exact: true }).click();
    await capture("unbroken-name-list");
    const venueRow = page.getByRole("link", { name: new RegExp(state.venue.name) });
    expect.soft(await venueRow.evaluate(element => element.scrollWidth <= element.clientWidth), "Venue text must fit its card, not be clipped").toBe(true);
  });
}


test("venue and night URLs survive reload, support back/forward and reject foreign nights", async ({ page }) => {
  const state = await workspace(page);
  await expect(page).toHaveURL(venuePath);
  await page.getByRole("link", { name: /View night Fri.*2 Oct/ }).click();
  const nightPath = `/admin/nights/${id(12)}`;
  await expect(page).toHaveURL(nightPath);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Night schedule" })).toContainText("20:00");
  await page.reload();
  await expect(page.getByRole("heading", { name: /Fri.*2 Oct/ })).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(venuePath);
  await expect(page.getByRole("region", { name: "Nights at this venue", exact: true })).toBeVisible();
  await page.goForward();
  await expect(page.getByRole("region", { name: "Night schedule" })).toBeVisible();
  state.nights = state.nights.map(night => night.id === id(12) ? { ...night, venue_id: id(99) } : night);
  await refresh(page);
  await expect(page.getByRole("heading", { name: "Night unavailable" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Edit schedule|Pause|Launch|Cancel scheduled/ })).toHaveCount(0);
  expect(state.commands).toHaveLength(0);
  await page.goto(`/admin/venues/${id(99)}`);
  await expect(page.getByRole("heading", { name: "Venue unavailable" })).toBeVisible();
  const response = await page.goto("/admin/venues/not-a-uuid");
  expect(response?.status()).toBe(404);
  expect(state.commands).toHaveLength(0);
});


test("direct venue, creation and night links keep the founder gate before reads", async ({ page }) => {
  let workspaceReads = 0;
  await page.route("**/auth/v1/**", route => route.abort());
  await page.routeWebSocket(/.*/, socket => {
    const url = new URL(socket.url());
    if (url.host === new URL(page.url()).host && url.pathname.startsWith("/_next/")) socket.connectToServer();
    else socket.close();
  });
  await page.route("**/rest/v1/**", route => {
    if (!route.request().url().includes("/rpc/am_i_admin")) workspaceReads++;
    return route.fulfill({ contentType: "application/json", body: "false" });
  });
  for (const path of [`/admin/nights/${id(12)}`, "/admin/venues", venuePath, "/admin/venues/new"]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { name: "Founder sign-in" })).toBeVisible();
    await expect(page.getByRole("region", { name: "Night schedule" })).toHaveCount(0);
    await expect(page.getByRole("form", { name: "Add venue" })).toHaveCount(0);
    expect(workspaceReads).toBe(0);
  }
});

test("directory city URL, counts, untrusted fallback and test toggle", async ({ page }) => {
  const state = await workspace(page);
  state.extraVenues = [
    { ...state.venue, id: id(50), name: "NY Venue", slug: "ny-venue", city: "New York", timezone: "America/New_York" },
    { ...state.venue, id: id(51), name: "Permanent test", slug: "permanent-test", is_test_venue: true },
  ];
  await page.goto("/admin/venues?city=New%20York");
  await expect(page.getByRole("button", { name: "New York · 1", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("link", { name: /NY Venue/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Le Salon|Permanent test/ })).toHaveCount(0);
  await page.getByRole("button", { name: "Paris · 1", exact: true }).click();
  await expect(page).toHaveURL(/\?city=Paris$/);
  await expect(page.getByRole("link", { name: /Le Salon/ })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("button", { name: "Paris · 1", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.goBack();
  await expect(page.getByRole("button", { name: "New York · 1", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.goForward();
  await page.getByLabel("Show test venues").check();
  await expect(page.getByRole("button", { name: "Paris · 2", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: /Permanent test/ }).getByText("Test", { exact: true })).toBeVisible();
  await page.getByLabel("Show test venues").uncheck();
  await expect(page.getByRole("link", { name: /Permanent test/ })).toHaveCount(0);
  for (const city of ["Atlantis", " Paris", "paris", "<script>"]) {
    await page.goto(`/admin/venues?city=${encodeURIComponent(city)}`);
    await expect(page.getByRole("button", { name: "All · 2", exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("link", { name: /Le Salon/ })).toBeVisible();
    await expect(page.getByRole("link", { name: /NY Venue/ })).toBeVisible();
  }
  await page.goto("/admin/venues?city=Paris&city=New%20York");
  await expect(page.getByRole("button", { name: "Paris · 1", exact: true })).toHaveAttribute("aria-pressed", "true");
  expect(state.commands).toHaveLength(0);
  expect(state.reads).not.toContain("admin_launch_overview");
});

test("directory statuses use cheap night reads and expose empty, no match and retry states", async ({ page }) => {
  const state = await workspace(page);
  await page.goto("/admin/venues");
  const card = page.getByRole("link", { name: /Le Salon/ });
  await expect(card).toContainText("Live now");
  state.nights = [{ ...fixtureNight(11, "2026-10-01"), opened_at: "2026-10-01T18:00:00Z" }];
  await refresh(page);
  await expect(card).toContainText("Paused");
  state.nights = [fixtureNight(12, "2026-10-02")];
  await refresh(page);
  await expect(card).toContainText("Next: Fri 2 Oct");
  await expect(card).toContainText("20:00 → 02:00 (+1 day)");
  state.nights = [fixtureNight(14, "2026-09-26", "closed", true)];
  await refresh(page);
  await expect(card).toContainText("No upcoming night");
  await expect(card).toContainText("1 night held");
  state.failLoad = true;
  await refresh(page);
  await expect(page.getByRole("main").getByRole("alert")).toContainText("Displayed information may be out of date");
  await expect(card).toBeVisible();
  state.failLoad = false;
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toHaveCount(0);
  await page.getByRole("button", { name: "New York · 0" }).click();
  await expect(page.getByRole("heading", { name: "No venues match these filters" })).toBeVisible();
  state.removed = true;
  await page.goto("/admin/venues");
  await expect(page.getByRole("heading", { name: "No venues yet" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Add venue" }).last()).toBeVisible();
  state.failLoad = true;
  await page.reload();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("Could not load venues");
  state.failLoad = false;
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByRole("heading", { name: "No venues yet" })).toBeVisible();
  expect(state.reads).not.toContain("admin_launch_overview");
});

test("inline cancel restores all values and address validation precedes all effects", async ({ page }) => {
  const state = await workspace(page);
  const details = page.getByRole("region", { name: "Venue details" });
  await details.getByRole("button", { name: "Edit", exact: true }).click();
  await details.getByLabel("Venue name", { exact: true }).fill("Another name");
  await details.getByLabel("Rollout location").selectOption("New York");
  await details.getByLabel("Street address").fill("Changed address");
  await details.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(details.getByRole("button", { name: "Edit", exact: true })).toBeFocused();
  await details.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(details.getByLabel("Venue name", { exact: true })).toHaveValue("Le Salon");
  await expect(details.getByLabel("Rollout location")).toHaveValue("Paris");
  await expect(details.getByLabel("Street address")).toHaveValue("12 rue du Salon");
  await details.getByLabel("Street address").fill("😀".repeat(301));
  await details.getByRole("button", { name: "Save venue details" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("at most 300 characters");
  expect(state.commands).toHaveLength(0);
  await details.getByLabel("Street address").fill("  " + "😀".repeat(300) + "  ");
  await details.getByLabel("Venue name", { exact: true }).fill("  " + "😀".repeat(120) + "  ");
  await details.getByRole("button", { name: "Save venue details" }).click();
  await expect(details.getByRole("button", { name: "Edit", exact: true })).toBeVisible();
  expect(state.commands.map(command => command.endpoint)).toEqual(["save_venue_details", "admin_set_venue_address"]);
  expect(state.commands[0].payload.p_name).toBe("😀".repeat(120));
  expect(state.commands[1].payload).toEqual({ p_venue: venueId, p_address: "😀".repeat(300) });
});

test("venue deletion preserves exact confirmation, refusal and recovery", async ({ page }) => {
  const state = await workspace(page);
  await page.locator("summary").filter({ hasText: "Delete venue" }).click();
  await page.getByRole("button", { name: "Delete venue…", exact: true }).click();
  const dialog = page.getByRole("dialog");
  const submit = dialog.getByRole("button", { name: "Delete permanently" });
  await expect(submit).toBeDisabled();
  await dialog.getByLabel("Type Le Salon to confirm").fill("Le Salon ");
  await expect(submit).toBeDisabled();
  expect(state.commands).toHaveLength(0);
  await dialog.getByLabel("Type Le Salon to confirm").fill("Le Salon");
  state.failDelete = true;
  await submit.click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("reservation history cannot be deleted");
  await expect(dialog.getByLabel("Type Le Salon to confirm")).toHaveValue("Le Salon");
  state.failDelete = false;
  await submit.click();
  await expect(page).toHaveURL("/admin/venues");
  await expect(page.getByRole("heading", { name: "No venues yet" })).toBeVisible();
  expect(state.commands).toEqual(Array.from({ length: 2 }, () => ({ endpoint: "delete_venue_configuration", payload: { p_venue_id: venueId } })));
});

test("creation validates before effects and retries partial address failure on the same venue", async ({ page }) => {
  const state = await workspace(page);
  await page.goto("/admin/venues/new");
  const form = page.getByRole("form", { name: "Add venue", exact: true });
  await form.getByLabel("Venue name", { exact: true }).fill(" ");
  await form.getByRole("button", { name: "Add venue", exact: true }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("1 to 120 characters");
  await form.getByLabel("Venue name", { exact: true }).fill("😀".repeat(121));
  await form.getByRole("button", { name: "Add venue", exact: true }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("1 to 120 characters");
  expect(state.commands).toHaveLength(0);
  await form.getByLabel("Venue name", { exact: true }).fill("New place");
  await form.getByLabel("Street address").fill("  20 Main Street  ");
  state.failAddress = true;
  await form.getByRole("button", { name: "Add venue", exact: true }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("Venue details saved. Address could not be saved");
  await expect(form.getByLabel("Street address")).toHaveValue("  20 Main Street  ");
  await expect(form.getByRole("link", { name: "Cancel" })).toHaveAttribute("href", `/admin/venues/${id(30)}`);
  state.failAddress = false;
  await form.getByRole("button", { name: "Save venue details", exact: true }).click();
  await expect(page).toHaveURL(`/admin/venues/${id(30)}`);
  await expect(page.getByRole("region", { name: "Venue details" })).toContainText("20 Main Street");
  expect(state.commands.filter(command => command.endpoint === "save_venue_details").map(command => command.payload.p_venue_id)).toEqual([null, id(30)]);
  expect(state.commands.at(-1)).toEqual({ endpoint: "admin_set_venue_address", payload: { p_venue: id(30), p_address: "20 Main Street" } });
});

for (const width of [320, 390]) {
  test(`venue directory, details and creation targets fit ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    const state = await workspace(page);
    const geometry = async () => {
      for (const control of await page.locator("main input:visible, main select:visible").all()) {
        expect(await control.evaluate(element => parseFloat(getComputedStyle(element).fontSize))).toBeGreaterThanOrEqual(16);
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      const targets = page.getByRole("main").locator('a, button, summary, input:not([type="checkbox"]), select, label:has(input[type="checkbox"])');
      for (const target of await targets.all()) {
        if (!await target.isVisible()) continue;
        const box = await target.boundingBox();
        expect(box?.height, (await target.textContent()) ?? "Control").toBeGreaterThanOrEqual(44);
        expect(box?.width, (await target.textContent()) ?? "Control").toBeGreaterThanOrEqual(44);
      }
    };
    await expect(page.getByRole("region", { name: "Entrance QR" }).getByRole("img")).toBeVisible();
    await geometry();
    await page.getByRole("button", { name: "Edit", exact: true }).click();
    await geometry();
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    state.venue.name = "W".repeat(120);
    await page.goto("/admin/venues");
    await expect(page.getByRole("link", { name: new RegExp(state.venue.name) })).toBeVisible();
    await geometry();
    await page.getByRole("link", { name: "Add venue", exact: true }).click();
    await expect(page.getByRole("form", { name: "Add venue" })).toBeVisible();
    await geometry();
  });
}


test("venue rename explains and retains the permanent production link", async ({ page }) => {
  const state = await workspace(page);
  const details = page.getByRole("region", { name: "Venue details" });
  await expect(details).toContainText("https://getamourette.com/v/le-salon");
  await details.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(details.getByText("The entrance link and QR code stay the same when you rename a venue.", { exact: true })).toBeVisible();
  await details.getByLabel("Venue name", { exact: true }).fill("New salon name");
  await details.getByRole("button", { name: "Save venue details" }).click();
  await expect(details).toContainText("New salon name");
  await expect(details).toContainText("https://getamourette.com/v/le-salon");
  expect(state.commands.at(-1)?.payload.p_slug).toBe("le-salon");
});

test("directory test toggle stays above inserted venue cards", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const state = await workspace(page);
  state.extraVenues = [{ ...state.venue, id: id(51), name: "Permanent test", slug: "permanent-test", is_test_venue: true }];
  await page.goto("/admin/venues");
  await expect(page.getByRole("link", { name: /Le Salon/ })).toBeVisible();
  const toggle = page.getByLabel("Show test venues");
  const before = await toggle.boundingBox();
  await toggle.check();
  await expect(page.getByRole("link", { name: /Permanent test/ })).toBeVisible();
  expect((await toggle.boundingBox())!.y).toBe(before!.y);
  await toggle.uncheck();
  expect((await toggle.boundingBox())!.y).toBe(before!.y);
});
