import { test, expect, type Page } from "@playwright/test";
import QRCode from "qrcode";
import type { StaffArrival } from "../../lib/launch-arrivals";

const venue = "00000000-0000-4000-8000-000000000010";
const night = "00000000-0000-4000-8000-000000000011";
const reservation = "00000000-0000-4000-8000-000000000012";
const other = "00000000-0000-4000-8000-000000000013";
const founder = "00000000-0000-4000-8000-000000000014";
const secret = "ab".repeat(32);
// A code issued for another night of the same venue (#403).
const otherNight = "00000000-0000-4000-8000-000000000015";
const otherSecret = "cd".repeat(32);
const otherStarts = "2026-10-16T18:00:00Z";
const now = "2026-10-13T20:00:00Z";
const starts = "2026-10-13T18:00:00Z";
const ends = "2026-10-14T00:00:00Z";

// Playwright's Linux WebKit cannot play a canvas MediaStream, so the simulated
// camera never shows a frame there (#349). Camera scans run on Chromium only and
// the WebKit report lists them as skipped; the iPhone camera stays unverified.
const cameraScan = () => test.skip(test.info().project.name.startsWith("webkit"), "Simulated camera cannot play in Playwright's WebKit");

async function setup(page: Page, options: { code?: string; cameraDenied?: boolean; ended?: boolean } = {}) {
  await page.clock.setFixedTime(new Date(now));
  if (process.env.E2E_BASE_URL && process.env.E2E_VERCEL_BYPASS) {
    const origin = new URL(process.env.E2E_BASE_URL).origin;
    await page.route(url => url.origin === origin, route => route.continue({ headers: { ...route.request().headers(), "x-vercel-protection-bypass": process.env.E2E_VERCEL_BYPASS! } }));
  }
  // Real QR decoding from canvas video frames; only the physical camera is simulated.
  await page.addInitScript(({ png, denied }) => {
    Object.defineProperty(navigator.mediaDevices, "getUserMedia", { value: async () => {
      if (denied) throw new DOMException("Permission denied", "NotAllowedError");
      const canvas = document.createElement("canvas"); canvas.width = 640; canvas.height = 480;
      const ctx = canvas.getContext("2d")!; const img = new Image(); img.src = png; await img.decode();
      const draw = () => { ctx.fillStyle = "white"; ctx.fillRect(0, 0, 640, 480); ctx.drawImage(img, 160, 80, 320, 320); };
      draw(); const timer = setInterval(draw, 100); const stream = canvas.captureStream(10);
      for (const track of stream.getTracks()) {
        const stop = track.stop.bind(track);
        track.stop = () => { clearInterval(timer); stop(); document.documentElement.dataset.cameraStopped = "true"; };
      }
      return stream;
    } });
  }, { png: await QRCode.toDataURL(options.code ?? secret, { width: 320, margin: 4 }), denied: options.cameraDenied ?? false });
  const row: StaffArrival = { id: reservation, night_id: night, first_name: "Alexandra", email: "alexandra.long.booking@example.com",
    state: "confirmed", payment_state: "paid", arrival: options.ended ? "no_show" : null, verified_at: null, verified_by: null, method: null, note: null,
    revision: options.ended ? 1 : 0, refund_state: null, availability: options.ended ? "ended" : "open", can_correct: true, history: [] };
  const state = { row, otherAvailability: null as StaffArrival["availability"] | null, otherStarts: otherStarts as string, otherFails: false, inspectStatus: 0, inspectFails: false, confirmLost: false, correctionStale: false, rejectConfirm: false, commands: [] as { endpoint: string; payload: Record<string, unknown> }[] };
  await page.routeWebSocket(/.*/, socket => {
    const url = new URL(socket.url());
    if (url.host === new URL(page.url()).host && url.pathname.startsWith("/_next/")) socket.connectToServer(); else socket.close();
  });
  await page.route("**/auth/v1/**", route => route.abort());
  await page.route("**/rest/v1/**", async route => {
    const endpoint = new URL(route.request().url()).pathname.split("/").at(-1)!;
    const reply = (data: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(data) });
    // The admin shell polls the open-report count on every screen (#475).
    if (endpoint === "admin_moderation_queue") return reply([]);
    if (endpoint === "admin_launch_mail_problems") return reply({ total: 0, items: [] });
    if (endpoint === "am_i_admin") return reply(true);
    if (endpoint === "venues") return reply([{ id: venue, name: "Le Salon", slug: "le-salon", city: "Paris", timezone: "Europe/Paris", is_test_venue: true }]);
    const search = new URL(route.request().url()).searchParams;
    if (endpoint === "venue_nights" && search.get("select") === "id,waiting_opens_at") {
      // Only this venue's other nights, split around the selected night's entry time.
      const scoped = search.get("venue_id") === `eq.${venue}` && search.get("id") === `neq.${night}`;
      const side = state.otherStarts < starts ? "lt" : "gte";
      return reply(scoped && search.get("waiting_opens_at") === `${side}.${starts}` ? [{ id: otherNight, waiting_opens_at: state.otherStarts }] : []);
    }
    if (endpoint === "venue_nights") return reply([{ id: night, venue_id: venue, waiting_opens_at: starts, guaranteed_launch_at: "2026-10-13T19:00:00Z", closes_at: options.ended ? now : ends, launch_threshold: 4, opened_at: starts, terminal_at: options.ended ? now : null, terminal_reason: options.ended ? "ended" : null, status: options.ended ? "closed" : "live" }]);
    if (endpoint === "admin_venue_night_participant_counts") return reply([]);
    // #561: the night overview also reads the reservation-link totals.
    if (endpoint === "admin_launch_channel_counts") return reply({ street: 0, instagram: 0, venue_flyer: 0, venue_story: 0, unspecified: 0 });
    if (endpoint === "admin_launch_survey") return reply({ enabled: false, send_at: "2026-10-21T09:00:00Z", queued: 0, answers: 0, matched_yes: 0, matched_no: 0, talked_yes: 0, talked_no: 0, at_ease_yes: 0, at_ease_somewhat: 0, at_ease_no: 0, heard_friend: 0, heard_instagram: 0, heard_venue: 0, heard_street: 0, heard_other: 0 });
    if (endpoint === "admin_launch_overview") return reply({ now, allocations: 1, finance: [], event: { night_id: night, capacity: 50, deposit_minor: 1000, currency: "eur", policy_version: "launch-v1", registration_opens_at: "2026-10-10T12:00:00Z", cancelled_at: null, cancellation_reason: null } });
    if (endpoint === "admin_launch_arrival_summary") return reply({ now, starts_at: starts, ends_at: ends, ended: options.ended ?? false, cancelled: false,
      verified: row.arrival === "verified" ? 1 : 0, remaining: row.arrival !== "verified" && !options.ended ? 2 : 1, absent: options.ended && row.arrival !== "verified" ? 1 : 0, cancelled_count: 0 });
    const payload = route.request().postDataJSON() as Record<string, unknown>;
    if (endpoint === "admin_search_launch_reservations") return reply(payload.p_query === "nobody" ? [] : [row, { ...row, id: other, email: "alexandra.other@example.com" }]);
    if (endpoint === "admin_inspect_launch_arrival") {
      if (state.inspectFails) return route.abort();
      if (state.inspectStatus) return reply({ message: "JWT expired" }, state.inspectStatus);
      if (payload.p_night === otherNight && state.otherFails) return route.abort();
      if (payload.p_night === otherNight) return state.otherAvailability && payload.p_secret === otherSecret
        ? reply({ ...row, id: other, night_id: otherNight, availability: state.otherAvailability, can_correct: false,
          state: state.otherAvailability === "cancelled" ? "cancelled" : "confirmed" })
        : reply({ code: "P0001", message: "arrival credential unavailable" }, 400);
      if (payload.p_secret && payload.p_secret !== secret) return reply({ code: "P0001", message: "arrival credential unavailable" }, 400);
      return reply(payload.p_id === other ? { ...row, id: other, email: "alexandra.other@example.com" } : row);
    }
    state.commands.push({ endpoint, payload });
    if (endpoint === "admin_confirm_launch_arrival") {
      if (state.rejectConfirm) return reply({ code: "P0001", message: "arrival credential unavailable" }, 400);
      row.arrival = "verified"; row.verified_at = now; row.verified_by = founder; row.method = payload.p_method as "qr" | "manual";
      row.note = payload.p_note as string | null; row.revision++; row.refund_state = "queued";
      row.history.unshift({ id: 1, action: "arrival_verified", actor_id: founder, created_at: now, detail: { method: row.method } });
      if (state.confirmLost) return route.abort();
      return reply(row);
    }
    if (endpoint === "admin_correct_launch_arrival") {
      if (state.correctionStale) { row.revision++; return reply({ message: "arrival changed" }, 409); }
      row.arrival = payload.p_verified ? "verified" : options.ended ? "no_show" : null;
      row.verified_at = payload.p_verified ? now : null; row.verified_by = payload.p_verified ? founder : null;
      row.method = payload.p_verified ? "manual" : null; row.note = payload.p_verified ? String(payload.p_note) : null; row.revision++;
      if (payload.p_verified) row.refund_state ??= "queued";
      row.history.unshift({ id: row.revision, action: "arrival_corrected", actor_id: founder, created_at: now, detail: { note: payload.p_note, verified: payload.p_verified } });
      return reply(row);
    }
    throw new Error(`Unexpected RPC ${endpoint}`);
  });
  await page.goto(`/admin/nights/${night}`);
  await page.getByRole("tab", { name: "Arrivals", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Arrivals", exact: true })).toBeVisible();
  return state;
}
const arrival = (page: Page) => page.getByRole("region", { name: "Arrival verification", exact: true });
async function manual(page: Page) {
  // #484: names and emails are typed as they are; the phone keyboard must not rewrite them.
  const lookup = arrival(page).getByLabel("First name, email or reference");
  for (const [name, value] of [["autocorrect", "off"], ["autocapitalize", "none"], ["spellcheck", "false"]]) await expect(lookup).toHaveAttribute(name, value);
  await lookup.fill("Alexandra");
  await arrival(page).getByRole("button", { name: "Find guest", exact: true }).click();
  await arrival(page).getByRole("button", { name: /Alexandra alexandra.long.booking/ }).click();
  await expect(arrival(page).getByRole("heading", { name: "Alexandra", exact: true })).toBeVisible();
}

test("camera decodes personal QR, waits for explicit confirmation, and duplicates preserve verification", async ({ page }, info) => {
  cameraScan();
  const state = await setup(page); await page.setViewportSize({ width: 320, height: 850 });
  await arrival(page).getByRole("button", { name: "Scan personal QR" }).click();
  await expect(arrival(page).getByRole("heading", { name: "Alexandra", exact: true })).toBeVisible();
  expect(state.commands).toHaveLength(0);
  await expect(page.locator("html")).toHaveAttribute("data-camera-stopped", "true");
  await arrival(page).getByRole("button", { name: "Confirm arrival", exact: true }).click();
  await expect(arrival(page).getByRole("status")).toContainText("Arrival verified");
  expect(state.commands[0].payload).toMatchObject({ p_id: reservation, p_night: night, p_expected_revision: 0, p_method: "qr", p_secret: secret });
  await expect(arrival(page)).toContainText("Refund requested. Bank credit is not yet confirmed.");
  await page.screenshot({ path: info.outputPath("arrival-verified-320.png"), fullPage: true });
  await arrival(page).getByRole("button", { name: "Scan personal QR" }).click();
  await expect(arrival(page).getByRole("status")).toContainText("Already verified");
  await expect(arrival(page).getByRole("button", { name: "Confirm arrival", exact: true })).toHaveCount(0);
  expect(state.commands).toHaveLength(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(await page.evaluate(code => location.href.includes(code) || Object.values(localStorage).some(value => String(value).includes(code)), secret)).toBe(false);
});

test("manual lookup distinguishes identical names, validates Unicode notes and keeps correction refunds", async ({ page }, info) => {
  const state = await setup(page, { cameraDenied: true });
  await arrival(page).getByRole("button", { name: "Scan personal QR" }).click();
  await expect(arrival(page).getByRole("alert")).toContainText("permission denied");
  await arrival(page).getByRole("button", { name: "Close camera" }).click();
  await manual(page); await expect(arrival(page).getByText("alexandra.other@example.com", { exact: true })).toBeVisible();
  await arrival(page).getByLabel("Verification note", { exact: true }).fill("😀".repeat(501));
  await arrival(page).getByRole("button", { name: "Confirm arrival", exact: true }).click();
  await expect(arrival(page).getByRole("alert")).toContainText("1–500"); expect(state.commands).toHaveLength(0);
  await arrival(page).getByLabel("Verification note", { exact: true }).fill("Verified email with the guest outside; bar full");
  await arrival(page).getByRole("button", { name: "Confirm arrival", exact: true }).click();
  await expect(arrival(page).getByRole("status")).toContainText("Arrival verified");
  expect(state.commands[0].payload.p_secret).toBeNull(); expect(state.commands[0].payload.p_method).toBe("manual");
  await arrival(page).getByRole("button", { name: "Correct mistaken validation", exact: true }).click();
  await expect(arrival(page).getByRole("button", { name: "Confirm correction" })).toBeDisabled();
  await arrival(page).getByLabel("Verification note", { exact: true }).fill("Wrong reservation selected");
  await arrival(page).getByRole("checkbox").check();
  await page.screenshot({ path: info.outputPath("arrival-correction.png"), fullPage: true });
  await arrival(page).getByRole("button", { name: "Confirm correction" }).click();
  await expect(arrival(page).getByRole("status")).toContainText("Attendance corrected");
  expect(state.row.arrival).toBeNull(); expect(state.row.refund_state).toBe("queued");
  await arrival(page).getByText("Attendance history", { exact: true }).click();
  await expect(arrival(page).getByText("Wrong reservation selected", { exact: true })).toBeVisible();
});

test("lost mutation response reads committed state and blocks effects while readback is unavailable", async ({ page }) => {
  const state = await setup(page); await manual(page); state.confirmLost = true; state.inspectFails = true;
  await arrival(page).getByLabel("Verification note", { exact: true }).fill("Verified guest and booking email");
  await arrival(page).getByRole("button", { name: "Confirm arrival", exact: true }).click();
  await expect(arrival(page).getByRole("alert")).toContainText("may have completed");
  await expect(arrival(page).getByRole("button", { name: "Confirm arrival", exact: true })).toHaveCount(0);
  expect(state.commands).toHaveLength(1); state.inspectFails = false;
  await arrival(page).getByRole("button", { name: "Refresh result" }).click();
  await expect(arrival(page).getByRole("status")).toContainText("Current server record loaded");
  await expect(arrival(page)).toContainText("Refund requested");
  expect(state.commands).toHaveLength(1);
});

test("losing the network while confirming shows one message, not a stack of two (#407)", async ({ page }, info) => {
  const state = await setup(page); await page.setViewportSize({ width: 390, height: 844 }); await manual(page);
  let offline = false;
  await page.route("**/rest/v1/rpc/admin_launch_arrival_summary", route => offline ? route.abort() : route.fallback());
  offline = true; state.confirmLost = true; state.inspectFails = true;
  const countsFailed = page.waitForEvent("requestfailed", request => request.url().includes("admin_launch_arrival_summary"));
  await arrival(page).getByLabel("Verification note", { exact: true }).fill("Verified guest and booking email");
  await arrival(page).getByRole("button", { name: "Confirm arrival", exact: true }).click();
  await countsFailed;
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await expect(arrival(page).getByRole("alert")).toHaveCount(1);
  await expect(arrival(page).getByRole("alert")).toContainText("may have completed");
  await arrival(page).getByRole("alert").scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath("door-network-loss-390.png") });
});

