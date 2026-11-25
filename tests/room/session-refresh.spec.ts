import type { BrowserContext, Page } from '@playwright/test';
import { test, expect, type TestData } from '../helpers/fixtures';

// #480: an expired guest session whose refresh fails must keep the guest's
// identity (network down, Auth 5xx) or say it ended (refresh refused). It must
// never be replaced by a new anonymous user behind her back.

const storageKey = (data: TestData) => `sb-${new URL(data.env.url).hostname.split('.')[0]}-auth-token`;

function storedUserId(page: Page, key: string) {
  return page.evaluate(k => {
    const session = JSON.parse(localStorage.getItem(k) ?? 'null') as { user?: { id?: string } } | null;
    return session?.user?.id ?? null;
  }, key);
}

// The access token is past its expiry, as after an hour with the phone locked:
// the next page has to refresh it before anything else.
async function expireStoredSession(page: Page, key: string) {
  await page.evaluate(k => {
    const session = JSON.parse(localStorage.getItem(k)!) as { expires_at: number };
    localStorage.setItem(k, JSON.stringify({ ...session, expires_at: Math.floor(Date.now() / 1000) - 60 }));
  }, key);
}

function countSignUps(context: BrowserContext) {
  const signUps = { count: 0 };
  context.on('request', request => { if (new URL(request.url()).pathname.endsWith('/auth/v1/signup')) signUps.count++; });
  return signUps;
}

test('a refresh that fails while the network is down keeps the guest, her room and her match', async ({ data, contextFor }) => {
  test.setTimeout(150_000);
  const venue = await data.venue();
  const alice = await data.identity('Alice', 'woman', 'anonymous');
  const bob = await data.identity('Bob', 'man');
  await data.checkIn(venue, [alice, bob]);
  const matchId = await data.match(venue, alice, bob);
  const context = await contextFor(alice);
  await context.addInitScript(() => localStorage.setItem('amourette-room-hint-dismissed', '1'));
  const signUps = countSignUps(context);
  const key = storageKey(data);
  const page = await context.newPage();
  await page.goto(`/v/${venue.slug}`);
  await expect(page.getByTestId('match-stack')).toContainText('Bob');

  await test.step('the network drops; the expired session cannot be refreshed', async () => {
    await expireStoredSession(page, key);
    await context.route('**/auth/v1/token?grant_type=refresh_token', route => route.abort('internetdisconnected'));
    await page.goto(`/chat/${matchId}`);
    const notice = page.getByRole('status').filter({ hasText: 'Reconnecting…' });
    // Supabase retries the refresh for about 25 s before reporting the failure.
    await expect.poll(async () => signUps.count > 0 || await notice.isVisible(), { timeout: 45_000 }).toBe(true);
    expect(signUps.count, 'no new anonymous user is created').toBe(0);
    expect(await storedUserId(page, key), 'the stored identity is still Alice').toBe(alice.id);
    await expect(notice).toContainText('Your profile and your matches are kept.');
    await page.screenshot({ path: test.info().outputPath('reconnecting.png') });
  });

  await test.step('the network comes back: same guest, same match, no new identity', async () => {
    await context.unroute('**/auth/v1/token?grant_type=refresh_token');
    // Supabase holds a failed refresh for 60 s before trying the network
    // again; skip that wait instead of sleeping through it.
    await page.clock.install();
    await page.clock.fastForward(61_000);
    await expect(page.getByTestId('session-notice')).toHaveCount(0, { timeout: 20_000 });
    await expect(page).toHaveURL(new RegExp(`/chat/${matchId}$`));
    await expect(page.getByText('Bob', { exact: true }).first()).toBeVisible();
    expect(await storedUserId(page, key)).toBe(alice.id);
    await page.goto(`/v/${venue.slug}`);
    await expect(page.getByTestId('match-stack')).toContainText('Bob');
    expect(signUps.count).toBe(0);
  });
});

test('a session the server revoked is reported as ended, and only the guest starts a new one', async ({ data, contextFor }) => {
  test.setTimeout(120_000);
  const venue = await data.venue();
  const alice = await data.identity('Alice', 'woman', 'anonymous');
  await data.checkIn(venue, [alice]);
  const context = await contextFor(alice);
  await context.addInitScript(() => localStorage.setItem('amourette-room-hint-dismissed', '1'));
  const key = storageKey(data);
  const page = await context.newPage();
  await page.goto(`/v/${venue.slug}`);
  await expect(page.getByRole('button', { name: 'Night options', exact: true })).toBeVisible();

  // Revoke every refresh token of this guest on the server, as Auth does when
  // a refresh token is reused or the session is removed.
  expect((await data.service.auth.admin.signOut(alice.session.access_token, 'global')).error).toBeNull();
  await expireStoredSession(page, key);
  const signUps = countSignUps(context);

  await test.step('the next page says the session ended instead of creating a new guest', async () => {
    await page.reload();
    const notice = page.getByRole('alertdialog', { name: 'Your session has ended' });
    await expect.poll(async () => signUps.count > 0 || await notice.isVisible(), { timeout: 20_000 }).toBe(true);
    expect(signUps.count, 'no new anonymous user is created').toBe(0);
    await expect(notice).toContainText('If you booked, your reservation and its QR code stay valid.');
    await page.screenshot({ path: test.info().outputPath('session-ended.png') });
    // Wait past any late initialization before asserting the absence.
    await page.waitForTimeout(2_000);
    expect(signUps.count).toBe(0);
    expect(await storedUserId(page, key)).toBeNull();
  });

  await test.step('the guest chooses to start again: a new profile for this venue', async () => {
    // Return an already tracked anonymous session from signup so teardown owns it.
    const fresh = await data.identity('Fresh', undefined, 'anonymous');
    await context.route('**/auth/v1/signup', route => route.fulfill({ json: fresh.session }));
    await page.getByRole('button', { name: 'Create a new profile', exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/profile\\?venue=${venue.slug}$`));
    await expect(page.getByTestId('session-notice')).toHaveCount(0);
    expect(signUps.count).toBe(1);
    await expect.poll(() => storedUserId(page, key)).toBe(fresh.id);
  });
});
