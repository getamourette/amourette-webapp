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
  const state = {
    venue: { id: venueId, name: "Le Salon", slug: "le-salon", city: "Paris", timezone: "Europe/Paris", is_test_venue: testVenue },
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
    if (endpoint === "am_i_admin") return reply(true);
    if (endpoint === "venues") return reply([state.venue]);
    if (endpoint === "venue_nights") return state.failLoad ? reply({ message: "Synthetic refresh failure" }, 500) : reply(state.nights);
    if (endpoint === "admin_venue_night_participant_counts") return reply([{ venue_night_id: id(11), participant_count: 18 }]);
    const payload = route.request().postDataJSON() as Record<string, unknown>;
    state.commands.push({ endpoint, payload });
    if (endpoint === "save_venue_details") {
      if (state.failSave) return reply({ message: "Synthetic save refusal" }, 400);
      state.venue = { ...state.venue, id: payload.p_venue_id === null ? id(30) : state.venue.id, name: String(payload.p_name), city: String(payload.p_city), timezone: String(payload.p_timezone), slug: String(payload.p_slug) };
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
  await page.goto("/admin");
  await page.getByRole("button", { name: /Le Salon/ }).click();
  await expect(page.getByRole("heading", { name: "Le Salon", exact: true })).toBeVisible();
  return state;
}

const editUpcoming = (page: Page) => page.getByRole("button", { name: /Edit night Fri.*2 Oct/ }).click();
const refresh = (page: Page) => page.evaluate(() => window.dispatchEvent(new Event("focus")));

test("venue page separates details and nights, counts only upcoming and retains production QR", async ({ page }) => {
  const state = await workspace(page);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Venue details", exact: true })).toBeVisible();
  const rows = page.getByRole("button", { name: /^Edit night/ });
  await expect(rows.nth(0)).toHaveAccessibleName(/2 Oct/);
  await expect(rows.nth(1)).toHaveAccessibleName(/3 Oct/);
  await page.getByRole("button", { name: "All venues", exact: true }).click();
  await expect(page.getByText("2 upcoming nights", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: /Le Salon/ }).click();
  await page.getByRole("button", { name: "Production QR", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("https://getamourette.com/v/le-salon", { exact: true })).toBeVisible();
  await expect(dialog.getByRole("img", { name: "Permanent QR code for Le Salon" })).toBeVisible();
  await expect(dialog.getByRole("link", { name: "Download QR" })).toHaveAttribute("href", /^data:image\/png;base64,/);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Production QR", exact: true })).toBeFocused();
  await page.getByRole("button", { name: "Edit details", exact: true }).click();
  await dialog.getByLabel("Venue name", { exact: true }).fill("x".repeat(121));
  await dialog.getByRole("button", { name: "Save venue details" }).click();
  await expect(dialog.getByRole("alert")).toContainText("1 to 120 characters");
  expect(state.commands).toHaveLength(0);
  await dialog.getByLabel("Venue name", { exact: true }).fill("  Le Salon Updated  ");
  state.failSave = true;
  await dialog.getByRole("button", { name: "Save venue details" }).click();
  await expect(dialog.getByRole("alert")).toContainText("Synthetic save refusal");
  await refresh(page);
  await expect(dialog.getByRole("alert")).toContainText("Synthetic save refusal");
  await expect(dialog.getByLabel("Venue name", { exact: true })).toHaveValue("  Le Salon Updated  ");
  state.failSave = false;
  await dialog.getByRole("button", { name: "Save venue details" }).click();
  await expect(page.getByRole("heading", { name: "Le Salon Updated", exact: true })).toBeVisible();
  expect(state.commands.map(command => command.endpoint)).toEqual(["save_venue_details", "save_venue_details"]);
  expect(state.commands[1].payload.p_name).toBe("Le Salon Updated");
  await editUpcoming(page);
  await expect(dialog.getByLabel("Night date", { exact: true })).toHaveValue("2026-10-02");
  await page.keyboard.press("Escape");
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: test.info().outputPath(`venue-workspace-${width}.png`), fullPage: true });
  }
});

