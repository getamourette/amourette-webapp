import { test, expect } from "../helpers/fixtures";

test("conversation starters and the limited profile preview reduce first-contact friction", async ({ data, contextFor }) => {
  test.setTimeout(120_000);
  const venue = await data.venue();
  const alice = await data.identity("Alice", "woman");
  const bob = await data.identity("Bob", "man");
  await data.checkIn(venue, [alice, bob]);
  const fixture = { users: { alice, bob }, matchId: await data.match(venue, alice, bob) };
  const context = await contextFor(fixture.users.alice);
  const page = await context.newPage();
  await page.goto(`/chat/${fixture.matchId}`);
  await expect(page.getByTestId("chat-input")).toBeVisible();
  await page.evaluate(() => {
    localStorage.setItem("amourette-locale", "fr");
    window.dispatchEvent(new Event("amourette-locale-change"));
  });
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

});