test("ended event uses founder correction, rejects stale edits and preserves notes for retry", async ({ page }) => {
  const state = await setup(page, { ended: true }); await manual(page);
  await expect(arrival(page)).toContainText("Arrivals are closed");
  await expect(arrival(page).getByRole("button", { name: "Confirm arrival", exact: true })).toHaveCount(0);
  await arrival(page).getByRole("button", { name: "Correct a missed arrival" }).click();
  await arrival(page).getByLabel("Verification note", { exact: true }).fill("Founder witnessed attendance; scan was missed");
  await arrival(page).getByRole("checkbox").check(); state.correctionStale = true;
  await arrival(page).getByRole("button", { name: "Confirm correction" }).click();
  await expect(arrival(page).getByRole("alert")).toContainText("current server record");
  expect(state.commands[0].payload.p_expected_revision).toBe(1);
  state.correctionStale = false; await arrival(page).getByRole("button", { name: "Correct a missed arrival" }).click();
  await expect(arrival(page).getByLabel("Verification note", { exact: true })).toHaveValue("Founder witnessed attendance; scan was missed");
  await arrival(page).getByRole("checkbox").check(); await arrival(page).getByRole("button", { name: "Confirm correction" }).click();
  await expect(arrival(page).getByRole("status")).toContainText("Attendance corrected"); expect(state.commands[1].payload.p_expected_revision).toBe(2);
});

