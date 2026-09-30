import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import type { Page, Route } from '@playwright/test';
import type { Database } from '../../lib/database.types';
import { test, expect } from '../helpers/fixtures';
import { likeCommand } from '../helpers/like-command';
import { t } from '../../lib/strings';

async function inspect(page: Page, state: string) {
  const directory = process.env.E2E_SCREENSHOTS_DIR;
  if (!directory) return;
  await mkdir(directory, { recursive: true });
  await page.screenshot({ path: join(directory, `${test.info().project.name}-like-${state}.png`), fullPage: true });
}

// Requests are held at explicit barriers; no timing-dependent mutation races.
test('stale gestures and lost responses reconcile without duplicate match reveals', async ({ data, contextFor, request }) => {
  test.setTimeout(120_000);
  const venue = await data.venue();
  const alice = await data.identity('Alice', 'woman');
  const bob = await data.identity('Bob', 'man');
  await data.checkIn(venue, [alice, bob]);
  const client = (identity: typeof alice) => createClient<Database>(data.env.url, data.env.publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${identity.session.access_token}` } },
  });
  const a = client(alice), b = client(bob);
  const original = await likeCommand(a, venue.id, bob.id);
  expect((await a.from('likes').insert({ liker_id: alice.id, liked_id: bob.id, venue_id: venue.id })).error?.code).toBe('42501');
  expect((await a.from('likes').delete().eq('liked_id', bob.id)).error?.code).toBe('42501');
  const forged = await request.post(`${data.env.url}/rest/v1/rpc/write_like`, {
    headers: { apikey: data.env.publishableKey, Authorization: `Bearer ${alice.session.access_token}` },
    data: { ...original, p_actor_id: bob.id },
  });
  expect(forged.status()).toBe(404);
  const page = await (await contextFor(alice)).newPage();
  await page.clock.install();
  await page.goto(`/v/${venue.slug}`);
  await page.locator('[aria-labelledby="room-hint-title"]').getByRole('button').click();
  await expect(page.getByRole('heading', { name: 'Bob', exact: true })).toBeVisible();
  await inspect(page, 'resting');

  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  let started!: () => void;
  const captured = new Promise<void>(resolve => { started = resolve; });
  let oldGesture: Record<string, string> | undefined;
  const hold = async (route: Route) => {
    oldGesture = route.request().postDataJSON(); started(); await held; await route.continue();
  };
  await page.route('**/rest/v1/rpc/write_like', hold);
  await page.getByRole('button', { name: 'Like', exact: true }).click();
  await captured;
  await inspect(page, 'pending');
  expect((await b.from('profiles').update({ interested_in: ['man'] }).eq('id', bob.id)).error).toBeNull();
  expect((await b.from('profiles').update({ interested_in: ['woman', 'man', 'nonbinary'] }).eq('id', bob.id)).error).toBeNull();
  release();
  await expect(page.getByText(t.en.room.likeRefreshNotice, { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Like', exact: true })).toBeEnabled();
  await inspect(page, 'refused-refreshed');
  await expect(page.getByRole('heading', { name: 'The feeling’s mutual.' })).toHaveCount(0);
  expect((await a.from('likes').select('id')).data).toEqual([]);
  await page.unroute('**/rest/v1/rpc/write_like', hold);
  await page.clock.fastForward(6_000);
  await expect(page.getByTestId('like-notice')).toHaveCount(0);

  // Commit the new gesture but lose its HTTP response. The authoritative reread
  // must show the saved like without retrying either request or inventing a match.
  let commandCount = 0;
  await page.route('**/rest/v1/rpc/write_like', async route => {
    commandCount++;
    const next = route.request().postDataJSON();
    expect(next.p_token).not.toBe(oldGesture?.p_token);
    expect(next.p_request_id).not.toBe(oldGesture?.p_request_id);
    const result = await route.fetch();
    expect((await result.json()).accepted).toBe(true);
    await route.abort('failed');
  });
  await page.getByRole('button', { name: 'Like', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Unlike Bob', exact: true })).toBeEnabled();
  await expect(page.getByText(t.en.room.likeRefreshNotice, { exact: true })).toBeVisible();
  expect(commandCount).toBe(1);
  await inspect(page, 'lost-response');
  expect((await a.from('likes').select('id')).data).toHaveLength(1);
  await page.unroute('**/rest/v1/rpc/write_like');

  await page.clock.fastForward(6_000);
  await expect(page.getByTestId('like-notice')).toHaveCount(0);

  // Even a confirmed unlike must not claim a refresh succeeded when the reread
  // fails. The notice expires independently, then foreground recovery restores cards.
  const failRefresh = (route: Route) => route.fulfill({
    status: 503, contentType: 'application/json', body: JSON.stringify({ message: 'Test refresh failure' }),
  });
  await page.route('**/rest/v1/rpc/room_candidates', failRefresh);
  await page.getByRole('button', { name: 'Unlike Bob', exact: true }).click();
  await expect(page.getByTestId('like-notice')).toHaveText(t.en.room.likeRefreshFailed);
  await expect(page.getByText(t.en.room.likeRefreshNotice, { exact: true })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Bob', exact: true })).toHaveCount(0);
  await inspect(page, 'refresh-failed');
  await page.clock.fastForward(6_000);
  await expect(page.getByTestId('like-notice')).toHaveCount(0);
  await page.unroute('**/rest/v1/rpc/room_candidates', failRefresh);
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await expect(page.getByRole('button', { name: 'Like', exact: true })).toBeEnabled();

  // Hold an older successful discovery response across a newer hidden-state
  // refresh. Releasing it must not restore Bob's card or its old authorization.
  let releaseSnapshot!: () => void;
  const snapshotHeld = new Promise<void>(resolve => { releaseSnapshot = resolve; });
  let snapshotReady!: () => void;
  const snapshotCaptured = new Promise<void>(resolve => { snapshotReady = resolve; });
  let snapshotDone!: () => void;
  const snapshotDelivered = new Promise<void>(resolve => { snapshotDone = resolve; });
  let holdNext = true;
  const delayedSnapshot = async (route: Route) => {
    if (!holdNext) { await route.continue(); return; }
    holdNext = false;
    const response = await route.fetch();
    snapshotReady();
    await snapshotHeld;
    await route.fulfill({ response });
    snapshotDone();
  };
  await page.route('**/rest/v1/rpc/room_candidates', delayedSnapshot);
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await snapshotCaptured;
  expect((await b.from('presence').update({ is_visible: false }).eq('profile_id', bob.id)).error).toBeNull();
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await expect(page.getByRole('heading', { name: 'Bob', exact: true })).toHaveCount(0);
  releaseSnapshot();
  await snapshotDelivered;
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  await expect(page.getByRole('heading', { name: 'Bob', exact: true })).toHaveCount(0);
  await page.unroute('**/rest/v1/rpc/room_candidates', delayedSnapshot);
  expect((await b.from('presence').update({ is_visible: true }).eq('profile_id', bob.id)).error).toBeNull();
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await expect(page.getByRole('button', { name: 'Like', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Like', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Unlike Bob', exact: true })).toBeEnabled();

  const reciprocal = await likeCommand(b, venue.id, alice.id);
  expect((await b.rpc('write_like', reciprocal).single()).data?.match_id).toBeTruthy();
  await expect(page.getByRole('heading', { name: 'The feeling’s mutual.', exact: true })).toBeVisible();
  await inspect(page, 'match');
  await page.getByRole('button', { name: t.en.room.matchDismiss, exact: true }).click();
  expect((await b.rpc('write_like', reciprocal).single()).data?.accepted).toBe(true);
  // A duplicate receipt and foreground refresh must not replay the reveal.
  const refreshed = page.waitForResponse('**/rest/v1/rpc/room_candidates');
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await refreshed;
  await expect(page.getByRole('heading', { name: 'The feeling’s mutual.' })).toHaveCount(0);
  await inspect(page, 'dismissed');
  expect((await a.from('matches').select('id').eq('venue_night_id', venue.nightId)).data).toHaveLength(1);
  expect((await a.rpc('write_like', { ...original, p_request_id: randomUUID() }).single()).data?.accepted).toBe(false);
});
