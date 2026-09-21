import type { Page, BrowserContext } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../../lib/database.types";
import { test, expect, type TestData, type TestIdentity } from "./fixtures";

// Observe the retired venue-settings topic too, so a restored preview subscription
// would fail the expected counts: four for a visible participant with a match,
// one fewer without a message subscription or while hidden.
const roomTopic = /^realtime:(venue-night|venue-settings|presence|matches|room-messages)-/;
function observeRoom(page: Page) {
  const active = new Set<string>();
  const requests: string[] = [];
  page.on("websocket", socket => {
    socket.on("framesent", ({ payload }) => {
      if (typeof payload !== "string") return;
      const frame = JSON.parse(payload);
      const topic: string = Array.isArray(frame) ? frame[2] : frame.topic;
      const event: string = Array.isArray(frame) ? frame[3] : frame.event;
      if (!roomTopic.test(topic)) return;
      if (event === "phx_join") active.add(topic);
      if (event === "phx_leave") active.delete(topic);
    });
    socket.on("close", () => active.clear());
  });
  page.on("request", request => {
    if (/\/rest\/v1\/(presence|venue_night_public_state|matches|messages|likes|rpc\/room_candidates)(\?|$)/.test(request.url())) {
      requests.push(request.method() + " " + new URL(request.url()).pathname);
    }
  });
  return { active, requests };
}
async function enter(page: Page, slug: string) {
  await page.addInitScript(() => localStorage.setItem("amourette-room-hint-dismissed", "1"));
  await page.goto(`/v/${slug}`);
  await expect(page.getByRole("button", { name: "Night options" })).toBeVisible();
}
async function askLeave(page: Page) {
  const menu = page.getByRole("button", { name: "Night options" });
  if (await menu.isVisible()) {
    await menu.click();
    await page.locator("#room-overflow-menu").getByRole("button", { name: "Leave", exact: true }).click();
  } else {
    await page.getByRole("button", { name: "Leave", exact: true }).click();
  }
}
async function confirmLeave(page: Page) {
  await page.getByRole("dialog", { name: "Leave?", exact: true })
    .getByRole("button", { name: "Leave", exact: true }).click();
}
async function expectStopped(page: Page, traffic: ReturnType<typeof observeRoom>) {
  await expect.poll(() => traffic.active.size).toBe(0);
  await page.clock.install();
  const before = traffic.requests.length;
  for (const elapsed of [5_000, 25_000, 90_000]) {
    await page.clock.fastForward(elapsed);
    await page.evaluate(() => {
      window.dispatchEvent(new Event("focus"));
      window.dispatchEvent(new Event("online"));
      document.dispatchEvent(new Event("visibilitychange"));
      window.dispatchEvent(new Event("amourette-photo-refresh"));
    });
  }
  expect(traffic.requests.slice(before)).toEqual([]);
  expect(traffic.active.size).toBe(0);
  await page.clock.resume();
}

async function leaveReturnAndNavigation({ data, contextFor, alice, bob }: RoomFixtures) {
  const venue = await data.venue();
  await data.checkIn(venue, [alice, bob]);
  const match = await data.match(venue, alice, bob);
  const context = await contextFor(alice);
  const a = await context.newPage();
  const b = await context.newPage();
  const trafficA = observeRoom(a);
  const trafficB = observeRoom(b);
  await enter(a, venue.slug);
  await enter(b, venue.slug);
  await expect.poll(() => trafficA.active.size).toBe(4);
  await expect.poll(() => trafficB.active.size).toBe(4);
  await a.screenshot({ path: test.info().outputPath("room-active.png"), fullPage: true });

  await askLeave(a);
  await confirmLeave(a);
  await expect(a.getByRole("heading", { name: "You’ve left", exact: true })).toBeVisible();
  await expect(b.getByRole("heading", { name: "Back at the bar?" })).toBeVisible();
  await a.setViewportSize({ width: 320, height: 700 });
  await a.screenshot({ path: test.info().outputPath("room-departed-320.png"), fullPage: true });
  await expectStopped(a, trafficA);
  await expectStopped(b, trafficB);

  for (let cycle = 0; cycle < 2; cycle++) {
    await a.getByRole("button", { name: "Join tonight", exact: true }).click();
    await expect.poll(() => trafficA.active.size).toBe(4);
    await expect(b.getByRole("heading", { name: "Back at the bar?" })).toBeVisible();
    expect(trafficB.active.size).toBe(0);
    if (cycle === 0) {
      await askLeave(a);
      await confirmLeave(a);
      await expect(a.getByRole("heading", { name: "You’ve left", exact: true })).toBeVisible();
      await expectStopped(a, trafficA);
    }
  }
  await a.getByRole("button", { name: "Night options" }).click();
  await a.getByRole("button", { name: "Hide my profile", exact: true }).click();
  await expect(a.getByRole("heading", { name: "Your profile is hidden" })).toBeVisible();
  await expect.poll(() => trafficA.active.size).toBe(3);
  await a.screenshot({ path: test.info().outputPath("room-hidden-320.png"), fullPage: true });
  expect([...trafficA.active].some(topic => topic.startsWith("realtime:presence-"))).toBe(false);
  await a.getByRole("link", { name: "Open conversation with Bob" }).click();
  await expect(a).toHaveURL(new RegExp(`/chat/${match}$`));
  await expect.poll(() => trafficA.active.size).toBe(0);
  const remaining = await data.service.from("presence").select("id").eq("profile_id", alice.id).is("left_at", null);
  expect(remaining.error).toBeNull();
  expect(remaining.data).toHaveLength(1);
  await context.close();
}

