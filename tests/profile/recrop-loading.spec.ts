import sharp from 'sharp';
import type { Page } from '@playwright/test';
import { test, expect } from '../helpers/fixtures';

async function finalPreview(page: Page, name: string) {
  await page.goto('/profile');
  await page.getByPlaceholder('First name', { exact: true }).fill(name);
  const next = page.getByRole('button', { name: 'Continue', exact: true });
  await next.click();
  const buffer = await sharp('public/test-profiles/portrait-1.svg').png().toBuffer();
  await page.locator('input[type=file]').setInputFiles({ name: 'portrait.png', mimeType: 'image/png', buffer });
  const dialog = page.getByRole('dialog');
  const confirm = dialog.getByRole('button', { name: 'Confirm crop', exact: true });
  await expect(confirm).toBeEnabled();
  await dialog.getByRole('slider', { name: 'Zoom' }).fill('1.7');
  await dialog.getByRole('button', { name: 'Edit this crop', exact: true }).click();
  await dialog.getByRole('slider', { name: 'Zoom' }).fill('2.1');
  await confirm.click();
  await page.getByRole('group', { name: 'I am', exact: true }).getByRole('button', { name: 'Woman', exact: true }).click();
  await next.click();
  await page.getByRole('group', { name: 'I’d like to meet', exact: true }).getByRole('button', { name: 'Man', exact: true }).click();
  await next.click();
  await next.click();
  await expect(page.getByTestId('feed-photo-preview')).toBeVisible();
}

test('final preview recrop loads even when the detached image load callback is missed', async ({ data, contextFor }, testInfo) => {
  const user = await data.identity('Reopen');
  const page = await (await contextFor(user)).newPage();
  await finalPreview(page, user.name);
  const preview = page.getByTestId('feed-photo-preview').locator('img');
  const selected = await preview.getAttribute('src');
  // Keep native decoding intact but suppress the detached preloader's load
  // callback. This deterministically reproduces the silent, empty dialog;
  // it does not claim to reproduce Safari's underlying event scheduling.
  await page.evaluate(() => {
    const NativeImage = window.Image;
    window.Image = class extends NativeImage {
      constructor() {
        super();
        Object.defineProperty(this, 'onload', { set() {}, get() { return null; } });
      }
    };
  });
  const dialog = page.getByRole('dialog');
  const confirm = dialog.getByRole('button', { name: 'Confirm crop', exact: true });
  const zoom = dialog.getByRole('slider', { name: 'Zoom' });
  for (let attempt = 0; attempt < 2; attempt++) {
    await page.getByRole('button', { name: 'Recrop', exact: true }).click();
    await expect(confirm).toBeEnabled();
    await expect(zoom).toHaveValue('1.7');
    await expect.poll(() => dialog.locator('img').evaluateAll(images => images.every(image => image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0))).toBe(true);
    await expect(dialog.locator('.reactEasyCrop_Image')).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath(`reopen-${attempt}.png`) });
    await dialog.getByRole('button', { name: 'Edit this crop', exact: true }).click();
    await expect(zoom).toBeEnabled();
    await expect.poll(async () => Number(await zoom.inputValue())).toBeCloseTo(2.1, 2);
    if (attempt === 0) {
      await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
      await expect(preview).toHaveAttribute('src', selected!);
    } else {
      await confirm.click();
    }
    await expect(dialog).toHaveCount(0);
    await expect.poll(() => preview.evaluate(image => image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0)).toBe(true);
  }
});

test('cancelling a slow recrop decode keeps the final preview and restored crops', async ({ data, contextFor }, testInfo) => {
  const user = await data.identity('SlowDecode');
  const page = await (await contextFor(user)).newPage();
  await finalPreview(page, user.name);
  const preview = page.getByTestId('feed-photo-preview').locator('img');
  const selected = await preview.getAttribute('src');
  await page.evaluate(() => {
    const NativeImage = window.Image;
    window.Image = class extends NativeImage {
      async decode() {
        await new Promise<void>(resolve => window.addEventListener('release-photo-decode', () => resolve(), { once: true }));
        return super.decode();
      }
    };
    window.addEventListener('release-photo-decode', () => { window.Image = NativeImage; }, { once: true });
  });
  await page.getByRole('button', { name: 'Recrop', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('Working…', { exact: true })).toBeVisible();
  await expect(dialog.getByRole('slider')).toBeDisabled();
  await expect(dialog.getByRole('button', { name: 'Confirm crop', exact: true })).toBeDisabled();
  await page.screenshot({ path: testInfo.outputPath('loading.png') });
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.evaluate(() => window.dispatchEvent(new Event('release-photo-decode')));
  await expect(dialog).toHaveCount(0);
  await expect(preview).toHaveAttribute('src', selected!);
  await expect.poll(() => preview.evaluate(image => image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0)).toBe(true);
  await page.getByRole('button', { name: 'Recrop', exact: true }).click();
  await expect(dialog.getByRole('button', { name: 'Confirm crop', exact: true })).toBeEnabled();
  await expect(dialog.getByRole('slider')).toHaveValue('1.7');
  await dialog.getByRole('button', { name: 'Edit this crop', exact: true }).click();
  await expect(dialog.getByRole('slider')).toBeEnabled();
  await expect.poll(async () => Number(await dialog.getByRole('slider').inputValue())).toBeCloseTo(2.1, 2);
});
