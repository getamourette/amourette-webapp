import { test, expect, type Page } from "@playwright/test";

const venue = "00000000-0000-4000-8000-000000000010";
const night = "00000000-0000-4000-8000-000000000011";
const reservation = "00000000-0000-4000-8000-000000000012";
const path = `/admin/venues/${venue}/nights/${night}`;
const now = "2026-10-13T12:00:00Z";
async function setup(page: Page, configured = true) {
  await page.clock.setFixedTime(new Date(now));
  if (process.env.E2E_BASE_URL && process.env.E2E_VERCEL_BYPASS) {
    const origin = new URL(process.env.E2E_BASE_URL).origin;
    await page.route(url => url.origin === origin, route => route.continue({ headers: { ...route.request().headers(), "x-vercel-protection-bypass": process.env.E2E_VERCEL_BYPASS! } }));
  }
  const event = { night_id: night, capacity: 50, deposit_minor: 1000, currency: "eur", policy_version: "launch-v1", registration_opens_at: "2026-10-12T12:00:00Z", cancelled_at: null as string | null, cancellation_reason: null as string | null };
  const row = { id: reservation, night_id: night, first_name: "Alexandra", email: "alexandra.long.booking@example.com", locale: "en", state: "confirmed", hold_until: now, policy_version: "launch-v1", accepted_at: now,
    starts_at: "2026-10-20T18:00:00Z", ends_at: "2026-10-21T00:00:00Z", cancellation_deadline: "2026-10-18T18:00:00Z", cancelled_at: null, cancellation_refundable: null,
    amount_minor: 1000, currency: "eur", payment_state: "paid", arrival: null, verified_at: null, refund_state: null as string | null };
  const state = { configured, event, row, fail: false, commands: [] as { endpoint: string; payload: Record<string, unknown> }[],
    refund: null as null | { id: string; operation_id: string; provider_refund_id: string | null; state: string; reason: string; attempts: number; last_error: string | null; updated_at: string; lease_until: null; provider_source: string; review_owner: string | null } };
  await page.routeWebSocket(/.*/, socket => {
    const url = new URL(socket.url());
    if (url.host === new URL(page.url()).host && url.pathname.startsWith("/_next/")) socket.connectToServer(); else socket.close();
  });
  await page.route("**/auth/v1/**", route => route.abort());
  await page.route("**/rest/v1/**", async route => {
    const endpoint = new URL(route.request().url()).pathname.split("/").at(-1)!;
    const reply = (data: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(data) });
    if (endpoint === "am_i_admin") return reply(true);
    if (endpoint === "venues") return reply([{ id: venue, name: "Le Salon", slug: "le-salon", city: "Paris", timezone: "Europe/Paris", is_test_venue: true }]);
    if (endpoint === "venue_nights") return reply([{ id: night, venue_id: venue, waiting_opens_at: row.starts_at, guaranteed_launch_at: "2026-10-20T19:00:00Z", closes_at: row.ends_at, launch_threshold: 4, opened_at: null, terminal_at: event.cancelled_at, terminal_reason: event.cancelled_at ? "cancelled" : null, status: "closed" }]);
    if (endpoint === "admin_venue_night_participant_counts") return reply([]);
    if (endpoint === "admin_launch_overview") return reply({ event: state.configured ? event : null, now, allocations: 1, finance: state.configured ? [{ currency: "eur", paid_count: 25, charged: 25000, refunded: 20000, outstanding: 1000, held: 3000, retained: 1000, anomalies: 1, awaiting_funds: 0, oldest_unresolved_update: now }] : [] });
    const payload = route.request().postDataJSON() as Record<string, unknown>;
    if (endpoint === "admin_search_launch_reservations") return reply(state.configured && (!payload.p_query || String(payload.p_query).includes("alex")) && (payload.p_filter === "all" || payload.p_filter === row.state) ? [row] : []);
    if (endpoint === "admin_launch_reservation") return reply({ ...row, payment: { payment_id: "pi_test", checkout_id: "cs_test", paid_at: now }, checkout_work: { state: "done", attempts: 1, last_error: null, account_id: "acct_test" }, refund: state.refund, failed_refund_attempts: [] });
    if (endpoint === "admin_launch_list") return reply([{ id: 1, reservation_id: reservation, action: "exception_approved", actor_id: venue, detail: { note: "Support verified the booking" }, created_at: now }]);
    state.commands.push({ endpoint, payload });
    if (state.fail) return reply({ message: "Synthetic refusal" }, 400);
    if (endpoint === "admin_refund_launch_reservation") { row.refund_state = "queued"; state.refund = { id: "refund", operation_id: night, provider_refund_id: null, state: "queued", reason: "exception", attempts: 0, last_error: null, updated_at: now, lease_until: null, provider_source: "integration", review_owner: null }; return reply(null); }
    if (endpoint === "admin_correct_launch_email") { row.email = String(payload.p_email); return reply(null); }
    if (endpoint === "admin_cancel_launch_event") { event.cancelled_at = now; event.cancellation_reason = String(payload.p_reason); return reply(null); }
    if (endpoint === "admin_configure_launch_event") { event.capacity = Number(payload.p_capacity); state.configured = true; return reply(null); }
    throw new Error(`Unexpected RPC ${endpoint}`);
  });
  await page.goto(path);
  await expect(page.getByRole("heading", { name: "Reservations & deposits" })).toBeVisible();
  return state;
}
async function openReservation(page: Page) { await page.getByRole("button", { name: /Alexandra.*Booking/ }).click(); await expect(page.getByRole("heading", { name: "Alexandra" })).toBeVisible(); }

