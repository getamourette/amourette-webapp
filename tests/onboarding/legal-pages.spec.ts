import { test, expect } from '@playwright/test';
import { mockNameUi, nameUiState } from '../helpers/name-ui-fixture';

const locales = [
  { code: 'en', legal: 'Legal notice', terms: 'Terms of Use', privacy: 'Privacy policy' },
  { code: 'fr', legal: 'Mentions légales', terms: 'Conditions d’utilisation', privacy: 'Politique de confidentialité' },
  { code: 'es', legal: 'Aviso legal', terms: 'Condiciones de uso', privacy: 'Política de privacidad' },
] as const;

for (const locale of locales) {
  for (const kind of ['legal', 'terms'] as const) {
    test(`${kind} ${locale.code}: readable without JavaScript or a session, mobile navigation`, async ({ browser, baseURL }) => {
      const context = await browser.newContext({ baseURL, javaScriptEnabled: false, viewport: { width: 320, height: 740 } });
      if (process.env.E2E_BASE_URL && process.env.E2E_VERCEL_BYPASS) {
        await context.route(`${new URL(process.env.E2E_BASE_URL).origin}/**`, route => route.continue({
          headers: { ...route.request().headers(), 'x-vercel-protection-bypass': process.env.E2E_VERCEL_BYPASS! },
        }));
      }
      const backendRequests: string[] = [];
      await context.route(`${new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).origin}/**`, route => {
        backendRequests.push(route.request().url());
        return route.abort();
      });
      try {
        const page = await context.newPage();
        await page.goto(`/${kind}?lang=${locale.code}`);
        await expect(page.getByRole('heading', { level: 1 })).toHaveText(locale[kind]);
        await expect(page).toHaveTitle(`${locale[kind]} | Amourette`);
        await expect(page.locator('main')).toHaveAttribute('lang', locale.code);
        await expect(page.locator('article > section')).toHaveCount(kind === 'legal' ? 3 : 8);
        await expect(page.locator('article')).toContainText('InboxPilot, Inc.');
        if (kind === 'legal') await expect(page.locator('#publisher')).toContainText('Samih Sghier');
        await expect(page.locator('a[href="mailto:hello@getamourette.com"]')).toBeVisible();
        await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex, nofollow');
        expect(backendRequests).toEqual([]);
        for (const element of await page.locator('h1, h2, article p, article li, nav a').all()) {
          const box = await element.boundingBox();
          expect(box).not.toBeNull();
          expect(box!.x).toBeGreaterThanOrEqual(0);
          expect(box!.x + box!.width).toBeLessThanOrEqual(320);
        }
        await page.screenshot({ path: test.info().outputPath(`${kind}-${locale.code}-320.png`), fullPage: true });
        await page.locator('a[href="#privacy"]').click();
        await expect(page.locator('#privacy-title')).toBeInViewport();
        await expect(page.locator('#privacy').getByRole('link', { name: locale.privacy, exact: true }))
          .toHaveAttribute('href', `/privacy?lang=${locale.code}`);
        const other = kind === 'legal' ? 'terms' : 'legal';
        await page.locator('footer').getByRole('link', { name: locale[other], exact: true }).click();
        await expect(page.getByRole('heading', { level: 1 })).toHaveText(locale[other]);
        await page.getByRole('link', { name: 'English', exact: true }).click();
        await expect(page.getByRole('heading', { level: 1 })).toHaveText(locales[0][other]);
      } finally {
        await context.close();
      }
    });
  }

  test(`landing and profile legal links preserve ${locale.code} and unsaved profile edits`, async ({ context, page }) => {
    const state = nameUiState();
    await mockNameUi(context, state);
    await context.addInitScript(value => localStorage.setItem('amourette-locale', value), locale.code);
    await page.goto('/');
    for (const kind of ['legal', 'terms'] as const) {
      const link = page.locator('footer').getByRole('link', { name: locale[kind], exact: true });
      await expect(link).toHaveAttribute('href', `/${kind}?lang=${locale.code}`);
    }
    await page.locator('footer').getByRole('link', { name: locale.legal, exact: true }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(locale.legal);
    await page.goto('/profile?edit=1');
    const bio = page.locator('textarea');
    await bio.fill('An unsaved biography');
    const link = page.locator('footer').getByRole('link', { name: new RegExp(locale.terms) });
    await expect(link).toHaveAttribute('href', `/terms?lang=${locale.code}`);
    await expect(link).toHaveAttribute('target', '_blank');
    const popupPromise = page.waitForEvent('popup');
    await link.click();
    const popup = await popupPromise;
    await expect(popup.getByRole('heading', { level: 1 })).toHaveText(locale.terms);
    await popup.close();
    await expect(bio).toHaveValue('An unsaved biography');
    expect(state.patches).toEqual([]);
  });
}

test('legal locale rejects malformed input and overrides browser preference; keyboard navigation', async ({ context, page }) => {
  await mockNameUi(context, nameUiState());
  await context.addInitScript(() => localStorage.setItem('amourette-locale', 'es'));
  for (const kind of ['legal', 'terms'] as const) {
    for (const query of ['', '?lang=', '?lang=FR', '?lang=de', '?lang=%20fr%20', '?lang=fr&lang=es']) {
      await page.goto(`/${kind}${query}`);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(locales[0][kind]);
      await expect(page).toHaveTitle(`${locales[0][kind]} | Amourette`);
    }
  }
  await page.goto('/terms?lang=fr');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(locales[1].terms);
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Retour à Amourette', exact: true }).first()).toBeFocused();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: test.info().outputPath('terms-fr-desktop.png') });
});
