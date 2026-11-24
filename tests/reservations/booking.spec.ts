import { test, expect, type Page } from "@playwright/test";
import { renderLaunchQr } from "@/lib/launch-qr";
import { bookingStrings } from "@/lib/booking-strings";
import { bookingReference, depositLabel } from "@/lib/booking";
import { cancellationStrings } from "@/lib/cancellation-strings";
import { cancellationInput } from "@/lib/launch-cancellation";
import { t, type Locale } from "@/lib/strings";

const night = "00000000-0000-4000-8000-000000000184";
const id = "00000000-0000-4000-8000-000000000185";
const access = `v1.${"a".repeat(120)}`;
const now = "2026-10-13T12:00:00Z";
const retainedAccept = (locale: Locale) => cancellationStrings[locale].retainedAccept.replace("{amount}", depositLabel(1000, "eur", locale));
async function setup(page: Page, locale: Locale = "en") {
  await page.clock.setFixedTime(new Date(now));
  const event = { night_id: night, venue_name: "Le Salon", city: "Paris", address: "12 rue de la Rencontre", timezone: "Europe/Paris", now,
    opens_at: "2026-10-12T12:00:00Z", closes_at: "2026-10-20T17:30:00Z", starts_at: "2026-10-20T18:00:00Z", ends_at: "2026-10-20T22:00:00Z", cancellation_deadline: "2026-10-18T18:00:00Z",
    amount_minor: 1000, currency: "eur", policy_version: "launch-v1", available: 1, status: "open", walk_ins_possible: false, registration_open: true };
  const reservation = { id, night_id: night, email: "guest@example.com", first_name: "Alice", locale, state: "holding", payment_state: "pending", hold_until: "2026-10-13T12:30:00Z", starts_at: event.starts_at, ends_at: event.ends_at, cancellation_deadline: event.cancellation_deadline, amount_minor: 1000, currency: "eur", refund_state: null as string | null, cancellation_refundable: null as boolean | null };
  const png = `data:image/png;base64,${(await renderLaunchQr("a".repeat(64))).toString("base64")}`;
  const state = { event, reservation, create: 0, createInputs: [] as unknown[], qr: 0, recovery: 0, exchange: 0, waitlist: 0, cancelLate: false, cancelUnknown: false, cancelLost: false, cancelCount: 0, cancelInputs: [] as unknown[], cancelPreviews: 0, failCreate: false, rejectCreate: "", statusMissing: false, eventReadStatus: 0, eventReads: 0, statusRefused: false, qrUnavailable: true, failWaitlist: false, invalidAccess: false, failExchange: false, supersededExchange: false, invalidExchange: false };
  if (process.env.E2E_BASE_URL && process.env.E2E_VERCEL_BYPASS) {
    const origin = new URL(process.env.E2E_BASE_URL).origin;
    await page.route(url => url.origin === origin, route => route.continue({ headers: { ...route.request().headers(), "x-vercel-protection-bypass": process.env.E2E_VERCEL_BYPASS! } }));
  }
  await page.route("**/auth/v1/**", route => route.abort());
  await page.route("**/rest/v1/**", route => route.abort());
  await page.route("**/api/launch/**", async route => {
    const request = route.request(); const path = new URL(request.url()).pathname;
    const reply = (data: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(data) });
    if (path.endsWith("/checkout") && request.method() === "GET") state.eventReads++;
    if (path.endsWith("/checkout") && request.method() === "GET") return state.eventReadStatus ? reply({ error: "request_refused" }, state.eventReadStatus) : reply(event);
    if (path.endsWith("/credentials")) return reply({ id, access });
    const body = request.postDataJSON() as Record<string, unknown>;
    if (path.endsWith("/checkout")) {
      expect(request.headers().authorization).toBe(`Bearer ${access}`);
      if (state.invalidAccess) return reply({ error: "invalid_access" }, 401);
      if (body.action === "status" && state.statusRefused) return reply({ error: "request_refused" }, 429);
      if (body.action === "status") return state.statusMissing ? reply({ error: "invalid_access" }, 401) : reply(reservation);
      state.create++; state.createInputs.push(body);
      if (state.rejectCreate) return reply({ error: state.rejectCreate }, 409);
      if (state.failCreate) return reply({ error: "checkout_pending" }, 503);
      return reply({ reservation, checkout_url: null, checkout_state: "pending" });
    }
    if (path.endsWith("/cancellation")) {
      expect(request.headers().authorization).toBe(`Bearer ${access}`);
      // Same body contract as the route, so a malformed preview or confirmation fails here too.
      try { cancellationInput(body); } catch { return reply({ error: "invalid_cancellation" }, 400); }
      if (body.action === "confirm") {
        state.cancelCount++; state.cancelInputs.push(body);
        if (state.cancelLost) return reply({error:"cancellation_unknown"},503);
        if (state.cancelUnknown) { reservation.state = "cancelled"; reservation.refund_state = "queued"; return reply({error:"cancellation_unknown"},503); }
        if (!state.cancelLate || body.accept_retained || reservation.refund_state) { reservation.state = "cancelled"; reservation.cancellation_refundable = !state.cancelLate; reservation.refund_state = reservation.refund_state ?? (state.cancelLate ? null : "queued"); }
      } else state.cancelPreviews++;
      return reply({reservation,now,timezone:event.timezone,refundable:!state.cancelLate,can_cancel:reservation.state === "confirmed",confirmation_required:body.action === "confirm" && state.cancelLate && !body.accept_retained && !reservation.refund_state});
    }
    if (path.endsWith("/arrival-qr")) {
      state.qr++;
      return state.qrUnavailable ? reply({ error: "arrival_unavailable" }, 409) : reply({ reservation_id: id, night_id: night, starts_at: event.starts_at, ends_at: event.ends_at, timezone: event.timezone, verified_at: null, png_data_url: png });
    }
    if (path.endsWith("/access")) {
      if (body.action === "request") { state.recovery++; return reply({ accepted: true }, 202); }
      state.exchange++; if (state.invalidExchange) return reply({ error: "invalid_access" }, 401); if (state.supersededExchange) return reply({ error: "superseded_access" }, 401); return state.failExchange ? reply({ error: "access_unavailable" }, 503) : reply({ id, access });
    }
    if (path.endsWith("/waitlist")) { state.waitlist++; return state.failWaitlist ? reply({ error: "waitlist_unavailable" }, 409) : reply({ accepted: true }); }
    throw Error(`Unexpected booking request: ${path}`);
  });
  await page.goto(`/events/${night}`);
  await expect(page.getByRole("heading", { name: "Le Salon" })).toBeVisible();
  await page.getByRole("button", { name: { en: "English", fr: "Français", es: "Español" }[locale], exact: true }).click();
  return state;
}
test("a created hold leaves for Stripe Checkout by top-level navigation, without a referrer", async ({ page }) => {
  // #377: security headers must not stop the payment hand-off. Stripe is stubbed;
  // nothing is paid and no request leaves the machine.
  const state = await setup(page); const s = bookingStrings.en;
  const checkout = "https://checkout.stripe.com/c/pay/cs_test_security_headers";
  await page.route("**/api/launch/checkout", async route => {
    const request = route.request();
    if (request.method() !== "POST" || (request.postDataJSON() as { action?: string }).action === "status") return route.fallback();
    state.create++;
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ reservation: state.reservation, checkout_url: checkout, checkout_state: "open" }) });
  });
  const stripe: { url: string; referer?: string; navigation: boolean }[] = [];
  await page.route("https://checkout.stripe.com/**", route => {
    stripe.push({ url: route.request().url(), referer: route.request().headers().referer, navigation: route.request().isNavigationRequest() });
    return route.fulfill({ status: 200, contentType: "text/html", body: "<!doctype html><title>Stripe Checkout stub</title><h1>Stripe Checkout stub</h1>" });
  });
  await page.getByLabel(s.name, { exact: true }).fill("Alice"); await page.getByLabel(s.email, { exact: true }).first().fill("guest@example.com");
  await page.getByRole("radio", { name: t.en.genders.woman, exact: true }).check(); await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: new RegExp(s.reserve.split("{amount}")[0]) }).click();
  await expect(page).toHaveURL(checkout);
  await expect(page.getByRole("heading", { name: "Stripe Checkout stub" })).toBeVisible();
  expect(state.create).toBe(1);
  expect(stripe).toEqual([{ url: checkout, referer: undefined, navigation: true }]);
});

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
    // #354: gender is required; a missing answer is refused before any booking effect.
    await expect(page.getByRole("main").getByRole("alert")).toHaveText(s.needGender); expect(state.create).toBe(0);
    // #405: the refusal is in view and the three choices share one row.
    await expect(page.getByRole("main").getByRole("alert")).toBeInViewport({ ratio: 1 });
    expect(new Set(await Promise.all((await page.getByRole("radio").all()).map(async radio => Math.round((await radio.locator("..").boundingBox())!.y)))).size).toBe(1);
    await expect(page.getByRole("radiogroup", { name: s.gender })).toContainText(s.genderHelp);
    await expect(page.getByRole("radiogroup", { name: s.gender })).toHaveAttribute("aria-required", "true");
    await expect(page.getByRole("radio")).toHaveCount(3);
    await page.getByRole("radio", { name: t[locale].genders.nonbinary, exact: true }).check();
    for (const choice of await page.getByRole("radio").all()) {
      const box = await choice.locator("..").boundingBox(); expect(box).not.toBeNull(); expect(box!.height).toBeGreaterThanOrEqual(44); expect(box!.x + box!.width).toBeLessThanOrEqual(320);
    }
    await page.getByRole("radio", { name: t[locale].genders.woman, exact: true }).check(); await submit.click();
    await expect(page).toHaveURL(new RegExp(`/reservations/${id}`));
    expect(state.createInputs[0]).toMatchObject({ booking: { gender: "woman" } });
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
test("recovery does not confirm ownership and a visible email link opens the reservation by itself", async ({ page }) => {
  const state = await setup(page); await page.locator("summary").filter({ hasText: bookingStrings.en.recover }).click();
  await page.locator("details").getByLabel("Email address", { exact: true }).fill("unknown@example.com");
  await page.getByRole("button", { name: bookingStrings.en.recover, exact: true }).click();
  await expect(page.getByRole("status")).toHaveText(bookingStrings.en.recoverySent); expect(state.recovery).toBe(1);
  await page.goto(`/reservations/access#${id}.${"a".repeat(64)}`);
  await expect(page).toHaveURL(new RegExp(`/reservations/${id}$`)); expect(state.exchange).toBe(1);
  await expect(page.getByText(bookingStrings.en.holding, { exact: true })).toBeVisible();
});
// #405: the automatic exchange must not hand the credential rotation to a prefetcher,
// and the button remains when the automatic attempt fails.
test("an email link exchanges nothing while the page is hidden and keeps the button as a fallback", async ({ page }) => {
  const state = await setup(page);
  await page.addInitScript(() => {
    let visible = false;
    Object.defineProperty(document, "visibilityState", { get: () => visible ? "visible" : "hidden" });
    Object.assign(window, { showPage: () => { visible = true; document.dispatchEvent(new Event("visibilitychange")); } });
  });
  state.failExchange = true;
  await page.goto(`/reservations/access#${id}.${"a".repeat(64)}`);
  await expect(page.getByText(bookingStrings.en.opening)).toBeVisible();
  // The fragment leaves the address bar before any exchange.
  await expect(page).toHaveURL(/\/reservations\/access$/); await page.waitForTimeout(500); expect(state.exchange).toBe(0);
  await page.evaluate(() => (window as unknown as { showPage: () => void }).showPage());
  await expect(page.getByRole("main").getByRole("alert")).toHaveText(bookingStrings.en.error); expect(state.exchange).toBe(1);
  state.failExchange = false; await page.getByRole("button", { name: bookingStrings.en.openAccess }).click();
  await expect(page).toHaveURL(new RegExp(`/reservations/${id}$`)); expect(state.exchange).toBe(2);
});
test("a replaced email link says to use the most recent email and offers no retry", async ({ page }) => {
  const state = await setup(page); state.supersededExchange = true;
  await page.goto(`/reservations/access#${id}.${"a".repeat(64)}`);
  await expect(page.getByRole("main").getByRole("alert")).toHaveText(bookingStrings.en.accessSuperseded); expect(state.exchange).toBe(1);
  // Nothing contradicts the message: no retry on the replaced proof, no prompt to request yet another link.
  await expect(page.getByRole("button", { name: bookingStrings.en.openAccess })).toHaveCount(0);
  for (const text of [bookingStrings.en.accessExpired, bookingStrings.en.accessIntro, bookingStrings.en.recoveryEntry]) await expect(page.getByText(text)).toHaveCount(0);
});
test("a refused email link keeps the generic wording and the fallback", async ({ page }) => {
  const state = await setup(page); state.invalidExchange = true;
  await page.goto(`/reservations/access#${id}.${"a".repeat(64)}`);
  await expect(page.getByRole("main").getByRole("alert")).toHaveText(bookingStrings.en.accessExpired);
  await expect(page.getByRole("button", { name: bookingStrings.en.openAccess })).toBeVisible(); await expect(page.getByText(bookingStrings.en.recoveryEntry)).toBeVisible();
});
test("an email link without a valid proof exchanges nothing", async ({ page }) => {
  const state = await setup(page);
  await page.goto(`/reservations/access#${id}.not-a-token`);
  // #476: a page without its link (opened elsewhere, reloaded) sends the guest back to the email, not to "expired".
  await expect(page.getByText(bookingStrings.en.accessReopen)).toBeVisible(); await expect(page.getByRole("button", { name: bookingStrings.en.openAccess })).toHaveCount(0);
  expect(state.exchange).toBe(0);
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
  await expect(page.getByText(bookingStrings.en.qrError)).toBeVisible(); await expect(page.getByText(bookingReference(id), { exact: true })).toBeVisible();
  // #405: the raw identifier sits in the help area, and recovery is not offered on an open reservation.
  await expect(page.getByText(id, { exact: true })).toBeHidden(); await page.getByText(bookingStrings.en.help, { exact: true }).click(); await expect(page.getByText(id, { exact: true })).toBeVisible();
  await expect(page.getByText(bookingStrings.en.recover, { exact: true })).toHaveCount(0);
  state.qrUnavailable = false; await page.getByRole("button", { name: bookingStrings.en.refresh }).click();
  await expect(page.locator("figure img")).toBeVisible();
  // #405: the QR comes before the reservation details.
  expect((await page.locator("figure img").boundingBox())!.y).toBeLessThan((await page.locator("dl").boundingBox())!.y);
  await page.screenshot({ path: info.outputPath("confirmed.png"), fullPage: true });
  state.invalidAccess = true; await page.getByRole("button", { name: bookingStrings.en.refresh }).click();
  await expect(page.locator("figure img")).toHaveCount(0);
  // #476: a refused access on a paid reservation offers no payment to continue, and sends the guest back to the email.
  await expect(page.getByRole("button", { name: bookingStrings.en.resume })).toHaveCount(0);
  await expect(page.getByRole("main").getByRole("alert")).toHaveText(bookingStrings.en.accessReopen);
  await expect(page.getByText(bookingStrings.en.recoveryEntry)).toBeVisible();
  // Also after the tab is reloaded, as Safari does when it restores a tab at the door.
  await page.reload(); await expect(page.getByRole("main").getByRole("alert")).toHaveText(bookingStrings.en.accessReopen);
  await expect(page.getByRole("button", { name: bookingStrings.en.resume })).toHaveCount(0);
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

// #400: found in the reservation rehearsal, where a rate refusal hid the arrival QR.
test("a refused status keeps the loaded QR, reads the event once and ignores repeated refresh taps", async ({ page }) => {
  const state = await setup(page); state.reservation.state = "confirmed"; state.reservation.payment_state = "paid"; state.qrUnavailable = false;
  await page.evaluate(({ id, access }) => sessionStorage.setItem(`amourette-reservation:${id}`, JSON.stringify({ id, access, expires: Date.now() + 7 * 86400000 })), { id, access });
  state.eventReads = 0; await page.goto(`/reservations/${id}`);
  await expect(page.locator("figure img")).toBeVisible(); await expect(page.getByRole("heading", { name: "Le Salon" })).toBeVisible();
  const refresh = page.getByRole("button", { name: bookingStrings.en.refresh });
  await refresh.click(); await expect.poll(() => state.qr).toBe(2); await expect(refresh).toBeEnabled();
  // Returning to the tab reloads the status and QR, never the event details.
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange"))); await expect.poll(() => state.qr).toBe(3);
  expect(state.eventReads).toBe(1);
  let release!: () => void; const barrier = new Promise<void>(resolve => { release = resolve; }); let statusReads = 0;
  await page.route("**/api/launch/checkout", async route => { if (route.request().method() === "POST") { statusReads++; await barrier; } await route.fallback(); });
  state.statusRefused = true; await refresh.click();
  const waiting = page.getByRole("button", { name: bookingStrings.en.loading });
  await expect(waiting).toBeDisabled(); await expect(waiting).toHaveAttribute("aria-busy", "true"); await waiting.click({ force: true }); await waiting.dispatchEvent("click");
  release();
  await expect(page.getByRole("main").getByRole("alert")).toHaveText(bookingStrings.en.rate);
  await expect(page.locator("figure img")).toBeVisible(); await expect(page.getByRole("heading", { name: bookingStrings.en.confirmed })).toBeVisible();
  await expect(refresh).toBeEnabled(); expect(statusReads).toBe(1); expect(state.eventReads).toBe(1);
});
test("a refused status after the payment window closed leaves no stale resume", async ({ page }) => {
  const state = await setup(page);
  await page.evaluate(({ id, access }) => sessionStorage.setItem(`amourette-reservation:${id}`, JSON.stringify({ id, access, expires: Date.now() + 7 * 86400000 })), { id, access });
  await page.goto(`/reservations/${id}`);
  const resume = page.getByRole("button", { name: bookingStrings.en.resume });
  await expect(resume).toBeVisible();
  // While the window is open, a refusal keeps the way back to payment.
  state.statusRefused = true; await page.getByRole("button", { name: bookingStrings.en.refresh }).click();
  await expect(page.getByRole("main").getByRole("alert")).toHaveText(bookingStrings.en.rate); await expect(resume).toBeVisible();
  await page.clock.setFixedTime(new Date("2026-10-13T12:31:00Z"));
  await page.getByRole("button", { name: bookingStrings.en.refresh }).click();
  await expect(resume).toHaveCount(0); await expect(page.getByRole("main").getByRole("alert")).toHaveText(bookingStrings.en.rate);
  await expect(page.getByText(bookingReference(id), { exact: true })).toBeVisible();
});

test("pre-allocation refusal lets an interrupted draft accept the new late terms", async ({ page }) => {
  const state = await setup(page); state.failCreate = true; state.statusMissing = true;
  await page.getByLabel("First name", { exact: true }).fill("Alice");
  await page.getByLabel("Email address", { exact: true }).first().fill("guest@example.com");
  await page.getByRole("radio", { name: "Man", exact: true }).check();
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
  await page.getByRole("radio", { name: "Man", exact: true }).check();
  for (const checkbox of await page.getByRole("checkbox").all()) await checkbox.check();
  await page.getByRole("button", { name: /Reserve with/ }).click();
  await expect(page).toHaveURL(new RegExp(`/reservations/${id}`));
  expect(state.createInputs[0]).toMatchObject({ booking: { late_ack: false, gender: "man" } });
  expect(state.createInputs.at(-1)).toMatchObject({ booking: { late_ack: true, gender: "man" } });
});

test("a connection at its unpaid-hold limit is told to finish a pending payment and keeps no draft", async ({ page }, testInfo) => {
  const state = await setup(page); state.rejectCreate = "payment_pending_limit";
  await page.getByLabel("First name", { exact: true }).fill("Alice");
  await page.getByLabel("Email address", { exact: true }).first().fill("guest@example.com");
  await page.getByRole("radio", { name: "Woman", exact: true }).check();
  await page.getByRole("checkbox").check(); await page.getByRole("button", { name: /Reserve with/ }).click();
  const refusal = page.getByRole("alert").filter({ hasText: bookingStrings.en.holdLimit });
  await expect(refusal).toBeVisible();
  // #405: the refusal sits just above the action that caused it and is brought into view.
  await expect(refusal).toBeInViewport({ ratio: 1 });
  const submit = await page.getByRole("button", { name: /Reserve with/ }).boundingBox(); const alert = await refusal.boundingBox();
  expect(alert!.y + alert!.height).toBeLessThanOrEqual(submit!.y); expect(submit!.y - (alert!.y + alert!.height)).toBeLessThan(40);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("hold-limit.png"), fullPage: true });
  await expect(page).toHaveURL(new RegExp(`/events/${night}`));
  expect(await page.evaluate(id => sessionStorage.getItem(`amourette-reservation:${id}`), id)).toBeNull();
  expect(state.create).toBe(1);
});

