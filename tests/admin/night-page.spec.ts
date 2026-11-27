import { test, expect, type Page } from "@playwright/test";

const venueId = "00000000-0000-4000-8000-000000000010";
const nightId = "00000000-0000-4000-8000-000000000011";
const path = `/admin/nights/${nightId}`;
const now = "2026-10-13T12:00:00Z";
const productionUrl = `https://getamourette.com/events/${nightId}`;

async function dashboard(page: Page, options: { configured?: boolean; terminal?: boolean; status?: string; tab?: string; holdOverview?: Promise<void> } = {}) {
  await page.clock.setFixedTime(new Date(now));
  if (process.env.E2E_BASE_URL && process.env.E2E_VERCEL_BYPASS) {
    const origin = new URL(process.env.E2E_BASE_URL).origin;
    await page.route(url => url.origin === origin, route => route.continue({ headers: { ...route.request().headers(), "x-vercel-protection-bypass": process.env.E2E_VERCEL_BYPASS! } }));
  }
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async (value: string) => { document.documentElement.dataset.clipboard = value; } } });
  });
  const active = !!options.status;
  const state = {
    night: { id: nightId, venue_id: venueId, waiting_opens_at: active ? "2026-10-13T10:00:00Z" : "2026-10-20T18:00:00Z", guaranteed_launch_at: active ? "2026-10-13T13:00:00Z" : "2026-10-20T19:00:00Z", closes_at: options.terminal ? now : "2026-10-21T00:00:00Z", launch_threshold: 12,
      status: options.status ?? "closed", opened_at: active ? "2026-10-13T10:00:00Z" : null, terminal_at: options.terminal ? now : null, terminal_reason: options.terminal ? "scheduled_end" : null },
    reads: [] as { endpoint: string; select: string | null; id: string | null; venueId: string | null }[],
    failOverlap: false, failOverview: false, configurationRefusal: "",
    genderCounts: { woman: 14, man: 11, nonbinary: 1, unspecified: 0 } as null | Record<"woman" | "man" | "nonbinary" | "unspecified", number>,
    channelCounts: { street: 9, instagram: 12, venue_flyer: 3, venue_story: 2, unspecified: 0 } as null | Record<"street" | "instagram" | "venue_flyer" | "venue_story" | "unspecified", number>,
    holdNight: null as Promise<void> | null,
    staleNight: null as null | Record<string, unknown>,
    configured: options.configured ?? true,
    event: { night_id: nightId, capacity: 40, deposit_minor: 1000, currency: "eur", policy_version: "launch-v1", registration_opens_at: "2026-10-12T10:00:00Z", cancelled_at: null as string | null, cancellation_reason: null as string | null },
    fail: false, audit: [] as { id: number; reservation_id: null; actor_id: null; action: string; detail: Record<string, unknown>; created_at: string }[], commands: [] as { endpoint: string; payload: Record<string, unknown> }[],
  };
  await page.routeWebSocket(/.*/, socket => {
    const url = new URL(socket.url());
    if (url.host === new URL(page.url()).host && url.pathname.startsWith("/_next/")) socket.connectToServer(); else socket.close();
  });
  await page.route("**/auth/v1/**", route => route.abort());
  await page.route("**/rest/v1/**", async route => {
    const url = new URL(route.request().url());
    const endpoint = url.pathname.split("/").at(-1)!;
    state.reads.push({ endpoint, select: url.searchParams.get("select"), id: url.searchParams.get("id"), venueId: url.searchParams.get("venue_id") });
    const reply = (value: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(value) });
    // The admin shell polls the open-report count on every screen (#475).
    if (endpoint === "admin_moderation_queue") return reply([]);
    if (endpoint === "admin_launch_mail_problems") return reply({ total: 0, items: [] });
    if (endpoint === "am_i_admin") return reply(true);
    if (endpoint === "venues") return reply([{ id: venueId, name: "Le Salon", slug: "le-salon", city: "Paris", timezone: "Europe/Paris", is_test_venue: true }]);
    if (endpoint === "venue_nights") {
      if (url.searchParams.has("venue_id")) return state.failOverlap ? reply({ message: "Synthetic overlap read failure" }, 500) : reply([]);
      if (url.searchParams.get("select")?.includes("venues!inner")) return reply([]);
      const snapshot = { ...(state.staleNight ?? state.night) };
      await state.holdNight;
      return reply([snapshot]);
    }
    if (endpoint === "admin_venue_night_participant_counts") return reply([{ venue_night_id: nightId, participant_count: 18 }]);
    if (endpoint === "admin_launch_overview") {
      await options.holdOverview;
      return state.failOverview ? reply({ message: "Overview unavailable" }, 500) : reply({ now, event: state.configured ? state.event : null, allocations: 31, finance: [], ...(state.genderCounts ? { gender_counts: state.genderCounts } : {}) });
    }
    // #561: a database without the channel migration refuses the call; the block is then omitted.
    if (endpoint === "admin_launch_channel_counts") return state.channelCounts ? reply(state.channelCounts) : reply({ message: "Could not find the function" }, 404);
    if (endpoint === "admin_search_launch_reservations") return reply([]);
    if (endpoint === "admin_launch_list") {
      const payload = route.request().postDataJSON();
      return reply(payload.p_kind === "audit" ? state.audit.filter(item => item.id > Number(payload.p_after)).slice(0, 100) : []);
    }
    const payload = route.request().postDataJSON() as Record<string, unknown>;
    state.commands.push({ endpoint, payload });
    if (endpoint === "admin_configure_launch_event") {
      if (state.configurationRefusal) return reply({ message: state.configurationRefusal }, 400);
      state.configured = true; state.event.registration_opens_at = String(payload.p_opens);
      return reply(null);
    }
    if (endpoint === "admin_cancel_launch_event") return reply({ message: "event has ended" }, 400);
    if (state.fail) return reply({ message: "Synthetic lifecycle refusal" }, 400);
    if (endpoint === "close_venue_night") state.night.status = "closed";
    else if (endpoint === "launch_venue_night" || endpoint === "reopen_venue_night") state.night.status = "live";
    else if (endpoint === "end_venue_night_now") Object.assign(state.night, { status: "closed", terminal_at: now, terminal_reason: "scheduled_end" });
    else throw new Error(`Unexpected RPC ${endpoint}`);
    return reply(null);
  });
  await page.goto(`${path}${options.tab ? `?tab=${options.tab}` : ""}`);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  // The overview is asynchronous, so wait for its configured/unconfigured UI.
  if (!options.holdOverview) await expect(page.getByRole("tab", { name: "Reservations", exact: true })).toHaveCount(state.configured ? 1 : 0);
  return state;
}