test("night totals cover all payments, search filters independently, and mobile detail keeps separate states", async ({ page }, testInfo) => {
  await setup(page); await page.setViewportSize({ width: 320, height: 850 });
  await expect(page.getByText("€250.00", { exact: true })).toBeVisible();
  await page.getByLabel("Find a reservation").fill("nobody"); await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page.getByText("No reservations match this search.")).toBeVisible();
  await page.getByLabel("Find a reservation").fill("alex"); await page.getByRole("button", { name: "Search", exact: true }).click();
  await openReservation(page);
  await expect(page.getByText("No refund requested", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole("heading", { name: "Alexandra" }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath("reservation-detail-320.png"), fullPage: true });
});

test("exception requires reason and confirmation, preserves rejected draft and never records attendance", async ({ page }, testInfo) => {
  const state = await setup(page); await openReservation(page);
  await page.getByRole("button", { name: "Refund full deposit", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("button", { name: "Refund full deposit", exact: true })).toBeDisabled();
  await dialog.getByLabel("Reason / verification note").fill("😀".repeat(501)); await dialog.getByRole("checkbox").check();
  await dialog.getByRole("button", { name: "Refund full deposit", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("1–500"); expect(state.commands).toHaveLength(0);
  await dialog.getByLabel("Reason / verification note").fill("Verified support exception"); state.fail = true;
  await dialog.getByRole("button", { name: "Refund full deposit", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("could not be completed");
  await expect(dialog.getByLabel("Reason / verification note")).toHaveValue("Verified support exception");
  await page.screenshot({ path: testInfo.outputPath("refund-confirmation-error.png"), fullPage: true });
  state.fail = false; await dialog.getByRole("button", { name: "Refund full deposit", exact: true }).click();
  await expect(dialog).toHaveCount(0); await expect(page.getByRole("status").filter({ hasText: "asynchronous" })).toBeVisible();
  expect(state.commands.every(command => command.endpoint === "admin_refund_launch_reservation")).toBe(true);
  await expect(page.getByRole("button", { name: "Refund full deposit", exact: true })).toHaveCount(0);
  await expect(page.getByText("Not recorded", { exact: true })).toBeVisible();
});

test("frozen registration only edits capacity; quota refusal preserves the draft", async ({ page }) => {
  const state = await setup(page);
  await expect(page.getByRole("button", { name: "Edit schedule", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Edit capacity", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByLabel("Deposit amount")).toBeDisabled();
  await dialog.getByLabel("Reservation capacity").fill("0"); await dialog.getByRole("button", { name: "Save reservation settings" }).click();
  await expect(dialog.getByRole("alert")).toContainText("allocated places"); expect(state.commands).toHaveLength(0);
  await dialog.getByLabel("Reservation capacity").fill("60"); await dialog.getByRole("button", { name: "Save reservation settings" }).click();
  await expect(dialog).toHaveCount(0); await expect(page.getByText("1 / 60 places allocated")).toBeVisible();
  expect(state.commands[0].payload.p_opens).toBe("2026-10-12T12:00:00Z");
});

test("organizer postponement explains all deposits, confirms explicitly and records the reason", async ({ page }) => {
  const state = await setup(page);
  await page.getByRole("button", { name: "Postpone event and refund deposits", exact: true }).click();
  const dialog = page.getByRole("dialog"); await expect(dialog).toContainText("invalidates arrival QRs");
  await dialog.getByRole("checkbox").check(); await dialog.getByRole("button", { name: "Postpone event and refund deposits" }).click();
  await expect(dialog).toHaveCount(0); expect(state.commands[0]).toEqual({ endpoint: "admin_cancel_launch_event", payload: { p_night: night, p_reason: "postponed" } });
  await expect(page.getByRole("button", { name: "Postpone event and refund deposits", exact: true })).toHaveCount(0);
});

test("email correction is explicit about access expiry and no email delivery; history retains audit notes", async ({ page }) => {
  const state = await setup(page); await openReservation(page);
  await page.getByRole("button", { name: "Correct booking email" }).click();
  const dialog = page.getByRole("dialog"); await expect(dialog).toContainText("arrival QR stays valid");
  await dialog.getByLabel("Correct email", { exact: true }).fill("Corrected@Example.com");
  await dialog.getByLabel("Reason / verification note").fill("Verified payment reference with guest"); await dialog.getByRole("checkbox").check();
  await dialog.getByRole("button", { name: "Correct booking email" }).click();
  await expect(dialog).toHaveCount(0); expect(state.commands[0].payload.p_email).toBe("corrected@example.com");
  await expect(page.getByRole("status").filter({ hasText: "No email has been sent" })).toBeVisible();
  await page.getByText("Event activity and audit history", { exact: true }).click();
  await expect(page.getByText("note: Support verified the booking", { exact: true })).toBeVisible();
});

test("empty setup supports keyboard dismissal and rejects unauthenticated refund HTTP requests", async ({ page, request }) => {
  await setup(page, false); await page.getByRole("button", { name: "Set up reservations" }).click();
  await expect(page.getByRole("dialog")).toBeVisible(); await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0); await expect(page.getByRole("button", { name: "Set up reservations" })).toBeFocused();
  const origin = new URL(page.url()).origin;
  const response = await request.post(`${origin}/api/admin/launch/refunds`, { headers: { Origin: origin }, data: {} });
  expect(response.status()).toBe(401); expect(response.headers()["cache-control"]).toContain("no-store");
});
