import { randomUUID } from 'node:crypto';
import type { Page } from '@playwright/test';
import { test, expect } from '../helpers/fixtures';

function observeRoom(page: Page) {
  const channels = new Set<string>();
  const requests: string[] = [];
  page.on('websocket', socket => {
    socket.on('framesent', ({ payload }) => {
      if (typeof payload !== 'string') return;
      const frame = JSON.parse(payload) as unknown[] | { topic?: unknown; event?: unknown };
      const topic = Array.isArray(frame) ? frame[2] : frame.topic;
      const event = Array.isArray(frame) ? frame[3] : frame.event;
      if (typeof topic !== 'string' || !/^realtime:(venue-night|presence|matches|room-messages)-/.test(topic)) return;
      if (event === 'phx_join') channels.add(topic);
      if (event === 'phx_leave') channels.delete(topic);
    });
    socket.on('close', () => channels.clear());
  });
  page.on('request', request => {
    const url = new URL(request.url());
    if (/\/rest\/v1\/(presence|matches|messages|likes|blocks|rpc\/(room_candidates|write_like|submit_report|submit_venue_feedback|has_submitted_venue_feedback|record_room_arrival))$/.test(url.pathname)) {
      requests.push(`${request.method()} ${url.pathname}`);
    }
  });
  return { channels, requests };
}

test('another tab signing in replaces the anonymous room, stops old resources and discards delayed reads', async ({ data, contextFor }) => {
  const venue = await data.venue();
  const alice = await data.identity('Alice', 'woman', 'anonymous');
  const bob = await data.identity('Bob', 'man');
  const replacement = await data.identity('Replacement');
  const password = randomUUID();
  expect((await data.service.auth.admin.updateUserById(replacement.id, { password })).error).toBeNull();
  await data.checkIn(venue, [alice, bob]);
  await data.match(venue, alice, bob);

  const context = await contextFor(alice);
  await context.addInitScript(() => localStorage.setItem('amourette-room-hint-dismissed', '1'));
  const room = await context.newPage();
  await room.setViewportSize({ width: 320, height: 700 });
  const traffic = observeRoom(room);
  await room.goto(`/v/${venue.slug}`);
  await expect(room.getByRole('button', { name: 'Night options', exact: true })).toBeVisible();
  await expect.poll(() => traffic.channels.size).toBe(4);
  await room.getByRole('button', { name: 'Night options', exact: true }).click();
  await room.getByRole('button', { name: 'Give feedback', exact: true }).click();
  const feedback = room.getByRole('dialog', { name: 'How was tonight?' });
  await feedback.getByPlaceholder('Your feedback', { exact: true }).fill('Private unfinished feedback from Alice');
  await room.screenshot({ path: test.info().outputPath('before-identity-change.png') });

  // The old authorized response is already fetched, but cannot publish after
  // the identity changes, even if its transport finishes later.
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  let waiting = false;
  await room.route('**/rest/v1/rpc/room_candidates', async route => {
    const response = await route.fetch();
    waiting = true;
    await held;
    await route.fulfill({ response });
  }, { times: 1 });
  await room.evaluate(() => window.dispatchEvent(new Event('amourette-participant-refresh')));
  await expect.poll(() => waiting).toBe(true);

  let releaseProfile!: () => void;
  const profileHeld = new Promise<void>(resolve => { releaseProfile = resolve; });
  let readingReplacement = false;
  await room.route('**/rest/v1/profiles?**', async route => {
    if (new URL(route.request().url()).searchParams.get('id') === `eq.${replacement.id}`) {
      readingReplacement = true;
      await profileHeld;
    }
    await route.continue();
  });
  const cancelledRead = room.waitForEvent('requestfailed', {
    predicate: request => request.url().includes('/rpc/room_candidates'),
  });

  const admin = await context.newPage();
  await admin.goto('/admin');
  await admin.locator('input[type=email]').fill(replacement.session.user.email!);
  await admin.locator('input[type=password]').fill(password);
  await admin.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(admin.getByRole('heading', { name: 'Not authorized', exact: true })).toBeVisible();
  await expect.poll(() => readingReplacement).toBe(true);
  await cancelledRead;
  await expect(feedback).toHaveCount(0);
  await expect.poll(() => traffic.channels.size).toBe(0);
  release();
  await expect(room.getByTestId('profile-feed')).toHaveCount(0);
  await expect(room.getByRole('button', { name: 'Night options', exact: true })).toHaveCount(0);
  await room.screenshot({ path: test.info().outputPath('identity-reset-loading.png') });
  releaseProfile();
  await expect(room).toHaveURL(new RegExp(`/profile\\?venue=${venue.slug}$`));
  await room.screenshot({ path: test.info().outputPath('replacement-onboarding.png') });

  // Foreground recovery and multiple heartbeat/poll intervals cannot revive
  // the old participant's resources or submit their unfinished feedback.
  const stopped = traffic.requests.length;
  await room.clock.install();
  await room.clock.fastForward(125_000);
  await room.evaluate(() => {
    window.dispatchEvent(new Event('focus'));
    window.dispatchEvent(new Event('online'));
    document.dispatchEvent(new Event('visibilitychange'));
    window.dispatchEvent(new Event('amourette-participant-refresh'));
  });
  await room.clock.runFor(1_000);
  expect(traffic.requests.slice(stopped)).toEqual([]);
  expect(traffic.channels.size).toBe(0);
  const feedbackRows = await data.service.from('venue_feedback').select('id', { count: 'exact', head: true })
    .eq('venue_night_id', venue.nightId);
  expect(feedbackRows.error).toBeNull();
  expect(feedbackRows.count).toBe(0);
});

