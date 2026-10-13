import { test, expect, type Page } from "@playwright/test";
import { renderLaunchQr } from "@/lib/launch-qr";
import { bookingStrings } from "@/lib/booking-strings";
import type { Locale } from "@/lib/strings";

const night = "00000000-0000-4000-8000-000000000184";
const id = "00000000-0000-4000-8000-000000000185";
const access = `v1.${"a".repeat(120)}`;
const now = "2026-10-13T12:00:00Z";
async function setup(page: Page, locale: Locale = "en") {
  await page.clock.setFixedTime(new Date(now));
  const event = { night_id: night, venue_id: id, venue_name: "Le Salon", city: "Paris", address: "12 rue de la Rencontre", timezone: "Europe/Paris", now,
    opens_at: "2026-10-12T12:00:00Z", closes_at: "2026-10-20T17:30:00Z", starts_at: "2026-10-20T18:00:00Z", ends_at: "2026-10-20T22:00:00Z", cancellation_deadline: "2026-10-18T18:00:00Z",
    amount_minor: 1000, currency: "eur", policy_version: "launch-v1", available: 1, status: "open", walk_ins_possible: false, registration_open: true };
  const reservation = { id, night_id: night, email: "guest@example.com", first_name: "Alice", locale, state: "holding", payment_state: "pending", hold_until: "2026-10-13T12:30:00Z", starts_at: event.starts_at, ends_at: event.ends_at, cancellation_deadline: event.cancellation_deadline, amount_minor: 1000, currency: "eur", refund_state: null };
  const png = `data:image/png;base64,${(await renderLaunchQr("a".repeat(64))).toString("base64")}`;
  const state = { event, reservation, create: 0, createInputs: [] as unknown[], qr: 0, recovery: 0, exchange: 0, waitlist: 0, failCreate: false, rejectCreate: "", statusMissing: false, eventReadStatus: 0, qrUnavailable: true, failWaitlist: false, invalidAccess: false };
  if (process.env.E2E_BASE_URL && process.env.E2E_VERCEL_BYPASS) {
    const origin = new URL(process.env.E2E_BASE_URL).origin;
    await page.route(url => url.origin === origin, route => route.continue({ headers: { ...route.request().headers(), "x-vercel-protection-bypass": process.env.E2E_VERCEL_BYPASS! } }));
  }
  await page.route("**/auth/v1/**", route => route.abort());
  await page.route("**/rest/v1/**", route => route.abort());
  await page.route("**/api/launch/**", async route => {
    const request = route.request(); const path = new URL(request.url()).pathname;
    const reply = (data: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(data) });
    if (path.endsWith("/checkout") && request.method() === "GET") return state.eventReadStatus ? reply({ error: "request_refused" }, state.eventReadStatus) : reply(event);
    if (path.endsWith("/credentials")) return reply({ id, access });
    const body = request.postDataJSON() as Record<string, unknown>;
    if (path.endsWith("/checkout")) {
      expect(request.headers().authorization).toBe(`Bearer ${access}`);
      if (state.invalidAccess) return reply({ error: "invalid_access" }, 401);
      if (body.action === "status") return state.statusMissing ? reply({ error: "invalid_access" }, 401) : reply(reservation);
      state.create++; state.createInputs.push(body);
      if (state.rejectCreate) return reply({ error: state.rejectCreate }, 409);
      if (state.failCreate) return reply({ error: "checkout_pending" }, 503);
      return reply({ reservation, checkout_url: null, checkout_state: "pending" });
    }
    if (path.endsWith("/arrival-qr")) {
      state.qr++;
      return state.qrUnavailable ? reply({ error: "arrival_unavailable" }, 409) : reply({ reservation_id: id, night_id: night, starts_at: event.starts_at, ends_at: event.ends_at, timezone: event.timezone, verified_at: null, png_data_url: png });
    }
    if (path.endsWith("/access")) {
      if (body.action === "request") { state.recovery++; return reply({ accepted: true }, 202); }
      state.exchange++; return reply({ id, access });
    }
    if (path.endsWith("/waitlist")) { state.waitlist++; return state.failWaitlist ? reply({ error: "waitlist_unavailable" }, 409) : reply({ accepted: true }); }
    throw Error(`Unexpected booking request: ${path}`);
  });
  await page.goto(`/events/${night}`);
  await expect(page.getByRole("heading", { name: "Le Salon" })).toBeVisible();
  await page.getByRole("button", { name: { en: "English", fr: "Français", es: "Español" }[locale], exact: true }).click();
  return state;
}
for (const locale of ["en", "fr", "es"] as const) {
  test(`${locale}: consent, secure saved attempt and pending payment at 320px`, async ({ page }, info) => {
    await page.setViewportSize({ width: 320, height: 740 }); const state = await setup(page, locale); const s = bookingStrings[locale];
    await page.getByLabel(s.name, { exact: true }).fill("Alice"); await page.getByLabel(s.email, { exact: true }).first().fill("guest@example.com");
    const submit = page.getByRole("button", { name: new RegExp(s.reserve.split("{amount}")[0]) });
    await submit.click(); await expect(page.getByRole("main").getByRole("alert")).toHaveText(s.required); expect(state.create).toBe(0);
    for (const button of await page.locator('header button').all()) {
      const box = await button.boundingBox(); expect(box).not.toBeNull(); expect(box!.x + box!.width).toBeLessThanOrEqual(320);
    }
    await page.screenshot({ path: info.outputPath(`form-${locale}.png`), fullPage: true });
    await page.getByRole("checkbox").check(); state.failCreate = true; await submit.click();
    await expect(page).toHaveURL(new RegExp(`/reservations/${id}`));
    await expect(page.getByText(s.holding, { exact: true })).toBeVisible();
    expect(await page.evaluate(id => Boolean(sessionStorage.getItem(`amourette-reservation:${id}`)), id)).toBe(true);
    expect(state.create).toBe(1); expect(state.qr).toBe(0);
    await page.reload(); await expect(page.getByRole("button", { name: s.resume })).toBeVisible(); expect(state.create).toBe(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath(`pending-${locale}.png`), fullPage: true });
  });
}
test("late cancellation acknowledgement and unsupported policy block payment", async ({ page }) => {
  const state = await setup(page); state.event.now = "2026-10-19T12:00:00Z"; await page.reload();
  await page.getByLabel("First name", { exact: true }).fill("Alice"); await page.getByLabel("Email address", { exact: true }).first().fill("guest@example.com");
  await page.getByLabel(bookingStrings.en.accept, { exact: false }).check();
  await page.getByRole("button", { name: /Reserve with/ }).click(); expect(state.create).toBe(0);
  await expect(page.getByRole("main").getByRole("alert")).toHaveText(bookingStrings.en.required);
  state.event.policy_version = "future-unpublished"; await page.reload();
  await expect(page.getByText(bookingStrings.en.policyUnknown)).toBeVisible(); await expect(page.getByRole("button", { name: /Reserve with/ })).toHaveCount(0);
});
test("full event waitlist is free, deduplicated by server, and handles released capacity", async ({ page }) => {
  const state = await setup(page); state.event.available = 0; await page.reload();
  await page.getByLabel("Email address", { exact: true }).first().fill("waiting@example.com"); await page.getByRole("button", { name: bookingStrings.en.waitlist, exact: true }).click();
  await expect(page.getByRole("status")).toHaveText(bookingStrings.en.waitlistDone); expect(state.create).toBe(0); expect(state.waitlist).toBe(1);
  await page.reload(); await expect(page.getByRole("button", { name: bookingStrings.en.waitlist, exact: true })).toBeVisible(); state.failWaitlist = true; state.event.available = 1;
  await page.getByLabel("Email address", { exact: true }).first().fill("waiting@example.com"); await page.getByRole("button", { name: bookingStrings.en.waitlist, exact: true }).click();
  await expect(page.getByRole("main").getByRole("alert")).toHaveText(bookingStrings.en.waitlistChanged); await expect(page.getByRole("button", { name: /Reserve with/ })).toBeVisible();
});
test("recovery does not confirm ownership and email proof requires an explicit action", async ({ page }) => {
  const state = await setup(page); await page.locator("summary").filter({ hasText: bookingStrings.en.recover }).click();
  await page.locator("details").getByLabel("Email address", { exact: true }).fill("unknown@example.com");
  await page.getByRole("button", { name: bookingStrings.en.recover, exact: true }).click();
  await expect(page.getByRole("status")).toHaveText(bookingStrings.en.recoverySent); expect(state.recovery).toBe(1);
  await page.goto(`/reservations/access#${id}.${"a".repeat(64)}`);
  await expect(page).toHaveURL(/\/reservations\/access$/); expect(state.exchange).toBe(0);
  await page.getByRole("button", { name: bookingStrings.en.openAccess }).click();
  await expect(page).toHaveURL(new RegExp(`/reservations/${id}`)); expect(state.exchange).toBe(1);
});
test("waitlist can retry after refusal without reloading", async ({ page }) => {
  const state = await setup(page); state.event.available = 0; state.failWaitlist = true; await page.reload();
  await page.getByLabel("Email address", { exact: true }).first().fill("waiting@example.com");
  const submit = page.getByRole("button", { name: bookingStrings.en.waitlist, exact: true });
  await submit.click(); await expect(page.getByRole("main").getByRole("alert")).toHaveText(bookingStrings.en.waitlistChanged);
  state.failWaitlist = false; await submit.click();
  await expect(page.getByRole("status")).toHaveText(bookingStrings.en.waitlistDone); expect(state.waitlist).toBe(2);
});
test("confirmed payment with unavailable QR keeps reference and recovery; invalid access clears QR", async ({ page }, info) => {
  const state = await setup(page); state.reservation.state = "confirmed"; state.reservation.payment_state = "paid";
  await page.evaluate(({ id, access }) => sessionStorage.setItem(`amourette-reservation:${id}`, JSON.stringify({ id, access, expires: Date.now() + 7 * 86400000 })), { id, access });
  await page.goto(`/reservations/${id}`); await expect(page.getByRole("heading", { name: bookingStrings.en.confirmed })).toBeVisible();
  await expect(page.getByText(bookingStrings.en.qrError)).toBeVisible(); await expect(page.getByText(id, { exact: true })).toBeVisible();
  state.qrUnavailable = false; await page.getByRole("button", { name: bookingStrings.en.refresh }).click();
  await expect(page.locator("figure img")).toBeVisible();
  await page.screenshot({ path: info.outputPath("confirmed.png"), fullPage: true });
  state.invalidAccess = true; await page.getByRole("button", { name: bookingStrings.en.refresh }).click();
  await expect(page.getByRole("main").getByRole("alert")).toHaveText(bookingStrings.en.accessExpired); await expect(page.locator("figure img")).toHaveCount(0);
});
test("walk-in invitation appears only for a valid closed evening", async ({ page }) => {
  const state = await setup(page); state.event.status = "closed"; state.event.walk_ins_possible = true; await page.reload();
  await expect(page.getByText(bookingStrings.en.walkin)).toBeVisible(); await expect(page.getByRole("button", { name: /Reserve with/ })).toHaveCount(0);
  state.event.status = "cancelled"; state.event.walk_ins_possible = false; await page.reload();
  await expect(page.getByText(bookingStrings.en.cancelled, { exact: true })).toBeVisible(); await expect(page.getByText(bookingStrings.en.walkin)).toHaveCount(0);
});