test("invalid QR is rejected before lookup effects; a cancelled booking has no confirmation action", async ({ page }) => {
  cameraScan();
  const state = await setup(page, { code: "https://getamourette.com/v/le-salon" });
  await arrival(page).getByRole("button", { name: "Scan personal QR" }).click();
  await expect(arrival(page).getByRole("alert")).toContainText("not a personal reservation QR"); expect(state.commands).toHaveLength(0);
  state.row.state = "cancelled"; state.row.availability = "cancelled"; state.row.can_correct = false;
  await manual(page); await expect(arrival(page)).toContainText("This reservation was cancelled");
  await expect(arrival(page).getByRole("button", { name: "Confirm arrival", exact: true })).toHaveCount(0);
});

test("cancellation after scan is refused and reloads the current cancelled state", async ({ page }) => {
  const state = await setup(page); await manual(page);
  await arrival(page).getByLabel("Verification note", { exact: true }).fill("Guest identified");
  state.rejectConfirm = true; state.row.state = "cancelled"; state.row.availability = "cancelled"; state.row.can_correct = false;
  await arrival(page).getByRole("button", { name: "Confirm arrival", exact: true }).click();
  await expect(arrival(page)).toContainText("This reservation was cancelled");
  await expect(arrival(page).getByRole("button", { name: "Confirm arrival", exact: true })).toHaveCount(0);
  expect(state.row.arrival).toBeNull(); expect(state.row.refund_state).toBeNull();
});