test("schedule editing rejects invalid order, saves separately and returns to the venue", async ({ page }) => {
  const state = await workspace(page);
  await editUpcoming(page);
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Guaranteed launch", { exact: true }).fill("19:00");
  await expect(dialog.getByRole("alert")).toContainText("later than entry");
  await expect(dialog.getByRole("button", { name: "Save schedule" })).toBeDisabled();
  expect(state.commands).toHaveLength(0);
  await dialog.getByLabel("Guaranteed launch", { exact: true }).fill("21:30");
  await dialog.getByRole("button", { name: "Save schedule" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Le Salon", exact: true })).toBeVisible();
  expect(state.commands).toEqual([{ endpoint: "update_venue_night_schedule", payload: {
    p_venue_night_id: id(12), p_waiting_opens_at: "2026-10-02T18:00:00.000Z", p_guaranteed_launch_at: "2026-10-02T19:30:00.000Z", p_closes_at: "2026-10-03T00:00:00.000Z", p_launch_threshold: 4,
  } }]);
  await page.getByRole("button", { name: "Add night", exact: false }).click();
  await dialog.getByLabel("Night date", { exact: true }).fill("2026-10-04");
  await dialog.getByRole("button", { name: "Add scheduled night" }).click();
  await expect(dialog).toHaveCount(0);
  expect(state.commands[1].endpoint).toBe("schedule_venue_night");
  expect(state.commands[1].payload.p_venue_id).toBe(venueId);
  await expect(page.getByRole("button", { name: /Edit night Sun.*4 Oct/ })).toBeVisible();
});

test("history is read-only and refreshed lifecycle state locks an open editor", async ({ page }) => {
  const state = await workspace(page);
  await page.locator("summary").filter({ hasText: "History" }).click();
  await page.getByRole("button", { name: /View night Sat.*26 Sep/ }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("This night is part of venue history.", { exact: false })).toBeVisible();
  await expect(dialog.locator("input,select")).toHaveCount(0);
  await expect(dialog.getByRole("button", { name: /Save|Launch|Pause|Reopen|Cancel scheduled/ })).toHaveCount(0);
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
  await page.getByRole("button", { name: /Manage night/ }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Pause room", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByText("Paused", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: /Manage night/ }).click();
  await dialog.getByRole("button", { name: "Reopen room", exact: true }).click();
  await expect(page.getByText("Live", { exact: true })).toBeVisible();
  await editUpcoming(page);
  await dialog.getByRole("button", { name: "Cancel scheduled night", exact: true }).click();
  expect(state.commands.map(command => command.endpoint)).toEqual(["close_venue_night", "reopen_venue_night"]);
  await dialog.getByRole("button", { name: "Keep night", exact: true }).click();
  await expect(dialog.getByLabel("Night date", { exact: true })).toHaveValue("2026-10-02");
  await dialog.getByRole("button", { name: "Cancel scheduled night", exact: true }).click();
  await dialog.getByRole("button", { name: "Confirm cancellation", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Edit night Fri.*2 Oct/ })).toHaveCount(0);
  expect(state.commands[2]).toEqual({ endpoint: "cancel_venue_night", payload: { p_venue_night_id: id(12) } });
  await page.getByRole("button", { name: "Edit details", exact: true }).click();
  await dialog.locator("summary").filter({ hasText: "Delete venue" }).click();
  await dialog.getByRole("button", { name: "Delete venue…", exact: true }).click();
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
  await expect(page.getByRole("button", { name: "Edit details", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Delete venue", exact: true })).toHaveCount(0);
  state.failLoad = true;
  await refresh(page);
  await expect(page.getByRole("main").getByRole("alert")).toContainText("Could not refresh the workspace");
  await expect(page.getByRole("heading", { name: "Le Salon", exact: true })).toBeVisible();
  state.failLoad = false;
  state.nights = [];
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(page.getByText("Ready for your first night")).toBeVisible();
  await expect(page.getByRole("main").getByRole("alert")).toHaveCount(0);
});

test("creating a venue opens its empty workspace without creating a night", async ({ page }) => {
  const state = await workspace(page);
  await page.getByRole("button", { name: "All venues", exact: true }).click();
  await page.getByRole("button", { name: /Create venue/ }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Venue name", { exact: true }).fill("  New York Salon  ");
  await dialog.getByLabel("Rollout location").selectOption("New York");
  await dialog.getByRole("button", { name: "Create venue", exact: true }).click();
  await expect(page.getByRole("heading", { name: "New York Salon", exact: true })).toBeVisible();
  await expect(page.getByText("Ready for your first night")).toBeVisible();
  expect(state.commands).toEqual([{ endpoint: "save_venue_details", payload: {
    p_venue_id: null, p_name: "New York Salon", p_slug: "new-york-salon", p_city: "New York", p_timezone: "America/New_York",
  } }]);
  await page.getByRole("button", { name: /Add night/ }).click();
  await expect(dialog.getByText("Times use America/New_York.", { exact: false })).toBeVisible();
  await expect(dialog.getByLabel("Night date", { exact: true })).toHaveValue("");
  await expect(dialog.getByRole("button", { name: "Add scheduled night" })).toBeDisabled();
});

for (const width of [1440, 820, 390, 320]) {
  test(`visual review of workspace and dialogs at ${width}px`, async ({ page }) => {
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
    const nights = page.getByRole("region", { name: "Nights", exact: true });
    const detailsBounds = await details.boundingBox();
    const nightsBounds = await nights.boundingBox();
    expect(detailsBounds && nightsBounds && detailsBounds.y + detailsBounds.height <= nightsBounds.y,
      "Permanent venue details must remain separate, above night scheduling at every width").toBe(true);
    await expect(details.getByRole("button", { name: "Production QR", exact: true })).toBeVisible();
    await expect(nights.getByRole("button", { name: "Add night", exact: true })).toBeVisible();
    await expect(nights.getByRole("heading", { name: "Live and active", exact: true })).toBeVisible();
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
    await expect(page.getByRole("button", { name: /Edit night Fri.*2 Oct/ })).toBeFocused();
    await page.getByRole("button", { name: "Edit details", exact: true }).click();
    state.failSave = true;
    await dialog.getByRole("button", { name: "Save venue details" }).click();
    await expect(dialog.getByRole("alert")).toContainText("Synthetic save refusal");
    await capture("save-error");
    await page.keyboard.press("Escape");
    state.failSave = false;
    await page.getByRole("button", { name: "Production QR", exact: true }).click();
    await expect(dialog.getByRole("img")).toBeVisible();
    await capture("qr");
    await page.keyboard.press("Escape");
    state.venue.name = "Le Salon des Rencontres Extraordinaires on the Lower East Side";
    await refresh(page);
    await expect(page.getByRole("heading", { name: state.venue.name, exact: true })).toBeVisible();
    await capture("long-name");
    await page.getByRole("button", { name: "All venues", exact: true }).click();
    await capture("venue-list");
    await page.getByRole("button", { name: /Le Salon des Rencontres/ }).click();
    state.nights = [fixtureNight(11, "2026-10-01", "waiting")];
    await refresh(page);
    await expect(page.getByText("Waiting", { exact: true })).toBeVisible();
    await capture("waiting");
    await page.getByRole("button", { name: /Manage night/ }).click();
    await dialog.getByRole("button", { name: "Launch now" }).click();
    await expect(dialog).toHaveCount(0);
    expect(state.commands.at(-1)).toEqual({ endpoint: "launch_venue_night", payload: { p_venue_night_id: id(11) } });
    state.nights = [];
    await refresh(page);
    await expect(page.getByText("Ready for your first night")).toBeVisible();
    await capture("empty");
    state.venue.name = "W".repeat(120);
    await refresh(page);
    await expect(page.getByRole("heading", { name: state.venue.name, exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Edit details", exact: true }).click();
    await dialog.locator("summary").filter({ hasText: "Delete venue" }).click();
    await dialog.getByRole("button", { name: "Delete venue…", exact: true }).click();
    await capture("long-delete");
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "All venues", exact: true }).click();
    await capture("unbroken-name-list");
    const venueRow = page.getByRole("button", { name: new RegExp(state.venue.name) });
    expect.soft(await venueRow.evaluate(element => element.scrollWidth <= element.clientWidth), "Venue text must fit its card, not be clipped").toBe(true);
  });
}
