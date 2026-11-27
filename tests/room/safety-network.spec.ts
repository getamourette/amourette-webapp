import { test, expect, type Page } from '@playwright/test';
import { nameIds } from '../helpers/name-ui-fixture';
import { ids, newRoom, openRoom } from '../helpers/room-mock';
import { t } from '../../lib/strings';

// #244: a block or a report sent while the bar network is down must say it
// failed, keep the person where the guest can try again, and never pretend it
// went through. The request is cut at the network; the mock closes Realtime.
const s = t.en.room;

async function cut(page: Page, pattern: string) {
  const network = { down: true, attempts: 0 };
  await page.route(pattern, route => {
    if (route.request().method() !== 'POST') return route.fallback();
    network.attempts++;
    return network.down ? route.abort('internetdisconnected') : route.fallback();
  });
  return network;
}

async function openMenuAction(page: Page, action: 'Block' | 'Report') {
  await page.getByRole('button', { name: 'Night options', exact: true }).click();
  await expect(page.getByTestId('room-menu-profile-name')).toHaveText('Bob');
  await page.locator('#room-overflow-menu').getByRole('button', { name: action, exact: true }).click();
}

test('a block cut by the network says so, keeps the person, and goes through on the next tap', async ({ page }) => {
  const room = newRoom();
  const feed = await openRoom(page, room);
  const network = await cut(page, '**/rest/v1/blocks*');

  await openMenuAction(page, 'Block');
  const dialog = page.getByRole('dialog', { name: 'Block Bob?' });
  await dialog.getByRole('button', { name: 'Block this person', exact: true }).click();
  // The dialog stays open with the error, so the next tap is the retry.
  await expect(dialog.getByText(s.blockError, { exact: true })).toBeVisible();
  expect(network.attempts).toBe(1);
  expect(room.blocks).toHaveLength(0);
  await expect(feed.getByRole('heading', { name: 'Bob', exact: true })).toBeVisible();

  network.down = false;
  await dialog.getByRole('button', { name: 'Block this person', exact: true }).click();
  await expect(feed.getByRole('heading', { name: 'Bob', exact: true })).toHaveCount(0);
  expect(room.blocks).toHaveLength(1);
  expect(room.blocks[0]).toMatchObject({ blocker_id: nameIds.alice, blocked_id: ids.Bob });

  await page.reload();
  // Check the populated feed so an empty loading state cannot hide a returning card.
  await expect(feed.getByRole('heading', { name: 'Charlie', exact: true })).toBeVisible();
  await expect(feed.getByRole('heading', { name: 'Bob', exact: true })).toHaveCount(0);
});

test('a report cut by the network says so and is sent on the next tap', async ({ page }) => {
  const room = newRoom();
  await openRoom(page, room);
  const network = await cut(page, '**/rest/v1/rpc/submit_report');

  await openMenuAction(page, 'Report');
  const dialog = page.getByRole('dialog', { name: 'Report Bob' });
  await dialog.getByRole('button', { name: 'Send report', exact: true }).click();
  await expect(dialog.getByText(s.reportError, { exact: true })).toBeVisible();
  await expect(page.getByText(s.reportSuccess, { exact: true })).toHaveCount(0);
  expect(room.reports).toHaveLength(0);

  network.down = false;
  await dialog.getByRole('button', { name: 'Send report', exact: true }).click();
  await expect(page.getByText(s.reportSuccess, { exact: true })).toBeVisible();
  expect(room.reports).toHaveLength(1);
  expect(room.reports[0]).toMatchObject({ p_reported_id: ids.Bob, p_venue_night_id: nameIds.night });
});
