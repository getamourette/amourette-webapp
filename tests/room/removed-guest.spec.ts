import type { Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../../lib/database.types";
import { test, expect, type TestData, type TestIdentity } from "../helpers/fixtures";
import { captureFolder } from "../helpers/text-overflow";

// #517: a guest a founder removed for tonight is told plainly that they cannot
// join this night again, without a reason and without a way back in.
const asUser = (data: TestData, user: TestIdentity) => createClient<Database>(data.env.url, data.env.publishableKey, {
  auth: { persistSession: false, autoRefreshToken: false },
  global: { headers: { Authorization: `Bearer ${user.session.access_token}` } },
});
const setLocale = (page: Page, locale: "en" | "fr") => page.evaluate(value => localStorage.setItem("amourette-locale", value), locale);

test("a guest removed for tonight sees that they cannot join again, with no way back in", async ({ data, contextFor }) => {
  test.setTimeout(120_000);
  const venue = await data.venue();
  const bob = await data.identity("Bob", "man");
  const founder = await data.identity("Founder", "man");
  await data.checkIn(venue, [bob]);
  await data.founder(founder);

  const context = await contextFor(bob);
  await context.addInitScript(() => localStorage.setItem("amourette-room-hint-dismissed", "1"));
  const page = await context.newPage();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/v/${venue.slug}`);
  await expect(page.getByRole("button", { name: "Night options" })).toBeVisible({ timeout: 30_000 });

  const removal = await asUser(data, founder).rpc("eject_from_venue", {
    p_profile_id: bob.id, p_venue_id: venue.id, p_reason: "unsafe_behavior",
  });
  expect(removal.error).toBeNull();

  // His open room notices the closed presence and offers the usual way back.
  await expect(page.getByRole("heading", { name: "Back at the bar?" })).toBeVisible({ timeout: 30_000 });
  const checkIns: string[] = [];
  page.on("request", request => { if (request.url().includes("/rpc/check_in")) checkIns.push(request.url()); });
  await page.getByRole("button", { name: "Join tonight", exact: true }).click();

  const removed = page.getByRole("heading", { name: "You can no longer join this night" });
  await expect(removed).toBeVisible();
  await expect(page.getByText("If you have any questions, speak to the bar staff.")).toBeVisible();
  await expect(page.getByRole("button", { name: /Join/ })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Couldn’t load this page" })).toHaveCount(0);
  expect(checkIns).toHaveLength(1);
  await page.screenshot({ path: `${captureFolder}/removed-guest-en.png`, scale: "css", animations: "disabled" });

  // The screen stays put: no silent retry brings him back into the room.
  await page.waitForTimeout(6_000);
  await expect(removed).toBeVisible();
  expect(checkIns).toHaveLength(1);

  await setLocale(page, "fr");
  await page.reload();
  await page.getByRole("button", { name: "Rejoindre la soirée", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Tu ne peux plus rejoindre cette soirée" })).toBeVisible();
  await expect(page.getByText("Pour toute question, adresse-toi au staff du bar.")).toBeVisible();
  await page.screenshot({ path: `${captureFolder}/removed-guest-fr.png`, scale: "css", animations: "disabled" });

  const presence = await data.service.from("presence").select("id").eq("profile_id", bob.id)
    .eq("venue_night_id", venue.nightId).is("left_at", null);
  expect(presence.error).toBeNull();
  expect(presence.data).toEqual([]);
});
