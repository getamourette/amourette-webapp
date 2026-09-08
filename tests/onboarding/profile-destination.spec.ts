import { test, expect } from "../helpers/fixtures";

test("a completed profile enters only an explicitly supplied valid venue", async ({ data, contextFor }) => {
  const identity = await data.identity("Alice", "woman");
  const page = await (await contextFor(identity)).newPage();

  for (const query of ["", "?venue=", `?venue=missing-${data.runId}`]) {
    await page.goto(`/profile${query}`);
    await expect(page).toHaveURL("/");
    await expect(page.getByRole("link", { name: "Edit my profile" })).toBeVisible();
    await expect(page.locator('a[href^="/v/"]')).toHaveCount(0);
  }

  const { count, error } = await data.service.from("presence")
    .select("id", { count: "exact", head: true }).eq("profile_id", identity.id);
  expect(error).toBeNull();
  expect(count).toBe(0);

  const venue = await data.venue();
  await page.goto(`/profile?venue=${venue.slug}`);
  await expect(page).toHaveURL(`/v/${venue.slug}`);
});

test("creating a profile without a venue returns home without checking in", async ({ data, contextFor }) => {
  const identity = await data.identity("Alice");
  const page = await (await contextFor(identity)).newPage();
  await page.goto("/profile");

  const next = page.getByRole("button", { name: "Continue", exact: true });
  await page.getByPlaceholder("First name", { exact: true }).fill("Alice");
  await next.click();
  await page.locator('input[type="file"]').setInputFiles({
    name: "e2e-profile.png", mimeType: "image/png",
    buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aM1sAAAAASUVORK5CYII=", "base64"),
  });
  await next.click();
  await page.getByRole("group", { name: "I am", exact: true }).getByRole("button", { name: "Woman", exact: true }).click();
  await next.click();
  await page.getByRole("group", { name: "I want to meet", exact: true }).getByRole("button", { name: "Man", exact: true }).click();
  await next.click();
  await next.click();
  await page.getByRole("checkbox", { name: "I confirm that I am 18 or older." }).check();
  await page.getByRole("button", { name: "Enter the room", exact: true }).click();

  await expect(page).toHaveURL("/");
  await expect(page.getByRole("link", { name: "Edit my profile" })).toBeVisible();
  const { count, error } = await data.service.from("presence")
    .select("id", { count: "exact", head: true }).eq("profile_id", identity.id);
  expect(error).toBeNull();
  expect(count).toBe(0);
});

test("confirming age with an unknown venue returns home", async ({ data, contextFor }) => {
  const identity = await data.identity("Alice");
  // Model interrupted onboarding: the public profile exists, but the private
  // age confirmation has never been written.
  const { error } = await data.service.from("profiles").insert({
    id: identity.id, first_name: "Alice", gender: "woman",
    photo_url: "http://127.0.0.1:3100/favicon.ico", interested_in: ["man"],
  });
  expect(error).toBeNull();
  const page = await (await contextFor(identity)).newPage();
  await page.goto(`/profile?venue=missing-${data.runId}`);
  await expect(page.getByRole("heading", { name: "Confirm your age" })).toBeVisible();
  await page.getByRole("checkbox", { name: "I confirm that I am 18 or older." }).check();
  await page.getByRole("button", { name: "Enter the room", exact: true }).click();
  await expect(page).toHaveURL("/");
  await expect(page.getByRole("link", { name: "Edit my profile" })).toBeVisible();
});

test("profile editing returns home or to the explicitly supplied venue", async ({ data, contextFor }) => {
  const identity = await data.identity("Alice", "woman");
  const venue = await data.venue();
  const page = await (await contextFor(identity)).newPage();

  for (const [query, destination] of [
    ["", "/"],
    [`&venue=missing-${data.runId}`, "/"],
    [`&venue=${venue.slug}`, `/v/${venue.slug}`],
  ]) {
    await page.goto(`/profile?edit=1${query}`);
    await expect(page.getByRole("heading", { name: "Edit your profile" })).toBeVisible();
    await page.getByPlaceholder("Bio (optional)").fill(`Updated bio ${query}`);
    await page.getByRole("button", { name: "Save changes", exact: true }).click();
    await expect(page).toHaveURL(destination);
  }
});
