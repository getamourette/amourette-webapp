import type { Locator, Page } from "@playwright/test";
import { test, expect } from "../helpers/fixtures";
import { captureFolder } from "../helpers/text-overflow";
import { t } from "../../lib/strings";

// #518: once a guest has gone through everyone present and already has a
// match, the floating match row sits above the empty-room title, never on it.
const locales = ["fr", "en", "es"] as const;
const widths = [320, 390] as const;

async function expectBelow(page: Page, upper: Locator, lower: Locator, label: string) {
  await expect(upper).toBeVisible();
  await expect(lower).toBeVisible();
  const a = await upper.boundingBox();
  const b = await lower.boundingBox();
  expect(a, label).not.toBeNull();
  expect(b, label).not.toBeNull();
  // At rest: nothing scrolled under the chrome yet.
  expect(await page.getByTestId("empty-live-room").locator(".overflow-y-auto").evaluate(e => e.scrollTop)).toBe(0);
  expect.soft(b!.y, `${label}: starts below the match row`).toBeGreaterThanOrEqual(a!.y + a!.height);
}

test("the match row never covers the empty-room title, with one match or several", async ({ data, contextFor }) => {
  test.setTimeout(300_000);
  const venue = await data.venue();
  const alice = await data.identity("Alice", "woman");
  const bob = await data.identity("Bob", "man");
  const carlos = await data.identity("Carlos", "man");
  const dario = await data.identity("Dario", "man");
  await data.checkIn(venue, [alice, bob, carlos, dario]);
  // Every other guest is already a match: nobody is left to show.
  await data.match(venue, alice, bob);

  const context = await contextFor(alice);
  await context.addInitScript(() => localStorage.setItem("amourette-room-hint-dismissed", "1"));
  const page = await context.newPage();
  // A seeded match can arrive over realtime after entry and open its reveal.
  await page.addLocatorHandler(
    page.getByRole("button", { name: /^(Back to tonight|Retour à la soirée|Volver a la noche)$/ }),
    async (dismiss) => { await dismiss.click(); },
  );

  const visit = async (locale: (typeof locales)[number]) => {
    await page.goto("about:blank");
    await context.addInitScript(value => localStorage.setItem("amourette-locale", value), locale);
    await page.goto(`/v/${venue.slug}`);
  };

  // A single match with nobody left to show: Carlos and Dario leave for now.
  const { error: leftError } = await data.service.from("presence")
    .update({ left_at: new Date().toISOString() })
    .in("profile_id", [carlos.id, dario.id]).eq("venue_night_id", venue.nightId).is("left_at", null);
  expect(leftError).toBeNull();

  const sweep = async (shot: string, expand: boolean) => {
    for (const locale of locales) {
      const s = t[locale].room;
      await visit(locale);
      const title = page.getByRole("heading", { name: s.empty.liveTitle, exact: true });
      const stack = page.getByTestId("match-stack");
      await expect(title).toBeVisible({ timeout: 60_000 });
      for (const width of widths) {
        await page.setViewportSize({ width, height: 740 });
        if (expand) {
          if (await page.getByTestId("match-strip").count() === 0) await stack.getByRole("button").first().click();
          await expect(page.getByTestId("match-strip")).toBeVisible();
        }
        await page.screenshot({ path: `${captureFolder}/empty-room-${shot}-${locale}-${width}.png`, scale: "css", animations: "disabled" });
        await expectBelow(page, stack, title, `${shot} ${locale} ${width}px`);
      }
    }
  };

  await test.step("one match", async () => {
    await sweep("one-match", false);
  });

  await test.step("an arrival held back while an answer is typed", async () => {
    const s = t.en.room;
    await visit("en");
    await page.setViewportSize({ width: 320, height: 740 });
    await page.getByRole("button", { name: new RegExp(s.emailCard.title) }).click();
    await page.getByRole("textbox").fill("alice@example.test");
    const { error } = await data.service.from("presence").insert({
      profile_id: carlos.id, venue_id: venue.id, venue_night_id: venue.nightId, is_visible: true,
    });
    expect(error).toBeNull();
    const arrival = page.getByRole("button", { name: s.empty.heldArrival });
    await expect(arrival).toBeVisible({ timeout: 30_000 });
    // The pill joins the match row: beside the chip, never on it, and the
    // draft being typed is not moved.
    const chip = page.getByTestId("match-stack").getByRole("link");
    for (const width of widths) {
      await page.setViewportSize({ width, height: 740 });
      await page.screenshot({ path: `${captureFolder}/empty-room-held-arrival-en-${width}.png`, scale: "css", animations: "disabled" });
      const a = (await chip.boundingBox())!;
      const b = (await arrival.boundingBox())!;
      expect.soft(b.x, `held arrival en ${width}px: beside the chip`).toBeGreaterThanOrEqual(a.x + a.width);
      expect.soft(b.x + b.width, `held arrival en ${width}px: inside the screen`).toBeLessThanOrEqual(width);
      expect.soft(Math.abs((b.y + b.height / 2) - (a.y + a.height / 2)), `held arrival en ${width}px: on the match row`).toBeLessThan(4);
    }
    // For those few seconds the chip shows the photo only, so a long name
    // never crowds the row; it still opens the conversation.
    await expect(chip).not.toContainText("Bob");
    await expect(chip).toHaveAccessibleName(s.openConversation("Bob"));
    await expect(page.getByRole("textbox")).toHaveValue("alice@example.test");
  });

  await test.step("several matches, collapsed and expanded", async () => {
    await page.goto("about:blank");
    const { error } = await data.service.from("presence").insert([dario].map(({ id }) => ({
      profile_id: id, venue_id: venue.id, venue_night_id: venue.nightId, is_visible: true,
    })));
    expect(error).toBeNull();
    await data.match(venue, alice, carlos);
    await data.match(venue, alice, dario);
    await sweep("three-matches", false);
    await sweep("three-matches-open", true);
  });
});