for (const [name, availability, opens, reason] of [
  ["a valid booking for another night", "not_started", otherStarts, "Booked for another night: Fri, 16 Oct 2026, 20:00."],
  ["a cancelled booking for another night", "cancelled", otherStarts, "Cancelled booking, and it was for another night: Fri, 16 Oct 2026, 20:00."],
  ["a booking for a night that has ended", "ended", "2026-10-09T18:00:00Z", "This booking was for a night that has ended: Fri, 09 Oct 2026, 20:00."],
] as const) test(`scanning ${name} gives the door that reason and confirms nothing (#403)`, async ({ page }, info) => {
  cameraScan();
  const state = await setup(page, { code: otherSecret }); state.otherAvailability = availability; state.otherStarts = opens;
  await page.setViewportSize({ width: 390, height: 844 });
  await arrival(page).getByRole("button", { name: "Scan personal QR" }).click();
  await expect(arrival(page).getByRole("alert")).toHaveText(`${reason} No arrival was confirmed tonight.`);
  await expect(arrival(page).getByRole("alert")).not.toContainText(/connection/i);
  // The other night's record is never opened here: no identity, no confirmation action.
  await expect(arrival(page).getByRole("heading", { name: "Alexandra", exact: true })).toHaveCount(0);
  await expect(arrival(page)).not.toContainText("alexandra.long.booking@example.com");
  await expect(arrival(page).getByRole("button", { name: "Confirm arrival", exact: true })).toHaveCount(0);
  expect(state.commands).toHaveLength(0);
  await arrival(page).getByRole("alert").scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath(`scan-${availability}-390.png`) });
});

