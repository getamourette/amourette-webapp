import { createClient } from '@supabase/supabase-js';
import type { Page } from '@playwright/test';
import type { Database } from '../../lib/database.types';
import { test, expect, type TestIdentity } from '../helpers/fixtures';
import { likeCommand } from '../helpers/like-command';

const MUTUAL = "The feeling’s mutual.";

async function enterRoom(page: Page, slug: string) {
  await page.goto(`/v/${slug}`);
  const primer = page.locator('[aria-labelledby="room-hint-title"]');
  await expect(primer.or(page.getByTestId('profile-feed')).first()).toBeVisible();
  if (await primer.isVisible()) await primer.getByRole('button').click();
}

function cardOf(page: Page, name: string) {
  return page.getByTestId('profile-feed').locator('section').filter({ has: page.getByRole('heading', { name, exact: true }) });
}

// #479: the guest who liked first must not miss the reveal because the match
// landed while the room was not on screen (another page, a discarded tab).
test('a match completed while the first liker was away is revealed when they return, once', async ({ data, contextFor }) => {
  test.setTimeout(150_000);
  const venue = await data.venue();
  const alice = await data.identity('Alice', 'woman');
  const bob = await data.identity('Bob', 'man');
  const carl = await data.identity('Carl', 'man');
  await data.checkIn(venue, [alice, bob, carl]);
  const client = (identity: TestIdentity) => createClient<Database>(data.env.url, data.env.publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${identity.session.access_token}` } },
  });

  const alicePage = await (await contextFor(alice)).newPage();
  const bobPage = await (await contextFor(bob)).newPage();
  await enterRoom(alicePage, venue.slug);
  await enterRoom(bobPage, venue.slug);

  await test.step('Alice likes Bob and Carl, then leaves the room', async () => {
    for (const name of ['Bob', 'Carl']) {
      const card = cardOf(alicePage, name);
      await card.getByRole('button', { name: 'Like', exact: true }).click();
      await expect(card.getByRole('button', { name: `Unlike ${name}` })).toHaveAttribute('aria-busy', 'false');
    }
    await alicePage.goto('about:blank');
  });

  await test.step('Bob likes back in the room and sees his own reveal; Carl likes back too', async () => {
    await cardOf(bobPage, 'Alice').getByRole('button', { name: 'Like', exact: true }).click();
    await expect(bobPage.getByRole('heading', { name: MUTUAL, exact: true })).toBeVisible();
    const receipt = await client(carl).rpc('write_like', await likeCommand(client(carl), venue.id, alice.id)).single();
    expect(receipt.error).toBeNull();
    expect(receipt.data?.match_id).toBeTruthy();
  });

  await test.step('Alice returns and gets both reveals, one after the other', async () => {
    const { data: rows, error } = await data.service.from('matches').select('id').eq('venue_night_id', venue.nightId);
    expect(error).toBeNull();
    expect(rows).toHaveLength(2);
    await alicePage.goto(`/v/${venue.slug}`);
    const heading = alicePage.getByRole('heading', { name: MUTUAL, exact: true });
    const openChat = alicePage.getByRole('link', { name: 'Write a message', exact: true });
    const revealed: string[] = [];
    for (let i = 0; i < 2; i++) {
      await expect(heading).toBeVisible({ timeout: 20_000 });
      revealed.push((await openChat.getAttribute('href')) ?? '');
      await alicePage.getByRole('button', { name: 'Back to tonight', exact: true }).click();
    }
    expect(revealed.sort()).toEqual(rows!.map(row => `/chat/${row.id}`).sort());
    await expect(heading).toHaveCount(0);
  });

  await test.step('a seen reveal never replays on reload', async () => {
    await alicePage.reload();
    await expect(alicePage.getByTestId('match-stack')).toBeVisible();
    // Wait past the room's own first resync before asserting the absence.
    await alicePage.waitForTimeout(3_000);
    await expect(alicePage.getByRole('heading', { name: MUTUAL, exact: true })).toHaveCount(0);
  });
});
