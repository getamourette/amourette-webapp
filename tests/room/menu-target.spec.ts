import { test, expect, type Page } from '@playwright/test';
import { mockNameUi, nameIds, nameUiState } from '../helpers/name-ui-fixture';

// #473: the room ⋯ menu must act on the card actually on screen. A block is
// irreversible, so every case asserts the person named in the confirmation
// (name and photo) and the id the command really sends.
const now = new Date().toISOString();
const night = {
  venue_night_id: nameIds.night, status: 'live', participant_count: 5, launch_threshold: 3,
  guaranteed_launch_at: now, closes_at: new Date(Date.now() + 3600000).toISOString(),
  terminal_reason: null, updated_at: now,
};
const names = ['Bob', 'Charlie', 'Dana', 'Eve'];
const ids = Object.fromEntries(names.map((name, index) => [name, `00000000-0000-4000-8000-00000000020${index}`]));
const card = (first_name: string) => ({
  id: ids[first_name], first_name, bio: null, photo_url: null, checked_in_at: now,
  venue_night_id: nameIds.night, like_token: nameIds.match,
});

type Room = {
  feed: string[]; reviewFails: boolean; matchedWith: string | null;
  blocks: Array<Record<string, unknown>>; reports: Array<Record<string, unknown>>;
};

async function openRoom(page: Page, room: Room) {
  const context = page.context();
  await mockNameUi(context, nameUiState());
  await context.addInitScript(() => {
    localStorage.setItem('amourette-room-hint-dismissed', '1');
    sessionStorage.setItem('amourette-entered:test-bar', '1');
  });
  await context.route('**/rest/v1/**', async route => {
    const request = route.request(), url = new URL(request.url()), name = url.pathname.split('/').at(-1);
    const rows = (values: unknown[]) => route.fulfill({ json: request.headers().accept?.includes('object+json') ? values[0] ?? null : values });
    if (name === 'my_profile_review') return room.reviewFails
      ? route.fulfill({ status: 503, json: { message: 'Synthetic review failure' } }) : route.fulfill({ json: null });
    if (name === 'venues' || name === 'venue_by_slug') return rows([{ id: nameIds.venue, name: 'Test bar', city: 'Paris', timezone: 'Europe/Paris' }]);
    if (name === 'venue_night_state' || name === 'venue_night_public_state') return rows([night]);
    if (name === 'profile_private') return rows([{ adult_confirmed_at: now }]);
    if (name === 'presence') return rows([{ id: nameIds.admin, left_at: null, is_visible: true, venue_night_id: nameIds.night }]);
    if (name === 'photo_state') return rows([{ profile_id: nameIds.alice, displayed_id: null, pending_id: null,
      correction_required: false, reason: null, last_action: null, last_reason: null, revision: 1, updated_at: now }]);
    if (name === 'likes' || name === 'messages') return rows([]);
    if (name === 'profiles') {
      const other = names.find(first => url.search.includes(ids[first]));
      if (other) return rows([card(other)]);
      return route.fallback();
    }
    if (name === 'matches') return rows(room.matchedWith ? [{ id: nameIds.match, profile_a: nameIds.alice,
      profile_b: ids[room.matchedWith], expires_at: night.closes_at, created_at: now }] : []);
    if (name === 'room_candidates') return rows(room.feed.filter(first => first !== room.matchedWith).map(card));
    if (name === 'write_like') {
      const command = request.postDataJSON() as { p_target_id: string; p_action: string };
      const target = names.find(first => ids[first] === command.p_target_id) ?? null;
      room.matchedWith = command.p_action === 'like' ? target : null;
      return rows([{ accepted: true, liked: command.p_action === 'like', match_id: room.matchedWith ? nameIds.match : null }]);
    }
    if (name === 'blocks') { room.blocks.push(request.postDataJSON()); return route.fulfill({ status: 201, json: null }); }
    if (name === 'submit_report') { room.reports.push(request.postDataJSON()); return route.fulfill({ json: null }); }
    if (name === 'record_room_arrival') return route.fulfill({ json: null });
    return route.fallback();
  });
  await page.goto('/v/test-bar');
  const feed = page.getByTestId('profile-feed');
  await expect(feed.locator('section')).toHaveCount(room.feed.length);
  await expect(feed.getByRole('button', { name: 'Like', exact: true }).first()).toBeEnabled();
  return feed;
}

const newRoom = (): Room => ({ feed: [...names], reviewFails: false, matchedWith: null, blocks: [], reports: [] });

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
