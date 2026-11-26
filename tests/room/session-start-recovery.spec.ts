import { test, expect, type Page } from '@playwright/test';
import { mockRoom, newRoom } from '../helpers/room-mock';
import { t } from '../../lib/strings';

// #244: a guest's first visit creates her anonymous session. On a dead bar
// network that sign-in fails; she must get a way forward that needs neither a
// reload nor clearing browser data. The network is cut at the sign-in request
// itself; WebSockets are closed by the mock, so nothing else reloads the page.

// 'refused' fails at once; 'hung' never answers, like a stalled bar Wi-Fi.
async function cutSignIn(page: Page, mode: 'refused' | 'hung' = 'refused') {
  const network = { down: true, attempts: 0 };
  await page.context().route('**/auth/v1/signup*', route => {
    network.attempts++;
    if (!network.down) return route.fallback();
    return mode === 'refused' ? route.abort('internetdisconnected') : new Promise<void>(() => {});
  });
  return network;
}

async function countLoads(page: Page) {
  const loads = { count: 0 };
  page.on('load', () => { loads.count++; });
  return loads;
}

for (const locale of ['en', 'fr'] as const) {
  test(`a first scan whose sign-in fails opens the room once the network is back (${locale})`, async ({ page }) => {
    const s = t[locale].room;
    await mockRoom(page, newRoom(), locale, { signedIn: false });
    const network = await cutSignIn(page);
    const loads = await countLoads(page);
    await page.goto('/v/test-bar');

    await expect(page.getByText(s.loadError, { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: s.retry, exact: true })).toBeVisible();
    expect(network.attempts).toBeGreaterThan(0);

    network.down = false;
    await page.getByRole('button', { name: s.retry, exact: true }).click();
    await expect(page.getByTestId('profile-feed').locator('section')).toHaveCount(4);
    expect(loads.count).toBe(1);
  });

  test(`a first visit whose sign-in fails on the home page offers Retry (${locale})`, async ({ page }) => {
    const s = t[locale].landing;
    await mockRoom(page, newRoom(), locale, { signedIn: false });
    const network = await cutSignIn(page);
    const loads = await countLoads(page);
    await page.goto('/');

    await expect(page.getByText(s.sessionError, { exact: true })).toBeVisible();
    network.down = false;
    await page.getByRole('button', { name: s.retry, exact: true }).click();
    await expect(page.getByText(s.welcomeBack, { exact: true })).toBeVisible();
    expect(loads.count).toBe(1);
  });
}

test('a home page whose first sign-in failed comes back on its own when the network returns', async ({ page }) => {
  const s = t.en.landing;
  await mockRoom(page, newRoom(), 'en', { signedIn: false });
  const network = await cutSignIn(page);
  await page.goto('/');
  await expect(page.getByText(s.sessionError, { exact: true })).toBeVisible();

  // The phone drops off the network and comes back: the browser's own
  // offline/online switch, no tap on Retry.
  await page.context().setOffline(true);
  network.down = false;
  await page.context().setOffline(false);
  await expect(page.getByText(s.welcomeBack, { exact: true })).toBeVisible();
});

test('a first scan whose sign-in never answers stops waiting and opens the room on Retry', async ({ page }) => {
  const s = t.en.room;
  await mockRoom(page, newRoom(), 'en', { signedIn: false });
  const network = await cutSignIn(page, 'hung');
  await page.goto('/v/test-bar');

  // The sign-in gives up after AUTH_REQUEST_TIMEOUT_MS (15 s) instead of
  // holding the doorway logo forever.
  await expect(page.getByText(s.loadError, { exact: true })).toBeVisible({ timeout: 30_000 });
  network.down = false;
  await page.getByRole('button', { name: s.retry, exact: true }).click();
  await expect(page.getByTestId('profile-feed').locator('section')).toHaveCount(4);
});

test('a first visit to the profile form whose sign-in fails offers Retry', async ({ page }) => {
  const s = t.en.profile;
  await mockRoom(page, newRoom(), 'en', { signedIn: false });
  const network = await cutSignIn(page);
  await page.goto('/profile?venue=test-bar');

  await expect(page.getByRole('alert').filter({ hasText: s.loadFailed })).toBeVisible();
  network.down = false;
  await page.getByRole('button', { name: s.retry, exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: s.loadFailed })).toHaveCount(0);
});
