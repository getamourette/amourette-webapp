import { test, expect } from '@playwright/test';
import { mockNameUi, nameUiState } from '../helpers/name-ui-fixture';
import { t } from '../../lib/strings';

// #486: a failed profile read is not "no profile". An existing guest must get
// a Retry screen, never the empty onboarding wizard that invites a duplicate.
for (const locale of ['en', 'fr'] as const) {
  const s = t[locale].profile;

  test(`a failed profile read shows Retry, not an empty wizard (${locale})`, async ({ page }) => {
    test.setTimeout(90_000);
    await mockNameUi(page.context(), nameUiState(), 'alice', locale);
    let failing = true;
    await page.route('**/rest/v1/profiles?*', route => failing && route.request().method() === 'GET'
      ? route.fulfill({ status: 503, json: { message: 'Synthetic outage' } })
      : route.fallback());

    await page.goto('/profile');
    // supabase-js itself retries a failed GET for about 15 s first.
    await expect(page.getByRole('alert').filter({ hasText: s.loadFailed })).toBeVisible({ timeout: 40_000 });
    await expect(page.getByPlaceholder(s.firstName, { exact: true })).toHaveCount(0);

    failing = false;
    await page.getByRole('button', { name: s.retry, exact: true }).click();
    await expect(page.getByRole('alert').filter({ hasText: s.loadFailed })).toHaveCount(0);
    // The existing profile is found: still no blank first step.
    await expect(page.getByPlaceholder(s.firstName, { exact: true })).toHaveCount(0);
  });
}
