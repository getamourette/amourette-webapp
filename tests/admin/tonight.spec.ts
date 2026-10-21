import { test, expect, type Page } from "@playwright/test";
import type { StaffArrival } from "../../lib/launch-arrivals";

const id = (value: number) => `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
const now = "2026-10-21T20:00:00Z";
const venue = (value: number, name: string, isTest = false) => ({ id: id(value), name, city: "Paris", timezone: "Europe/Paris", is_test_venue: isTest });
const night = (value: number, venueId: number, status = "live", future = false) => ({
  id: id(value), venue_id: id(venueId), status,
  waiting_opens_at: future ? "2026-10-22T18:00:00Z" : "2026-10-21T18:00:00Z",
  guaranteed_launch_at: future ? "2026-10-22T19:00:00Z" : "2026-10-21T19:00:00Z",
  closes_at: future ? "2026-10-23T00:00:00Z" : "2026-10-22T00:00:00Z",
  launch_threshold: 12, opened_at: future ? null : "2026-10-21T18:00:00Z", terminal_at: null as string | null, terminal_reason: null,
});

async function setup(page: Page, options: { empty?: boolean; multiple?: boolean; walkIn?: boolean; query?: string; status?: string } = {}) {
  await page.clock.setFixedTime(new Date(now));
  if (process.env.E2E_BASE_URL && process.env.E2E_VERCEL_BYPASS) {
    const origin = new URL(process.env.E2E_BASE_URL).origin;
    await page.route(url => url.origin === origin, route => route.continue({ headers: { ...route.request().headers(), "x-vercel-protection-bypass": process.env.E2E_VERCEL_BYPASS! } }));
  }
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia: async () => { throw new DOMException("Permission denied", "NotAllowedError"); } } });
  });
  const state = {
    venues: [venue(1, "Le Salon"), venue(2, "The Lantern"), venue(3, "Test Room", true)],
    nights: [
      ...(!options.empty ? [night(11, 1, options.status)] : []),
      ...(options.multiple ? [night(12, 2)] : []),
      night(13, 3), night(14, 2, "closed", true),
    ],
    fail: false, failReads: false, failSummary: false,
    commands: [] as { endpoint: string; payload: Record<string, unknown> }[],
    reads: [] as { endpoint: string; payload?: Record<string, unknown>; sidebar?: boolean }[],
    row: { id: id(31), night_id: id(11), first_name: "Alexandra", email: "alexandra@example.com", state: "confirmed", payment_state: "paid", arrival: null,
      verified_at: null, verified_by: null, method: null, note: null, revision: 0, refund_state: null, availability: "open", can_correct: true, history: [] } as StaffArrival,
  };
  await page.routeWebSocket(/.*/, socket => {
    const url = new URL(socket.url());
    if (url.host === new URL(page.url()).host && url.pathname.startsWith("/_next/")) socket.connectToServer(); else socket.close();
  });
  await page.route("**/auth/v1/**", route => route.abort());
  await page.route("**/rest/v1/**", async route => {
    const url = new URL(route.request().url());
    const endpoint = url.pathname.split("/").at(-1)!;
    const payload = route.request().method() === "POST" ? route.request().postDataJSON() as Record<string, unknown> : undefined;
    const sidebar = url.searchParams.get("select")?.includes("venues!inner");
    state.reads.push({ endpoint, payload, sidebar });
    const reply = (value: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(value) });
    if (endpoint === "am_i_admin") return reply(true);
    if (endpoint === "venues") return state.failReads ? reply({ message: "Read failed" }, 500) : reply(state.venues);
    if (endpoint === "venue_nights") return reply(sidebar ? state.nights.filter(row => row.status === "live" && !row.terminal_at && Date.parse(row.closes_at) > Date.parse(now) && !state.venues.find(venue => venue.id === row.venue_id)?.is_test_venue).map(row => ({ ...row, venues: { is_test_venue: false } })) : state.nights);
    if (endpoint === "admin_venue_night_participant_counts") return reply(state.nights.map(row => ({ venue_night_id: row.id, participant_count: row.id === id(11) ? 23 : 8 })));
    if (endpoint === "admin_launch_overview") return reply({ now, event: options.walkIn ? null : { night_id: payload?.p_night, capacity: 40, deposit_minor: 1000, currency: "eur", policy_version: "launch-v1", registration_opens_at: "2026-10-10T10:00:00Z", cancelled_at: null }, allocations: 34, finance: [] });
    if (endpoint === "admin_launch_arrival_summary") return state.failSummary ? reply({ message: "Counts failed" }, 500) : reply({ now, starts_at: "2026-10-21T18:00:00Z", ends_at: "2026-10-22T00:00:00Z", ended: false, cancelled: false, verified: state.row.arrival === "verified" ? 20 : 19, remaining: 15, absent: 0, cancelled_count: 2 });
    if (endpoint === "admin_search_launch_reservations") return reply([state.row]);
    if (endpoint === "admin_inspect_launch_arrival") return reply(state.row);
    state.commands.push({ endpoint, payload: payload! });
    if (state.fail) return reply({ message: "Synthetic lifecycle refusal" }, 400);
    const selected = state.nights.find(row => row.id === payload?.p_venue_night_id);
    if (endpoint === "close_venue_night" && selected) selected.status = "closed";
    else if ((endpoint === "reopen_venue_night" || endpoint === "launch_venue_night") && selected) selected.status = "live";
    else if (endpoint === "admin_confirm_launch_arrival") Object.assign(state.row, { arrival: "verified", revision: 1, verified_at: now, verified_by: id(40), method: "manual", note: payload?.p_note, refund_state: "queued" });
    else throw new Error(`Unexpected RPC ${endpoint}`);
    return reply(null);
  });
  await page.goto(`/admin/tonight${options.query ? `?${options.query}` : ""}`);
  await expect(page.getByRole("heading", { name: "Tonight", exact: true })).toBeVisible();
  await expect(page.getByRole("main").getByText("Loading Tonight…", { exact: true })).toHaveCount(0);
  return state;
}
const main = (page: Page) => page.getByRole("main");
const card = (page: Page) => main(page).getByRole("region", { name: "Tonight’s night" });
const sidebar = (page: Page) => page.getByRole("navigation", { name: "Admin", exact: true }).getByRole("link", { name: /^Tonight/ });

test("empty state offers the next real night, its local entry time, and Nights", async ({ page }) => {
  await setup(page, { empty: true });
  await expect(main(page).getByRole("heading", { name: "Nothing is happening right now" })).toBeVisible();
  await expect(main(page)).toContainText("Up next · The Lantern");
  await expect(main(page)).toContainText("Entry Thu 22 Oct, 20:00 · Europe/Paris");
  await expect(main(page).getByRole("link", { name: "Open next night" })).toHaveAttribute("href", `/admin/nights/${id(14)}`);
  await expect(main(page).getByRole("link", { name: "Go to Nights" })).toHaveAttribute("href", "/admin");
  await expect(sidebar(page)).toHaveAttribute("aria-current", "page");
  await expect(sidebar(page)).not.toContainText("Live");
  await main(page).getByLabel("Include test venues").check();
  await expect(card(page)).toContainText("Test Room");
  await expect(sidebar(page)).not.toContainText("Live");
});

test("one live reservation night shows honest counters and a selected Tonight sidebar", async ({ page }) => {
  const state = await setup(page);
  await expect(card(page)).toContainText("Le Salon");
  await expect(card(page)).toContainText("Closes 02:00 (+1 day)");
  for (const [label, count] of [["In the room", "23"], ["Arrived", "19"], ["Remaining", "15"]]) await expect(card(page).getByText(label, { exact: true }).locator("..")).toContainText(count);
  await expect(main(page).getByRole("button", { name: "Scan an arrival", exact: true })).toBeVisible();
  await expect(main(page).getByRole("button", { name: "Find a guest without QR", exact: true })).toBeVisible();
  await expect(main(page).getByLabel("Active night", { exact: true })).toHaveCount(0);
  await expect(main(page).getByRole("link", { name: "Open full night page" })).toHaveAttribute("href", `/admin/nights/${id(11)}`);
  await expect(sidebar(page)).toHaveAttribute("aria-current", "page");
  await expect(sidebar(page)).toContainText("Live");
  await expect(page.getByRole("navigation", { name: "Admin", exact: true }).getByRole("link").first()).toHaveAttribute("href", "/admin/tonight");
  expect(state.commands).toHaveLength(0);
  expect(state.reads.filter(read => read.sidebar)).toHaveLength(1);
});

test("selector persists across reload and browser history", async ({ page }) => {
  await setup(page, { multiple: true });
  await main(page).getByLabel("Active night", { exact: true }).selectOption(id(12));
  await expect(page).toHaveURL(`/admin/tonight?night=${id(12)}`);
  await expect(card(page)).toContainText("The Lantern");
  await page.reload();
  await expect(card(page)).toContainText("The Lantern");
  await main(page).getByLabel("Active night", { exact: true }).selectOption(id(11));
  await expect(card(page)).toContainText("Le Salon");
  await page.goBack(); await expect(card(page)).toContainText("The Lantern");
  await page.goForward(); await expect(card(page)).toContainText("Le Salon");
});

for (const value of ["bad", "<script>alert(1)</script>", id(99), id(13), id(14), ` ${id(12)}`]) {
  test(`untrusted selection ${value} falls back without querying that ID`, async ({ page }) => {
    const state = await setup(page, { multiple: true, query: `night=${encodeURIComponent(value)}` });
    await expect(card(page)).toContainText("Le Salon");
    await expect(main(page).getByLabel("Active night", { exact: true })).toHaveValue(id(11));
    await expect(main(page).getByRole("button", { name: "Scan an arrival", exact: true })).toBeVisible();
    expect(state.reads.filter(read => read.payload?.p_night).every(read => read.payload?.p_night === id(11))).toBe(true);
    expect(state.commands).toHaveLength(0);
  });
}

test("walk-in nights have only room attendance and no arrival actions", async ({ page }) => {
  const state = await setup(page, { walkIn: true });
  await expect(card(page)).toContainText("In the room");
  await expect.poll(() => state.reads.some(read => read.endpoint === "admin_launch_overview")).toBe(true);
  await expect(main(page).getByRole("button", { name: /Scan an arrival|Find a guest without QR/ })).toHaveCount(0);
  await expect(card(page).getByText("Arrived", { exact: true })).toHaveCount(0);
  expect(state.reads.some(read => read.endpoint === "admin_launch_arrival_summary")).toBe(false);
});

test("Scan embeds the existing camera flow and Back returns to Tonight", async ({ page }) => {
  const state = await setup(page);
  await main(page).getByRole("button", { name: "Scan an arrival", exact: true }).click();
  await expect(page).toHaveURL("/admin/tonight");
  await expect(main(page).getByRole("region", { name: "Arrival verification" })).toBeVisible();
  await expect(main(page).getByRole("alert")).toContainText("Camera unavailable or permission denied");
  await expect(main(page).getByRole("button", { name: "Confirm arrival", exact: true })).toHaveCount(0);
  await main(page).getByRole("button", { name: "Back to Tonight" }).click();
  await expect(card(page)).toContainText("Le Salon");
  expect(state.commands).toHaveLength(0);
});

test("manual lookup preserves explicit confirmation, note validation and Next guest", async ({ page }) => {
  const state = await setup(page);
  await main(page).getByRole("button", { name: "Find a guest without QR", exact: true }).click();
  await main(page).getByLabel("Name, email or reservation reference").fill("Alexandra");
  await main(page).getByRole("button", { name: "Find guest", exact: true }).click();
  await main(page).getByRole("button", { name: /Alexandra alexandra@example.com/ }).click();
  expect(state.commands).toHaveLength(0);
  await main(page).getByRole("button", { name: "Confirm arrival", exact: true }).click();
  await expect(main(page).getByRole("alert")).toHaveText("Add a verification note of 1–500 characters.");
  expect(state.commands).toHaveLength(0);
  await main(page).getByLabel("Verification note", { exact: true }).fill("Checked the guest’s email and reservation reference at the door.");
  await main(page).getByRole("button", { name: "Confirm arrival", exact: true }).click();
  await expect(main(page).getByRole("status")).toContainText("Arrival verified");
  expect(state.commands).toHaveLength(1);
  expect(state.commands[0]).toMatchObject({ endpoint: "admin_confirm_launch_arrival", payload: { p_id: id(31), p_night: id(11), p_method: "manual", p_secret: null, p_expected_revision: 0 } });
  await main(page).getByRole("button", { name: "Next guest" }).click();
  await expect(main(page).getByLabel("Name, email or reservation reference")).toBeVisible();
  await main(page).getByRole("button", { name: "Back to Tonight" }).click();
  await expect(card(page).getByText("Arrived", { exact: true }).locator("..")).toContainText("20");
});

for (const [status, label, rpc, result] of [["live", "Pause room", "close_venue_night", "Paused"], ["closed", "Reopen room", "reopen_venue_night", "Live"], ["waiting", "Launch now", "launch_venue_night", "Live"]]) {
  test(`${label} requires inline confirmation and retains server refusals`, async ({ page }) => {
    const state = await setup(page, { status });
    await main(page).getByRole("button", { name: label, exact: true }).click();
    const confirm = main(page).getByRole("region", { name: "Confirm room change" });
    await expect(confirm).toContainText(status === "waiting" ? "Open matching now" : "Existing interactions are preserved");
    expect(state.commands).toHaveLength(0);
    await confirm.getByRole("button", { name: "Keep current state" }).click();
    await expect(confirm).toHaveCount(0);
    await main(page).getByRole("button", { name: label, exact: true }).click();
    state.fail = true;
    await confirm.getByRole("button", { name: label, exact: true }).click();
    await expect(main(page).getByRole("alert")).toHaveText("Synthetic lifecycle refusal");
    state.fail = false;
    await confirm.getByRole("button", { name: label, exact: true }).click();
    await expect(confirm).toHaveCount(0);
    await expect(card(page).getByText(result, { exact: true })).toBeVisible();
    expect(state.commands).toEqual(Array(2).fill({ endpoint: rpc, payload: { p_venue_night_id: id(11) } }));
    if (result === "Paused") await expect(sidebar(page)).not.toContainText("Live");
    else await expect(sidebar(page)).toContainText("Live");
  });
}

test("refresh retains last successful counts with an explicit failure and excludes ended nights", async ({ page }) => {
  const state = await setup(page);
  await expect(card(page).getByText("Arrived", { exact: true }).locator("..")).toContainText("19");
  state.failSummary = true;
  await main(page).getByRole("button", { name: "Refresh Tonight" }).click();
  await expect(main(page).getByRole("alert")).toContainText("Counts could not refresh");
  await expect(card(page).getByText("Arrived", { exact: true }).locator("..")).toContainText("19");
  state.nights[0].terminal_at = now;
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(main(page).getByRole("heading", { name: "Nothing is happening right now" })).toBeVisible();
  await expect(sidebar(page)).not.toContainText("Live");
});

for (const width of [320, 390]) {
  test(`Tonight, confirmation and embedded arrivals fit ${width}px with large targets`, async ({ page }) => {
    await page.setViewportSize({ width, height: 850 });
    await setup(page, { multiple: true });
    await expect(main(page).getByRole("button", { name: "Scan an arrival", exact: true })).toBeVisible();
    const scan = await main(page).getByRole("button", { name: "Scan an arrival", exact: true }).boundingBox();
    expect(scan?.height).toBeGreaterThanOrEqual(64);
    async function checkTargets() {
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      for (const target of await main(page).locator("button:visible, a:visible, select:visible, summary:visible, label:has(input[type=checkbox]):visible").all()) {
        const box = await target.boundingBox();
        expect(box?.height, await target.innerText()).toBeGreaterThanOrEqual(44);
        expect(box?.width, await target.innerText()).toBeGreaterThanOrEqual(44);
      }
    }
    await checkTargets();
    await main(page).getByRole("button", { name: "Pause room", exact: true }).click();
    await checkTargets();
    await main(page).getByRole("button", { name: "Keep current state" }).click();
    await main(page).getByRole("button", { name: "Scan an arrival", exact: true }).click();
    await expect(main(page).getByRole("alert")).toContainText("Camera unavailable");
    await checkTargets();
    await main(page).getByRole("button", { name: "Find a guest without QR", exact: true }).click();
    await checkTargets();
  });
}