for (const refusal of ["checkout_pending", "reservation_conflict"]) {
  test(`resume preserves the same draft after ${refusal}`, async ({ page }) => {
    const state = await setup(page); state.failCreate = true; state.statusMissing = true;
    await page.getByLabel("First name", { exact: true }).fill("Alice");
    await page.getByLabel("Email address", { exact: true }).first().fill("guest@example.com");
    await page.getByRole("radio", { name: "Woman", exact: true }).check();
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

for (const locale of ["en", "fr", "es"] as const) test(`cancellation reconfirms a crossed deadline and clears the QR (${locale})`, async ({page},info) => {
  const state=await setup(page,locale);state.reservation.state="confirmed";state.reservation.payment_state="paid";state.qrUnavailable=false;
  await page.setViewportSize({width:320,height:850});
  await page.evaluate(({id,access})=>sessionStorage.setItem(`amourette-reservation:${id}`,JSON.stringify({id,access,expires:Date.now()+7*86400000})),{id,access});
  await page.goto(`/reservations/${id}`);const s=cancellationStrings[locale];
  await expect(page.locator("figure img")).toBeVisible();
  await page.getByRole("button",{name:s.title,exact:true}).click();
  await expect(page.getByRole("button",{name:s.confirm,exact:true})).toBeVisible();expect(state.cancelCount).toBe(0);
  await page.getByRole("button",{name:s.keep,exact:true}).click();expect(state.reservation.state).toBe("confirmed");
  // The free preview must land before the deadline crosses, or it would already be a late one.
  await page.getByRole("button",{name:s.title,exact:true}).click();await expect(page.getByRole("button",{name:s.confirm,exact:true})).toBeEnabled();state.cancelLate=true;
  await page.getByRole("button",{name:s.confirm,exact:true}).click();
  await expect(page.getByText(s.crossed)).toBeVisible();expect(state.reservation.state).toBe("confirmed");
  await page.screenshot({path:info.outputPath("cancellation-deadline.png"),fullPage:true});
  // #401: the crossed deadline asks for consent again, and a second tap alone is not consent.
  await expect(page.getByRole("button",{name:s.confirm,exact:true})).toBeDisabled();
  await page.getByRole("checkbox",{name:retainedAccept(locale)}).check();
  await page.getByRole("button",{name:s.confirm,exact:true}).click();
  await expect(page.getByRole("heading",{name:bookingStrings[locale].reservationCancelled})).toBeVisible();
  await expect(page.locator("figure img")).toHaveCount(0);await expect(page.getByText(s.retainedOutcome)).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
// #401: two quick taps on the same spot forfeited the deposit during the launch rehearsal.
for (const locale of ["en", "fr", "es"] as const) test(`late cancellation is refused until the retained deposit is acknowledged (${locale})`, async ({page}) => {
  const state=await setup(page,locale);state.reservation.state="confirmed";state.reservation.payment_state="paid";state.cancelLate=true;
  await page.setViewportSize({width:320,height:850});
  await page.evaluate(({id,access})=>sessionStorage.setItem(`amourette-reservation:${id}`,JSON.stringify({id,access,expires:Date.now()+7*86400000})),{id,access});
  await page.goto(`/reservations/${id}`);const s=cancellationStrings[locale];
  const open=page.getByRole("button",{name:s.title,exact:true}),confirm=page.getByRole("button",{name:s.confirm,exact:true}),ack=page.getByRole("checkbox",{name:retainedAccept(locale)});
  await open.click();
  await expect(confirm).toBeDisabled();await expect(ack).not.toBeChecked();
  // Dispatched taps bypass Playwright's wait for an enabled control, as a real finger does.
  await confirm.dispatchEvent("click");await confirm.dispatchEvent("click");
  await expect(confirm).toBeDisabled();expect(state.cancelCount).toBe(0);expect(state.reservation.state).toBe("confirmed");
  // Leaving the confirmation discards the acknowledgement.
  await ack.check();await page.getByRole("button",{name:s.keep,exact:true}).click();await open.click();
  await expect(ack).not.toBeChecked();await expect(confirm).toBeDisabled();
  await ack.check();await confirm.click();
  await expect(page.getByRole("heading",{name:bookingStrings[locale].reservationCancelled})).toBeVisible();
  await expect(page.getByText(s.retainedOutcome)).toBeVisible();
  expect(state.cancelCount).toBe(1);expect(state.cancelInputs).toEqual([{action:"confirm",accept_retained:true}]);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test("lost cancellation response requires readback and never submits another cancellation blindly",async({page})=>{
  const state=await setup(page);state.reservation.state="confirmed";state.reservation.payment_state="paid";state.qrUnavailable=false;
  await page.evaluate(({id,access})=>sessionStorage.setItem(`amourette-reservation:${id}`,JSON.stringify({id,access,expires:Date.now()+7*86400000})),{id,access});
  await page.goto(`/reservations/${id}`);const s=cancellationStrings.en;
  await page.getByRole("button",{name:s.title,exact:true}).click();state.cancelUnknown=true;
  await page.getByRole("button",{name:s.confirm,exact:true}).click();
  await expect(page.getByText(s.unknown)).toBeVisible();await expect(page.locator("figure img")).toHaveCount(0);await expect(page.getByRole("button",{name:s.confirm,exact:true})).toHaveCount(0);
  await page.getByRole("button",{name:s.refresh,exact:true}).click();
  await expect(page.getByRole("heading",{name:bookingStrings.en.reservationCancelled})).toBeVisible();expect(state.cancelCount).toBe(1);
});

// #405: "Check current reservation" read like a second cancel prompt.
test("checking after an uncertain cancellation reports a still-active reservation without reopening the confirmation",async({page})=>{
  const state=await setup(page);state.reservation.state="confirmed";state.reservation.payment_state="paid";state.qrUnavailable=false;
  await page.evaluate(({id,access})=>sessionStorage.setItem(`amourette-reservation:${id}`,JSON.stringify({id,access,expires:Date.now()+7*86400000})),{id,access});
  await page.goto(`/reservations/${id}`);const s=cancellationStrings.en;
  await page.getByRole("button",{name:s.title,exact:true}).click();state.cancelLost=true;
  await page.getByRole("button",{name:s.confirm,exact:true}).click();
  await expect(page.getByText(s.unknown)).toBeVisible();
  await page.getByRole("button",{name:s.refresh,exact:true}).click();
  await expect(page.getByText(s.stillActive)).toBeVisible();await expect(page.getByRole("button",{name:s.confirm,exact:true})).toHaveCount(0);
  await expect(page.getByText(s.unknown)).toHaveCount(0);await expect(page.locator("figure img")).toBeVisible();
  await expect(page.getByRole("button",{name:s.title,exact:true})).toBeVisible();expect(state.cancelCount).toBe(1);
});

// #402: the rehearsal confirmed offline, then restored the network. The page's own
// background reload must not bring the QR back while the cancellation is unchecked.
for (const committed of [false, true]) test(`an offline cancellation keeps the QR hidden until the check (${committed ? "committed" : "not committed"})`,async({page})=>{
  const state=await setup(page);state.reservation.state="confirmed";state.reservation.payment_state="paid";state.qrUnavailable=false;
  await page.evaluate(({id,access})=>sessionStorage.setItem(`amourette-reservation:${id}`,JSON.stringify({id,access,expires:Date.now()+7*86400000})),{id,access});
  await page.goto(`/reservations/${id}`);const s=cancellationStrings.en;const qr=page.locator("figure img");
  await expect(qr).toBeVisible();await page.getByRole("button",{name:s.title,exact:true}).click();
  // Committed: the server applied the cancellation and only the answer was lost.
  // Not committed: the request dies on the device, as in airplane mode.
  if (committed) state.cancelUnknown=true;
  else await page.route("**/api/launch/cancellation",route=>(route.request().postDataJSON() as {action?:string}).action==="confirm"?route.abort("internetdisconnected"):route.fallback());
  await page.getByRole("button",{name:s.confirm,exact:true}).click();
  await expect(page.getByText(s.unknown)).toBeVisible();await expect(qr).toHaveCount(0);
  const qrReads=state.qr;const statusRead=page.waitForResponse(r=>r.url().endsWith("/api/launch/checkout")&&r.request().method()==="POST");
  // Back online: the browser fires `online` and the page reloads the reservation status.
  await page.evaluate(()=>window.dispatchEvent(new Event("online")));
  await statusRead;
  if (committed) {
    await expect(page.getByRole("heading",{name:bookingStrings.en.reservationCancelled})).toBeVisible();
  } else {
    await expect(page.getByRole("button",{name:s.refresh,exact:true})).toBeVisible();
    // Nothing after the status read may show the QR before the check.
    await page.waitForLoadState("networkidle");
  }
  await expect(qr).toHaveCount(0);expect(state.qr).toBe(qrReads);
  if (!committed) {
    await page.getByRole("button",{name:s.refresh,exact:true}).click();
    await expect(page.getByText(s.stillActive)).toBeVisible();await expect(qr).toBeVisible();
  }
  expect(state.cancelCount).toBe(committed?1:0);
});

test("a QR response started before cancellation cannot restore the revoked QR",async({page})=>{
  const state=await setup(page);state.reservation.state="confirmed";state.reservation.payment_state="paid";state.qrUnavailable=false;
  let release!:()=>void;const barrier=new Promise<void>(resolve=>{release=resolve;});let requested=false; let delivered!:()=>void; const delivery=new Promise<void>(resolve=>{delivered=resolve;});
  await page.route("**/api/launch/arrival-qr",async route=>{
    requested=true;await barrier;
    try { await route.fulfill({status:200,contentType:"application/json",body:JSON.stringify({reservation_id:id,night_id:night,starts_at:state.event.starts_at,ends_at:state.event.ends_at,timezone:state.event.timezone,verified_at:null,png_data_url:`data:image/png;base64,${(await renderLaunchQr("a".repeat(64))).toString("base64")}`})}); } finally { delivered(); }
  });
  await page.evaluate(({id,access})=>sessionStorage.setItem(`amourette-reservation:${id}`,JSON.stringify({id,access,expires:Date.now()+7*86400000})),{id,access});
  await page.goto(`/reservations/${id}`);await expect.poll(()=>requested).toBe(true);
  await page.getByRole("button",{name:cancellationStrings.en.title,exact:true}).click();
  await page.getByRole("button",{name:cancellationStrings.en.confirm,exact:true}).click();
  await expect(page.getByRole("heading",{name:bookingStrings.en.reservationCancelled})).toBeVisible();
  release();await delivery;
  await expect(page.locator("figure img")).toHaveCount(0);
});

test("cancellation describes and preserves an existing exceptional refund",async({page})=>{
  const state=await setup(page);state.reservation.state="confirmed";state.reservation.payment_state="paid";state.reservation.refund_state="succeeded";state.cancelLate=true;
  await page.evaluate(({id,access})=>sessionStorage.setItem(`amourette-reservation:${id}`,JSON.stringify({id,access,expires:Date.now()+7*86400000})),{id,access});
  await page.goto(`/reservations/${id}`);const s=cancellationStrings.en;
  await page.getByRole("button",{name:s.title,exact:true}).click();await expect(page.getByText(s.existingRefund)).toBeVisible();
  await page.getByRole("button",{name:s.confirm,exact:true}).click();
  await expect(page.getByRole("heading",{name:bookingStrings.en.reservationCancelled})).toBeVisible();
  await expect(page.getByText(bookingStrings.en.refundDone)).toBeVisible();expect(state.cancelCount).toBe(1);
});

test("keeping a reservation after the deadline crossing restores its authorized QR",async({page})=>{
  const state=await setup(page);state.reservation.state="confirmed";state.reservation.payment_state="paid";state.qrUnavailable=false;
  await page.evaluate(({id,access})=>sessionStorage.setItem(`amourette-reservation:${id}`,JSON.stringify({id,access,expires:Date.now()+7*86400000})),{id,access});
  await page.goto(`/reservations/${id}`);const s=cancellationStrings.en;
  await expect(page.locator("figure img")).toBeVisible();
  await page.getByRole("button",{name:s.title,exact:true}).click();
  await expect(page.getByRole("button",{name:s.confirm,exact:true})).toBeEnabled();state.cancelLate=true;await page.getByRole("button",{name:s.confirm,exact:true}).click();
  await expect(page.getByText(s.crossed)).toBeVisible();
  await page.getByRole("button",{name:s.keep,exact:true}).click();
  await expect(page.locator("figure img")).toBeVisible();
  await expect(page.getByRole("heading",{name:bookingStrings.en.confirmed})).toBeVisible();expect(state.cancelCount).toBe(1);
});

test("opening cancellation preview during initial QR loading retries authorized delivery",async({page})=>{
  const state=await setup(page);state.reservation.state="confirmed";state.reservation.payment_state="paid";state.qrUnavailable=false;
  let release!:()=>void;const barrier=new Promise<void>(resolve=>{release=resolve;});let requests=0;
  await page.route("**/api/launch/arrival-qr",async route=>{
    if (++requests===1) await barrier;
    await route.fallback();
  });
  await page.evaluate(({id,access})=>sessionStorage.setItem(`amourette-reservation:${id}`,JSON.stringify({id,access,expires:Date.now()+7*86400000})),{id,access});
  try {
    await page.goto(`/reservations/${id}`);await expect.poll(()=>requests).toBe(1);
    await page.getByRole("button",{name:cancellationStrings.en.title,exact:true}).click();
    await expect(page.locator("figure img")).toBeVisible();expect(requests).toBe(2);expect(state.cancelCount).toBe(0);
  } finally {release();}
});

for (const [payment,refundable,retained] of [["unpaid",true,false],["pending",true,false],["paid",true,false],["paid",null,false],["paid",false,true]] as const) {
  test(`retained deposit requires paid late cancellation (${payment}, ${refundable})`,async({page})=>{
    const state=await setup(page);state.reservation.state="cancelled";state.reservation.payment_state=payment;state.reservation.cancellation_refundable=refundable;
    await page.evaluate(({id,access})=>sessionStorage.setItem(`amourette-reservation:${id}`,JSON.stringify({id,access,expires:Date.now()+7*86400000})),{id,access});
    await page.goto(`/reservations/${id}`);await expect(page.getByRole("heading",{name:bookingStrings.en.reservationCancelled})).toBeVisible();
    await expect(page.getByText(cancellationStrings.en.retainedOutcome)).toHaveCount(retained?1:0);
  });
}

// #405: found in the reservation rehearsal on a phone.
test("the form waits in place until Checkout opens, without showing the saved-attempt prompt", async ({ page }) => {
  const state = await setup(page);
  let release!: () => void; const barrier = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/api/launch/checkout", async route => { if (route.request().method() === "POST") await barrier; await route.fallback(); });
  await page.getByLabel("First name", { exact: true }).fill("Alice"); await page.getByLabel("Email address", { exact: true }).first().fill("guest@example.com");
  await page.getByRole("radio", { name: "Woman", exact: true }).check(); await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: /Reserve with/ }).click();
  const waiting = page.getByRole("button", { name: bookingStrings.en.submitting });
  await expect(waiting).toBeDisabled(); await expect(waiting).toHaveAttribute("aria-busy", "true");
  expect(await page.evaluate(id => Boolean(sessionStorage.getItem(`amourette-reservation:${id}`)), id)).toBe(true);
  await expect(page.getByRole("link", { name: bookingStrings.en.saved })).toHaveCount(0);
  await expect(page.getByLabel("First name", { exact: true })).toBeVisible();
  release(); await expect(page).toHaveURL(new RegExp(`/reservations/${id}`)); expect(state.create).toBe(1);
});

test("the event page opens on the form and names the venue zone only for a device in another one", async ({ page, browser }) => {
  await page.setViewportSize({ width: 393, height: 852 }); await setup(page);
  await expect(page.getByLabel("First name", { exact: true })).toBeInViewport({ ratio: 1 });
  await expect(page.getByRole("main")).not.toContainText("Paris time");
  // The number of places left is not shown; the deposit terms read as two short rows.
  await expect(page.getByRole("main")).not.toContainText(/places/i);
  await expect(page.getByRole("listitem").filter({ hasText: "€10.00 deposit" })).toContainText("refunded when you arrive");
  await expect(page.getByRole("listitem").filter({ hasText: "Free cancellation" })).toContainText("until");
  const context = await browser.newContext({ timezoneId: "America/New_York", locale: "en-US" }); const abroad = await context.newPage();
  try {
    await setup(abroad);
    await expect(abroad.getByText("Tuesday, October 20 · 8:00 PM – 12:00 AM (Paris time)")).toBeVisible();
    await expect(abroad.getByText("at 8:00 PM (Paris time)")).toBeVisible();
  } finally { await context.close(); }
});

// #439: a free-cancellation deadline that has passed is stated as over, never printed as a date.
const cancellationOver = { en: ["Free cancellation", "no longer possible for this evening"], fr: ["Annulation gratuite", "plus possible pour cette soirée"], es: ["Cancelación gratuita", "ya no es posible para esta noche"] } as const;
for (const locale of ["en", "fr", "es"] as const) test(`${locale}: a passed free-cancellation deadline is stated as over on the reservation and never offered on the event page`, async ({ page }, info) => {
  await page.setViewportSize({ width: 393, height: 852 }); const state = await setup(page, locale); const [lead, over] = cancellationOver[locale];
  state.reservation.state = "confirmed"; state.reservation.payment_state = "paid";
  await page.evaluate(({ id, access }) => sessionStorage.setItem(`amourette-reservation:${id}`, JSON.stringify({ id, access, expires: Date.now() + 7 * 86400000 })), { id, access });
  const row = page.locator("dl > div").filter({ hasText: lead }); const pledge = page.getByRole("listitem").filter({ hasText: lead });
  const date = { en: /October 18, 2026.+8:00/, fr: /18 octobre 2026.+20:00/, es: /18 de octubre de 2026.+20:00/ }[locale];
  // Up to the deadline instant included, both pages print the venue-local deadline.
  for (const instant of [now, state.event.cancellation_deadline]) {
    state.event.now = instant; await page.goto(`/reservations/${id}`);
    await expect.soft(row).toContainText(date); await expect.soft(row).not.toContainText(over);
  }
  await page.goto(`/events/${night}`); await expect.soft(pledge).toContainText(date); await expect.soft(pledge).not.toContainText(over);
  // One second later the date is gone from both.
  state.event.now = "2026-10-18T18:00:01Z"; await page.goto(`/reservations/${id}`);
  await expect(row).toBeVisible(); await row.scrollIntoViewIfNeeded(); await page.screenshot({ path: info.outputPath(`late-reservation-${locale}.png`) });
  await expect.soft(row).toContainText(over); await expect.soft(row).not.toContainText(/\d/);
  await page.goto(`/events/${night}`); await expect(page.getByRole("heading", { name: "Le Salon" })).toBeVisible();
  // No checked "Free cancellation" row, which would read as a benefit: the late notice alone speaks.
  const notice = page.getByText(bookingStrings[locale].late, { exact: true }); await expect(notice).toBeVisible(); await notice.scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath(`late-event-${locale}.png`) });
  await expect.soft(pledge).toHaveCount(0); await expect.soft(page.getByRole("main")).not.toContainText(over);
});
for (const refused of [false, true]) test(`a reservation left open across the free-cancellation deadline reads the event exactly once more (${refused ? "refused" : "answered"})`, async ({ page }) => {
  const state = await setup(page); state.reservation.state = "confirmed"; state.reservation.payment_state = "paid"; state.qrUnavailable = false;
  await page.evaluate(({ id, access }) => sessionStorage.setItem(`amourette-reservation:${id}`, JSON.stringify({ id, access, expires: Date.now() + 7 * 86400000 })), { id, access });
  state.eventReads = 0; await page.goto(`/reservations/${id}`);
  const row = page.locator("dl > div").filter({ hasText: "Free cancellation" }); const refresh = page.getByRole("button", { name: bookingStrings.en.refresh });
  await expect(row).toContainText("until"); expect(state.eventReads).toBe(1);
  // The same document, six days later: one more event read, then none, even when it was refused.
  state.event.now = "2026-10-19T12:00:00Z"; await page.clock.setFixedTime(new Date(state.event.now)); if (refused) state.eventReadStatus = 429;
  await refresh.click(); await expect.poll(() => state.qr).toBe(2); await expect(refresh).toBeEnabled();
  // A refused read keeps the details already on screen; an answered one drops the date.
  if (refused) await expect(row).toContainText("until"); else await expect(row).toHaveText(/no longer possible for this evening$/);
  await expect(page.getByRole("heading", { name: "Le Salon" })).toBeVisible(); expect(state.eventReads).toBe(2);
  await refresh.click(); await expect.poll(() => state.qr).toBe(3); await expect(refresh).toBeEnabled(); expect(state.eventReads).toBe(2);
});

for (const [name, patch, title, text] of [
  ["a processed refund", { state: "cancelled", refund_state: "succeeded" }, bookingStrings.en.refundDoneTitle, bookingStrings.en.refundDone],
  ["a pending refund", { state: "cancelled", refund_state: "queued" }, bookingStrings.en.refundPendingTitle, bookingStrings.en.refundPending],
  ["a refund kept after arrival", { state: "confirmed", payment_state: "paid", refund_state: "succeeded" }, bookingStrings.en.refundDoneTitle, bookingStrings.en.refundDone],
  ["a refund needing attention", { state: "cancelled", refund_state: "review_needed" }, bookingStrings.en.refundIssueTitle, bookingStrings.en.refundIssue],
  ["a retained deposit", { state: "cancelled", payment_state: "paid", cancellation_refundable: false }, bookingStrings.en.retainedTitle, cancellationStrings.en.retainedOutcome],
  ["an expired payment attempt", { state: "expired", payment_state: "unpaid" }, bookingStrings.en.expiredTitle, bookingStrings.en.expiredHelp],
] as const) test(`one status block at the top states ${name}`, async ({ page }) => {
  const state = await setup(page); Object.assign(state.reservation, patch);
  await page.evaluate(({ id, access }) => sessionStorage.setItem(`amourette-reservation:${id}`, JSON.stringify({ id, access, expires: Date.now() + 7 * 86400000 })), { id, access });
  await page.goto(`/reservations/${id}`);
  const status = page.getByRole("status").filter({ hasText: text });
  await expect(status).toHaveCount(1); await expect(status).toContainText(title.replace("{amount}", "€10.00")); await expect(status).toBeInViewport();
  expect((await status.boundingBox())!.y).toBeLessThan((await page.locator("dl").boundingBox())!.y);
});

// #438: seen on a phone as a flash before Stripe Checkout. Every DOM change between the tap and
// the Checkout page is recorded, so a frame that drops the form, swaps it for another screen or
// re-enables the button is caught even when it lasts a single render.
for (const locale of ["en", "fr"] as const) test(`${locale}: the Stripe hand-off keeps one still, pending form and creates once on a double tap`, async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 }); const state = await setup(page, locale); const s = bookingStrings[locale];
  const checkout = "https://checkout.stripe.com/c/pay/cs_test_pending_state";
  let releaseCreate!: () => void; const createHeld = new Promise<void>(resolve => { releaseCreate = resolve; });
  let releaseRead!: () => void; const readHeld = new Promise<void>(resolve => { releaseRead = resolve; });
  let credentials = 0; let reads = 0;
  await page.route("**/api/launch/credentials", async route => { credentials++; await route.fallback(); });
  await page.route(url => url.pathname === "/api/launch/checkout", async route => {
    const request = route.request();
    if (request.method() === "GET") { reads++; await readHeld; return route.fallback(); }
    state.create++; await createHeld;
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ reservation: state.reservation, checkout_url: checkout, checkout_state: "open" }) });
  });
  await page.route("https://checkout.stripe.com/**", route => route.fulfill({ status: 200, contentType: "text/html", body: "<!doctype html><title>Stripe Checkout stub</title><h1>Stripe Checkout stub</h1>" }));
  type Frame = { form: boolean; label: string; disabled: boolean; busy: string | null; top: number; height: number; other: string[] };
  const frames: Frame[] = [];
  await page.exposeFunction("recordBookingFrame", (frame: Frame) => { frames.push(frame); });
  await page.getByLabel(s.name, { exact: true }).fill("Alice"); await page.getByLabel(s.email, { exact: true }).first().fill("guest@example.com");
  await page.getByRole("radio", { name: t[locale].genders.woman, exact: true }).check(); await page.getByRole("checkbox").check();
  const idle = await page.getByRole("button", { name: new RegExp(s.reserve.split("{amount}")[0]) }).evaluate(button => { const rect = button.getBoundingClientRect(); return { top: Math.round(rect.top + window.scrollY), height: Math.round(rect.height) }; });
  // A background refresh is already in flight when the guest taps, and the evening fills up with
  // the guest's own hold, so its answer would turn the form into the waitlist.
  state.event.available = 0;
  await page.evaluate(() => window.dispatchEvent(new Event("online"))); await expect.poll(() => reads).toBe(1);
  await page.evaluate(({ saved, waitlist, full }) => {
    const record = () => {
      const form = document.querySelector("main form"); const button = form?.querySelector("button:not([type=button])");
      const rect = button?.getBoundingClientRect(); const text = document.querySelector("main")?.textContent ?? "";
      (window as unknown as { recordBookingFrame: (frame: unknown) => void }).recordBookingFrame({
        form: Boolean(form?.querySelector("input[autocomplete=given-name]")), label: button?.textContent ?? "", disabled: Boolean((button as HTMLButtonElement | undefined)?.disabled),
        busy: button?.getAttribute("aria-busy") ?? null, top: Math.round((rect?.top ?? 0) + window.scrollY), height: Math.round(rect?.height ?? 0),
        other: [saved, waitlist, full].filter(phrase => text.includes(phrase)).concat([...document.querySelectorAll("main [role=alert]")].map(alert => `alert: ${alert.textContent}`)),
      });
    };
    new MutationObserver(record).observe(document.body, { subtree: true, childList: true, attributes: true, characterData: true });
  }, { saved: s.saved, waitlist: s.waitlist, full: s.full });
  // Two submissions before React re-renders: the second one is what a double tap sends.
  await page.evaluate(() => { const form = document.querySelector("main form") as HTMLFormElement; form.requestSubmit(); form.requestSubmit(); });
  const waiting = page.getByRole("button", { name: s.submitting });
  await expect(waiting).toBeDisabled(); await expect(waiting).toHaveAttribute("aria-busy", "true");
  await expect.poll(() => state.create).toBe(1);
  releaseRead(); await expect.poll(() => state.eventReads).toBe(2);
  // A second refresh started during the wait (network back, timer) must not repaint the form either.
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 500)));
  await page.screenshot({ path: info.outputPath(`pending-${locale}.png`) });
  releaseCreate();
  await expect(page).toHaveURL(checkout); await expect(page.getByRole("heading", { name: "Stripe Checkout stub" })).toBeVisible();
  expect(frames.length).toBeGreaterThan(0);
  for (const frame of frames) expect(frame).toEqual({ form: true, label: s.submitting, disabled: true, busy: "true", ...idle, other: [] });
  expect(state.create).toBe(1); expect(credentials).toBe(1);
});

