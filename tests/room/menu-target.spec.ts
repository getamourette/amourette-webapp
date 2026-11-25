import { test, expect, type Page } from '@playwright/test';
import { nameIds } from '../helpers/name-ui-fixture';
import { card, ids, names, newRoom, openRoom } from '../helpers/room-mock';

// #473: the room ⋯ menu must act on the card actually on screen. A block is
// irreversible, so every case asserts the person named in the confirmation
// (name and photo) and the id the command really sends.
async function scrollToCard(page: Page, index: number) {
  const feed = page.getByTestId('profile-feed');
  await feed.evaluate((el, i) => { el.scrollTop = i * el.clientHeight; }, index);
  await expect.poll(() => feed.evaluate(el => Math.round(el.scrollTop / el.clientHeight))).toBe(index);
}

// The name shown on the card that fills the feed viewport right now.
async function cardOnScreen(page: Page) {
  return page.getByTestId('profile-feed').evaluate(el => {
    const index = Math.round(el.scrollTop / el.clientHeight);
    return el.querySelectorAll('section')[index]?.querySelector('[data-testid=room-profile-name]')?.textContent?.trim() ?? null;
  });
}

const menuButton = (page: Page) => page.getByRole('button', { name: 'Night options', exact: true });
const menuName = (page: Page) => page.getByTestId('room-menu-profile-name');
const refreshRoom = (page: Page) => page.evaluate(() => window.dispatchEvent(new Event('amourette-photo-refresh')));

async function blockFromMenu(page: Page, expected: string) {
  await menuButton(page).click();
  await expect(menuName(page)).toHaveText(expected);
  await page.locator('#room-overflow-menu').getByRole('button', { name: 'Block', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: `Block ${expected}?` });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('img', { name: expected, exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Block this person', exact: true }).click();
  await expect(dialog).toHaveCount(0);
}

test('the person on screen leaves while the menu is open: their actions disappear, then the menu targets who slid in', async ({ page }) => {
  const room = newRoom();
  const feed = await openRoom(page, room);
  await scrollToCard(page, 2);
  await menuButton(page).click();
  await expect(menuName(page)).toHaveText('Dana');

  // Dana leaves (hides, blocks or is removed) while the menu is open; Eve
  // slides into the same slot without any scroll event.
  room.feed = names.filter(first => first !== 'Dana');
  await refreshRoom(page);
  await expect(feed.getByText('Dana', { exact: true })).toHaveCount(0);
  expect(await cardOnScreen(page)).toBe('Eve');
  // The safety actions never move to someone else under the open menu.
  await expect(menuButton(page)).toHaveAttribute('aria-expanded', 'true');
  await expect(menuName(page)).toHaveCount(0);
  await expect(page.locator('#room-overflow-menu').getByRole('button', { name: 'Block', exact: true })).toHaveCount(0);
  await menuButton(page).click();

  await blockFromMenu(page, 'Eve');
  expect(room.blocks).toHaveLength(1);
  expect(room.blocks[0]).toMatchObject({ blocker_id: nameIds.alice, blocked_id: ids.Eve });
});

test('after a match removes the card on screen, Report targets the person who took its place', async ({ page }) => {
  const room = newRoom();
  const feed = await openRoom(page, room);
  await scrollToCard(page, 2);
  await feed.locator('section').nth(2).getByRole('button', { name: 'Like', exact: true }).tap();
  await expect(page.getByRole('heading', { name: 'The feeling’s mutual.', exact: true })).toBeVisible();
  await expect(feed.locator('section')).toHaveCount(3);
  await page.getByRole('button', { name: 'Back to tonight', exact: true }).click();
  expect(await cardOnScreen(page)).toBe('Eve');

  await menuButton(page).click();
  await expect(menuName(page)).toHaveText('Eve');
  await page.locator('#room-overflow-menu').getByRole('button', { name: 'Report', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Report Eve' });
  await expect(dialog.getByRole('img', { name: 'Eve', exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Send report', exact: true }).click();
  await expect.poll(() => room.reports.length).toBe(1);
  expect(room.reports[0]).toMatchObject({ p_reported_id: ids.Eve, p_venue_night_id: nameIds.night });
});

test('an arrival or a departure above the card does not change the frozen target', async ({ page }) => {
  const room = newRoom();
  const feed = await openRoom(page, room);
  await scrollToCard(page, 2);
  await menuButton(page).click();
  await expect(menuName(page)).toHaveText('Dana');

  // Bob (above) leaves and a newcomer arrives below, both under the open menu.
  const newcomer = { ...card('Eve'), id: '00000000-0000-4000-8000-000000000209', first_name: 'Fay' };
  room.feed = names.filter(first => first !== 'Bob');
  await page.context().route('**/rest/v1/rpc/room_candidates', route =>
    route.fulfill({ json: [...room.feed.map(card), newcomer] }));
  await refreshRoom(page);
  await expect(feed.getByText('Fay', { exact: true })).toHaveCount(1);
  await expect(feed.getByText('Bob', { exact: true })).toHaveCount(0);
  expect(await cardOnScreen(page)).toBe('Dana');
  await expect(menuName(page)).toHaveText('Dana');
  await menuButton(page).click();

  await blockFromMenu(page, 'Dana');
  expect(room.blocks[0]).toMatchObject({ blocked_id: ids.Dana });
});

test('after the feed remounts at the top, the menu targets the top card, not the one seen before', async ({ page }) => {
  const room = newRoom();
  const feed = await openRoom(page, room);
  await scrollToCard(page, 2);

  // A network blip on the profile review swaps the feed for the review error
  // panel; the retry brings the same list back at the top, with no scroll event.
  room.reviewFails = true;
  await refreshRoom(page);
  await expect(feed).toHaveCount(0);
  room.reviewFails = false;
  await refreshRoom(page);
  await expect(feed.locator('section')).toHaveCount(4);
  expect(await cardOnScreen(page)).toBe('Bob');

  await blockFromMenu(page, 'Bob');
  expect(room.blocks[0]).toMatchObject({ blocked_id: ids.Bob });
});
