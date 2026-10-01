import { test, expect } from '@playwright/test';
import { mockNameUi, nameIds, nameUiState } from '../helpers/name-ui-fixture';

test('consent polls preserve the viewed card and disable likes until verified', async ({ page, context }) => {
  await mockNameUi(context, nameUiState());
  await context.addInitScript(() => {
    Object.defineProperty(AbortSignal, 'any', { configurable: true, value: undefined });
    Object.defineProperty(AbortSignal, 'timeout', { configurable: true, value: undefined });
    localStorage.setItem('amourette-room-hint-dismissed', '1');
    sessionStorage.setItem('amourette-entered:test-bar', '1');
  });
  const now = new Date().toISOString();
  const night = { venue_night_id: nameIds.night, status: 'live', participant_count: 4,
    launch_threshold: 4, guaranteed_launch_at: now, closes_at: new Date(Date.now() + 3600000).toISOString(),
    terminal_reason: null, updated_at: now };
  const presence = { id: nameIds.admin, left_at: null, is_visible: true, venue_night_id: nameIds.night };
  const cards = ['Bob', 'Charlie', 'Dana'].map((first_name, index) => ({
    id: `00000000-0000-4000-8000-00000000010${index}`, first_name, bio: `Hello from ${first_name}`,
    photo_url: null, checked_in_at: now, venue_night_id: nameIds.night, like_token: nameIds.match,
  }));
  let hold = true, fail = false, active = true, reads = 0, writes = 0, arrivals = 0;
  let release: (() => void) | undefined;
  let holdFeed = false, failFeed = false, feedReads = 0;
  let releaseFeed: (() => void) | undefined;
  let eligibleCards = cards;
  await context.route('**/rest/v1/**', async route => {
    const request = route.request(), name = new URL(request.url()).pathname.split('/').at(-1);
    const rows = (values: unknown[]) => route.fulfill({ json: request.headers().accept?.includes('object+json') ? values[0] ?? null : values });
    if (name === 'get_my_matching_consent') {
      reads++;
      if (hold) await new Promise<void>(resolve => { release = resolve; });
      if (fail) return route.fulfill({ status: 500, json: { message: 'Synthetic read failure' } });
      return rows([{ active, revision: nameIds.alice, granted_at: now, withdrawn_at: active ? null : now,
        available_at: null, server_now: now }]);
    }
    if (name === 'venues') return rows([{ id: nameIds.venue, name: 'Test bar', city: 'Paris', timezone: 'Europe/Paris' }]);
    if (name === 'venue_night_state' || name === 'venue_night_public_state') return rows([night]);
    if (name === 'profile_private') return rows([{ adult_confirmed_at: now }]);
    if (name === 'presence') return rows([presence]);
    if (name === 'matches') return rows([]);
    if (name === 'room_candidates') {
      feedReads++;
      if (holdFeed) await new Promise<void>(resolve => { releaseFeed = resolve; });
      if (failFeed) return route.fulfill({ status: 500, json: { message: 'Synthetic feed failure' } });
      return rows(eligibleCards);
    }
    if (name === 'write_like') { writes++; return rows([]); }
    if (name === 'record_room_arrival') {
      arrivals++;
      expect(request.postDataJSON()).toEqual({ p_venue_night_id: nameIds.night, p_visible_count: 3 });
      return route.fulfill({ json: null });
    }
    return route.fallback();
  });
  await page.clock.install();
  await page.goto('/v/test-bar');
  await expect.poll(() => reads).toBeGreaterThan(0);
  expect(arrivals).toBe(0);
  hold = false; release!();
  const feed = page.getByTestId('profile-feed');
  await expect(feed).toBeVisible();
  await expect(feed.getByRole('button', { name: 'Like', exact: true }).first()).toBeEnabled();
  await expect.poll(() => arrivals).toBe(1);
  await feed.evaluate(el => { el.scrollTop = el.clientHeight; });
  await expect.poll(() => feed.evaluate(el => Math.round(el.scrollTop / el.clientHeight))).toBe(1);
  const original = await feed.elementHandle();
  const position = await feed.evaluate(el => el.scrollTop);

  hold = true;
  const before = reads;
  await page.clock.fastForward(30_000);
  await expect.poll(() => reads).toBeGreaterThan(before);
  await expect(feed).toHaveAttribute('aria-busy', 'true');
  const secondCard = feed.locator('section').nth(1);
  await expect(secondCard.getByRole('button', { name: 'Like', exact: true })).toBeDisabled();
  // Double-tapping must not emit a command or a successful-like animation.
  await secondCard.dispatchEvent('click');
  await secondCard.dispatchEvent('click');
  expect(writes).toBe(0);
  await expect(secondCard.locator('.gesture-heart')).toHaveCount(0);
  expect(await feed.evaluate((el, previous) => el === previous, original)).toBe(true);
  expect(await feed.evaluate(el => el.scrollTop)).toBe(position);
  hold = false;
  release!();
  await expect(feed).toHaveAttribute('aria-busy', 'false');
  expect(await feed.evaluate((el, previous) => el === previous, original)).toBe(true);
  expect(await feed.evaluate(el => el.scrollTop)).toBe(position);

  fail = true;
  await page.clock.fastForward(30_000);
  await expect(page.getByRole('button', { name: 'Check again', exact: true })).toBeVisible();
  await expect(secondCard.getByRole('button', { name: 'Like', exact: true })).toBeDisabled();
  expect(await feed.evaluate(el => el.scrollTop)).toBe(position);
  fail = false;
  await page.getByRole('button', { name: 'Check again', exact: true }).click();
  await expect(feed).toHaveAttribute('aria-busy', 'false');
  expect(await feed.evaluate((el, previous) => el === previous, original)).toBe(true);
  expect(await feed.evaluate(el => el.scrollTop)).toBe(position);

  // Recovery invalidation revalidates attendance without unmounting the feed.
  holdFeed = true;
  const beforeFeed = feedReads;
  await page.evaluate(() => window.dispatchEvent(new Event('amourette-photo-refresh')));
  await expect.poll(() => feedReads).toBeGreaterThan(beforeFeed);
  await expect(feed).toHaveAttribute('aria-busy', 'true');
  await expect(secondCard.getByRole('button', { name: 'Like', exact: true })).toBeDisabled();
  await secondCard.dispatchEvent('click'); await secondCard.dispatchEvent('click');
  expect(writes).toBe(0);
  expect(await feed.evaluate((el, previous) => el === previous, original)).toBe(true);
  expect(await feed.evaluate(el => el.scrollTop)).toBe(position);
  holdFeed = false; releaseFeed!();
  await expect(feed).toHaveAttribute('aria-busy', 'false');
  expect(await feed.evaluate(el => el.scrollTop)).toBe(position);
  await expect(page.getByRole('button', { name: 'A new profile to discover ↓', exact: true })).toHaveCount(0);

  failFeed = true;
  await page.evaluate(() => window.dispatchEvent(new Event('amourette-photo-refresh')));
  await expect(page.getByRole('button', { name: 'Check again', exact: true })).toBeVisible();
  await expect(page.getByText('We couldn’t refresh the room right now. Try again in a moment.', { exact: true })).toBeVisible();
  await expect(feed).toBeVisible();
  await expect(secondCard.getByRole('button', { name: 'Like', exact: true })).toBeDisabled();
  expect(await feed.evaluate(el => el.scrollTop)).toBe(position);
  failFeed = false;
  // A confirmed removal still removes the now-ineligible participant.
  eligibleCards = cards.filter(card => card.first_name !== 'Charlie');
  await page.getByRole('button', { name: 'Check again', exact: true }).click();
  await expect(feed).toHaveAttribute('aria-busy', 'false');
  await expect(feed.getByText('Charlie', { exact: true })).toHaveCount(0);
  await expect(feed.locator('section')).toHaveCount(2);

  active = false;
  await page.clock.fastForward(30_000);
  await expect(feed).toHaveCount(0);
  await expect(page.getByText('Matching is off.', { exact: false })).toBeVisible();
  expect(writes).toBe(0);
  expect(arrivals).toBe(1);
});

