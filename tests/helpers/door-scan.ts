import { expect, type Page } from "@playwright/test";
import QRCode from "qrcode";
import type { StaffArrival } from "../../lib/launch-arrivals";

// The Tonight door screen (#520) with a simulated camera, as in
// tests/admin/arrival-operations.spec.ts: real QR decoding from canvas video
// frames, only the physical camera is replaced.
export const ids = {
  venue: "00000000-0000-4000-8000-000000000101",
  night: "00000000-0000-4000-8000-000000000111",
  otherNight: "00000000-0000-4000-8000-000000000112",
  reservation: "00000000-0000-4000-8000-000000000121",
  founder: "00000000-0000-4000-8000-000000000131",
};
export const secret = "ab".repeat(32);
export const otherSecret = "cd".repeat(32);
const now = "2026-10-21T20:00:00Z";
const starts = "2026-10-21T18:00:00Z";
const ends = "2026-10-22T00:00:00Z";

export type DoorScanOptions = { code?: string; row?: Partial<StaffArrival>; otherNight?: StaffArrival["availability"]; offline?: boolean };

export async function openDoor(page: Page, options: DoorScanOptions = {}) {
  await page.clock.setFixedTime(new Date(now));
  if (process.env.E2E_BASE_URL && process.env.E2E_VERCEL_BYPASS) {
    const origin = new URL(process.env.E2E_BASE_URL).origin;
    await page.route(url => url.origin === origin, route => route.continue({ headers: { ...route.request().headers(), "x-vercel-protection-bypass": process.env.E2E_VERCEL_BYPASS! } }));
  }
  await page.addInitScript(({ png }) => {
    // Records haptic calls where the engine has the API; Safari has none.
    const calls: unknown[] = [];
    (window as unknown as { __vibrations: unknown[] }).__vibrations = calls;
    if ("vibrate" in navigator) Object.defineProperty(navigator, "vibrate", { configurable: true, value: (pattern: unknown) => { calls.push(pattern); return true; } });
    Object.defineProperty(navigator.mediaDevices, "getUserMedia", { value: async () => {
      const canvas = document.createElement("canvas"); canvas.width = 640; canvas.height = 480;
      const ctx = canvas.getContext("2d")!; const img = new Image(); img.src = png; await img.decode();
      const draw = () => { ctx.fillStyle = "white"; ctx.fillRect(0, 0, 640, 480); ctx.drawImage(img, 160, 80, 320, 320); };
      draw(); const timer = setInterval(draw, 100); const stream = canvas.captureStream(10);
      for (const track of stream.getTracks()) { const stop = track.stop.bind(track); track.stop = () => { clearInterval(timer); stop(); }; }
      return stream;
    } });
  }, { png: await QRCode.toDataURL(options.code ?? secret, { width: 320, margin: 4 }) });
  const row: StaffArrival = { id: ids.reservation, night_id: ids.night, first_name: "Alexandra", email: "alexandra@example.com", state: "confirmed",
    payment_state: "paid", arrival: null, verified_at: null, verified_by: null, method: null, note: null, revision: 0, refund_state: null,
    availability: "open", can_correct: true, history: [], ...options.row };
  const state = { row, commands: [] as { endpoint: string; payload: Record<string, unknown> }[] };
  await page.routeWebSocket(/.*/, socket => {
    const url = new URL(socket.url());
    if (url.host === new URL(page.url()).host && url.pathname.startsWith("/_next/")) socket.connectToServer(); else socket.close();
  });
  await page.route("**/auth/v1/**", route => route.abort());
  await page.route("**/rest/v1/**", async route => {
    const url = new URL(route.request().url());
    const endpoint = url.pathname.split("/").at(-1)!;
    const reply = (value: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(value) });
    const payload = route.request().method() === "POST" ? route.request().postDataJSON() as Record<string, unknown> : {};
    if (endpoint === "admin_moderation_queue") return reply([]);
    if (endpoint === "am_i_admin") return reply(true);
    if (endpoint === "venues") return reply([{ id: ids.venue, name: "Le Salon", slug: "le-salon", city: "Paris", timezone: "Europe/Paris", is_test_venue: false }]);
    const tonight = { id: ids.night, venue_id: ids.venue, status: "live", waiting_opens_at: starts, guaranteed_launch_at: "2026-10-21T19:00:00Z",
      closes_at: ends, launch_threshold: 12, opened_at: starts, terminal_at: null, terminal_reason: null };
    if (endpoint === "venue_nights" && url.searchParams.get("select") === "id,waiting_opens_at")
      return reply(options.otherNight && url.searchParams.get("waiting_opens_at")?.startsWith("gte.") ? [{ id: ids.otherNight, waiting_opens_at: "2026-10-23T18:00:00Z" }] : []);
    if (endpoint === "venue_nights") return reply(url.searchParams.get("select")?.includes("venues!inner") ? [{ ...tonight, venues: { is_test_venue: false } }] : [tonight]);
    if (endpoint === "admin_venue_night_participant_counts") return reply([{ venue_night_id: ids.night, participant_count: 23 }]);
    if (endpoint === "admin_launch_overview") return reply({ now, allocations: 34, finance: [], event: { night_id: ids.night, capacity: 40, deposit_minor: 1000,
      currency: "eur", policy_version: "launch-v1", registration_opens_at: "2026-10-10T10:00:00Z", cancelled_at: null } });
    if (endpoint === "admin_launch_arrival_summary") return reply({ now, starts_at: starts, ends_at: ends, ended: false, cancelled: false,
      verified: row.arrival === "verified" ? 20 : 19, remaining: 15, absent: 0, cancelled_count: 2 });
    if (endpoint === "admin_search_launch_reservations") return reply([row]);
    if (endpoint === "admin_inspect_launch_arrival") {
      if (options.offline) return route.abort();
      if (payload.p_night === ids.otherNight) return options.otherNight && payload.p_secret === otherSecret
        ? reply({ ...row, night_id: ids.otherNight, availability: options.otherNight, can_correct: false, state: options.otherNight === "cancelled" ? "cancelled" : "confirmed" })
        : reply({ code: "P0001", message: "arrival credential unavailable" }, 400);
      if (payload.p_secret && payload.p_secret !== secret) return reply({ code: "P0001", message: "arrival credential unavailable" }, 400);
      return reply(row);
    }
    state.commands.push({ endpoint, payload });
    if (endpoint === "admin_confirm_launch_arrival") {
      Object.assign(row, { arrival: "verified", verified_at: now, verified_by: ids.founder, method: payload.p_method, revision: row.revision + 1, refund_state: "queued" });
      return reply(row);
    }
    throw new Error(`Unexpected RPC ${endpoint}`);
  });
  await page.goto("/admin/tonight");
  await expect(page.getByRole("heading", { name: "Tonight", exact: true })).toBeVisible();
  return state;
}

export const door = (page: Page) => page.getByRole("main").getByRole("region", { name: "Arrival verification" });
export async function scan(page: Page) {
  await page.getByRole("main").getByRole("button", { name: "Scan an arrival", exact: true }).click();
}
