import { randomUUID } from "node:crypto";
import type { BrowserContext, Page } from "@playwright/test";
import { test, expect } from "../helpers/fixtures";

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

test("two sessions cover chat delivery, recovery, presence, safety and room geometry", async ({ data, contextFor }) => {
  test.setTimeout(180_000);
  const venue = await data.venue();
  const users = {
    alice: await data.identity("Alice", "woman"),
    bob: await data.identity("TestsuggIphone", "man"),
    intruder: await data.identity("Eve", "woman"),
    partners: [
      await data.identity("TestsuggIphoneTestsuggIphonexx", "woman"),
      await data.identity("Dario", "man"),
      await data.identity("Farah", "woman"),
    ],
  };
  await data.checkIn(venue, [users.alice, users.bob, users.intruder, ...users.partners]);
  const fixture = { venue, nightId: venue.nightId, users, matchId: await data.match(venue, users.alice, users.bob) };
  const service = data.service;
  const aliceContext = await contextFor(fixture.users.alice);
  const bobContext = await contextFor(fixture.users.bob);
  const intruderContext = await contextFor(fixture.users.intruder);

  const alice = await openChat(aliceContext, fixture.matchId);
  const bob = await openChat(bobContext, fixture.matchId);

  await test.step("RLS keeps an unrelated profile out", async () => {
    const intruder = await intruderContext.newPage();
    await intruder.goto(`/chat/${fixture.matchId}`);
    await expect(intruder.getByText("This chat is not available.", { exact: true })).toBeVisible();
    await expect(intruder.getByTestId("chat-input")).toHaveCount(0);
    await expect(intruder.locator("main")).toBeVisible();
  });

  await test.step("initial order is stable and identical for both members", async () => {
    const timestamp = new Date().toISOString();
    const [firstId, secondId] = [randomUUID(), randomUUID()].sort();
    const rows = [
      { id: secondId, body: "ordered second" },
      { id: firstId, body: "ordered first" },
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
    await expect(alice.getByTestId("chat-suggestions")).toBeHidden();
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
    await room.setViewportSize({ width: 320, height: 700 });
    await room.goto(`/v/${fixture.venue.slug}`);
    await expect(room.getByTestId("match-stack")).toBeVisible();
    await room
      .locator('[aria-labelledby="room-hint-title"]')
      .getByRole("button")
      .click();
    const one = await room.getByTestId("match-stack").boundingBox();
    expect(one).not.toBeNull();
    expect(one!.x).toBeGreaterThanOrEqual(0);
    expect(one!.x + one!.width).toBeLessThanOrEqual(await room.evaluate(() => innerWidth));

    const longRoomName = room
      .getByTestId("room-profile-name")
      .filter({ hasText: "TestsuggIphoneTestsuggIphonexx" });
    const shortRoomName = room.getByTestId("room-profile-name").filter({ hasText: "Eve" });
    for (const width of [320, 390]) {
      await room.setViewportSize({ width, height: 700 });
      await expect(longRoomName).toBeVisible();
      const metrics = await longRoomName.evaluate((element) => ({
        fontSize: parseFloat(getComputedStyle(element).fontSize),
        lines: Math.round(
          element.getBoundingClientRect().height /
            parseFloat(getComputedStyle(element).lineHeight),
        ),
        right: element.getBoundingClientRect().right,
        pageFits: document.documentElement.scrollWidth <= innerWidth,
      }));
      expect(metrics.fontSize).toBe(32);
      expect(metrics.lines).toBeLessThanOrEqual(2);
      expect(metrics.right).toBeLessThanOrEqual(width);
      expect(metrics.pageFits).toBe(true);
      expect(await shortRoomName.evaluate((element) => parseFloat(getComputedStyle(element).fontSize))).toBe(52);
    }

    await data.match(venue, users.alice, users.partners[0]);
    await room.reload();
    await room.getByTestId("match-stack").getByRole("button").first().click();
    let strip = room.getByTestId("match-strip");
    const feed = room.getByTestId("profile-feed");
    expect(
      await room.evaluate(() =>
        Boolean(
          document
            .elementFromPoint(innerWidth / 2, innerHeight / 2)
            ?.closest('[data-testid="profile-feed"]'),
        ),
      ),
    ).toBe(true);
    const initialScrollTop = await feed.evaluate((element) => element.scrollTop);
    await room.mouse.move(160, 500);
    await room.mouse.wheel(0, 700);
    await expect
      .poll(() => feed.evaluate((element) => element.scrollTop))
      .toBeGreaterThan(initialScrollTop);
    await strip.dispatchEvent("pointerdown", { pointerType: "touch" });
    await expect(strip).toBeVisible();
    await feed.dispatchEvent("pointerdown", { pointerType: "touch" });
    await expect(strip).toHaveCount(0);

    for (const partner of fixture.users.partners.slice(1)) {
      await data.match(venue, users.alice, partner);
    }
    await room.reload();
    await room.getByTestId("match-stack").getByRole("button").first().click();
    strip = room.getByTestId("match-strip");
    await expect(strip.locator("a")).toHaveCount(4);
    await expect(strip.getByRole("button")).toHaveCount(0);
    const geometry = await strip.evaluate((element) => ({
      left: element.getBoundingClientRect().left,
      right: element.getBoundingClientRect().right,
      viewport: innerWidth,
      scrollable: element.scrollWidth >= element.clientWidth,
    }));
    expect(geometry.left).toBeGreaterThanOrEqual(0);
    expect(geometry.right).toBeLessThanOrEqual(geometry.viewport);
    expect(geometry.scrollable).toBe(true);

    const longPill = strip.locator("a").filter({ hasText: "TestsuggIphoneTestsuggIphonexx" });
    // At 390px this name fits after the match-menu removal. Exercise actual
    // truncation at the narrow supported viewport, not an incidental text width.
    await room.setViewportSize({ width: 320, height: 700 });
    const pillName = longPill.getByText("TestsuggIphoneTestsuggIphonexx", { exact: true });
    expect(await pillName.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true);

  });

  await test.step("long-name chat header remains confined at phone widths", async () => {
    for (const width of [320, 390]) {
      await alice.setViewportSize({ width, height: 700 });
      const name = alice.getByTestId("chat-profile-name");
      const metrics = await name.evaluate((element) => ({
        lineHeight: parseFloat(getComputedStyle(element).lineHeight),
        fontSize: parseFloat(getComputedStyle(element).fontSize),
        bottomPadding: parseFloat(getComputedStyle(element).paddingBottom),
        fits: element.getBoundingClientRect().right <= innerWidth,
        pageFits: document.documentElement.scrollWidth <= innerWidth,
      }));
      expect(metrics.lineHeight / metrics.fontSize).toBeCloseTo(1.1, 1);
      expect(metrics.bottomPadding).toBeGreaterThanOrEqual(2);
      expect(metrics.fits).toBe(true);
      expect(metrics.pageFits).toBe(true);
    }
  });

  await test.step("report validation and blocking remove access immediately", async () => {
    await alice.bringToFront();
    await alice.getByTestId("chat-menu").click();
    await alice.getByTestId("chat-report-open").click();
    await alice.getByTestId("chat-report-reason").selectOption("other");
    await alice.getByTestId("chat-report-form").getByRole("button", { name: /./ }).first().click();
    await expect(
      alice.getByTestId("chat-report-form").getByRole("alert"),
    ).toBeVisible();
    await alice.getByTestId("chat-report-note").fill("Regression test report");
    await alice.getByTestId("chat-report-form").getByRole("button", { name: /./ }).first().click();
    await expect(alice.getByTestId("chat-report-form")).toContainText(
      /Report submitted|Signalement envoyé|Reporte enviado/i,
    );
    const blockResponsePromise = alice.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        response.url().includes("/rest/v1/blocks"),
    );
    await alice
      .getByTestId("chat-report-form")
      .getByRole("button", { name: /^(Block|Bloquer|Bloquear)$/i })
      .click();
    const blockResponse = await blockResponsePromise;
    expect(blockResponse.ok(), await blockResponse.text()).toBe(true);
    await expect(alice.getByTestId("chat-input")).toHaveCount(0);
    await bob.reload();
    await expect(bob.getByText("This chat is not available.", { exact: true })).toBeVisible();
    await expect(bob.getByTestId("chat-input")).toHaveCount(0);
  });

});
