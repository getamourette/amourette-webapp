import { readFileSync } from 'node:fs';
import sharp from 'sharp';
import { test, expect } from '../helpers/fixtures';

// Chromium does not decode HEIC. Model a native-capable decoder with an image
// having the same dimensions, while keeping the genuine original File and the
// real selection/cancellation flow. Real WebKit preview measurements supplement
// these deterministic races; server precision/refusal tests remain unchanged.
for (const result of ['success', 'refusal', 'cancel', 'dimensions'] as const) {
  test(`native HEIC is adjustable before validation and handles ${result}`, async ({ data, contextFor }) => {
    const owner = await data.identity('NativeHeic');
    const page = await (await contextFor(owner)).newPage();
    const png = await sharp({ create: { width: 128, height: 96, channels: 3, background: '#678abc' } }).png().toBuffer();
    await page.addInitScript(bytes => {
      const create = URL.createObjectURL.bind(URL);
      URL.createObjectURL = blob => create(blob instanceof Blob && blob.type === 'image/heic' ? new Blob([new Uint8Array(bytes)], { type: 'image/png' }) : blob);
    }, [...png]);
    let requested = false;
    let release!: () => void;
    const held = new Promise<void>(resolve => { release = resolve; });
    await page.route('**/storage/v1/object/upload/sign/profile-photo-staging/**', route => route.fulfill({ json: { Key: 'staged' } }));
    await page.route('**/api/profile-photo/prepare', async route => {
      if (!route.request().postDataJSON().ticket) return route.fulfill({ json: { path: `${owner.id}/native.heic`, token: 'test-token', ticket: 'test-ticket' } });
      requested = true;
      await held;
      if (result === 'refusal') return route.fulfill({ status: 400, json: { error: 'unsupported_heic' } }).catch(() => undefined);
      await route.fulfill({ contentType: 'image/png', headers: { 'X-Photo-Width': result === 'dimensions' ? '96' : '128', 'X-Photo-Height': '96' }, body: png }).catch(() => undefined);
    });
    try {
      await page.goto('/profile');
      await page.getByPlaceholder('First name', { exact: true }).fill(owner.name);
      await page.getByRole('button', { name: 'Continue', exact: true }).click();
      // Establish an accepted selection first; the pending HEIC must never own it.
      await page.locator('input[type=file]').setInputFiles({ name: 'accepted.png', mimeType: 'image/png', buffer: png });
      const cropper = page.locator('dialog:has(img[alt="Photo being cropped"])');
      await expect(cropper.getByRole('button', { name: 'Confirm crop', exact: true })).toBeEnabled();
      const accepted = await cropper.locator('img[alt="Photo being cropped"]').getAttribute('src');
      await cropper.getByRole('button', { name: 'Confirm crop', exact: true }).click();
      await page.getByRole('button', { name: '← Back', exact: true }).click();
      await page.getByRole('button', { name: 'Recrop', exact: true }).click();
      await expect(cropper.getByRole('button', { name: 'Confirm crop', exact: true })).toBeEnabled();
      await cropper.locator('input[type=file]').setInputFiles({ name: 'candidate.heic', mimeType: 'image/heic', buffer: readFileSync('tests/fixtures/heic/p3-10.heic') });
      await expect.poll(() => requested).toBe(true);
      const image = cropper.locator('img[alt="Photo being cropped"]');
      await expect(image).not.toHaveAttribute('src', accepted!);
      const native = await image.getAttribute('src');
      const zoom = cropper.getByRole('slider', { name: 'Zoom', exact: true });
      await expect(zoom).toBeEnabled();
      await expect(cropper.getByRole('button', { name: 'Confirm crop', exact: true })).toBeDisabled();
      await expect(cropper.locator('#photo-crop-help')).toHaveAttribute('role', 'status');
      await expect(cropper.locator('#photo-crop-help')).toHaveText('Working…');
      await zoom.focus(); await zoom.press('ArrowRight');
      const changedZoom = await zoom.inputValue();
      expect(Number(changedZoom)).toBeGreaterThan(1);
      if (result === 'cancel') {
        await cropper.getByRole('button', { name: 'Cancel', exact: true }).click();
        await expect(image).toHaveAttribute('src', accepted!);
        release();
        await expect(cropper.getByRole('button', { name: 'Confirm crop', exact: true })).toBeEnabled();
        await expect(image).toHaveAttribute('src', accepted!);
      } else {
        release();
        await expect(cropper.getByRole('button', { name: 'Confirm crop', exact: true })).toBeEnabled();
        if (result === 'refusal') {
          await expect(image).toHaveAttribute('src', accepted!);
          await expect(cropper.getByRole('alert')).toContainText("can't preserve");
        } else if (result === 'dimensions') {
          // A different native orientation cannot authorize those coordinates.
          await expect(image).not.toHaveAttribute('src', native!);
        } else {
          await expect(image).toHaveAttribute('src', native!);
          await expect(zoom).toHaveValue(changedZoom);
          const timings = await page.evaluate(() => performance.getEntriesByName('photo.prepare.native-validation').length);
          expect(timings).toBe(1);
          await cropper.getByRole('button', { name: 'Confirm crop', exact: true }).click();
          await page.getByRole('button', { name: '← Back', exact: true }).click();
          await page.getByRole('button', { name: 'Recrop', exact: true }).click();
          await expect(cropper.getByRole('button', { name: 'Confirm crop', exact: true })).toBeEnabled();
          await expect(image).toHaveAttribute('src', native!);
        }
      }
    } finally { release(); }
  });
}
