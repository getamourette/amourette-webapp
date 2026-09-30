import { test, expect } from "../helpers/fixtures";

test("the top back control returns directly to the room on mobile", async ({ data, contextFor }) => {
  const identity = await data.identity("Alice", "woman");
  const venue = await data.venue();
  await data.checkIn(venue, [identity]);
  const page = await (await contextFor(identity)).newPage();

  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 667 });
    await page.goto(`/v/${venue.slug}`);
    await page.locator('[aria-controls="room-overflow-menu"]').click();
    await page.getByRole("link", { name: "Edit my profile", exact: true }).click();
    const back = page.getByRole("button", { name: "Back", exact: true }).first();
    await expect(back).toBeInViewport();
    const bounds = await back.boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds!.height).toBeGreaterThanOrEqual(44);
    expect(bounds!.x).toBeLessThan(width / 2);
    await expect(page.locator("body")).toHaveJSProperty("scrollWidth", width);
    await back.focus();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(`/v/${venue.slug}`);
    await expect(page.getByRole("alertdialog")).toHaveCount(0);
  }
});

test("back protects unsaved edits and supports keyboard cancellation and discard", async ({ data, contextFor }) => {
  const identity = await data.identity("Alice", "woman");
  const venue = await data.venue();
  const page = await (await contextFor(identity)).newPage();
  await page.goto(`/profile?edit=1&venue=${venue.slug}`);
  const bio = page.getByPlaceholder("Bio (optional)");
  const originalBio = `${identity.name} is here for a good conversation and a great night.`;
  await bio.fill("Unsaved bio");
  const back = page.getByRole("button", { name: "Back", exact: true }).first();
  await back.click();
  const dialog = page.getByRole("alertdialog", { name: "Discard changes?" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Keep editing" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(back).toBeFocused();
  await expect(bio).toHaveValue("Unsaved bio");

  await page.keyboard.press("Enter");
  await dialog.getByRole("button", { name: "Keep editing" }).click();
  await expect(back).toBeFocused();
  await expect(bio).toHaveValue("Unsaved bio");

  await back.click();
  await page.keyboard.press("Tab");
  await expect(dialog.getByRole("button", { name: "Discard changes", exact: true })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(`/v/${venue.slug}`);
  const { data: saved, error } = await data.service.from("profiles").select("bio").eq("id", identity.id).single();
  expect(error).toBeNull();
  expect(saved?.bio).toBe(originalBio);

  await page.goto("/profile?edit=1");
  await page.getByRole("button", { name: "Back", exact: true }).first().click();
  await expect(page).toHaveURL("/");
});
