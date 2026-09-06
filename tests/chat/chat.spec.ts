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

test("conversation starters and the limited profile preview reduce first-contact friction", async ({ browser }) => {
  const fixture = await readFixture();
  const context = await contextFor(browser, fixture.users.alice);
  const page = await openChat(context, fixture.matchId);
  const suggestions = page.getByTestId("chat-suggestions");
  const input = page.getByTestId("chat-input");

  await test.step("localized starters fill the draft without sending", async () => {
    await expect(suggestions).toBeVisible();
    const starterButtons = suggestions.getByRole("button");
    await expect(starterButtons).toHaveCount(3);
    const boxes = await starterButtons.evaluateAll((buttons) =>
      buttons.map((button) => {
        const box = button.getBoundingClientRect();
        return { top: box.top, left: box.left, width: box.width, height: box.height };
      }),
    );
    expect(boxes[1].top).toBeGreaterThan(boxes[0].top + boxes[0].height);
    expect(boxes[2].top).toBeGreaterThan(boxes[1].top + boxes[1].height);
    expect(boxes.every((box) => box.height >= 44)).toBe(true);
    expect(boxes.every((box) => box.left === boxes[0].left)).toBe(true);
    const suggestionAreaWidth = await suggestions.evaluate(
      (element) => element.getBoundingClientRect().width,
    );
    expect(boxes.every((box) => box.width < suggestionAreaWidth)).toBe(true);
    await expect(suggestions.getByRole("button", { name: /Fermer|Dismiss|Cerrar/ })).toHaveCount(0);
    await expect(suggestions.getByRole("button", { name: "Tu es où dans la salle ?" })).toBeVisible();
    await suggestions.getByRole("button", { name: "Tu es où dans la salle ?" }).click();
    await expect(input).toHaveValue("Tu es où dans la salle ?");
    await expect(input).toBeFocused();
    await expect(page.getByTestId("chat-message")).toHaveCount(0);
    await expect(suggestions).toBeHidden();
    await input.fill("");
    await expect(suggestions).toBeHidden();
    await input.blur();
    await expect(suggestions).toBeVisible();

    await input.focus();
    await expect(suggestions).toBeHidden();
    await input.blur();
    await expect(suggestions).toBeVisible();

    for (const [locale, starter] of [
      ["en", "Where are you in the room?"],
      ["es", "¿Dónde estás en la sala?"],
      ["fr", "Tu es où dans la salle ?"],
    ] as const) {
      await page.evaluate((value) => {
        localStorage.setItem("amourette-locale", value);
        window.dispatchEvent(new Event("amourette-locale-change"));
      }, locale);
      await expect(suggestions.getByRole("button", { name: starter })).toBeVisible();
    }
  });

  await test.step("profile dialog is limited, traps focus, and restores it", async () => {
    const trigger = page.getByTestId("chat-profile-open");
    await trigger.click();
    const dialog = page.getByTestId("chat-profile-dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText("Bob", { exact: true })).toBeVisible();
    await expect(dialog.getByText("Bob is here for a good conversation and a great night.")).toBeVisible();
    await expect(dialog.locator("img")).toHaveCount(1);
    await expect(dialog.getByRole("button", { name: "Retour à la conversation" })).toBeVisible();
    expect(await page.evaluate(() => document.activeElement?.closest('[data-testid="chat-profile-dialog"]') !== null)).toBe(true);
    await dialog.getByRole("button", { name: "Retour à la conversation" }).click();
    await expect(trigger).toBeFocused();

    await trigger.click();
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeFocused();

    await trigger.click();
    await page.getByTestId("chat-profile-overlay").click({ position: { x: 5, y: 5 } });
    await expect(dialog).toHaveCount(0);
    await trigger.click();
    await dialog.getByRole("button", { name: "Fermer le profil" }).click();
    await expect(dialog).toHaveCount(0);
  });

  await test.step("mobile layout is a bottom sheet and reduced motion is honored", async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.getByTestId("chat-profile-open").click();
    const dialog = page.getByTestId("chat-profile-dialog");
    const box = await dialog.boundingBox();
    expect(box).not.toBeNull();
    expect(Math.abs(box!.y + box!.height - 844)).toBeLessThanOrEqual(1);
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(390);
    expect(await dialog.evaluate((element) => getComputedStyle(element).transitionDuration)).toBe("0s");
    await page.keyboard.press("Escape");
    expect(await suggestions.evaluate((element) => getComputedStyle(element).animationName)).toBe("none");
  });

  await test.step("the safety menu remains immediately available", async () => {
    await page.getByTestId("chat-menu").click();
    await expect(page.getByTestId("chat-report-open")).toBeVisible();
    await expect(page.getByTestId("chat-block-open")).toBeVisible();
  });

  await test.step("starters stay gone after the first message", async () => {
    await input.fill("Je viens te dire bonjour ?");
    await page.getByTestId("chat-send").click();
    await expect(page.getByTestId("chat-message").filter({ hasText: "Je viens te dire bonjour ?" })).toHaveCount(1);
    await expect(suggestions).toBeHidden();
    await page.reload();
    await expect(input).toBeVisible();
    await expect(suggestions).toBeHidden();
  });

  await context.close();
});

test("two sessions cover chat delivery, recovery, presence, safety and room geometry", async ({ browser }) => {
  test.setTimeout(180_000);
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

    await createMatch(service, fixture, fixture.users.partners[0]);
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
      await createMatch(service, fixture, partner);
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
    const pillName = longPill.locator("span").last();
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
