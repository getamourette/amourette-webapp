import { test, expect, type Page } from "@playwright/test";

const id = (value: number) => `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
const now = new Date("2026-10-01T20:00:00Z");
const venue = (value: number, name: string, testVenue = false) => ({
  id: id(value), name, slug: `venue-${value}`, city: "Paris", timezone: "Europe/Paris", is_test_venue: testVenue,
});
const night = (value: number, venueId: number, date: string, status = "closed", terminal = false) => ({
  id: id(value), venue_id: id(venueId), status,
  waiting_opens_at: `${date}T18:00:00Z`, guaranteed_launch_at: `${date}T19:00:00Z`,
  closes_at: new Date(Date.parse(`${date}T00:00:00Z`) + 86_400_000).toISOString(),
  launch_threshold: 4, opened_at: status !== "closed" || terminal ? `${date}T18:00:00Z` : null,
  terminal_at: terminal ? `${date}T23:59:00Z` : null, terminal_reason: terminal ? "scheduled_end" : null,
});

async function mockHome(page: Page) {
  await page.clock.setFixedTime(now);
  if (process.env.E2E_BASE_URL && process.env.E2E_VERCEL_BYPASS) {
    const origin = new URL(process.env.E2E_BASE_URL).origin;
    await page.route(url => url.origin === origin, route => route.continue({ headers: {
      ...route.request().headers(), "x-vercel-protection-bypass": process.env.E2E_VERCEL_BYPASS!,
    } }));
  }
  const state = {
    venues: [venue(1, "Le Salon"), venue(2, "The Lantern"), venue(3, "Test Room", true)],
    nights: [night(13, 2, "2026-10-03"), night(12, 1, "2026-10-02"), night(11, 1, "2026-10-01", "live"),
      night(15, 2, "2026-09-28", "closed", true), night(14, 1, "2026-09-30", "closed", true), night(16, 3, "2026-10-04")],
    failLoad: false, allowed: true, gateReads: 0, dataReads: 0, reads: [] as { endpoint: string; select: string | null; id: string | null }[],
  };
  await page.route("**/auth/v1/**", route => route.abort());
  await page.routeWebSocket(/.*/, socket => {
    const url = new URL(socket.url());
    if (url.host === new URL(page.url()).host && url.pathname.startsWith("/_next/")) socket.connectToServer();
    else socket.close();
  });
  await page.route("**/rest/v1/**", route => {
    const url = new URL(route.request().url());
    const endpoint = url.pathname.split("/").at(-1)!;
    const reply = (data: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(data) });
    if (endpoint === "am_i_admin") { state.gateReads++; return reply(state.allowed); }
    state.dataReads++;
    state.reads.push({ endpoint, select: url.searchParams.get("select"), id: url.searchParams.get("id") });
    if (endpoint === "venues") return reply(state.venues);
    if (endpoint === "venue_nights") {
      if (state.failLoad) return reply({ message: "Synthetic load failure" }, 500);
      const requested = url.searchParams.get("id")?.slice(3);
      return reply(requested ? state.nights.filter(night => night.id === requested) : state.nights);
    }
    if (endpoint === "admin_venue_night_participant_counts") return reply([{ venue_night_id: id(11), participant_count: 23 }]);
    if (endpoint === "admin_launch_overview") return reply({ event: null, now: now.toISOString(), allocations: 0, finance: [] });
    if (endpoint === "admin_search_launch_reservations") return reply([]);
    throw new Error(`Unexpected backend request: ${endpoint}`);
  });
  return state;
}
const schedule = (page: Page) => page.getByRole("region", { name: "Schedule", exact: true });
const nav = (page: Page) => page.getByRole("navigation", { name: "Admin", exact: true });

test("active night shows venue-local timing and counts; upcoming rows ascend across venues", async ({ page }) => {
  const state = await mockHome(page);
  await page.goto("/admin");
  const active = page.getByRole("region", { name: "Happening now" });
  await expect(active.getByRole("heading", { name: "Le Salon" })).toBeVisible();
  await expect(active.getByText("Live", { exact: true })).toBeVisible();
  await expect(active.getByText("23", { exact: true })).toBeVisible();
  await expect(active.getByText("02:00 (+1 day)", { exact: true })).toBeVisible();
  await expect(active.getByRole("link", { name: "Open night" })).toHaveAttribute("href", `/admin/nights/${id(11)}`);
  const rows = schedule(page).getByRole("link");
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0)).toHaveAttribute("href", `/admin/nights/${id(12)}`);
  await expect(rows.nth(1)).toHaveAttribute("href", `/admin/nights/${id(13)}`);
  await expect(rows.nth(0)).toContainText("tomorrow");
  await expect(rows.nth(0)).toContainText("20:00 → 02:00 (+1 day)");
  await expect(rows.nth(0)).toContainText("Scheduled");
  for (const text of [
    page.getByText("Amourette", { exact: true }),
    nav(page).getByRole("link", { name: "Nights", exact: true }),
    nav(page).getByText("Stats", { exact: true }),
    rows.nth(1).getByText("The Lantern", { exact: true }),
    page.getByRole("button", { name: "Upcoming", exact: true }),
    page.locator('label[for="nights-venue"]'),
  ]) {
    await expect(text).toHaveCSS("font-family", /Figtree/);
    await expect(text).toHaveCSS("letter-spacing", "normal");
    await expect(text).toHaveCSS("font-feature-settings", "normal");
    await expect(text).toHaveCSS("font-kerning", "normal");
  }
  expect(await schedule(page).getByRole("heading").evaluate(element =>
    parseFloat(getComputedStyle(element).letterSpacing))).toBeGreaterThan(0);
  expect(state.reads.every(read => read.select !== "*")).toBe(true);
  expect(state.reads.some(read => read.endpoint === "admin_launch_overview")).toBe(false);
});

test("past and venue filters persist in URLs, reload and back/forward", async ({ page }) => {
  await mockHome(page);
  await page.goto("/admin?view=past");
  const rows = schedule(page).getByRole("link");
  await expect(rows.nth(0)).toHaveAttribute("href", `/admin/nights/${id(14)}`);
  await expect(rows.nth(1)).toHaveAttribute("href", `/admin/nights/${id(15)}`);
  await expect(rows.nth(0)).toContainText("Ended");
  await page.getByLabel("Venue", { exact: true }).selectOption(id(2));
  await expect(page).toHaveURL(`/admin?view=past&venue=${id(2)}`);
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText("The Lantern");
  await expect(page.getByRole("region", { name: "Happening now" })).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("button", { name: "Past", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByLabel("Venue", { exact: true })).toHaveValue(id(2));
  await page.getByRole("button", { name: "Upcoming", exact: true }).click();
  await expect(page).toHaveURL(`/admin?venue=${id(2)}`);
  await expect(rows.first()).toHaveAttribute("href", `/admin/nights/${id(13)}`);
  await page.goBack();
  await expect(rows.first()).toHaveAttribute("href", `/admin/nights/${id(15)}`);
  await page.goForward();
  await expect(rows.first()).toHaveAttribute("href", `/admin/nights/${id(13)}`);
});

test("untrusted filters fall back to Upcoming and All venues", async ({ page }) => {
  await mockHome(page);
  for (const venueValue of ["not-a-uuid", id(99)]) {
    await page.goto(`/admin?view=PAST&venue=${venueValue}`);
    await expect(page.getByRole("button", { name: "Upcoming", exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByLabel("Venue", { exact: true })).toHaveValue("");
    await expect(schedule(page).getByRole("link")).toHaveCount(2);
  }
});

test("test venues are hidden by default, explicitly shown with a Test chip", async ({ page }) => {
  await mockHome(page);
  await page.goto(`/admin?venue=${id(3)}`);
  await expect(schedule(page).getByRole("link")).toHaveCount(2);
  await expect(page.getByLabel("Venue", { exact: true })).toHaveValue("");
  await expect(page.getByRole("option", { name: "Test Room" })).toHaveCount(0);
  await page.getByRole("checkbox", { name: "Show test venues" }).check();
  await expect(page.getByLabel("Venue", { exact: true })).toHaveValue(id(3));
  await expect(schedule(page).getByRole("link")).toHaveCount(1);
  await expect(schedule(page).getByRole("link")).toContainText("Test Room");
  await expect(schedule(page).getByText("Test", { exact: true })).toBeVisible();
  await page.getByRole("checkbox", { name: "Show test venues" }).uncheck();
  await expect(schedule(page).getByRole("link")).toHaveCount(2);
});

test("empty and filtered-empty states provide the appropriate next step", async ({ page }) => {
  const state = await mockHome(page);
  state.nights = [];
  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "No nights yet" })).toBeVisible();
  await expect(schedule(page).getByRole("link", { name: "Schedule a night" })).toHaveAttribute("href", "/admin/nights/new");
  await expect(page.getByRole("region", { name: "Happening now" })).toHaveCount(0);
  state.nights = [night(12, 1, "2026-10-02")];
  await page.goto(`/admin?venue=${id(2)}`);
  await expect(page.getByRole("heading", { name: "No nights match these filters" })).toBeVisible();
});

test("loading remains explicit until night data arrives", async ({ page }) => {
  await mockHome(page);
  let release!: () => void;
  const waiting = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/rest/v1/venue_nights?**", async route => {
    await waiting;
    await route.fallback();
  });
  await page.goto("/admin");
  await expect(page.getByRole("status")).toHaveText("Loading nights…");
  release();
  await expect(schedule(page).getByRole("link")).toHaveCount(2);
  await expect(page.getByRole("status")).toHaveCount(0);
});

test("load error can be retried without repeating the gate", async ({ page }) => {
  const state = await mockHome(page);
  state.failLoad = true;
  await page.goto("/admin");
  await expect(page.getByRole("main").getByRole("alert")).toContainText("Could not load nights");
  state.failLoad = false;
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(schedule(page).getByRole("link")).toHaveCount(2);
  await expect(page.getByRole("main").getByRole("alert")).toHaveCount(0);
  expect(state.gateReads).toBe(1);
});

test("route navigation highlights parents and preserves the mounted founder gate", async ({ page }) => {
  const state = await mockHome(page);
  await page.goto("/admin");
  await expect(nav(page).getByRole("link", { name: "Nights", exact: true })).toHaveAttribute("aria-current", "page");
  await nav(page).getByRole("link", { name: "Venues", exact: true }).click();
  await expect(page).toHaveURL("/admin/venues");
  await expect(nav(page).getByRole("link", { name: "Venues", exact: true })).toHaveAttribute("aria-current", "page");
  await page.getByRole("link", { name: /Le Salon/ }).click();
  await expect(page).toHaveURL(`/admin/venues/${id(1)}`);
  await expect(nav(page).getByRole("link", { name: "Venues", exact: true })).toHaveAttribute("aria-current", "page");
  await page.getByRole("link", { name: "Open night", exact: true }).click();
  await expect(page).toHaveURL(`/admin/nights/${id(11)}`);
  await expect(page.getByRole("region", { name: "Night schedule" })).toBeVisible();
  await expect(nav(page).getByRole("link", { name: "Nights", exact: true })).toHaveAttribute("aria-current", "page");
  expect(state.gateReads).toBe(1);
  expect(state.reads.some(read => read.endpoint === "venue_nights" && read.id === `eq.${id(11)}`)).toBe(true);
  expect(state.reads.every(read => !read.select?.includes("*"))).toBe(true);
});

test("legacy night route redirects permanently; missing and malformed nights are controlled", async ({ page, request }) => {
  await mockHome(page);
  const legacy = `/admin/venues/${id(1)}/nights/${id(12)}`;
  const response = await request.get(legacy, {
    maxRedirects: 0,
    headers: process.env.E2E_VERCEL_BYPASS ? { "x-vercel-protection-bypass": process.env.E2E_VERCEL_BYPASS } : {},
  });
  expect(response.status()).toBe(308);
  expect(response.headers().location).toBe(`/admin/nights/${id(12)}`);
  await page.goto(legacy);
  await expect(page).toHaveURL(`/admin/nights/${id(12)}`);
  await expect(page.getByRole("region", { name: "Night schedule" })).toBeVisible();
  await page.goto(`/admin/nights/${id(99)}`);
  await expect(page.getByRole("heading", { name: "Night unavailable" })).toBeVisible();
  await page.getByRole("link", { name: "Back to Nights" }).click();
  await expect(page).toHaveURL("/admin");
  const invalid = await page.goto("/admin/nights/not-a-uuid");
  expect(invalid?.status()).toBe(404);
});

test("direct night links never read workspace data before founder authorization", async ({ page }) => {
  const state = await mockHome(page); state.allowed = false;
  await page.goto(`/admin/nights/${id(12)}`);
  await expect(page.getByRole("heading", { name: "Founder sign-in" })).toBeVisible();
  expect(state.dataReads).toBe(0);
  await expect(nav(page)).toHaveCount(0);
});

for (const width of [320, 390, 1280]) {
  test(`Nights home fits ${width}px with long names and visible keyboard focus`, async ({ page }, info) => {
    const state = await mockHome(page);
    state.venues[0].name = "W".repeat(120);
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/admin");
    await expect(schedule(page).getByRole("link")).toHaveCount(2);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const row = schedule(page).getByRole("link").first();
    expect(await row.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    await row.focus();
    await expect(row).toBeFocused();
    expect(await row.evaluate(element => getComputedStyle(element).outlineStyle)).toBe("solid");
    for (const link of await nav(page).getByRole("link").all()) {
      expect((await link.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    }
    if (width === 390) {
      const account = page.getByRole("button", { name: "Account", exact: true });
      await expect(account).toBeVisible();
      await expect(account).toHaveAttribute("aria-expanded", "false");
      await expect(account).toHaveAttribute("aria-controls", "admin-account-panel");
      expect((await account.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      await expect(page.getByRole("button", { name: "Change password", exact: true })).toBeHidden();
      await account.focus();
      await page.keyboard.press("Enter");
      await expect(account).toHaveAttribute("aria-expanded", "true");
      const changePassword = page.getByRole("button", { name: "Change password", exact: true });
      await expect(changePassword).toBeVisible();
      const signOut = page.getByRole("button", { name: "Sign out", exact: true });
      await expect(signOut).toBeVisible();
      for (const action of [changePassword, signOut]) {
        expect((await action.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      }
      await page.keyboard.press("Tab");
      await expect(changePassword).toBeFocused();
      await page.keyboard.press("Escape");
      await expect(account).toBeFocused();
      await expect(account).toHaveAttribute("aria-expanded", "false");
      await expect(changePassword).toBeHidden();
      await expect(signOut).toBeHidden();
      await account.click();
      await expect(changePassword).toBeVisible();
      await page.getByRole("heading", { name: "Nights", exact: true }).click();
      await expect(account).toHaveAttribute("aria-expanded", "false");
      await expect(changePassword).toBeHidden();
    }
    await page.screenshot({ path: info.outputPath(`nights-home-${width}.png`), fullPage: true });
    await nav(page).getByRole("link", { name: "Feedback", exact: true }).scrollIntoViewIfNeeded();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if (width === 390) {
      const account = page.getByRole("button", { name: "Account", exact: true });
      await account.click();
      await expect(account).toHaveAttribute("aria-expanded", "true");
      // Keyboard navigation isolates route dismissal from the outside-pointer handler.
      await nav(page).getByRole("link", { name: "Venues", exact: true }).focus();
      await page.keyboard.press("Enter");
      await expect(page).toHaveURL("/admin/venues");
      await expect(account).toHaveAttribute("aria-expanded", "false");
      await expect(page.getByRole("button", { name: "Change password", exact: true })).toBeHidden();
    }
  });
}
