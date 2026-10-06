import { test, expect } from '@playwright/test';
import { mockNameUi, nameUiState } from '../helpers/name-ui-fixture';
import { emailPreferenceStrings } from '../../lib/email-preference-strings';

const locales = [
  { code: 'en', title: 'Privacy policy', updated: 'Last updated: 6 October 2026' },
  { code: 'fr', title: 'Politique de confidentialité', updated: 'Dernière mise à jour : 6 octobre 2026' },
  { code: 'es', title: 'Política de privacidad', updated: 'Última actualización: 6 de octubre de 2026' },
] as const;

for (const locale of locales) {
  test(`policy ${locale.code}: complete without JavaScript or sign-in, narrow layout and language navigation`, async ({ browser, baseURL }) => {
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
    const page = await context.newPage();
    try {
      await page.goto(`/privacy?lang=${locale.code}`);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(locale.title);
      await expect(page.locator('main')).toHaveAttribute('lang', locale.code);
      await expect(page.getByText(locale.updated, { exact: true })).toBeVisible();
      await expect(page.locator('aside')).toHaveCount(0);
      await expect(page.locator('main')).not.toContainText(/Draft for review|Projet pour relecture|Borrador para revisión|testing only|réservée aux tests|solo para pruebas|before public registration|avant l’ouverture des inscriptions|antes de abrir el registro/i);
      await expect(page.locator('article > section')).toHaveCount(11);
      await expect(page.locator('#retention dt')).toHaveCount(7);
      await expect(page.locator('article')).toContainText('InboxPilot, Inc.');
      await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex, nofollow');
      await expect(page.locator('a[href="mailto:privacy@getamourette.com"]').first()).toBeVisible();
      expect(backendRequests).toEqual([]);
      await page.screenshot({ path: test.info().outputPath(`privacy-${locale.code}-320.png`) });
      // Check the actual content extents: .night-shell hides overflow and can
      // otherwise make a document-width assertion pass while clipping content.
      for (const element of await page.locator('h1, h2, article p, dt, dd, nav a').all()) {
        const box = await element.boundingBox();
        expect(box).not.toBeNull();
        expect(box!.x).toBeGreaterThanOrEqual(0);
        expect(box!.x + box!.width).toBeLessThanOrEqual(320);
      }
      await page.locator('a[href="#retention"]').click();
      await expect(page).toHaveURL(/#retention$/);
      await expect(page.locator('#retention-title')).toBeInViewport();
      await page.screenshot({ path: test.info().outputPath(`privacy-retention-${locale.code}-320.png`) });
      await page.getByRole('link', { name: 'English', exact: true }).click();
      await expect(page.getByRole('heading', { level: 1 })).toHaveText('Privacy policy');
      await expect(page.getByRole('link', { name: 'English', exact: true })).toHaveAttribute('aria-current', 'page');
    } finally {
      await context.close();
    }
  });

  test(`privacy links preserve ${locale.code} across landing, email preferences and invalid unsubscribe`, async ({ context, page }) => {
    await mockNameUi(context, nameUiState());
    await context.addInitScript(value => localStorage.setItem('amourette-locale', value), locale.code);
    const mutations: string[] = [];
    await page.route('**/api/unsubscribe', route => {
      mutations.push(route.request().method());
      return route.abort();
    });
    await page.goto('/');
    const landingLink = page.locator('footer').getByRole('link', { name: locale.title, exact: true });
    await expect(landingLink).toHaveAttribute('href', `/privacy?lang=${locale.code}`);
    await landingLink.click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(locale.title);

    await page.goto('/email-preferences');
    await expect(page.getByText(emailPreferenceStrings[locale.code].deletion)).toBeVisible();
    await expect(page.getByRole('link', { name: locale.title, exact: true })).toHaveAttribute('href', `/privacy?lang=${locale.code}`);
    await expect(page.locator('a[href="mailto:privacy@getamourette.com"]')).toBeVisible();

    // Invalid tokens stop at the page boundary and never contact the shared DB.
    await page.goto(`/unsubscribe?token=invalid&lang=${locale.code}`);
    await expect(page.getByRole('status')).toHaveText(emailPreferenceStrings[locale.code].publicInvalid);
    await expect(page.getByText(emailPreferenceStrings[locale.code].deletion)).toBeVisible();
    const policyLink = page.getByRole('link', { name: locale.title, exact: true });
    await expect(policyLink).toHaveAttribute('href', `/privacy?lang=${locale.code}`);
    await expect(policyLink).toHaveAttribute('rel', 'noreferrer');
    await policyLink.click();
    await expect(page).toHaveURL(new RegExp(`/privacy\\?lang=${locale.code}$`));
    expect(mutations).toEqual([]);
  });
}

test('unknown, empty and repeated policy locales fall back to English; URL wins over saved language', async ({ context, page }) => {
  await mockNameUi(context, nameUiState());
  await context.addInitScript(() => localStorage.setItem('amourette-locale', 'es'));
  for (const query of ['', '?lang=', '?lang=FR', '?lang=de', '?lang=%20fr%20', '?lang=fr&lang=es']) {
    await page.goto(`/privacy${query}`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Privacy policy');
  }
  await page.goto('/privacy?lang=fr');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Politique de confidentialité');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Retour à Amourette', exact: true }).first()).toBeFocused();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: test.info().outputPath('privacy-fr-desktop.png') });
});
