import sharp from "sharp";
import { test, expect } from "../helpers/fixtures";

// A colored source makes a real crop distinguishable from the original upload.
async function sourcePhoto() {
  return sharp({ create: { width: 1200, height: 1600, channels: 3, background: "#b75e70" } })
    .composite([{ input: await sharp({ create: { width: 400, height: 1600, channels: 3, background: "#385f72" } }).png().toBuffer(), left: 0, top: 0 }])
    .png({ compressionLevel: 0 }).toBuffer();
}

test("initial profile photo is cropped before joining", async ({ data, contextFor }) => {
  test.setTimeout(180_000);
  const identity = await data.identity("NewCrop");
  const page = await (await contextFor(identity)).newPage();
  await page.goto("/profile");
  const next = page.getByRole("button", { name: "Continue", exact: true });
  await page.getByPlaceholder("First name", { exact: true }).fill(identity.name);
  await next.click();
  const input = page.locator('input[type="file"]');
  const file = { name: "first.png", mimeType: "image/png", buffer: await sourcePhoto() };
  expect(file.buffer.length).toBeGreaterThan(5 * 1024 * 1024);
  await input.setInputFiles(file);
  const dialog = page.getByRole("dialog", { name: "Crop your photo" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(next).toBeDisabled();
  expect(file.buffer.length).toBeGreaterThan(5 * 1024 * 1024);
  await input.setInputFiles(file);
  const alternative = await sharp({ create: { width: 1200, height: 1600, channels: 3, background: "#287f4a" } }).png({ compressionLevel: 0 }).toBuffer();
  const [chooser] = await Promise.all([
    page.waitForEvent("filechooser"),
    dialog.getByText("Change photo", { exact: true }).click(),
  ]);
  await chooser.setFiles({ name: "different.png", mimeType: "image/png", buffer: alternative });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Confirm crop", exact: true }).click();
  await page.getByRole("button", { name: "← Back", exact: true }).click();
  const preview = page.locator("label img");
  const previewBytes = Buffer.from(await preview.evaluate(async image => Array.from(new Uint8Array(await (await fetch((image as HTMLImageElement).src)).arrayBuffer()))));
  const previewSize = await sharp(previewBytes).metadata();
  expect(previewSize.width).toBeLessThan(1200);
  const previewPixel = await sharp(previewBytes).removeAlpha().raw().toBuffer();
  expect([...previewPixel.subarray(0, 3)]).toEqual([40, 127, 74]);
  await page.reload();
  const restored = page.locator("label img");
  await expect(restored).toBeVisible();
  const restoredBytes = Buffer.from(await restored.evaluate(async image => Array.from(new Uint8Array(await (await fetch((image as HTMLImageElement).src)).arrayBuffer()))));
  const restoredSize = await sharp(restoredBytes).metadata();
  expect(restoredSize.width).toBe(previewSize.width);
  expect(restoredSize.height).toBe(previewSize.height);
  await next.click();
  await page.getByRole("group", { name: "I am", exact: true }).getByRole("button", { name: "Woman", exact: true }).click();
  await next.click();
  await page.getByRole("group", { name: "I’d like to meet", exact: true }).getByRole("button", { name: "Man", exact: true }).click();
  await next.click();
  await next.click();
  await page.getByRole("checkbox", { name: "I confirm that I am 18 or older." }).check();
  const photoSourceLookups: string[] = [];
  page.on("request", request => {
    if (new URL(request.url()).pathname.endsWith("/rpc/profile_photo_source")) photoSourceLookups.push(request.url());
  });
  // Larger originals cross remote Storage multiple times from localhost. This
  // is a functional wait, not an accepted user-facing latency target.
  const uploadStarted = Date.now();
  await page.getByRole("button", { name: "Join tonight", exact: true }).click();
  await expect(page).toHaveURL("/", {timeout:90_000});
  test.info().annotations.push({type:'photo-upload-ms',description:String(Date.now()-uploadStarted)});
  const version = await data.service.from("photo_versions").select("path,source_path").eq("profile_id", identity.id).single();
  expect(version.error).toBeNull();
  const originalStored = await data.service.storage.from("profile-photo-sources").download(version.data!.source_path!);
  expect(originalStored.error).toBeNull();
  const preserved = await sharp(Buffer.from(await originalStored.data!.arrayBuffer())).raw().toBuffer({resolveWithObject:true});
  const expectedSource = await sharp(alternative).raw().toBuffer({resolveWithObject:true});
  expect(preserved.info).toEqual(expectedSource.info);
  expect(preserved.data.equals(expectedSource.data)).toBe(true);
  const stored = await data.service.storage.from("profile-photos").download(version.data!.path);
  expect(stored.error).toBeNull();
  const metadata = await sharp(Buffer.from(await stored.data!.arrayBuffer())).metadata();
  expect(metadata.format).toBe("png");
  expect(metadata.width).toBe(previewSize.width);
  expect(metadata.height).toBe(previewSize.height);
  const ring = page.locator(".night-card .night-photo-ring");
  await expect(ring.locator("img")).toBeVisible();
  await page.reload();
  await expect(ring.locator("img")).toBeVisible();
  expect(photoSourceLookups).toHaveLength(0);
  const disappeared = await ring.evaluate(async element => {
    let missing = false;
    const observer = new MutationObserver(() => { if (!element.querySelector("img")) missing = true; });
    observer.observe(element, { childList: true, subtree: true });
    await new Promise(resolve => setTimeout(resolve, 31_000));
    observer.disconnect();
    return missing;
  });
  expect(disappeared).toBe(false);
});

test("crop confirmation saves native pixels; cancel preserves the selection", async ({ data, contextFor, request }) => {
  test.setTimeout(180_000);
  const identity = await data.identity("CropAlice");
  const initial = await request.post("/api/profile-photo", {
    headers: { Authorization: `Bearer ${identity.session.access_token}` },
    multipart: {
      revision: "0",
      profile: JSON.stringify({ first_name: identity.name, gender: "woman", interested_in: ["man"], adult_confirmed: true }),
      photo: { name: "initial.jpg", mimeType: "image/jpeg", buffer: await sharp(await sourcePhoto()).jpeg().toBuffer() },
    },
  });
  expect(initial.ok(), await initial.text()).toBeTruthy();
  const page = await (await contextFor(identity)).newPage();
  await page.goto("/profile?edit=1");
  // Wait for the displayed photo: the profile form and photo-state query load
  // independently, and a replacement needs the loaded revision to submit.
  await expect(page.locator("label img")).toBeVisible();
  const input = page.locator('input[type="file"]');
  const file = { name: "portrait.png", mimeType: "image/png", buffer: await sourcePhoto() };
  expect(file.buffer.length).toBeGreaterThan(5 * 1024 * 1024);
  await input.setInputFiles(file);
  const dialog = page.getByRole("dialog", { name: "Crop your photo" });
  await expect(dialog).toBeVisible();
  const confirm = dialog.getByRole("button", { name: "Confirm crop", exact: true });
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
  expect(metadata.height!).toBeLessThanOrEqual(1600);
  expect(metadata.width! / metadata.height!).toBeCloseTo(9 / 19.5, 2);
  expect(cropped.length).toBeLessThan(4 * 1024 * 1024);

  expect(file.buffer.length).toBeGreaterThan(5 * 1024 * 1024);
  await input.setInputFiles(file);
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(preview).toHaveAttribute("src", selectedUrl!);

  const uploadStarted = Date.now();
  const [response] = await Promise.all([
    page.waitForResponse(response => new URL(response.url()).pathname === "/api/profile-photo" && response.request().method() === "POST", { timeout: 90_000 }),
    page.getByRole("button", { name: "Send this photo", exact: true }).click(),
  ]);
  test.info().annotations.push({type:"photo-upload-ms",description:String(Date.now()-uploadStarted)});
  expect(response.ok(), await response.text()).toBeTruthy();
  test.info().annotations.push({type:'photo-server-timing',description:response.headers()['server-timing'] ?? 'missing'});
  // Only the ticket crosses Vercel; inspect the persisted lossless replacement.
  expect(response.request().postDataJSON()).toEqual({ ticket: expect.any(String) });
  const submittedPhoto: { id: string } = await response.json();
  const version = await data.service.from("photo_versions").select("path,source_path").eq("id", submittedPhoto.id).single();
  expect(version.error).toBeNull();
  const originalStored = await data.service.storage.from("profile-photo-sources").download(version.data!.source_path!);
  expect(originalStored.error).toBeNull();
  const preserved = await sharp(Buffer.from(await originalStored.data!.arrayBuffer())).raw().toBuffer({resolveWithObject:true});
  const expectedSource = await sharp(file.buffer).raw().toBuffer({resolveWithObject:true});
  expect(preserved.info).toEqual(expectedSource.info);
  expect(preserved.data.equals(expectedSource.data)).toBe(true);
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
  await expect(dialog.getByRole("button", { name: "Confirm crop", exact: true })).toBeDisabled();
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Send this photo", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Back", exact: true }).first().click();
  await expect(page).toHaveURL("/");
});