test("paid QR survives an exhausted shared event-read bucket", async ({ page }) => {
  const state = await setup(page); state.reservation.state = "confirmed"; state.reservation.payment_state = "paid";
  state.eventReadStatus = 429; state.qrUnavailable = false;
  await page.evaluate(({ id, access }) => sessionStorage.setItem(`amourette-reservation:${id}`, JSON.stringify({ id, access, expires: Date.now() + 7 * 86400000 })), { id, access });
  await page.goto(`/reservations/${id}`);
  await expect(page.locator("figure img")).toBeVisible(); expect(state.qr).toBe(1);
  await page.getByRole("button", { name: bookingStrings.en.refresh }).click();
  await expect.poll(() => state.qr).toBe(2); await expect(page.locator("figure img")).toBeVisible();
  // The private endpoint remains authoritative, even without event metadata.
  state.qrUnavailable = true; await page.getByRole("button", { name: bookingStrings.en.refresh }).click();
  await expect(page.getByText(bookingStrings.en.qrError)).toBeVisible(); await expect(page.locator("figure img")).toHaveCount(0);
});

test("pre-allocation refusal lets an interrupted draft accept the new late terms", async ({ page }) => {
  const state = await setup(page); state.failCreate = true; state.statusMissing = true;
  await page.getByLabel("First name", { exact: true }).fill("Alice");
  await page.getByLabel("Email address", { exact: true }).first().fill("guest@example.com");
  await page.getByRole("checkbox").check(); await page.getByRole("button", { name: /Reserve with/ }).click();
  await expect(page).toHaveURL(new RegExp(`/reservations/${id}`));
  state.event.now = "2026-10-19T12:00:00Z"; state.rejectCreate = "booking_refused";
  await page.getByRole("button", { name: bookingStrings.en.resume }).click();
  await expect(page).toHaveURL(new RegExp(`/events/${night}`));
  expect(await page.evaluate(id => sessionStorage.getItem(`amourette-reservation:${id}`), id)).toBeNull();
  await expect(page.getByRole("checkbox")).toHaveCount(2);
  state.rejectCreate = ""; state.failCreate = false; state.statusMissing = false;
  await page.getByLabel("First name", { exact: true }).fill("Alice");
  await page.getByLabel("Email address", { exact: true }).first().fill("guest@example.com");
  for (const checkbox of await page.getByRole("checkbox").all()) await checkbox.check();
  await page.getByRole("button", { name: /Reserve with/ }).click();
  await expect(page).toHaveURL(new RegExp(`/reservations/${id}`));
  expect(state.createInputs[0]).toMatchObject({ booking: { late_ack: false } });
  expect(state.createInputs.at(-1)).toMatchObject({ booking: { late_ack: true } });
});