async function departureConfirmation({ data, contextFor, alice }: RoomFixtures) {
  const venue = await data.venue();
  await data.checkIn(venue, [alice]);
  const context = await contextFor(alice);
  const page = await context.newPage();
  const traffic = observeRoom(page);
  await enter(page, venue.slug);
  // Refuse the write while the owner presence remains active.
  await page.route("**/rest/v1/presence?**", async route => {
    if (route.request().method() === "PATCH") {
      await route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ message: "test refusal" }) });
    } else await route.continue();
  });
  await askLeave(page);
  await confirmLeave(page);
  await expect(page.getByRole("dialog", { name: "Leave?", exact: true }).getByRole("alert")).toHaveText("Couldn’t leave. Try again.");
  await expect(page.getByRole("dialog", { name: "Leave?", exact: true })).toBeVisible();
  expect(traffic.active.size).toBeGreaterThan(0);
  await page.unroute("**/rest/v1/presence?**");
  await page.route("**/rest/v1/presence?**", async route => {
    if (route.request().method() === "PATCH") await route.fulfill({ json: null });
    else await route.continue();
  });
  await confirmLeave(page);
  await expect(page.getByRole("dialog", { name: "Leave?", exact: true }).getByRole("alert")).toHaveText("Couldn’t leave. Try again.");
  await page.unroute("**/rest/v1/presence?**");
  // An empty acknowledgement requires the subsequent owner read to establish
  // departure, including when the server already committed the write.
  await page.route("**/rest/v1/presence?**", async route => {
    if (route.request().method() === "PATCH") {
      await route.fetch();
      await route.fulfill({ json: null });
    } else await route.continue();
  });
  await confirmLeave(page);
  await expect(page.getByRole("heading", { name: /You’ve left|Back at the bar\?/ })).toBeVisible();
  await expectStopped(page, traffic);
  await page.unroute("**/rest/v1/presence?**");
  await page.getByRole("button", { name: "Join tonight", exact: true }).click();
  await expect(page.getByRole("button", { name: "Night options" })).toBeVisible();
  await page.route("**/rest/v1/presence?**", async route => {
    if (route.request().method() === "PATCH" && route.request().postDataJSON()?.left_at) {
      expect((await route.fetch()).ok()).toBe(true);
      await route.abort("failed"); // Write committed; the client lost its response.
    } else await route.continue();
  });
  await askLeave(page);
  await confirmLeave(page);
  await expect(page.getByRole("heading", { name: "Back at the bar?" })).toBeVisible();
  await expectStopped(page, traffic);
  await context.close();
}