// #478: before taking a card, the page itself says that a late cancellation or a
// no-show keeps the deposit, and that the evening is 18+. The French copy says
// "caution", never "dépôt", and never "conservé" (it reads as "kept safe for you").
const beforePayment = {
  en: { retention: "If you cancel after this deadline or do not attend, your deposit is retained.", adults: "This evening is for people aged 18 and over.", terms: "or if you do not attend, the deposit is retained." },
  fr: { retention: "Après cette échéance, ou si vous ne venez pas, la caution n’est pas remboursée.", adults: "Soirée réservée aux personnes de 18 ans et plus.", terms: "ou en cas d’absence, la caution n’est pas remboursée." },
  es: { retention: "Si cancelas después de ese plazo o no asistes, el depósito no se reembolsa.", adults: "Noche reservada a personas de 18 años o más.", terms: "o si no asistes, el depósito no se reembolsa." },
} as const;
for (const locale of ["en", "fr", "es"] as const) test(`${locale}: the retained deposit and the 18+ rule are read above the pay button and in the conditions`, async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 }); await setup(page, locale); const s = bookingStrings[locale]; const copy = beforePayment[locale];
  const pay = page.getByRole("button", { name: new RegExp(s.reserve.split("{amount}")[0]) });
  const payTop = (await pay.boundingBox())!.y;
  for (const text of [copy.retention, copy.adults]) {
    const line = page.getByText(text, { exact: true });
    await expect(line).toBeVisible();
    const box = (await line.boundingBox())!;
    expect(box.y + box.height, `${text} sits above the pay button`).toBeLessThanOrEqual(payTop);
    expect(box.x + box.width, `${text} fits the 320px screen`).toBeLessThanOrEqual(320);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const main = page.getByRole("main");
  if (locale === "fr") { await expect(pay).toContainText("caution"); await expect(main).not.toContainText(/dépôt|conservé/i); }
  await page.goto(`/reservation-terms?lang=${locale}&version=launch-v1`);
  await expect(page.getByText(copy.adults, { exact: true })).toBeVisible();
  await expect(page.getByRole("main")).toContainText(copy.terms);
  if (locale === "fr") await expect(page.getByRole("main")).not.toContainText(/dépôt|conservé/i);
});
