import sharp from 'sharp';
import type { Page } from '@playwright/test';
import { test, expect } from '@playwright/test';
import { mockPhotoOnboarding } from '../helpers/photo-onboarding-ui';
import { cropZoom, cropReady, setCropZoom } from '../helpers/photo-crop-ui';

async function finalPreview(page: Page, name: string) {
  await page.goto('/profile');
  await page.getByPlaceholder('First name', { exact: true }).fill(name);
  const next = page.getByRole('button', { name: 'Continue', exact: true });
  await next.click();
  const buffer = await sharp('public/test-profiles/portrait-1.svg').png().toBuffer();
  await page.locator('input[type=file]').setInputFiles({ name: 'portrait.png', mimeType: 'image/png', buffer });
  const dialog = page.getByRole('dialog');
  const confirm = dialog.getByRole('button', { name: /^(Next|Confirm)$/ });
  await expect(confirm).toBeEnabled();
  await setCropZoom(dialog, 1.7);
  await dialog.getByRole('button', { name: 'Next', exact: true }).click();
  await cropReady(dialog);
  await setCropZoom(dialog, 2);
  await dialog.locator('.reactEasyCrop_Container').focus();
  await page.keyboard.down('+');
  await expect(confirm).toBeDisabled();
  await page.keyboard.up('+');
  await expect(confirm).toBeEnabled();
  await expect.poll(() => cropZoom(dialog)).toBeCloseTo(2.1, 2);
  await confirm.click();
  await page.getByRole('group', { name: 'I am', exact: true }).getByRole('button', { name: 'Woman', exact: true }).click();
  await page.getByRole('group', { name: 'I’d like to meet', exact: true }).getByRole('button', { name: 'Man', exact: true }).click();
  await next.click();
  await page.getByRole('button', { name: 'Skip', exact: true }).click();
  await expect(page.getByTestId('feed-photo-preview')).toBeVisible();
}

async function returnToPreview(page: Page, fromGender = false) {
  const next = page.getByRole('button', { name: 'Continue', exact: true });
  // Returning preserves the selected gender without scheduling auto-advance.
  if (!fromGender) await next.click();
  await expect(page.getByRole('group', { name: 'I am', exact: true })).toBeVisible();
  await next.click();
  await expect(page.getByRole('group', { name: 'I’d like to meet', exact: true })).toBeVisible();
  await next.click();
  await page.getByRole('button', { name: 'Skip', exact: true }).click();
}

async function editFromPreview(page: Page) {
  await page.getByTestId('onboarding-confirmation').getByRole('button', { name: 'Change photo', exact: true }).click();
  await page.getByTestId('photo-picker').getByRole('button', { name: 'Edit', exact: true }).click();
}

test('final preview recrop loads even when the detached image load callback is missed', async ({ context, page }, testInfo) => {
  await mockPhotoOnboarding(context);
  await finalPreview(page, 'Reopen');
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
  const confirm = dialog.getByRole('button', { name: /^(Next|Confirm)$/ });
  for (let attempt = 0; attempt < 2; attempt++) {
    await editFromPreview(page);
    await expect(confirm).toBeEnabled();
    await expect.poll(() => cropZoom(dialog)).toBeCloseTo(1.7, 2);
    await expect.poll(() => dialog.locator('img').evaluateAll(images => images.every(image => image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0))).toBe(true);
    await expect(dialog.locator('.reactEasyCrop_Image')).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath(`reopen-${attempt}.png`) });
    await dialog.getByRole('button', { name: 'Next', exact: true }).click();
    await cropReady(dialog);
    await expect.poll(async () => await cropZoom(dialog)).toBeCloseTo(2.1, 2);
    if (attempt === 0) {
      await page.keyboard.press('Escape');
      await expect(page.getByTestId('photo-picker').locator('img')).toHaveAttribute('src', selected!);
    } else {
      await confirm.click();
    }
    await expect(dialog).toHaveCount(0);
    await returnToPreview(page, attempt === 1);
    if (attempt === 0) await expect(preview).toHaveAttribute('src', selected!);
    await expect.poll(() => preview.evaluate(image => image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0)).toBe(true);
  }
});

test('warm recrop reuses decoded pixels and keeps the final preview and restored crops', async ({ context, page }, testInfo) => {
  await mockPhotoOnboarding(context);
  await finalPreview(page, 'SlowDecode');
  const preview = page.getByTestId('feed-photo-preview').locator('img');
  const selected = await preview.getAttribute('src');
  await page.evaluate(() => {
    performance.clearMeasures();
    const NativeImage = window.Image;
    window.Image = class extends NativeImage {
      async decode() {
        await new Promise<void>(resolve => window.addEventListener('release-photo-decode', () => resolve(), { once: true }));
        return super.decode();
      }
    };
    window.addEventListener('release-photo-decode', () => { window.Image = NativeImage; }, { once: true });
  });
  await editFromPreview(page);
  const dialog = page.getByRole('dialog');
  // A newly allocated detached image would remain blocked. The accepted
  // source already has decoded pixels, so reopening must remain usable.
  await cropReady(dialog);
  await expect(dialog.getByRole('button', { name: 'Next', exact: true })).toBeEnabled();
  expect(await page.evaluate(() => performance.getEntriesByName('photo.crop.decode').length)).toBe(0);
  await page.screenshot({ path: testInfo.outputPath('warm-recrop.png') });
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.evaluate(() => window.dispatchEvent(new Event('release-photo-decode')));
  await expect(dialog).toHaveCount(0);
  await expect(page.getByTestId('photo-picker').locator('img')).toHaveAttribute('src', selected!);
  await returnToPreview(page);
  await expect(preview).toHaveAttribute('src', selected!);
  await expect.poll(() => preview.evaluate(image => image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0)).toBe(true);
  await editFromPreview(page);
  await expect(dialog.getByRole('button', { name: 'Next', exact: true })).toBeEnabled();
  await expect.poll(() => cropZoom(dialog)).toBeCloseTo(1.7, 2);
  await dialog.getByRole('button', { name: 'Next', exact: true }).click();
  await cropReady(dialog);
  await expect.poll(async () => await cropZoom(dialog)).toBeCloseTo(2.1, 2);
});
