import { test, expect } from '@playwright/test';
import { mockNameUi, nameUiState } from '../helpers/name-ui-fixture';
import { legalLabels } from '../../lib/legal';
import { INSTAGRAM_URL, SUPPORTED_LOCALES, t } from '../../lib/strings';

// #345: the landing links the public Instagram account, in every language and
// at the narrowest supported width, without leaving the app tab.
for (const locale of SUPPORTED_LOCALES) {
  test(`landing links the Instagram account in a new tab (${locale}, 320px)`, async ({ context, page }) => {
    await mockNameUi(context, nameUiState());
    await context.addInitScript(value => localStorage.setItem('amourette-locale', value), locale);
    // The landing must not depend on Instagram: nothing loads from it.
    const external: string[] = [];
    await context.route('https://www.instagram.com/**', route => {
      external.push(route.request().url());
      return route.fulfill({ status: 200, contentType: 'text/html', body: '<title>Instagram</title>' });
    });
    await page.setViewportSize({ width: 320, height: 740 });
    await page.goto('/');

    const name = `${t[locale].landing.instagram} (${legalLabels[locale].newTab})`;
    const link = page.locator('footer').getByRole('link', { name, exact: true });
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute('href', INSTAGRAM_URL);
    await expect(link).toHaveAttribute('target', '_blank');
    await expect(link).toHaveAttribute('rel', 'noopener noreferrer');

    const box = (await link.boundingBox())!;
    expect(box.height).toBeGreaterThanOrEqual(44);
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(320);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
    expect(external).toEqual([]);

    const popupPromise = page.waitForEvent('popup');
    await link.click();
    const popup = await popupPromise;
    await popup.waitForURL(INSTAGRAM_URL);
    expect(await popup.evaluate(() => window.opener)).toBeNull();
    await popup.close();
    await expect(page).toHaveURL(/\/$/);
  });
}
