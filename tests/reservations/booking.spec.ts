import { test, expect, type Page } from "@playwright/test";
import { renderLaunchQr } from "@/lib/launch-qr";
import { bookingStrings } from "@/lib/booking-strings";
import { bookingReference } from "@/lib/booking";
import { cancellationStrings } from "@/lib/cancellation-strings";
import { t, type Locale } from "@/lib/strings";

const night = "00000000-0000-4000-8000-000000000184";
const id = "00000000-0000-4000-8000-000000000185";
const access = `v1.${"a".repeat(120)}`;
const now = "2026-10-13T12:00:00Z";
async function setup(page: Page, locale: Locale = "en") {
  await page.clock.setFixedTime(new Date(now));
  const event = { night_id: night, venue_id: id, venue_name: "Le Salon", city: "Paris", address: "12 rue de la Rencontre", timezone: "Europe/Paris", now,
    opens_at: "2026-10-12T12:00:00Z", closes_at: "2026-10-20T17:30:00Z", starts_at: "2026-10-20T18:00:00Z", ends_at: "2026-10-20T22:00:00Z", cancellation_deadline: "2026-10-18T18:00:00Z",
    amount_minor: 1000, currency: "eur", policy_version: "launch-v1", available: 1, status: "open", walk_ins_possible: false, registration_open: true };
  const reservation = { id, night_id: night, email: "guest@example.com", first_name: "Alice", locale, state: "holding", payment_state: "pending", hold_until: "2026-10-13T12:30:00Z", starts_at: event.starts_at, ends_at: event.ends_at, cancellation_deadline: event.cancellation_deadline, amount_minor: 1000, currency: "eur", refund_state: null as string | null, cancellation_refundable: null as boolean | null };
  const png = `data:image/png;base64,${(await renderLaunchQr("a".repeat(64))).toString("base64")}`;
  const state = { event, reservation, create: 0, createInputs: [] as unknown[], qr: 0, recovery: 0, exchange: 0, waitlist: 0, cancelLate: false, cancelUnknown: false, cancelLost: false, cancelCount: 0, cancelPreviews: 0, failCreate: false, rejectCreate: "", statusMissing: false, eventReadStatus: 0, eventReads: 0, statusRefused: false, qrUnavailable: true, failWaitlist: false, invalidAccess: false, failExchange: false };
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
      if (body.action === "confirm") {
        state.cancelCount++;
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
      state.exchange++; return state.failExchange ? reply({ error: "access_unavailable" }, 503) : reply({ id, access });
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
test("an email link without a valid proof exchanges nothing", async ({ page }) => {
  const state = await setup(page);
  await page.goto(`/reservations/access#${id}.not-a-token`);
  await expect(page.getByText(bookingStrings.en.accessExpired)).toBeVisible(); await expect(page.getByRole("button", { name: bookingStrings.en.openAccess })).toHaveCount(0);
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
  await expect(page.getByRole("main").getByRole("alert")).toHaveText(bookingStrings.en.accessExpired); await expect(page.locator("figure img")).toHaveCount(0);
  await expect(page.getByText(bookingStrings.en.recoveryEntry)).toBeVisible();
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
  await page.getByRole("button",{name:s.title,exact:true}).click();state.cancelLate=true;
  await page.getByRole("button",{name:s.confirm,exact:true}).click();
  await expect(page.getByText(s.crossed)).toBeVisible();expect(state.reservation.state).toBe("confirmed");
  await page.screenshot({path:info.outputPath("cancellation-deadline.png"),fullPage:true});
  await page.getByRole("button",{name:s.confirm,exact:true}).click();
  await expect(page.getByRole("heading",{name:bookingStrings[locale].reservationCancelled})).toBeVisible();
  await expect(page.locator("figure img")).toHaveCount(0);await expect(page.getByText(s.retainedOutcome)).toBeVisible();
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
  state.cancelLate=true;await page.getByRole("button",{name:s.confirm,exact:true}).click();
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