test('same-user sign-in preserves the room; replacement and sign-out reset its owner', async ({ data, contextFor }) => {
  const venue = await data.venue();
  const alice = await data.identity('Alice', 'woman');
  const bob = await data.identity('Bob', 'man');
  const carol = await data.identity('Carol', 'woman');
  const password = randomUUID();
  for (const actor of [alice, carol]) {
    expect((await data.service.auth.admin.updateUserById(actor.id, { password })).error).toBeNull();
  }
  await data.checkIn(venue, [alice, bob, carol]);
  await data.match(venue, alice, bob);
  const context = await contextFor(alice);
  await context.addInitScript(() => localStorage.setItem('amourette-room-hint-dismissed', '1'));
  const room = await context.newPage();
  const traffic = observeRoom(room);
  await room.goto(`/v/${venue.slug}`);
  await expect(room.getByRole('button', { name: 'Night options', exact: true })).toBeVisible();
  await expect.poll(() => traffic.channels.size).toBe(4);
  const originalFeed = await room.getByTestId('profile-feed').elementHandle();
  await room.getByRole('button', { name: 'Night options', exact: true }).click();
  await room.getByRole('button', { name: 'Give feedback', exact: true }).click();
  const feedback = room.getByRole('dialog', { name: 'How was tonight?' });
  const draft = feedback.getByPlaceholder('Your feedback', { exact: true });
  await draft.fill('Keep Alice’s unfinished feedback');

  const admin = await context.newPage();
  await admin.goto('/admin');
  await admin.locator('input[type=email]').fill(alice.session.user.email!);
  await admin.locator('input[type=password]').fill(password);
  await admin.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(admin.getByRole('heading', { name: 'Not authorized', exact: true })).toBeVisible();
  await expect(draft).toHaveValue('Keep Alice’s unfinished feedback');
  expect(await room.getByTestId('profile-feed').evaluate((element, previous) => element === previous, originalFeed)).toBe(true);
  expect(traffic.channels.size).toBe(4);

  // Reloading /admin shows its sign-in form for an ordinary participant.
  await admin.reload();
  await admin.locator('input[type=email]').fill(carol.session.user.email!);
  await admin.locator('input[type=password]').fill(password);
  await admin.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(admin.getByRole('heading', { name: 'Not authorized', exact: true })).toBeVisible();
  await expect(feedback).toHaveCount(0);
  await expect(room.getByRole('button', { name: 'Night options', exact: true })).toBeVisible();
  await expect.poll(() => traffic.channels.size).toBe(3);
  await expect(room.getByTestId('profile-feed').getByText('Alice', { exact: true })).toBeVisible();
  await expect(room.getByTestId('profile-feed').getByText('Carol', { exact: true })).toHaveCount(0);
  await room.getByRole('button', { name: 'Night options', exact: true }).click();
  await room.getByRole('button', { name: 'Give feedback', exact: true }).click();
  await expect(draft).toHaveValue('');
  await draft.fill('Feedback from Carol’s fresh room');
  await feedback.getByRole('button', { name: 'Send feedback', exact: true }).click();
  await expect(feedback.getByText('Thanks for helping us improve Amourette.', { exact: true })).toBeVisible();
  const stored = await data.service.from('venue_feedback').select('profile_id,body')
    .eq('venue_night_id', venue.nightId);
  expect(stored.error).toBeNull();
  expect(stored.data).toEqual([{ profile_id: carol.id, body: 'Feedback from Carol’s fresh room' }]);
  await room.screenshot({ path: test.info().outputPath('replacement-feedback.png') });

  // The normal sign-out path creates a fresh anonymous session. Return an
  // already tracked, real anonymous session from signup so teardown owns it.
  const signedOut = await data.identity('AfterSignOut', undefined, 'anonymous');
  await context.route('**/auth/v1/signup', route => route.fulfill({ json: signedOut.session }));
  await admin.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(room).toHaveURL(new RegExp(`/profile\\?venue=${venue.slug}$`));
  await expect(feedback).toHaveCount(0);
  await expect.poll(() => traffic.channels.size).toBe(0);
  const storageKey = `sb-${new URL(data.env.url).hostname.split('.')[0]}-auth-token`;
  await expect.poll(() => room.evaluate(key => {
    const session = JSON.parse(localStorage.getItem(key) ?? 'null') as { user?: { id?: unknown } } | null;
    return session?.user?.id;
  }, storageKey)).toBe(signedOut.id);
});