async function missedEvents({ data, contextFor, alice }: RoomFixtures) {
  const venue = await data.venue();
  const nextVenue = await data.venue();
  await data.checkIn(venue, [alice]);
  const context = await contextFor(alice);
  // No websocket updates: the existing five-second poll must detect the change.
  await context.routeWebSocket("**/realtime/v1/**", socket => { socket.close(); });
  const page = await context.newPage();
  const traffic = observeRoom(page);
  await enter(page, venue.slug);
  let failOwnerRead = true;
  await page.route("**/rest/v1/presence?**", async route => {
    const url = new URL(route.request().url());
    if (url.searchParams.get("select") === "id,left_at" && failOwnerRead) {
      await route.fulfill({ status: 503, json: { message: "temporary network failure" } });
    } else await route.continue();
  });
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect(page.getByRole("button", { name: "Night options" })).toBeVisible();
  const owner = createClient<Database>(data.env.url, data.env.publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${alice.session.access_token}` } },
  });
  const moved = await owner.rpc("check_in", { p_venue_id: nextVenue.id });
  expect(moved.error).toBeNull();
  await page.waitForTimeout(5_500);
  await expect(page.getByRole("button", { name: "Night options" })).toBeVisible();
  failOwnerRead = false;
  await expect(page.getByRole("heading", { name: "Back at the bar?" })).toBeVisible({ timeout: 12_000 });
  await expectStopped(page, traffic);
  expect((await owner.rpc("check_in", { p_venue_id: venue.id })).error).toBeNull();
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(page.getByRole("heading", { name: "Back at the bar?" })).toBeVisible();
  await context.close();
}

async function nightLifecycle({ data, contextFor, alice, founder }: RoomFixtures) {
  const venue = await data.venue();
  expect((await data.service.from("venue_nights").update({
    status: "waiting", launched_at: null, launch_reason: null,
    guaranteed_launch_at: new Date(Date.now() + 1_800_000).toISOString(), launch_threshold: 1000,
  }).eq("id", venue.nightId)).error).toBeNull();
  expect((await data.service.from("admins").insert({ user_id: founder.id })).error).toBeNull();
  const admin = createClient<Database>(data.env.url, data.env.publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${founder.session.access_token}` } },
  });
  await data.checkIn(venue, [alice]);
  const context = await contextFor(alice);
  const page = await context.newPage();
  const departed = await context.newPage();
  const traffic = observeRoom(page);
  await page.goto(`/v/${venue.slug}`);
  await departed.goto(`/v/${venue.slug}`);
  await expect.poll(() => traffic.active.size).toBe(1);
  expect([...traffic.active][0]).toContain("realtime:venue-night-");
  await page.screenshot({ path: test.info().outputPath("room-waiting.png"), fullPage: true });
  expect(traffic.requests.some(path => /\/(matches|messages)$/.test(path))).toBe(false);
  expect((await admin.rpc("close_venue_night", { p_venue_night_id: venue.nightId })).error).toBeNull();
  await expect(page.getByRole("heading", { name: "The night is paused" })).toBeVisible();
  await page.screenshot({ path: test.info().outputPath("room-paused.png"), fullPage: true });
  await expect.poll(() => traffic.active.size).toBe(1);
  expect((await admin.rpc("reopen_venue_night", { p_venue_night_id: venue.nightId })).error).toBeNull();
  await expect(page.getByRole("button", { name: "Leave", exact: true })).toBeVisible();
  await expect.poll(async () => (await data.service.from("presence").select("id")
    .eq("profile_id", alice.id).is("left_at", null)).data?.length).toBe(1);
  await askLeave(departed);
  await confirmLeave(departed);
  await expect(departed.getByRole("heading", { name: /You’ve left|Back at the bar\?/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Back at the bar?" })).toBeVisible();
  await page.getByRole("button", { name: "Join tonight", exact: true }).click();
  await expect.poll(() => traffic.active.size).toBe(1);
  expect((await admin.rpc("cancel_venue_night", { p_venue_night_id: venue.nightId })).error).toBeNull();
  await expect(page.getByRole("heading", { name: "The night is cancelled" })).toBeVisible();
  await expectStopped(page, traffic);
  await expect(departed.getByRole("heading", { name: /You’ve left|Back at the bar\?/ })).toBeVisible();
  await departed.getByRole("button", { name: "Join tonight", exact: true }).click();
  await expect(departed.getByRole("heading", { name: "The night is cancelled" })).toBeVisible();

  const ending = await data.venue();
  await enter(page, ending.slug);
  await expect.poll(() => traffic.active.size).toBe(3);
  // Set terminal state only on this isolated fixture; do not run the global cron.
  expect((await data.service.from("venue_nights").update({
    status: "closed", terminal_at: new Date().toISOString(), terminal_reason: "scheduled_end",
    closes_at: new Date(Date.now() - 1_000).toISOString(),
  }).eq("id", ending.nightId)).error).toBeNull();
  await expect(page.getByRole("heading", { name: "The night has ended" })).toBeVisible();
  await page.screenshot({ path: test.info().outputPath("room-ended.png"), fullPage: true });
  await expectStopped(page, traffic);
  await context.close();
}

async function delayedResponses({ data, contextFor, alice, bob }: RoomFixtures) {
  const venue = await data.venue();
  await data.checkIn(venue, [alice, bob]);
  await data.match(venue, alice, bob);
  const context = await contextFor(alice);
  const page = await context.newPage();
  const traffic = observeRoom(page);
  await enter(page, venue.slug);
  await expect.poll(() => traffic.active.size).toBe(4);
  const delayed = new Set<string>();
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/rest/v1/**", async route => {
    const url = new URL(route.request().url());
    const feed = url.pathname.endsWith("/rpc/room_candidates") && route.request().method() === "POST";
    const night = url.pathname.endsWith("/venue_night_public_state");
    const matches = url.pathname.endsWith("/matches");
    if (feed || (route.request().method() === "GET" && (night || matches))) {
      const response = await route.fetch();
      delayed.add(feed ? "feed" : matches ? "matches" : "night");
      await gate;
      // A cancelled browser request may already have disappeared; no UI work
      // is allowed regardless of whether the transport delivers this response.
      await route.fulfill({ response }).catch(() => {});
    } else await route.continue();
  });
  try {
    await page.evaluate(() => {
      window.dispatchEvent(new Event("amourette-photo-refresh"));
      window.dispatchEvent(new Event("focus"));
    });
    await expect.poll(() => [...delayed].sort()).toEqual(["feed", "matches", "night"]);
    await askLeave(page);
    await confirmLeave(page);
    await expect(page.getByRole("heading", { name: "You’ve left", exact: true })).toBeVisible();
    release();
    await expectStopped(page, traffic);
    await expect(page.getByRole("heading", { name: "You’ve left", exact: true })).toBeVisible();
    await expect(page.getByTestId("match-stack")).toHaveCount(0);
  } finally { release(); }
  await context.close();
}


type RoomFixtures = {
  data: TestData;
  contextFor: (identity: TestIdentity) => Promise<BrowserContext>;
  alice: TestIdentity;
  bob: TestIdentity;
  founder: TestIdentity;
};

export async function verifyVenueSession({ data, contextFor, alice, bob }: Omit<RoomFixtures, "founder">) {
  // Reuse the profile/chat journey's two participants. Only the isolated night
  // operations step temporarily grants Bob founder access; Alice remains an
  // ordinary participant throughout every resource and RLS assertion.
  const fixtures = { data, contextFor, alice, bob, founder: bob };
  await test.step("leave stops both tabs; explicit return owns one resource set and navigation preserves presence", async () => {
    expect((await data.service.from("presence").update({ left_at: new Date().toISOString() })
      .in("profile_id", [alice.id, bob.id]).is("left_at", null)).error).toBeNull();
    await leaveReturnAndNavigation(fixtures);
  });
  await test.step("failed and zero-row departures stay retryable; an already completed write is confirmed", async () => {
    expect((await data.service.from("presence").update({ left_at: new Date().toISOString() })
      .in("profile_id", [alice.id, bob.id]).is("left_at", null)).error).toBeNull();
    await departureConfirmation(fixtures);
  });
  await test.step("missed events and owner-read errors recover through polling, with no automatic return from another venue", async () => {
    expect((await data.service.from("presence").update({ left_at: new Date().toISOString() })
      .in("profile_id", [alice.id, bob.id]).is("left_at", null)).error).toBeNull();
    await missedEvents(fixtures);
  });
  await test.step("waiting and paused nights retain only lifecycle; cancellation stops everything and preserves a prior departure", async () => {
    expect((await data.service.from("presence").update({ left_at: new Date().toISOString() })
      .in("profile_id", [alice.id, bob.id]).is("left_at", null)).error).toBeNull();
    try {
      await nightLifecycle(fixtures);
    } finally {
      expect((await data.service.from("admins").delete().eq("user_id", bob.id)).error).toBeNull();
    }
  });
  await test.step("delayed feed, match and night responses cannot restore a departed screen", async () => {
    expect((await data.service.from("presence").update({ left_at: new Date().toISOString() })
      .in("profile_id", [alice.id, bob.id]).is("left_at", null)).error).toBeNull();
    await delayedResponses(fixtures);
  });
  expect((await data.service.from("presence").update({ left_at: new Date().toISOString() })
    .in("profile_id", [alice.id, bob.id]).is("left_at", null)).error).toBeNull();
}
