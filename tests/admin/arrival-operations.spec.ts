import { test, expect, type Page } from "@playwright/test";
import QRCode from "qrcode";
import type { StaffArrival } from "../../lib/launch-arrivals";

const venue = "00000000-0000-4000-8000-000000000010";
const night = "00000000-0000-4000-8000-000000000011";
const reservation = "00000000-0000-4000-8000-000000000012";
const other = "00000000-0000-4000-8000-000000000013";
const founder = "00000000-0000-4000-8000-000000000014";
const secret = "ab".repeat(32);
const now = "2026-10-13T20:00:00Z";
const starts = "2026-10-13T18:00:00Z";
const ends = "2026-10-14T00:00:00Z";

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
  const state = { row, inspectFails: false, confirmLost: false, correctionStale: false, rejectConfirm: false, commands: [] as { endpoint: string; payload: Record<string, unknown> }[] };
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
    if (endpoint === "venue_nights") return reply([{ id: night, venue_id: venue, waiting_opens_at: starts, guaranteed_launch_at: "2026-10-13T19:00:00Z", closes_at: options.ended ? now : ends, launch_threshold: 4, opened_at: starts, terminal_at: options.ended ? now : null, terminal_reason: options.ended ? "ended" : null, status: options.ended ? "closed" : "live" }]);
    if (endpoint === "admin_venue_night_participant_counts") return reply([]);
    if (endpoint === "admin_launch_overview") return reply({ now, allocations: 1, finance: [], event: { night_id: night, capacity: 50, deposit_minor: 1000, currency: "eur", policy_version: "launch-v1", registration_opens_at: "2026-10-10T12:00:00Z", cancelled_at: null, cancellation_reason: null } });
    if (endpoint === "admin_launch_arrival_summary") return reply({ now, starts_at: starts, ends_at: ends, ended: options.ended ?? false, cancelled: false,
      verified: row.arrival === "verified" ? 1 : 0, remaining: row.arrival !== "verified" && !options.ended ? 2 : 1, absent: options.ended && row.arrival !== "verified" ? 1 : 0, cancelled_count: 0 });
    const payload = route.request().postDataJSON() as Record<string, unknown>;
    if (endpoint === "admin_search_launch_reservations") return reply(payload.p_query === "nobody" ? [] : [row, { ...row, id: other, email: "alexandra.other@example.com" }]);
    if (endpoint === "admin_inspect_launch_arrival") {
      if (state.inspectFails) return route.abort();
      if (payload.p_secret && payload.p_secret !== secret) return reply({ message: "arrival credential unavailable" }, 400);
      return reply(payload.p_id === other ? { ...row, id: other, email: "alexandra.other@example.com" } : row);
    }
    state.commands.push({ endpoint, payload });
    if (endpoint === "admin_confirm_launch_arrival") {
      if (state.rejectConfirm) return reply({ message: "arrival credential unavailable" }, 400);
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
  await page.goto(`/admin/venues/${venue}/nights/${night}`);
  await page.getByRole("button", { name: "Open arrivals" }).click();
  await expect(page.getByRole("heading", { name: "Arrivals", exact: true })).toBeVisible();
  return state;
}
const arrival = (page: Page) => page.getByRole("region", { name: "Arrival verification", exact: true });
async function manual(page: Page) {
  await arrival(page).getByLabel("Name, email or reservation reference").fill("Alexandra");
  await arrival(page).getByRole("button", { name: "Find guest", exact: true }).click();
  await arrival(page).getByRole("button", { name: /Alexandra alexandra.long.booking/ }).click();
  await expect(arrival(page).getByRole("heading", { name: "Alexandra", exact: true })).toBeVisible();
}

test("camera decodes personal QR, waits for explicit confirmation, and duplicates preserve verification", async ({ page }, info) => {
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