for (const blockFails of [false, true]) {
  test(`blocking during room revalidation replaces the invalidated read (${blockFails ? 'refused' : 'saved'})`, async ({ context, page }) => {
    await mockNameUi(context, nameUiState());
    await context.addInitScript(() => {
      localStorage.setItem('amourette-room-hint-dismissed', '1');
      sessionStorage.setItem('amourette-entered:test-bar', '1');
    });
    const now = new Date().toISOString();
    const night = { venue_night_id: nameIds.night, status: 'live', participant_count: 3,
      launch_threshold: 3, guaranteed_launch_at: now, closes_at: new Date(Date.now() + 3600000).toISOString(),
      terminal_reason: null, updated_at: now };
    const cards = ['Bob', 'Dana'].map((first_name, index) => ({
      id: index === 0 ? nameIds.bob : nameIds.admin, first_name, bio: null, photo_url: null,
      checked_in_at: now, venue_night_id: nameIds.night, like_token: nameIds.match,
    }));
    let blocked = false, reads = 0;
    let releaseOld: (() => void) | undefined;
    let releaseReplacement: (() => void) | undefined;
    await context.route('**/rest/v1/**', async route => {
      const request = route.request(), name = new URL(request.url()).pathname.split('/').at(-1);
      const rows = (values: unknown[]) => route.fulfill({ json: request.headers().accept?.includes('object+json') ? values[0] ?? null : values });
      if (name === 'venues') return rows([{ id: nameIds.venue, name: 'Test bar', city: 'Paris', timezone: 'Europe/Paris' }]);
      if (name === 'venue_night_state' || name === 'venue_night_public_state') return rows([night]);
      if (name === 'profile_private') return rows([{ adult_confirmed_at: now }]);
      if (name === 'presence') return rows([{ id: nameIds.admin, left_at: null, is_visible: true, venue_night_id: nameIds.night }]);
      if (name === 'matches' || name === 'likes') return rows([]);
      if (name === 'room_candidates') {
        const read = ++reads;
        const snapshot = blocked ? cards.slice(1) : cards;
        if (read === 2) await new Promise<void>(resolve => { releaseOld = resolve; });
        if (read === 3) await new Promise<void>(resolve => { releaseReplacement = resolve; });
        return rows(snapshot);
      }
      if (name === 'blocks') {
        expect(request.postDataJSON()).toMatchObject({ blocker_id: nameIds.alice, blocked_id: nameIds.bob });
        if (blockFails) return route.fulfill({ status: 503, json: { message: 'Synthetic block failure' } });
        blocked = true;
        return route.fulfill({ status: 201, json: null });
      }
      return route.fallback();
    });
    await page.clock.install();
    await page.goto('/v/test-bar');
    const feed = page.getByTestId('profile-feed');
    await expect(feed.getByRole('button', { name: 'Like', exact: true }).first()).toBeEnabled();
    await page.evaluate(() => window.dispatchEvent(new Event('amourette-photo-refresh')));
    await expect.poll(() => reads).toBe(2);
    await expect(feed).toHaveAttribute('aria-busy', 'true');
    await page.getByRole('button', { name: 'Night options', exact: true }).click();
    await page.getByRole('button', { name: 'Block', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Block Bob?' });
    const oldCancelled = page.waitForEvent('requestfailed', {
      predicate: request => request.url().includes('/rpc/room_candidates'),
    });
    await dialog.getByRole('button', { name: 'Block this person', exact: true }).click();
    await expect.poll(() => reads).toBe(3);
    await oldCancelled;
    if (blockFails) await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
    else await expect(dialog).toHaveCount(0);
    await expect(feed.getByRole('button', { name: 'Like', exact: true }).last()).toBeDisabled();
    releaseReplacement!();
    await expect(feed).toHaveAttribute('aria-busy', 'false');
    await expect(feed.getByRole('button', { name: 'Like', exact: true }).last()).toBeEnabled();
    // The obsolete transport is cancelled; even releasing its old fixture cannot restore Bob.
    releaseOld!();
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    await expect(feed).toHaveAttribute('aria-busy', 'false');
    await expect(feed.getByText('Bob', { exact: true })).toHaveCount(blockFails ? 1 : 0);
    await expect(feed.locator('section')).toHaveCount(blockFails ? 2 : 1);
    await expect(feed.getByRole('button', { name: 'Like', exact: true }).last()).toBeEnabled();
    expect(reads).toBe(3);
  });
}
