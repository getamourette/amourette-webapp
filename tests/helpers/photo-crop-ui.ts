import { expect, type Locator, type Page } from '@playwright/test';

// Read the actual rendered transform, so restoration assertions do not depend
// on a separate zoom control or expose test-only state in the product.
export async function cropZoom(dialog: Locator) {
  return dialog.locator('.reactEasyCrop_Image').evaluate(image => {
    const match = (image as HTMLElement).style.transform.match(/scale\(([^)]+)\)/);
    return Number(match?.[1] ?? 1);
  });
}
export async function cropReady(dialog: Locator) {
  await expect(dialog.locator('.reactEasyCrop_Container')).toBeVisible();
  await expect(dialog.locator('[inert]')).toHaveCount(0);
}
export async function setCropZoom(dialog: Locator, value: number) {
  await cropReady(dialog);
  const current = await cropZoom(dialog);
  const steps = Math.round((value - current) * 10);
  const surface = dialog.locator('.reactEasyCrop_CropArea');
  await surface.focus();
  for (let i = 0; i < Math.abs(steps); i++) await surface.press(steps > 0 ? '+' : '-');
  await expect.poll(() => cropZoom(dialog)).toBeCloseTo(value, 2);
}
export async function confirmCrop(page: Page) {
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Next', exact: true }).click();
  await dialog.getByRole('button', { name: 'Confirm', exact: true }).click();
}
