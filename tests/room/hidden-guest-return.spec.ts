import type { Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../../lib/database.types";
import { test, expect, type TestData, type TestIdentity } from "../helpers/fixtures";
import { captureFolder } from "../helpers/text-overflow";

// #481: a guest who hid her profile is never shown again without deciding it,
// whichever way she comes back into the same night.
const hidden = (page: Page, title = "Your profile is hidden") => page.getByRole("heading", { name: title });
const setLocale = (page: Page, locale: "en" | "fr") => page.evaluate(value => localStorage.setItem("amourette-locale", value), locale);
const asUser = (data: TestData, user: TestIdentity) => createClient<Database>(data.env.url, data.env.publishableKey, {
  auth: { persistSession: false, autoRefreshToken: false },
  global: { headers: { Authorization: `Bearer ${user.session.access_token}` } },
});

test("a hidden guest stays hidden after Join tonight, a reload, a pause and a new scan", async ({ data, contextFor }) => {
  const venue = await data.venue();
  const alice = await data.identity("Alice", "woman");
  const bob = await data.identity("Bob", "man");
  const founder = await data.identity("Founder", "man");
  await data.checkIn(venue, [alice, bob]);
  await data.founder(founder);
  const admin = asUser(data, founder);
  // What Bob's room is allowed to show, read with his own session.
  const bobSees = async () => {
    const { data: rows, error } = await asUser(data, bob).rpc("room_candidates", { p_venue_id: venue.id });
    expect(error).toBeNull();
    return (rows ?? []).some(row => row.id === alice.id);
  };
  const expectStillHidden = async (page: Page, shot: string, title?: string) => {
    await expect(hidden(page, title).or(page.getByRole("button", { name: /Night options|Options de la soirée/ }))).toBeVisible();
    // The screen she lands on, before the assertion, so a failure shows it too.
    // Published by CI with the other fixture-only mobile captures.
    await page.screenshot({ path: `${captureFolder}/hidden-guest-${shot}.png`, scale: "css", animations: "disabled" });
    await expect(hidden(page, title)).toBeVisible();
    const active = await data.service.from("presence").select("is_visible")
      .eq("profile_id", alice.id).eq("venue_night_id", venue.nightId).is("left_at", null);
    expect(active.error).toBeNull();
    expect(active.data).toEqual([{ is_visible: false }]);
    expect(await bobSees()).toBe(false);
  };
  const leave = async (page: Page) => {
    await page.getByRole("button", { name: "Leave", exact: true }).click();
    await page.getByRole("dialog", { name: "Leave?", exact: true }).getByRole("button", { name: "Leave", exact: true }).click();
    await expect(page.getByRole("heading", { name: /You’ve left|Back at the bar\?/ })).toBeVisible();
  };

  try {
    const context = await contextFor(alice);
    await context.addInitScript(() => localStorage.setItem("amourette-room-hint-dismissed", "1"));
    const page = await context.newPage();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/v/${venue.slug}`);
    expect(await bobSees()).toBe(true);
    await page.getByRole("button", { name: "Night options" }).click();
    await page.getByRole("button", { name: "Hide my profile", exact: true }).click();
    await expect(hidden(page)).toBeVisible();
    expect(await bobSees()).toBe(false);

    await test.step("Join tonight after leaving", async () => {
      await leave(page);
      await page.getByRole("button", { name: "Join tonight", exact: true }).click();
      await expectStillHidden(page, "rejoin-en");
    });

    await test.step("reload with the presence still active, in French then English", async () => {
      await setLocale(page, "fr");
      await page.reload();
      await expectStillHidden(page, "reload-fr", "Ton profil est masqué");
      await setLocale(page, "en");
      await page.reload();
      await expectStillHidden(page, "reload-en");
    });

    await test.step("a founder pauses and reopens the night", async () => {
      expect((await admin.rpc("close_venue_night", { p_venue_night_id: venue.nightId })).error).toBeNull();
      await expect(page.getByRole("heading", { name: "The night is paused" })).toBeVisible();
      expect((await admin.rpc("reopen_venue_night", { p_venue_night_id: venue.nightId })).error).toBeNull();
      // The pause ended Bob's presence too: bring him back so his feed is a real witness.
      expect((await asUser(data, bob).rpc("check_in", { p_venue_id: venue.id })).error).toBeNull();
      await expectStillHidden(page, "after-pause");
    });

    await test.step("a new scan of the venue QR after leaving", async () => {
      await leave(page);
      const scanned = await context.newPage();
      await scanned.setViewportSize({ width: 390, height: 844 });
      await scanned.goto(`/v/${venue.slug}`);
      await expect(scanned.getByRole("heading", { name: "Back at the bar?" })).toBeVisible();
      await scanned.getByRole("button", { name: "Join tonight", exact: true }).click();
      await expectStillHidden(scanned, "new-scan");
    });

    await test.step("her own choice to be visible is kept too", async () => {
      await page.close();
      const [scanned] = context.pages();
      await scanned.getByRole("button", { name: "Make my profile visible", exact: true }).click();
      await expect(scanned.getByRole("button", { name: "Night options" })).toBeVisible();
      await expect.poll(bobSees).toBe(true);
    });
    await context.close();
  } finally {
    expect((await data.service.from("admins").delete().eq("user_id", founder.id)).error).toBeNull();
  }
});
