import { test, expect, type Page } from '@playwright/test';
import { mockRoom, newRoom, openRoom } from '../helpers/room-mock';
import { t } from '../../lib/strings';
import { profileReviewStrings } from '../../lib/profile-review-strings';

// #486: a failed room entry, a failed profile review read or a launch must
// never leave a guest on a dead screen or force a manual reload.

async function countLoads(page: Page) {
  const loads = { count: 0 };
  page.on('load', () => { loads.count++; });
  return loads;
}

for (const locale of ['en', 'fr'] as const) {
  const s = t[locale].room;

  test(`a failed entry offers Retry and comes back on its own, without a reload (${locale})`, async ({ page }) => {
    const room = { ...newRoom(), failures: { room_candidates: 1_000 } };
    await mockRoom(page, room, locale);
    const loads = await countLoads(page);
    await page.goto('/v/test-bar');

    await expect(page.getByText(s.loadError, { exact: true })).toBeVisible();
    const retry = page.getByRole('button', { name: s.retry, exact: true });
    await expect(retry).toBeVisible();

    // The network is back: no tap, no reload, the room opens on its own.
    room.failures.room_candidates = 0;
    const feed = page.getByTestId('profile-feed');
    await expect(feed.locator('section')).toHaveCount(4, { timeout: 15_000 });
    expect(loads.count).toBe(1);
  });

  test(`the Retry button reopens the room at once (${locale})`, async ({ page }) => {
    const room = { ...newRoom(), failures: { room_candidates: 1_000 } };
    await mockRoom(page, room, locale);
    await page.goto('/v/test-bar');
    const retry = page.getByRole('button', { name: s.retry, exact: true });
    await expect(retry).toBeVisible();
    room.failures.room_candidates = 0;
    await retry.click();
    // Faster than the first automatic retry could be scheduled after a
    // second failure: the button itself restarted the entry.
    await expect(page.getByTestId('profile-feed').locator('section')).toHaveCount(4, { timeout: 1_500 });
  });
}

test('a room that goes live while the network fails once opens without a reload', async ({ page }) => {
  test.setTimeout(60_000);
  const room = { ...newRoom(), nightStatus: 'waiting' };
  await mockRoom(page, room);
  const loads = await countLoads(page);
  await page.goto('/v/test-bar');
  await expect(page.getByTestId('profile-feed')).toHaveCount(0);

  // Launch: the first feed read after it fails, as on a saturated bar Wi-Fi.
  room.failures = { room_candidates: 1 };
  room.nightStatus = 'live';
  await expect(page.getByTestId('profile-feed').locator('section')).toHaveCount(4, { timeout: 30_000 });
  expect(room.failures.room_candidates).toBe(0);
  expect(loads.count).toBe(1);
});

test('a failed profile review read keeps the room on screen', async ({ page }) => {
  const room = newRoom();
  const feed = await openRoom(page, room);
  room.reviewFails = true;
  await page.evaluate(() => window.dispatchEvent(new Event('amourette-photo-refresh')));
  // Give the failed read time to land, then check nothing replaced the feed.
  await page.waitForResponse(response => response.url().includes('my_profile_review') && response.status() === 503);
  await page.waitForTimeout(500);
  await expect(feed.locator('section')).toHaveCount(4);
  await expect(page.getByRole('alert').filter({ hasText: profileReviewStrings.en.error })).toHaveCount(0);
});

test('a failing participant revision read retries alone, without reloading the room each time', async ({ page }) => {
  test.setTimeout(60_000);
  const room = { ...newRoom(), failures: { my_participant_revision: 1_000 } };
  const calls = { revision: 0, feed: 0 };
  page.on('request', request => {
    if (request.url().includes('/rpc/my_participant_revision')) calls.revision++;
    if (request.url().includes('/rpc/room_candidates')) calls.feed++;
  });
  await openRoom(page, room);
  // Let the entry's own reads settle, before the first retry (2.5 to 5 s after
  // the first failure).
  await expect.poll(() => calls.revision).toBeGreaterThanOrEqual(1);
  await page.waitForTimeout(1_500);
  const feedReads = calls.feed;
  await expect.poll(() => calls.revision, { timeout: 15_000 }).toBeGreaterThanOrEqual(2);
  await page.waitForTimeout(1_000);
  expect(calls.feed, 'a failed revision read must not reload the feed').toBe(feedReads);
});
