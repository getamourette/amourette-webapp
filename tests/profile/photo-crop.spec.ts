import sharp from "sharp";
import { test, expect } from "../helpers/fixtures";

// A colored source makes a real crop distinguishable from the original upload.
async function sourcePhoto() {
  return sharp({ create: { width: 1200, height: 800, channels: 3, background: "#b75e70" } })
    .composite([{ input: await sharp({ create: { width: 400, height: 800, channels: 3, background: "#385f72" } }).png().toBuffer(), left: 0, top: 0 }])
    .jpeg().toBuffer();
}

test("crop confirmation saves native pixels; cancel preserves the selection", async ({ data, contextFor, request }) => {
  const identity = await data.identity("CropAlice");
  const initial = await request.post("/api/profile-photo", {
    headers: { Authorization: `Bearer ${identity.session.access_token}` },
    multipart: {
      revision: "0",
      profile: JSON.stringify({ first_name: identity.name, gender: "woman", interested_in: ["man"], adult_confirmed: true }),
      photo: { name: "initial.jpg", mimeType: "image/jpeg", buffer: await sourcePhoto() },
    },
  });
  expect(initial.ok(), await initial.text()).toBeTruthy();
  const page = await (await contextFor(identity)).newPage();
  await page.goto("/profile?edit=1");
  // Wait for the displayed photo: the profile form and photo-state query load
  // independently, and a replacement needs the loaded revision to submit.
  await expect(page.locator("label img")).toBeVisible();
  const input = page.locator('input[type="file"]');
  const file = { name: "landscape.jpg", mimeType: "image/jpeg", buffer: await sourcePhoto() };
  await input.setInputFiles(file);
  const dialog = page.getByRole("dialog", { name: "Frame your moment" });
  await expect(dialog).toBeVisible();
  const confirm = dialog.getByRole("button", { name: "Use photo", exact: true });
  await expect(confirm).toBeEnabled();
  await expect(dialog.getByRole("button", { name: "Cancel", exact: true })).toBeFocused();
  await page.keyboard.press("+");
  await confirm.click();
  await expect(dialog).toHaveCount(0);
  const preview = page.locator('label img');
  const selectedUrl = await preview.getAttribute("src");
  expect(selectedUrl).toMatch(/^blob:/);
  const bytes = await preview.evaluate(async image => Array.from(new Uint8Array(await (await fetch((image as HTMLImageElement).src)).arrayBuffer())));
  const cropped = Buffer.from(bytes);
  const metadata = await sharp(cropped).metadata();
  expect(metadata.format).toBe("png");
  expect(metadata.width!).toBeLessThan(1200);
  expect(metadata.height!).toBeLessThanOrEqual(800);
  expect(metadata.width! / metadata.height!).toBeCloseTo(page.viewportSize()!.width / page.viewportSize()!.height, 2);
  expect(cropped.length).toBeLessThan(4 * 1024 * 1024);

  await input.setInputFiles(file);
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(preview).toHaveAttribute("src", selectedUrl!);

  const [response] = await Promise.all([
    page.waitForResponse(response => new URL(response.url()).pathname === "/api/profile-photo" && response.request().method() === "POST", { timeout: 10_000 }),
    page.getByRole("button", { name: "Send this photo", exact: true }).click(),
  ]);
  expect(response.ok(), await response.text()).toBeTruthy();
  // Only the ticket crosses Vercel; inspect the persisted lossless replacement.
  expect(response.request().postDataJSON()).toEqual({ ticket: expect.any(String) });
  const submittedPhoto: { id: string } = await response.json();
  const version = await data.service.from("photo_versions").select("path").eq("id", submittedPhoto.id).single();
  expect(version.error).toBeNull();
  const stored = await data.service.storage.from("profile-photos").download(version.data!.path);
  expect(stored.error).toBeNull();
  const storedMetadata = await sharp(Buffer.from(await stored.data!.arrayBuffer())).metadata();
  expect(storedMetadata.format).toBe("png");
  expect(storedMetadata.width).toBe(metadata.width);
  expect(storedMetadata.height).toBe(metadata.height);
  await expect(page.getByTestId("photo-status")).toBeVisible();
  await expect(preview).not.toHaveAttribute("src", selectedUrl!);
});

test("unreadable images show an error and can be cancelled without changing the profile", async ({ data, contextFor }) => {
  const identity = await data.identity("CropError", "woman");
  const page = await (await contextFor(identity)).newPage();
  await page.goto("/profile?edit=1");
  await page.locator('input[type="file"]').setInputFiles({ name: "broken.jpg", mimeType: "image/jpeg", buffer: Buffer.from("not an image") });
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("alert")).toHaveText("Couldn't open this photo. Cancel and choose another image.");
  await expect(dialog.getByRole("button", { name: "Use photo", exact: true })).toBeDisabled();
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Send this photo", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Back", exact: true }).first().click();
  await expect(page).toHaveURL("/");
});