test("booking-open night has venue-local header, honest allocations and policy timeline", async ({ page }) => {
  await dashboard(page);
  // en-GB dates: WebKit's ICU puts a comma after the weekday, Chromium's does not.
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/^Tue,? 20 Oct$/);
  await expect(page.getByRole("navigation", { name: "Night navigation" }).getByRole("link", { name: "Nights", exact: true })).toHaveAttribute("href", "/admin");
  await expect(page.getByRole("navigation", { name: "Night navigation" }).getByRole("link", { name: "Le Salon" })).toHaveAttribute("href", `/admin/venues/${venueId}`);
  await expect(page.getByText("Le Salon · Paris · 20:00 → 02:00 (+1 day)", { exact: true })).toBeVisible();
  const figures = page.getByRole("definition");
  await expect(figures.filter({ hasText: "31 / 40" })).toBeVisible();
  await expect(page.getByText("Confirmed bookings and payment holds", { exact: true })).toBeVisible();
  await expect(page.getByText("Checked in now", { exact: true }).locator("..")).toContainText("18");
  await expect(page.getByText("Registration closes", { exact: true }).first().locator("..")).toContainText("19:30");
  await expect(page.getByRole("region", { name: "Night schedule" }).getByRole("listitem")).toHaveCount(5);
  await expect(page.getByText("Guaranteed launch; earlier once 12 people are checked in.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Edit schedule" })).toHaveCount(0);
  await expect(page.getByText("Schedule is locked once registration opens.", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Edit capacity" })).toBeVisible();
  await page.getByRole("button", { name: "Open arrivals" }).click();
  await expect(page.getByRole("tab", { name: "Arrivals", exact: true })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("heading", { name: "Arrivals open on the night" })).toBeVisible();
  await expect(page.getByText("60 minutes before entry opens", { exact: false })).toBeVisible();
  await expect(page.getByRole("button", { name: "Scan personal QR" })).toHaveCount(0);
});