for (const refusal of ["checkout_pending", "reservation_conflict"]) {
  test(`resume preserves the same draft after ${refusal}`, async ({ page }) => {
    const state = await setup(page); state.failCreate = true; state.statusMissing = true;
    await page.getByLabel("First name", { exact: true }).fill("Alice");
    await page.getByLabel("Email address", { exact: true }).first().fill("guest@example.com");
    await page.getByRole("checkbox").check(); await page.getByRole("button", { name: /Reserve with/ }).click();
    await expect(page).toHaveURL(new RegExp(`/reservations/${id}`));
    const original = await page.evaluate(id => sessionStorage.getItem(`amourette-reservation:${id}`), id);
    if (refusal === "reservation_conflict") state.rejectCreate = refusal;
    await page.getByRole("button", { name: bookingStrings.en.resume }).click();
    await expect.poll(() => state.create).toBe(2);
    await expect(page.getByRole("button", { name: bookingStrings.en.resume })).toBeEnabled();
    expect(await page.evaluate(id => sessionStorage.getItem(`amourette-reservation:${id}`), id)).toBe(original);
    expect(state.createInputs[1]).toEqual(state.createInputs[0]);
    await page.getByRole("button", { name: bookingStrings.en.newBooking }).click();
    await expect(page.getByRole("link", { name: bookingStrings.en.saved })).toBeVisible();
    await expect(page.getByRole("button", { name: /Reserve with/ })).toHaveCount(0);
  });
}