for (const waiting of [false, true]) {
  test(`identity replacement cancels a pending ${waiting ? 'waiting' : 'empty live'} room email submission`, async ({ data, contextFor }) => {
    const venue = await data.venue();
    if (waiting) {
      expect((await data.service.from('venue_nights').update({
        status: 'waiting', launched_at: null, launch_reason: null,
        guaranteed_launch_at: new Date(Date.now() + 1_800_000).toISOString(), launch_threshold: 1000,
      }).eq('id', venue.nightId)).error).toBeNull();
    }
    const alice = await data.identity('Alice', 'woman');
    const replacement = await data.identity('Replacement');
    const password = randomUUID();
    expect((await data.service.auth.admin.updateUserById(replacement.id, { password })).error).toBeNull();
    await data.checkIn(venue, [alice]);
    const context = await contextFor(alice);
    await context.addInitScript(() => localStorage.setItem('amourette-room-hint-dismissed', '1'));
    const room = await context.newPage();
    await room.goto(`/v/${venue.slug}`);
    await room.getByRole('button', { name: /Want to hear about upcoming nights/ }).click();
    await room.getByPlaceholder('you@email.com', { exact: true }).fill('e2e-identity@example.com');
    await room.getByRole('checkbox').check();
    let release!: () => void;
    const held = new Promise<void>(resolve => { release = resolve; });
    let submitting = false;
    await room.route('**/api/email/subscribe', async route => {
      submitting = true;
      await held;
      await route.fulfill({ json: { alreadySubscribed: false, email: 'e2e-identity@example.com' } });
    });
    await room.getByRole('button', { name: 'Keep me posted', exact: true }).click();
    await expect.poll(() => submitting).toBe(true);
    const cancelled = room.waitForEvent('requestfailed', {
      predicate: request => new URL(request.url()).pathname === '/api/email/subscribe',
    });
    const admin = await context.newPage();
    await admin.goto('/admin');
    await admin.locator('input[type=email]').fill(replacement.session.user.email!);
    await admin.locator('input[type=password]').fill(password);
    await admin.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(admin.getByRole('heading', { name: 'Not authorized', exact: true })).toBeVisible();
    await cancelled;
    await expect(room).toHaveURL(new RegExp(`/profile\\?venue=${venue.slug}$`));
    release();
    await expect(room.getByPlaceholder('you@email.com', { exact: true })).toHaveCount(0);
    await expect(room.getByText('We’ll let you know about upcoming nights.', { exact: true })).toHaveCount(0);
  });
}
