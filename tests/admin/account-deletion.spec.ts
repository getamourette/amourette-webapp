import { createClient } from "@supabase/supabase-js";
import { mkdir } from "node:fs/promises";
import sharp from "sharp";
import type { Page } from "@playwright/test";
import { test, expect, type TestData, type TestIdentity } from "../helpers/fixtures";
import { selectReviewProfile } from "../helpers/profile-review";
import { captureFolder } from "../helpers/text-overflow";
import type { Database } from "../../lib/database.types";

// #258: a founder deletes a guest's profile and account from profile review, on
// a verified request. Refused while a report about the guest is open; once it
// is decided, the profile, its rows and every photo file go, and the founder
// action history stays. scripts/test-account-deletion-sql.mjs proves the whole
// list of what the database removes and keeps.
const BUCKETS = ["profile-photos", "profile-photo-staging", "profile-photo-sources", "profile-photo-rounds"] as const;
const as = (data: TestData, who: TestIdentity) => createClient<Database>(data.env.url, data.env.publishableKey, {
  accessToken: async () => who.session.access_token,
  auth: { persistSession: false, autoRefreshToken: false },
});
const files = async (data: TestData, id: string) => {
  const found: string[] = [];
  for (const bucket of BUCKETS) {
    const { data: listed, error } = await data.service.storage.from(bucket).list(id);
    expect(error).toBeNull();
    found.push(...(listed ?? []).map(file => `${bucket}/${file.name}`));
  }
  return found.sort();
};
async function capture(page: Page, name: string) {
  await mkdir(captureFolder, { recursive: true });
  await page.screenshot({ path: `${captureFolder}/${name}-${test.info().project.name}.png` });
}
async function deleteFromReview(page: Page, venueId: string, name: string) {
  const review = await selectReviewProfile(page, venueId, name);
  await review.getByText("Account deletion", { exact: true }).click();
  await review.getByRole("button", { name: "Delete account…", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: `Delete ${name}’s account?` });
  await expect(dialog.getByRole("button", { name: "Delete account", exact: true })).toBeDisabled();
  await dialog.getByLabel("Type DELETE to confirm").fill("DELETE");
  return { review, dialog };
}

test("a founder deletes a guest's profile, photos and account once open reports are decided", async ({ data, contextFor, request }) => {
  test.setTimeout(180_000);
  const photo = await sharp({ create: { width: 64, height: 64, channels: 3, background: "#c2410c" } }).png().toBuffer();
  const founder = await data.founder(await data.identity("DeletionFounder"));
  const venue = await data.venue();
  const alice = await data.identity("DeletionAlice", "woman");
  const bob = await data.identity("DeletionBob", "man");
  await data.checkIn(venue, [alice, bob]);
  await data.match(venue, alice, bob);
  // One file in each bucket a guest's photos can reach, plus Bob's own.
  for (const id of [alice.id, bob.id]) for (const bucket of BUCKETS) {
    const uploaded = await data.service.storage.from(bucket).upload(`${id}/${bucket}.png`, photo, { contentType: "image/png" });
    expect(uploaded.error).toBeNull();
  }
  expect(await files(data, alice.id)).toHaveLength(BUCKETS.length);
  const report = await as(data, bob).rpc("submit_report", { p_reported_id: alice.id, p_venue_night_id: venue.nightId, p_reason: "fake_profile" });
  expect(report.error).toBeNull();

  const page = await (await contextFor(founder)).newPage();
  await page.goto("/admin");
  await page.getByRole("navigation", { name: "Admin", exact: true }).getByRole("link", { name: "Moderation", exact: true }).click();

  // Open report: refused, nothing deleted.
  const first = await deleteFromReview(page, venue.id, alice.name);
  let dialog = first.dialog;
  await capture(page, "account-deletion-confirm");
  await dialog.getByRole("button", { name: "Delete account", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("A report this person made or received is still open.");
  await capture(page, "account-deletion-refused");
  expect((await data.service.auth.admin.getUserById(alice.id)).error).toBeNull();
  expect(await files(data, alice.id)).toHaveLength(BUCKETS.length);
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();

  // Decided: the deletion goes through.
  expect((await as(data, founder).rpc("review_report", { p_report_id: report.data! })).error).toBeNull();
  const second = await deleteFromReview(page, venue.id, alice.name);
  const review = second.review;
  dialog = second.dialog;
  await dialog.getByRole("button", { name: "Delete account", exact: true }).click();
  await expect(review.getByRole("status").filter({ hasText: "deleted" })).toContainText(`${alice.name}’s profile, photos and account were deleted.`);
  await capture(page, "account-deletion-done");

  expect((await data.service.auth.admin.getUserById(alice.id)).error?.status).toBe(404);
  expect((await data.service.from("profiles").select("id").eq("id", alice.id)).data).toEqual([]);
  expect(await files(data, alice.id)).toEqual([]);
  expect(await files(data, bob.id)).toHaveLength(BUCKETS.length);
  expect((await data.service.from("profiles").select("id").eq("id", bob.id)).data).toEqual([{ id: bob.id }]);
  const history = await as(data, founder).rpc("admin_moderation_history", { p_profile_id: alice.id });
  expect(history.error).toBeNull();
  expect(history.data?.length, "the decision on the report stays in the founder history").toBeGreaterThan(0);
  await review.getByRole("button", { name: "Reload profiles", exact: true }).click();
  await expect(review.getByText(alice.name, { exact: true })).toHaveCount(0);

  // A retry on the deleted account only sweeps files; it never fails.
  const call = (who: TestIdentity, profileId: string, origin = new URL(page.url()).origin) => request.post("/api/admin/account-deletion", {
    headers: { Origin: origin, Authorization: `Bearer ${who.session.access_token}` }, data: { profileId },
  });
  const again = await call(founder, alice.id);
  expect(again.status()).toBe(200);
  expect(await again.json()).toEqual({ deleted: "already_deleted" });

  // Refusals: a guest, another site, a founder's own account, a malformed id.
  expect((await call(bob, bob.id)).status()).toBe(403);
  expect((await call(founder, bob.id, "https://example.com")).status()).toBe(403);
  const self = await call(founder, founder.id);
  expect(self.status()).toBe(409);
  expect((await self.json()).reason).toBe("self");
  expect((await call(founder, "not-a-uuid")).status()).toBe(400);
  expect((await data.service.auth.admin.getUserById(bob.id)).error).toBeNull();
});
