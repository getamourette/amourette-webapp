import { createClient } from "@supabase/supabase-js";
import type { Page } from "@playwright/test";
import { test, expect, type TestData, type TestIdentity } from "../helpers/fixtures";
import type { Database } from "../../lib/database.types";

// #482: a founder removes a participant for tonight from the door screen,
// without any report, and the removal really takes them out of the room.
const as = (data: TestData, who: TestIdentity) => createClient<Database>(data.env.url, data.env.publishableKey, {
  accessToken: async () => who.session.access_token,
  auth: { persistSession: false, autoRefreshToken: false },
});

async function openTonight(page: Page, nightId: string) {
  await page.goto(`/admin/tonight?night=${nightId}`);
  await expect(page.getByRole("heading", { name: "Tonight", exact: true })).toBeVisible();
  await page.getByLabel("Show test venues").check();
  const section = page.getByRole("region", { name: "Remove someone" });
  await section.getByRole("button", { name: "Show participants", exact: true }).click();
  return section;
}

test("a founder removes a participant for tonight without a report", async ({ data, contextFor }) => {
  test.setTimeout(150_000);
  const founder = await data.identity("DoorFounder");
  expect((await data.service.from("admins").insert({ user_id: founder.id })).error).toBeNull();
  const venue = await data.venue();
  const alice = await data.identity("Alice", "woman");
  const bob = await data.identity("Bob", "man");
  await data.checkIn(venue, [alice, bob]);

  const page = await (await contextFor(founder)).newPage();
  const section = await openTonight(page, venue.nightId);
  const people = section.getByRole("list", { name: "Tonight’s participants" });
  await expect(people.getByRole("listitem")).toHaveCount(2, { timeout: 30_000 });

  // The search narrows a crowded room to one row.
  await section.getByRole("searchbox", { name: "Search by first name" }).fill("bo");
  await expect(people.getByRole("listitem")).toHaveCount(1);
  await people.getByRole("button", { name: "Remove Bob for tonight", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Remove Bob for tonight?" });
  await dialog.getByLabel("Reason").selectOption("harassment");
  await dialog.getByLabel("Note for the founders (optional)").fill("Seen grabbing a guest at the bar.");
  await dialog.getByRole("button", { name: "Remove for tonight", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(section.getByRole("status")).toContainText("Bob was removed for tonight.");
  await expect(people.getByRole("button", { name: "Bob removed for tonight", exact: true })).toBeDisabled();

  // Audited: who removed whom, why, for this night.
  const founderClient = as(data, founder);
  const { data: ejections, error } = await founderClient.from("venue_ejections")
    .select("profile_id,venue_night_id,reason,note,created_by").eq("venue_night_id", venue.nightId);
  expect(error).toBeNull();
  expect(ejections).toEqual([{ profile_id: bob.id, venue_night_id: venue.nightId, reason: "harassment",
    note: "Seen grabbing a guest at the bar.", created_by: founder.id }]);
  // Out of the room now, and refused if he tries to check in again tonight.
  const { data: presence } = await data.service.from("presence").select("left_at").eq("profile_id", bob.id).eq("venue_night_id", venue.nightId);
  expect(presence?.[0]?.left_at).not.toBeNull();
  expect((await as(data, bob).rpc("check_in", { p_venue_id: venue.id })).error).not.toBeNull();
  const alicePage = await (await contextFor(alice)).newPage();
  await alicePage.addInitScript(() => localStorage.setItem("amourette-room-hint-dismissed", "1"));
  await alicePage.goto(`/v/${venue.slug}`);
  await expect(alicePage.getByRole("button", { name: "Night options" })).toBeVisible({ timeout: 30_000 });
  await expect(alicePage.getByText("Bob", { exact: true })).toHaveCount(0);
});

test("removing someone from a paused night is refused and says why", async ({ data, contextFor }) => {
  test.setTimeout(120_000);
  const founder = await data.identity("DoorFounder");
  expect((await data.service.from("admins").insert({ user_id: founder.id })).error).toBeNull();
  const venue = await data.venue();
  const bob = await data.identity("Bob", "man");
  await data.checkIn(venue, [bob]);
  const page = await (await contextFor(founder)).newPage();
  const section = await openTonight(page, venue.nightId);
  await section.getByRole("button", { name: "Remove Bob for tonight", exact: true }).click({ timeout: 30_000 });
  const dialog = page.getByRole("dialog", { name: "Remove Bob for tonight?" });

  // The founder pauses the room in the meantime: `eject_from_venue` refuses.
  expect((await as(data, founder).rpc("close_venue_night", { p_venue_night_id: venue.nightId })).error).toBeNull();
  await dialog.getByRole("button", { name: "Remove for tonight", exact: true }).click();
  await expect(dialog.getByRole("alert")).toHaveText("This night is paused or over: nobody can be removed right now.");
  await expect(dialog.getByRole("button", { name: "Remove for tonight", exact: true })).toBeEnabled();
  const { data: ejections } = await as(data, founder).from("venue_ejections").select("id").eq("venue_night_id", venue.nightId);
  expect(ejections).toEqual([]);
});