test("an unknown code says no reservation matches; only a failed request blames the connection (#403)", async ({ page }, info) => {
  cameraScan();
  const state = await setup(page, { code: otherSecret }); await page.setViewportSize({ width: 390, height: 844 });
  await arrival(page).getByRole("button", { name: "Scan personal QR" }).click();
  await expect(arrival(page).getByRole("alert")).toHaveText("No reservation for this night matches. No arrival was confirmed. Ask for the guest’s confirmation QR or use manual lookup.");
  await page.screenshot({ path: info.outputPath("scan-no-match-390.png") });
  const offline = "Connection problem: this reservation could not be checked. No arrival was confirmed. Check your connection, then scan again or use manual lookup.";
  // The connection drops after this night refused the code: "no match" would be a guess.
  state.otherAvailability = "not_started"; state.otherFails = true;
  await arrival(page).getByRole("button", { name: "Scan personal QR" }).click();
  await expect(arrival(page).getByRole("alert")).toHaveText(offline);
  state.otherFails = false; state.inspectFails = true;
  await arrival(page).getByRole("button", { name: "Scan personal QR" }).click();
  await expect(arrival(page).getByRole("alert")).toHaveText(offline);
  await page.screenshot({ path: info.outputPath("scan-connection-390.png") });
  // An expired session is not a connection problem.
  state.inspectFails = false; state.inspectStatus = 401;
  await arrival(page).getByRole("button", { name: "Scan personal QR" }).click();
  await expect(arrival(page).getByRole("alert")).toHaveText("This reservation could not be checked. No arrival was confirmed. Reload the page, sign in again if asked, then scan again or use manual lookup.");
  expect(state.commands).toHaveLength(0);
});

