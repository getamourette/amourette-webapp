import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { mockNameUi, nameUiState } from '../helpers/name-ui-fixture';
import { landingStrings } from '../../lib/landing-strings';
import { t } from '../../lib/strings';

// #603: the landing page sells the next open night. Its booking button is read
// from the data (never a hardcoded night), is on the first screen of a small
// phone, relays the posted link it was opened from, and gives way to the
// waitlist when no night can be booked.
const night = '7f9c1e9a-3b1d-4c55-9a51-2f7d3c1b8e10';
const event = {
  night_id: night, venue_name: 'Amalgam', city: 'Paris', address: '50 rue Léon Frot, Paris 11e', timezone: 'Europe/Paris',
  now: '2026-11-28T18:00:00Z', opens_at: '2026-11-28T17:00:00Z', closes_at: '2026-12-10T18:00:00Z',
  starts_at: '2026-12-10T19:00:00Z', ends_at: '2026-12-10T22:00:00Z', cancellation_deadline: '2026-12-08T19:00:00Z',
  amount_minor: 1000, currency: 'eur', policy_version: 'launch-v1', available: 40, status: 'open',
  walk_ins_possible: false, registration_open: true,
};

type Next = { event: typeof event | null } | 'unavailable';
async function openLanding(context: BrowserContext, page: Page, next: Next, query = '', locale: 'fr' | 'en' = 'fr') {
  await mockNameUi(context, nameUiState(), 'alice', locale);
  await context.addInitScript(value => localStorage.setItem('amourette-locale', value), locale);
  await context.route('**/rest/v1/rpc/get_my_profile', route => route.fulfill({ json: null }));
  const requests: string[] = [];
  await context.route('**/api/launch/next', route => {
    requests.push(route.request().url());
    return next === 'unavailable' ? route.fulfill({ status: 503, json: { error: 'event_unavailable' } }) : route.fulfill({ json: next });
  });
  await page.setViewportSize({ width: 375, height: 600 });
  await page.goto(`/${query}`);
  return requests;
}

for (const locale of ['fr', 'en'] as const) {
  test(`booking button opens the next open night from the first screen (${locale})`, async ({ context, page }) => {
    const s = landingStrings[locale];
    const requests = await openLanding(context, page, { event }, '?via=instagram', locale);
    const book = page.getByRole('link', { name: s.book, exact: true });
    await expect(book).toHaveCount(1);
    await expect(book).toHaveAttribute('href', `/events/${night}?via=instagram`);
    await expect(page.getByRole('article')).toContainText('Amalgam');
    await expect(page.getByRole('article')).toContainText(locale === 'fr' ? '10 décembre' : 'December 10');
    // Fully visible without scrolling on a 375x600 phone.
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
    const box = (await book.boundingBox())!;
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.y + box.height).toBeLessThanOrEqual(600);
    // The page asks for the next night with no parameter of its own.
    expect(requests.map(url => new URL(url).search)).toEqual(['']);

    await book.click();
    await expect(page).toHaveURL(`/events/${night}?via=instagram`);
  });
}

test('an unknown, empty or repeated link channel is not relayed', async ({ context, page }) => {
  const s = landingStrings.fr;
  await openLanding(context, page, { event }, '?via=tiktok');
  const book = page.getByRole('link', { name: s.book, exact: true });
  await expect(book).toHaveAttribute('href', `/events/${night}`);
  for (const query of ['?via=Instagram', '?via=', '?via=instagram&via=street', '?via=street&utm_source=story']) {
    await page.goto(`/${query}`);
    await expect(book).toHaveAttribute('href', query.endsWith('story') ? `/events/${night}?via=street` : `/events/${night}`);
  }
});

for (const [name, next] of [['no night is open', { event: null }], ['the next night cannot be read', 'unavailable']] as const) {
  test(`the waitlist replaces the booking button when ${name}`, async ({ context, page }) => {
    await openLanding(context, page, next);
    await expect(page.getByLabel(t.fr.landing.waitlistLabel)).toBeVisible();
    await expect(page.getByRole('heading', { level: 1, name: landingStrings.fr.headline })).toBeVisible();
    await expect(page.locator('a[href^="/events/"]')).toHaveCount(0);
  });
}
