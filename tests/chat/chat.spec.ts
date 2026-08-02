import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { contextFor, readFixture, serviceClient, type TestIdentity } from "./fixture";

async function openChat(context: BrowserContext, matchId: string) {
  const page = await context.newPage();
  await page.goto(`/chat/${matchId}`);
  await expect(page.getByTestId("chat-input")).toBeVisible();
  return page;
}

async function send(page: Page, body: string) {
  await page.getByTestId("chat-input").fill(body);
  await page.getByTestId("chat-send").click();
  await expect(page.getByTestId("chat-message").filter({ hasText: body })).toHaveCount(1);
}

test("two sessions cover chat delivery, recovery, presence, safety and room geometry", async ({ browser }) => {
  test.slow();
  const fixture = await readFixture();
  const service = serviceClient();
  const aliceContext = await contextFor(browser, fixture.users.alice);
  const bobContext = await contextFor(browser, fixture.users.bob);
  const intruderContext = await contextFor(browser, fixture.users.intruder);

  const alice = await openChat(aliceContext, fixture.matchId);
  const bob = await openChat(bobContext, fixture.matchId);

  await test.step("RLS keeps an unrelated profile out", async () => {
    const intruder = await intruderContext.newPage();
    await intruder.goto(`/chat/${fixture.matchId}`);
    await expect(intruder.getByTestId("chat-input")).toHaveCount(0);
    await expect(intruder.locator("main")).toBeVisible();
  });

  await test.step("initial order is stable and identical for both members", async () => {
    const timestamp = new Date().toISOString();
    const rows = [
      { id: "00000000-0000-4000-8000-000000000002", body: "ordered second" },
      { id: "00000000-0000-4000-8000-000000000001", body: "ordered first" },
    ].map((row) => ({
      ...row,
      match_id: fixture.matchId,
      sender_id: fixture.users.alice.id,
      created_at: timestamp,
    }));
    const { error } = await service.from("messages").insert(rows);
    expect(error).toBeNull();
    await Promise.all([alice.reload(), bob.reload()]);
    await Promise.all([
      expect(alice.getByTestId("chat-input")).toBeVisible(),
      expect(bob.getByTestId("chat-input")).toBeVisible(),
    ]);
    await expect.poll(async () => alice.getByTestId("chat-message").allTextContents()).toEqual([
      expect.stringContaining("ordered first"),
      expect.stringContaining("ordered second"),
    ]);
    await expect.poll(async () => bob.getByTestId("chat-message").allTextContents()).toEqual([
      expect.stringContaining("ordered first"),
      expect.stringContaining("ordered second"),
    ]);
    const aliceTimes = await alice.locator("time").allTextContents();
    const bobTimes = await bob.locator("time").allTextContents();
    expect(aliceTimes).toEqual(bobTimes);
  });

  await test.step("optimistic, rapid and simultaneous sends converge exactly once", async () => {
    await alice.getByTestId("chat-input").fill("alice simultaneous");
    await bob.getByTestId("chat-input").fill("bob simultaneous");
    await Promise.all([
      alice.getByTestId("chat-send").click(),
      bob.getByTestId("chat-send").click(),
    ]);
    for (const page of [alice, bob]) {
      await expect(page.getByTestId("chat-message").filter({ hasText: "alice simultaneous" })).toHaveCount(1);
      await expect(page.getByTestId("chat-message").filter({ hasText: "bob simultaneous" })).toHaveCount(1);
    }
    await send(alice, "rapid one");
    await send(alice, "rapid two");
    await expect(bob.getByTestId("chat-message").filter({ hasText: /^rapid/ })).toHaveCount(2);
  });

  await test.step("typing is realtime and leaves no durable message", async () => {
    const before = await alice.getByTestId("chat-message").count();
    await alice.getByTestId("chat-input").fill("draft only");
    await expect(bob.getByTestId("typing-indicator")).toBeVisible();
    await alice.getByTestId("chat-input").fill("");
    await expect(bob.getByTestId("typing-indicator")).toBeHidden();
    expect(await alice.getByTestId("chat-message").count()).toBe(before);
  });

  await test.step("a failed request retries with the same UUID", async () => {
    await alice.route("**/rest/v1/messages*", async (route) => {
      if (route.request().method() === "POST") await route.abort("failed");
      else await route.continue();
    });
    await send(alice, "retry preserves identity");
    const failed = alice.getByTestId("chat-message").filter({ hasText: "retry preserves identity" });
    await expect(failed).toHaveAttribute("data-delivery-state", "failed");
    const messageId = await failed.getAttribute("data-message-id");
    await alice.unroute("**/rest/v1/messages*");
    await failed.getByRole("button").click();
    await expect(failed).toHaveAttribute("data-delivery-state", "confirmed");
    expect(await failed.getAttribute("data-message-id")).toBe(messageId);
    const { count } = await service.from("messages").select("id", { count: "exact", head: true }).eq("id", messageId!);
    expect(count).toBe(1);
  });

  await test.step("departure pauses sends and explicit return restores them", async () => {
    const { error: leaveError } = await service
      .from("presence")
      .update({ left_at: new Date().toISOString() })
      .eq("profile_id", fixture.users.bob.id)
      .eq("venue_night_id", fixture.nightId)
      .is("left_at", null);
    expect(leaveError).toBeNull();
    await expect(alice.getByTestId("chat-input")).toBeHidden({ timeout: 20_000 });
    const { error: returnError } = await service.from("presence").insert({
      profile_id: fixture.users.bob.id,
      venue_id: fixture.venue.id,
      venue_night_id: fixture.nightId,
      is_visible: true,
    });
    expect(returnError).toBeNull();
    await expect(alice.getByTestId("chat-input")).toBeVisible({ timeout: 20_000 });
  });

  await test.step("one match and four-match geometry stay horizontally confined", async () => {
    const room = await aliceContext.newPage();
    await room.goto(`/v/${fixture.venue.slug}`);
    await expect(room.getByTestId("match-stack")).toBeVisible();
    const one = await room.getByTestId("match-stack").boundingBox();
    expect(one).not.toBeNull();
    expect(one!.x).toBeGreaterThanOrEqual(0);
    expect(one!.x + one!.width).toBeLessThanOrEqual(await room.evaluate(() => innerWidth));

    for (const partner of fixture.users.partners) await createMatch(service, fixture, partner);
    await room.reload();
    await room.getByTestId("match-stack").getByRole("button").first().click();
    const strip = room.getByTestId("match-strip");
    await expect(strip.locator("a")).toHaveCount(4);
    const geometry = await strip.evaluate((element) => ({
      left: element.getBoundingClientRect().left,
      right: element.getBoundingClientRect().right,
      viewport: innerWidth,
      scrollable: element.scrollWidth >= element.clientWidth,
    }));
    expect(geometry.left).toBeGreaterThanOrEqual(0);
    expect(geometry.right).toBeLessThanOrEqual(geometry.viewport);
    expect(geometry.scrollable).toBe(true);
  });

  await test.step("report validation and blocking remove access immediately", async () => {
    await alice.bringToFront();
    await alice.getByTestId("chat-menu").click();
    await alice.getByTestId("chat-report-open").click();
    await alice.getByTestId("chat-report-reason").selectOption("other");
    await alice.getByTestId("chat-report-form").getByRole("button", { name: /./ }).first().click();
    await expect(alice.getByRole("alert")).toBeVisible();
    await alice.getByTestId("chat-report-note").fill("Regression test report");
    await alice.getByTestId("chat-report-form").getByRole("button", { name: /./ }).first().click();
    await expect(alice.getByTestId("chat-report-form")).toContainText(/reported|signalement|reporte/i);

    const { error } = await service.from("blocks").insert({
      blocker_id: fixture.users.alice.id,
      blocked_id: fixture.users.bob.id,
      venue_id: fixture.venue.id,
      reason: "unsafe_behavior",
    });
    expect(error).toBeNull();
    await bob.reload();
    await expect(bob.getByTestId("chat-input")).toHaveCount(0);
  });

  await Promise.all([aliceContext.close(), bobContext.close(), intruderContext.close()]);
});

async function createMatch(
  service: ReturnType<typeof serviceClient>,
  fixture: Awaited<ReturnType<typeof readFixture>>,
  partner: TestIdentity,
) {
  const ordered = [fixture.users.alice.id, partner.id].sort();
  const { error } = await service.from("matches").insert({
    profile_a: ordered[0],
    profile_b: ordered[1],
    venue_id: fixture.venue.id,
    venue_night_id: fixture.nightId,
    expires_at: new Date(Date.now() + 3_600_000).toISOString(),
  });
  expect(error).toBeNull();
}