// #474: a founder alone at the door must not lose a scanned guest by tapping on.
const unconfirmed = (page: Page) => arrival(page).getByRole("region", { name: "Arrival not confirmed", exact: true });

test("Next guest on a scanned, unconfirmed guest asks first, and Confirm records the arrival (#474)", async ({ page }, info) => {
  cameraScan();
  const state = await setup(page); await page.setViewportSize({ width: 390, height: 844 });
  await arrival(page).getByRole("button", { name: "Scan personal QR" }).click();
  await expect(arrival(page).getByRole("heading", { name: "Alexandra", exact: true })).toBeVisible();
  await arrival(page).getByRole("button", { name: "Next guest", exact: true }).click();
  await expect(unconfirmed(page)).toContainText("Alexandra is not marked as arrived");
  await expect(unconfirmed(page)).toContainText("deposit is not refunded");
  await expect(arrival(page).getByRole("heading", { name: "Alexandra", exact: true })).toBeVisible();
  await expect(unconfirmed(page).getByRole("heading", { name: "Arrival not confirmed" })).toBeFocused();
  expect(state.commands).toHaveLength(0);
  await unconfirmed(page).scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath("door-unconfirmed-prompt-390.png") });
  await unconfirmed(page).getByRole("button", { name: "Confirm arrival", exact: true }).click();
  await expect(arrival(page).getByRole("status")).toHaveText("Alexandra: arrival verified. The refund is handled separately; you can continue scanning.");
  expect(state.commands).toHaveLength(1);
  expect(state.commands[0]).toMatchObject({ endpoint: "admin_confirm_launch_arrival", payload: { p_id: reservation, p_method: "qr", p_secret: secret, p_expected_revision: 0 } });
  await expect(arrival(page).getByRole("heading", { name: "Alexandra", exact: true })).toHaveCount(0);
  // A verified guest needs no decision: Next guest moves on at once.
  await arrival(page).getByRole("button", { name: "Scan personal QR" }).click();
  await expect(arrival(page).getByRole("status")).toContainText("Already verified");
  await arrival(page).getByRole("button", { name: "Next guest", exact: true }).click();
  await expect(unconfirmed(page)).toHaveCount(0);
  await expect(arrival(page).getByRole("heading", { name: "Alexandra", exact: true })).toHaveCount(0);
  expect(state.commands).toHaveLength(1);
});