test("reservation overview shows aggregate confirmed bookings by gender (#354)", async ({ page }) => {
  const state = await dashboard(page);
  const totals = page.getByLabel("Confirmed bookings by gender");
  await expect(totals.getByText("Women", { exact: true }).locator("..")).toContainText("14");
  await expect(totals.getByText("Men", { exact: true }).locator("..")).toContainText("11");
  await expect(totals.getByText("Non-binary", { exact: true }).locator("..")).toContainText("1");
  await expect(totals.getByText("Not recorded", { exact: true })).toHaveCount(0);
  await expect(totals).toContainText("Payment holds are not counted.");
  // Bookings made before the field existed stay visible as an explicit remainder.
  state.genderCounts = { woman: 14, man: 11, nonbinary: 1, unspecified: 3 };
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(totals.getByText("Not recorded", { exact: true }).locator("..")).toContainText("3");
  // A database without the #354 migration returns no totals: the block is omitted, not zeroed.
  state.genderCounts = null;
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(totals).toHaveCount(0);
  await expect(page.getByText("31 / 40 places allocated", { exact: true })).toBeVisible();
});

test("reservation overview shows confirmed bookings by reservation link (#561)", async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const state = await dashboard(page);
  const totals = page.getByLabel("Confirmed bookings by link");
  for (const [label, count] of [["Street", "9"], ["Instagram", "12"], ["Venue flyer", "3"], ["Venue story", "2"], ["No link recorded", "0"]]) {
    await expect(totals.getByText(label, { exact: true }).locator("..")).toContainText(count);
  }
  await expect(totals).toContainText("Payment holds are not counted.");
  await totals.scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath("channel-totals.png") });
  // The channel read failing (or the function missing) never hides the rest of the overview.
  state.channelCounts = null;
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(totals).toHaveCount(0);
  await expect(page.getByLabel("Confirmed bookings by gender")).toBeVisible();
  await expect(page.getByText("31 / 40 places allocated", { exact: true })).toBeVisible();
});

