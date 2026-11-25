import { test, expect, type Page, type Route } from '@playwright/test';
import { ids, newRoom, openRoom } from '../helpers/room-mock';
import { t } from '../../lib/strings';

// #483 (Z3-M1): on a slow network, liking A then B shortly after must not
// empty A's heart or report a failed refresh. A's confirmation reread is
// skipped while B is in flight; that is deferred, not failed, and the server
// receipt stays on A's heart.
const s = t.en.room;

async function holdLikes(page: Page) {
  const liked = new Set<string>();
  const held = new Map<string, () => void>();
  const arrived = new Map<string, () => void>();
  const arrivals = new Map<string, Promise<void>>();
  for (const id of Object.values(ids)) arrivals.set(id, new Promise(resolve => arrived.set(id, resolve)));
  // Registered after the room mock, so these routes answer first.
  await page.context().route('**/rest/v1/likes?*', route => route.fulfill({ json: [...liked].map(liked_id => ({ liked_id })) }));
  await page.context().route('**/rest/v1/rpc/write_like', async (route: Route) => {
    const command = route.request().postDataJSON() as { p_target_id: string; p_action: string };
    arrived.get(command.p_target_id)?.();
    await new Promise<void>(resolve => held.set(command.p_target_id, resolve));
    if (command.p_action === 'like') liked.add(command.p_target_id); else liked.delete(command.p_target_id);
    await route.fulfill({ json: { accepted: true, liked: command.p_action === 'like', match_id: null } });
  });
  return {
    arrival: (id: string) => arrivals.get(id)!,
    release: (id: string) => { held.get(id)!(); },
  };
}

test('a second like in flight does not empty the first heart or report a failed refresh', async ({ page }) => {
  const feed = await openRoom(page, newRoom());
  const likes = await holdLikes(page);
  const bob = feed.locator('section').nth(0);
  const charlie = feed.locator('section').nth(1);

  await bob.getByRole('button', { name: s.like, exact: true }).tap();
  await likes.arrival(ids.Bob);
  await charlie.getByRole('button', { name: s.like, exact: true }).tap();
  await likes.arrival(ids.Charlie);

  // Bob's like is accepted while Charlie's is still in flight: Bob's reread
  // runs and is skipped because of Charlie's pending gesture.
  const bobReread = page.waitForResponse(r => r.url().includes('/rpc/room_candidates'), { timeout: 15_000 });
  likes.release(ids.Bob);
  await bobReread;
  // The heart stops being busy once the reread has settled and the notice is decided.
  await expect(bob.locator('button.heart-button')).toHaveAttribute('aria-busy', 'false');
  await expect(bob.getByRole('button', { name: s.removeLike('Bob'), exact: true })).toBeVisible();
  await expect(page.getByText(s.likeRefreshFailed)).toHaveCount(0);

  // Charlie's like lands; the authoritative reread confirms both hearts.
  const charlieReread = page.waitForResponse(r => r.url().includes('/rpc/room_candidates'), { timeout: 15_000 });
  likes.release(ids.Charlie);
  await charlieReread;
  await expect(bob.getByRole('button', { name: s.removeLike('Bob'), exact: true })).toBeVisible();
  await expect(charlie.getByRole('button', { name: s.removeLike('Charlie'), exact: true })).toBeVisible();
  await expect(page.getByText(s.likeRefreshFailed)).toHaveCount(0);
});