test("every way off an unconfirmed guest asks; Skip leaves them unconfirmed; a refused Confirm stays put (#474)", async ({ page }) => {
  cameraScan();
  const state = await setup(page);
  await arrival(page).getByRole("button", { name: "Scan personal QR" }).click();
  await expect(arrival(page).getByRole("heading", { name: "Alexandra", exact: true })).toBeVisible();
  await arrival(page).getByRole("button", { name: "Next guest", exact: true }).click();
  await unconfirmed(page).getByRole("button", { name: "Skip, not arrived", exact: true }).click();
  await expect(arrival(page).getByRole("heading", { name: "Alexandra", exact: true })).toHaveCount(0);
  expect(state.commands).toHaveLength(0); expect(state.row.arrival).toBeNull();
  // Another search result, a new scan and the back button all ask too.
  await manual(page);
  await arrival(page).getByRole("button", { name: /Alexandra alexandra.other@example.com/ }).click();
  await expect(unconfirmed(page)).toBeVisible();
  await unconfirmed(page).getByRole("button", { name: "Skip, not arrived", exact: true }).click();
  await expect(arrival(page).getByRole("heading", { name: "Alexandra", exact: true })).toBeVisible();
  await arrival(page).getByRole("button", { name: "Scan personal QR" }).click();
  await expect(unconfirmed(page)).toBeVisible();
  // A manual lookup needs a note: Confirm from the prompt sends nothing and points at the note.
  await unconfirmed(page).getByRole("button", { name: "Confirm arrival", exact: true }).click();
  await expect(arrival(page).getByRole("alert")).toHaveText("Add a verification note of 1–500 characters.");
  await expect(arrival(page).getByLabel("Verification note", { exact: true })).toBeFocused();
  expect(state.commands).toHaveLength(0);
  await arrival(page).getByLabel("Verification note", { exact: true }).fill("Checked the booking email with the guest");
  await arrival(page).getByRole("button", { name: "Reservations & deposits" }).click();
  await expect(unconfirmed(page)).toBeVisible();
  // A refused confirmation keeps the founder on the guest with the reason.
  state.rejectConfirm = true;
  await unconfirmed(page).getByRole("button", { name: "Confirm arrival", exact: true }).click();
  await expect(arrival(page).getByRole("alert")).toContainText("The action was refused");
  await expect(arrival(page).getByRole("heading", { name: "Alexandra", exact: true })).toBeVisible();
  expect(state.commands).toHaveLength(1); expect(state.row.arrival).toBeNull();
});