test("walk-in night has attendance and closing figures with only applicable tabs", async ({ page }) => {
  await dashboard(page, { configured: false, tab: "reservations" });
  await expect(page.getByRole("heading", { name: "Reservations & deposits" })).toBeVisible();
  await expect(page.getByRole("tab")).toHaveText(["Overview"]);
  await expect(page.getByRole("tab", { name: "Overview" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByText("Checked in", { exact: true }).locator("..")).toContainText("18");
  await expect(page.getByText("Closes at", { exact: true }).locator("..")).toContainText("02:00 (+1 day)");
  await expect(page.getByRole("region", { name: "Night schedule" }).getByRole("listitem")).toHaveCount(3);
  await expect(page.getByRole("button", { name: "Edit schedule" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Set up reservations" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Booking page" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Open arrivals" })).toHaveCount(0);
});

test("tab URLs persist on reload and history, unknown values fall back, and arrows wrap", async ({ page }) => {
  await dashboard(page, { tab: "invalid" });
  const overview = page.getByRole("tab", { name: "Overview", exact: true });
  await expect(overview).toHaveAttribute("aria-selected", "true");
  await page.getByRole("tab", { name: "Reservations", exact: true }).click();
  await expect(page).toHaveURL(`${path}?tab=reservations`);
  await page.reload();
  await expect(page.getByRole("tab", { name: "Reservations", exact: true })).toHaveAttribute("aria-selected", "true");
  await page.getByRole("tab", { name: "Waitlist", exact: true }).click();
  await expect(page.getByText("No waitlist signups yet.")).toBeVisible();
  await page.goBack();
  await expect(page.getByRole("tab", { name: "Reservations", exact: true })).toHaveAttribute("aria-selected", "true");
  await page.goForward();
  await expect(page.getByRole("tab", { name: "Waitlist", exact: true })).toHaveAttribute("aria-selected", "true");
  await overview.click(); await page.keyboard.press("ArrowLeft");
  await expect(page.getByRole("tab", { name: "Activity", exact: true })).toBeFocused();
  await expect(page.getByText("No activity yet.")).toBeVisible();
  await page.keyboard.press("ArrowRight"); await expect(overview).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("tab", { name: "Reservations", exact: true })).toBeFocused();
  await page.keyboard.press("End"); await expect(page.getByRole("tab", { name: "Activity", exact: true })).toBeFocused();
  await page.keyboard.press("Home"); await expect(overview).toBeFocused();
  await expect(page.getByRole("tabpanel")).toHaveAttribute("aria-labelledby", "night-tab-overview");
});

// #373: arrow keys move from the focused tab, even before the selection has re-rendered.
test("arrow keys move from the focused tab when the selection has not re-rendered yet", async ({ page }) => {
  await dashboard(page);
  await expect(page.getByRole("tab", { name: "Overview", exact: true })).toHaveAttribute("aria-selected", "true");
  await page.getByRole("tab", { name: "Waitlist", exact: true }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("tab", { name: "Arrivals", exact: true })).toBeFocused();
  await expect(page.getByRole("tab", { name: "Arrivals", exact: true })).toHaveAttribute("aria-selected", "true");
});

test("all booking links copy production and the booking QR downloads", async ({ page }) => {
  await dashboard(page);
  const card = page.getByRole("region", { name: "Booking page", exact: true });
  await expect(card.getByRole("link", { name: "Open page" })).toHaveAttribute("href", productionUrl);
  await expect(card.getByRole("link", { name: "Open page" })).toHaveAttribute("target", "_blank");
  await expect(card).toContainText("always points to production");
  await page.getByRole("button", { name: "Copy booking link", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-clipboard", productionUrl);
  await card.getByRole("button", { name: "Copy link", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("Booking link copied.");
  const download = page.waitForEvent("download");
  await card.getByRole("button", { name: "Download QR" }).click();
  expect((await download).suggestedFilename()).toBe(`${nightId}-booking-qr.png`);
  await page.getByRole("tab", { name: "Waitlist", exact: true }).click();
  await expect(page.getByRole("link", { name: productionUrl, exact: true })).toHaveAttribute("href", productionUrl);
  await page.evaluate(() => { delete document.documentElement.dataset.clipboard; });
  await page.getByRole("tabpanel").getByRole("button", { name: "Copy booking link" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-clipboard", productionUrl);
});

for (const [status, label, endpoint, result] of [
  ["waiting", "Launch now", "launch_venue_night", "Live"],
  ["live", "Pause room", "close_venue_night", "Paused"],
  ["closed", "Reopen room", "reopen_venue_night", "Live"],
]) {
  test(`${label} requires confirmation and preserves server refusals`, async ({ page }) => {
    const state = await dashboard(page, { status, configured: false });
    await page.getByRole("button", { name: label, exact: true }).click();
    const dialog = page.getByRole("dialog");
    await expect(page.getByRole("button", { name: label, exact: true })).toHaveCount(1);
    await expect(page.getByRole("region", { name: "Room controls" }).getByRole("button")).toHaveCount(0);
    await expect(dialog).toContainText(status === "waiting" ? "Open matching now" : status === "live" ? "every like that is not mutual is cleared" : "Matches and conversations are kept");
    expect(state.commands).toHaveLength(0);
    await dialog.getByRole("button", { name: "Keep current state" }).click();
    expect(state.commands).toHaveLength(0);
    await page.getByRole("button", { name: label, exact: true }).click();
    state.fail = true;
    await dialog.getByRole("button", { name: label, exact: true }).click();
    await expect(dialog.getByRole("alert")).toHaveText("Synthetic lifecycle refusal");
    state.fail = false;
    await dialog.getByRole("button", { name: label, exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByText(result, { exact: true })).toBeVisible();
    expect(state.commands).toEqual(Array(2).fill({ endpoint, payload: { p_venue_night_id: nightId } }));
  });
}

// #431: ending early runs the scheduled-end transition, behind an explicit confirmation.
test("End night now is offered once entry has opened, asks for confirmation and surfaces server refusals", async ({ page }) => {
  const end = (scope: Page | ReturnType<Page["getByRole"]>) => scope.getByRole("button", { name: "End night now", exact: true });
  // Not offered before entry opens: cancellation is the tool then.
  await dashboard(page, { configured: false });
  await expect(end(page)).toHaveCount(0);
  for (const status of ["waiting", "closed"]) {
    await dashboard(page, { status, configured: false });
    await expect(end(page.getByRole("region", { name: "Room controls" }))).toBeVisible();
  }
  const state = await dashboard(page, { status: "live", configured: false });
  await end(page).click();
  const dialog = page.getByRole("dialog", { name: "End this night now?" });
  await expect(dialog).toContainText("Everyone checked in is checked out, and every like, match and conversation of this night is deleted.");
  await expect(dialog).toContainText("The night report is kept.");
  await expect(dialog).toContainText("This cannot be undone.");
  await expect(page.getByRole("region", { name: "Room controls" }).getByRole("button")).toHaveCount(0);
  await dialog.getByRole("button", { name: "Keep night open" }).click();
  await expect(dialog).toHaveCount(0);
  expect(state.commands).toHaveLength(0);
  await end(page).click();
  state.fail = true;
  await end(dialog).click();
  await expect(dialog.getByRole("alert")).toHaveText("Synthetic lifecycle refusal");
  await expect(page.getByText("Live", { exact: true })).toBeVisible();
  state.fail = false;
  await end(dialog).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("status").filter({ hasText: "Night ended." })).toContainText("The night report is kept.");
  await expect(page.getByText("Ended", { exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "Night schedule" })).toContainText("Night ended early · Done");
  await expect(page.getByRole("region", { name: "Room controls" })).toContainText("This night has ended. There are no room actions available.");
  await expect(end(page)).toHaveCount(0);
  expect(state.commands).toEqual(Array(2).fill({ endpoint: "end_venue_night_now", payload: { p_venue_night_id: nightId } }));
});

// #477: organizer cancellation refunds every deposit and tells guests the evening is cancelled.
test("organizer cancellation is withdrawn once entry has opened, and an ended night's refusal is explained", async ({ page }) => {
  const organizer = /Cancel event and refund deposits|Postpone event and refund deposits/;
  for (const status of ["waiting", "live"]) {
    await dashboard(page, { status });
    await expect(page.getByText("Entry has opened, so organizer cancellation is no longer offered")).toBeVisible();
    await expect(page.getByRole("button", { name: organizer })).toHaveCount(0);
  }
  // Before entry it is offered; a tab left open past the night's end gets the server's refusal.
  const state = await dashboard(page);
  await expect(page.getByRole("button", { name: organizer })).toHaveCount(2);
  await expect(page.getByText("Entry has opened, so organizer cancellation")).toHaveCount(0);
  await page.getByRole("button", { name: "Cancel event and refund deposits" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("checkbox").check();
  await dialog.getByRole("button", { name: "Cancel event and refund deposits" }).click();
  await expect(dialog.getByRole("alert")).toHaveText("This night has ended, so it can no longer be cancelled. Deposits follow attendance and nothing was refunded.");
  expect(state.commands).toEqual([{ endpoint: "admin_cancel_launch_event", payload: { p_night: nightId, p_reason: "cancelled" } }]);
});

test("ended and cancelled events have closed booking pages and no editing controls", async ({ page }) => {
  const state = await dashboard(page, { terminal: true });
  await expect(page.getByRole("heading", { name: "Booking page · Closed" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Edit|Set up|Launch now|Pause room|Reopen room|End night now|Cancel scheduled|Cancel event|Postpone|Open arrivals/ })).toHaveCount(0);
  await expect(page.getByRole("tab", { name: "Report", exact: true })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Arrivals", exact: true })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Reservations", exact: true })).toBeVisible();
  state.night.terminal_reason = "cancelled"; state.event.cancelled_at = now;
  await page.getByRole("button", { name: "Refresh night" }).click();
  await expect(page.getByText("Cancelled", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Copy booking link" })).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Booking page" })).toContainText(productionUrl);
  await page.getByRole("tab", { name: "Waitlist", exact: true }).click();
  await expect(page.getByRole("button", { name: /Mark Contacted|Close entry|Return to Waiting/ })).toHaveCount(0);
  expect(state.commands).toHaveLength(0);
});

for (const width of [320, 390]) {
  test(`dashboard and tabs fit ${width}px with 44px targets`, async ({ page }) => {
    await page.setViewportSize({ width, height: 850 });
    await dashboard(page);
    for (const name of ["Overview", "Reservations", "Waitlist", "Arrivals", "Activity"]) {
      await page.getByRole("tab", { name, exact: true }).click();
      // The panel follows the URL one render later; measure the panel actually shown.
      await expect(page.getByRole("tab", { name, exact: true })).toHaveAttribute("aria-selected", "true");
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      const targets = page.getByRole("main").locator("button:visible, a:visible, summary:visible");
      for (const target of await targets.all()) {
        const box = await target.boundingBox();
        expect(box?.height, await target.innerText()).toBeGreaterThanOrEqual(44);
        expect(box?.width, await target.innerText()).toBeGreaterThanOrEqual(44);
      }
    }
    await page.getByRole("tab", { name: "Overview", exact: true }).click();
    await page.screenshot({ path: test.info().outputPath(`night-dashboard-${width}.png`), fullPage: true });
  });
}


// #373: the history loaded only from the open <details> toggle event, which can fire
// before React listens to it (seen after the Next.js 16.4 upgrade). Swallowing the
// event makes that race deterministic: the history must still load.
test("Activity history loads even when the details toggle event never reaches React", async ({ page }) => {
  await page.addInitScript(() => window.addEventListener("toggle", event => event.stopPropagation(), true));
  await dashboard(page);
  await page.getByRole("tab", { name: "Activity", exact: true }).click();
  await expect(page.getByText("No activity yet.")).toBeVisible();
});

test("Activity loads audit history in pages without affecting reservation commands", async ({ page }) => {
  const state = await dashboard(page);
  state.audit = Array.from({ length: 101 }, (_, index) => ({ id: index + 1, reservation_id: null, actor_id: null, action: "capacity_changed", detail: { note: `Audit note ${index + 1}` }, created_at: now }));
  await page.getByRole("tab", { name: "Activity", exact: true }).click();
  await expect(page.getByText("note: Audit note 100", { exact: true })).toBeVisible();
  await expect(page.getByText("note: Audit note 101", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Load more history" }).click();
  await expect(page.getByText("note: Audit note 101", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Load more history" })).toHaveCount(0);
  expect(state.commands).toHaveLength(0);
});


test("night reads stay targeted and overlap data loads only on schedule editing", async ({ page }) => {
  const state = await dashboard(page, { configured: false });
  await page.getByRole("button", { name: "Edit schedule", exact: true }).waitFor();
  await page.getByRole("button", { name: "Refresh night" }).click();
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect.poll(() => state.reads.filter(read => read.endpoint === "venues").length).toBeGreaterThan(1);
  // Keep the detail projection scoped; the shell separately checks one live night.
  expect(state.reads.filter(read => read.endpoint === "venue_nights" && !read.select?.includes("venues!inner")).every(read => read.id === `eq.${nightId}` && read.venueId === null)).toBe(true);
  expect(state.reads.filter(read => read.endpoint === "venues").every(read => read.id === `eq.${venueId}`)).toBe(true);
  expect(state.reads.every(read => !read.select?.includes("*"))).toBe(true);

  state.failOverlap = true;
  await page.getByRole("button", { name: "Edit schedule", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("alert")).toContainText("Could not load this venue’s other nights");
  await expect(dialog.getByRole("button", { name: "Save schedule" })).toHaveCount(0);
  state.failOverlap = false;
  await dialog.getByRole("button", { name: "Try again" }).click();
  await expect(dialog.getByLabel("Night date", { exact: true })).toHaveValue("2026-10-20");
  await expect(dialog.getByRole("button", { name: "Save schedule" })).toBeEnabled();
  const overlapReads = state.reads.filter(read => read.endpoint === "venue_nights" && read.venueId !== null);
  expect(overlapReads).toHaveLength(2);
  expect(overlapReads.every(read => read.venueId === `eq.${venueId}` && read.id === `neq.${nightId}`)).toBe(true);
  expect(state.commands).toHaveLength(0);
});


test("walk-in scheduling waits for a successful overview and fails closed on refresh error", async ({ page }) => {
  let release = () => {};
  const holdOverview = new Promise<void>(resolve => { release = resolve; });
  const state = await dashboard(page, { configured: false, holdOverview });
  await expect(page.getByRole("button", { name: "Edit schedule" })).toHaveCount(0);
  release();
  await expect(page.getByRole("button", { name: "Edit schedule" })).toBeVisible();
  state.failOverview = true;
  await page.getByRole("button", { name: "Refresh night" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toHaveText("Reservation operations could not load. Refresh to try again.");
  await expect(page.getByRole("button", { name: "Edit schedule" })).toHaveCount(0);
  state.failOverview = false;
  await page.getByRole("button", { name: "Refresh night" }).click();
  await expect(page.getByRole("button", { name: "Edit schedule" })).toBeVisible();
});

test("opened walk-in nights explain the schedule lock", async ({ page }) => {
  await dashboard(page, { configured: false, status: "closed" });
  await expect(page.getByRole("button", { name: "Edit schedule" })).toHaveCount(0);
  await expect(page.getByText("Schedule is locked once the night opens.", { exact: true })).toBeVisible();
});

for (const [status, label, next] of [["live", "Pause room", "Reopen room"], ["closed", "Reopen room", "Pause room"], ["waiting", "Launch now", "Pause room"]]) {
  test(`night ${label} stays updated through a delayed old refresh`, async ({ page }) => {
    const state = await dashboard(page, { configured: false, status });
    state.staleNight = { ...state.night, closes_at: "2026-10-21T01:00:00Z" };
    let release = () => {};
    state.holdNight = new Promise<void>(resolve => { release = resolve; });
    await page.getByRole("button", { name: label, exact: true }).click();
    await page.getByRole("dialog").getByRole("button", { name: label, exact: true }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByRole("button", { name: next, exact: true })).toBeVisible();
    const response = page.waitForResponse(response => response.url().includes("/venue_nights?") && new URL(response.url()).searchParams.has("id"));
    release(); state.holdNight = null;
    await response;
    await expect(page.getByText("Closes at", { exact: true }).locator("..")).toContainText("03:00");
    await page.getByRole("button", { name: "Refresh night" }).click();
    await expect(page.getByRole("button", { name: next, exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: label, exact: true })).toHaveCount(0);
    state.staleNight = null;
    await page.getByRole("button", { name: "Refresh night" }).click();
    await page.getByRole("button", { name: next, exact: true }).click();
    await expect(page.getByText(/Room paused\.|Room reopened\.|Night launched\./, { exact: true })).toHaveCount(0);
  });
}

test("reservation configuration validates time inline and maps server refusals", async ({ page }) => {
  const state = await dashboard(page, { configured: false });
  await page.getByRole("button", { name: "Set up reservations" }).click();
  const dialog = page.getByRole("dialog");
  const opening = dialog.getByLabel("Registration opens", { exact: true });
  const save = dialog.getByRole("button", { name: "Save reservation settings" });
  await expect(opening).toHaveValue("2026-10-13T14:15");
  for (const [value, message] of [
    ["2026-10-13T14:00", "Registration must open in the future."],
    ["2026-10-20T19:30", "Registration must open before booking closes, 30 minutes before entry."],
  ]) {
    await opening.fill(value); await save.click();
    await expect(dialog.locator("#registration-opens-error")).toHaveText(message);
    expect(state.commands).toHaveLength(0);
  }
  await dialog.getByRole("button", { name: "Use next available time" }).click();
  await expect(opening).toHaveValue("2026-10-13T14:15");
  for (const [refusal, message] of [
    ["opening must not be in the past", "Registration must open in the future."],
    ["invalid registration schedule", "Registration must open before booking closes, 30 minutes before entry."],
  ]) {
    state.configurationRefusal = refusal; await save.click();
    await expect(dialog.locator("#registration-opens-error")).toHaveText(message);
    await expect(opening).toHaveAttribute("aria-invalid", "true");
  }
  state.configurationRefusal = "";
  await save.click(); await expect(dialog).toHaveCount(0);
});

test("frozen capacity changes preserve the past opening and omit the quick action", async ({ page }) => {
  const state = await dashboard(page);
  await page.getByRole("button", { name: "Edit capacity" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByLabel("Registration opens", { exact: true })).toBeDisabled();
  await expect(dialog.getByRole("button", { name: "Use next available time" })).toHaveCount(0);
  await dialog.getByLabel("Reservation capacity", { exact: true }).fill("41");
  await dialog.getByRole("button", { name: "Save reservation settings" }).click();
  await expect(dialog).toHaveCount(0);
  expect(state.commands.at(-1)?.payload.p_opens).toBe("2026-10-12T10:00:00Z");
});


test("schedule and reservation controls fit phone widths without focus zoom", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await dashboard(page, { configured: false });
  for (const trigger of ["Edit schedule", "Set up reservations"]) {
    await page.getByRole("button", { name: trigger, exact: true }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.locator("input").first()).toBeVisible();
    for (const control of await dialog.locator("input:visible, select:visible").all()) {
      expect(await control.evaluate(element => parseFloat(getComputedStyle(element).fontSize))).toBeGreaterThanOrEqual(16);
      const box = await control.boundingBox();
      expect(box!.height).toBeGreaterThanOrEqual(44);
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(390);
    }
    expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    await dialog.getByRole("button", { name: "Close dialog", exact: true }).click();
  }
});
