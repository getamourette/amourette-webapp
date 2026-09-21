import { createClient } from '@supabase/supabase-js';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { test, expect, type TestData, type TestIdentity } from '../helpers/fixtures';
import type { Database } from '../../lib/database.types';
import type { Page } from '@playwright/test';
import { isModerationSignal, MODERATION_EVENT, MODERATION_TOPIC } from '../../lib/moderation-refresh';

function client(data: TestData, user: TestIdentity) {
  return createClient<Database>(data.env.url, data.env.publishableKey, {
    accessToken: async () => user.session.access_token,
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function inspect(page: Page, state: string) {
  const directory = process.env.E2E_SCREENSHOTS_DIR;
  if (!directory) return;
  await mkdir(directory, { recursive: true });
  await page.screenshot({ path: join(directory, `${test.info().project.name}-queue-${state}.png`), fullPage: true });
}

test('live reports converge across founders, preserve inspection and recover safely', async ({ data, contextFor }) => {
  test.setTimeout(150000);
  const founder = await data.identity('QueueFounder');
  const otherFounder = await data.identity('QueueOther');
  const reporter = await data.identity('QueueReporter', 'woman');
  const reported = await data.identity('QueueReported', 'man');
  const grants = await data.service.from('admins').insert([{ user_id: founder.id }, { user_id: otherFounder.id }]);
  expect(grants.error).toBeNull();
  const venue = await data.venue();
  await data.checkIn(venue, [reporter, reported]);
  const participant = client(data, reporter);
  const target = client(data, reported);
  const reviewer = client(data, founder);
  const received: unknown[] = [];
  const publicReceived: unknown[] = [];
  const deniedReceived: unknown[] = [];
  try {
    const privateChannel = reviewer.channel(MODERATION_TOPIC, { config: { private: true } })
      .on('broadcast', { event: MODERATION_EVENT }, (event: { payload: unknown }) => received.push(event.payload));
    await reviewer.realtime.setAuth(founder.session.access_token);
    await new Promise<void>((resolve, reject) => privateChannel.subscribe(status => {
      if (status === 'SUBSCRIBED') resolve();
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') reject(new Error('Founder signal subscription failed: apply approved #232 migration first'));
    }));
    await participant.realtime.setAuth(reporter.session.access_token);
    const denied = participant.channel(MODERATION_TOPIC, { config: { private: true } })
      .on('broadcast', { event: MODERATION_EVENT }, (event: { payload: unknown }) => deniedReceived.push(event.payload));
    const deniedStatus = await new Promise<string>(resolve => denied.subscribe(status => {
      if (['SUBSCRIBED', 'CHANNEL_ERROR', 'TIMED_OUT'].includes(status)) resolve(status);
    }));
    expect(deniedStatus).toBe('CHANNEL_ERROR');
    // A public listener with the same topic must receive no private signals.
    await target.realtime.setAuth(reported.session.access_token);
    const publicChannel = target.channel(MODERATION_TOPIC)
      .on('broadcast', { event: MODERATION_EVENT }, (event: { payload: unknown }) => publicReceived.push(event.payload));
    await new Promise<void>((resolve, reject) => publicChannel.subscribe(status => {
      if (status === 'SUBSCRIBED') resolve();
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') reject(new Error('Public control subscription failed'));
    }));

    const contextOne = await contextFor(founder);
    const contextTwo = await contextFor(otherFounder);
    const one = await contextOne.newPage();
    const two = await contextTwo.newPage();
    for (const page of [one, two]) {
      await page.goto('/admin');
      await page.getByRole('button', { name: /Moderation/ }).click();
      await expect(page.getByText('Live updates connected.', { exact: true })).toBeVisible();
    }
    const submit = await participant.rpc('submit_report', { p_reported_id: reported.id, p_venue_night_id: venue.nightId, p_reason: 'harassment', p_note: 'Queue test report' });
    expect(submit.error).toBeNull();
    const row = (page: Page) => page.getByRole('button').filter({ hasText: reporter.name }).filter({ hasText: 'Harassment' });
    // Under the 30-second fallback interval: this proves actual signal delivery.
    await expect(row(one)).toBeVisible({ timeout: 10000 });
    await expect(row(two)).toBeVisible({ timeout: 10000 });
    await row(one).click();
    const detailOne = one.getByRole('dialog', { name: 'Report details' });
    await expect(detailOne.getByText('“Queue test report”')).toBeVisible();
    const originalDetail = await detailOne.elementHandle();
    await detailOne.evaluate(node => { node.scrollTop = 80; });
    const scrollBefore = await detailOne.evaluate(node => node.scrollTop);
    const second = await target.rpc('submit_report', { p_reported_id: reporter.id, p_venue_night_id: venue.nightId, p_reason: 'underage' });
    expect(second.error).toBeNull();
    await expect(one.getByRole('button').filter({ hasText: reported.name }).filter({ hasText: 'Underage concern' })).toHaveCount(1);
    expect(await originalDetail?.evaluate(node => node.isConnected)).toBe(true);
    expect(await detailOne.evaluate(node => node.scrollTop)).toBe(scrollBefore);
    await expect(detailOne.getByText('“Queue test report”')).toBeVisible();

    await row(two).click();
    const detailTwo = two.getByRole('dialog', { name: 'Report details' });
    await detailTwo.getByRole('button', { name: 'Block until end of night' }).click();
    await expect(detailOne.getByRole('button', { name: 'Restore access' })).toBeVisible();
    await detailTwo.getByRole('button', { name: 'Restore access' }).click();
    await expect(detailOne.getByRole('button', { name: 'Block until end of night' })).toBeVisible();
    await detailTwo.getByRole('button', { name: 'Mark reviewed' }).click();
    await expect(detailOne.getByRole('button', { name: 'Reviewed', exact: true })).toBeDisabled();
    await inspect(one, 'live-detail');

    await test.step('failed refresh retains detail and Retry recovers', async () => {
      await one.route('**/rest/v1/rpc/admin_moderation_queue', route => route.fulfill({ status: 503, contentType: 'application/json', body: '{"message":"unavailable"}' }));
      await one.evaluate(() => window.dispatchEvent(new Event('online')));
      await expect(detailOne.getByText(/Updates interrupted/)).toBeVisible();
      await expect(detailOne.getByText('“Queue test report”')).toBeVisible();
      await inspect(one, 'stale-detail');
      await one.unroute('**/rest/v1/rpc/admin_moderation_queue');
      await detailOne.getByRole('button', { name: 'Retry', exact: true }).click();
      await expect(detailOne.getByText(/Updates interrupted/)).toHaveCount(0);
    });

    await test.step('offline recovery catches another founder action', async () => {
      await contextOne.setOffline(true);
      await detailTwo.getByRole('button', { name: 'Block until end of night' }).click();
      await expect(detailTwo.getByRole('button', { name: 'Restore access' })).toBeVisible();
      await contextOne.setOffline(false);
      await expect(detailOne.getByRole('button', { name: 'Restore access' })).toBeVisible();
      await expect(one.getByText('Live updates connected.', { exact: true })).toBeAttached();
    });

    await test.step('foreground recovery works even without a signal', async () => {
      await one.evaluate(() => Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' }));
      await detailTwo.getByRole('button', { name: 'Restore access' }).click();
      await expect(detailTwo.getByRole('button', { name: 'Block until end of night' })).toBeVisible();
      await one.evaluate(() => {
        Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
        document.dispatchEvent(new Event('visibilitychange'));
      });
      await expect(detailOne.getByRole('button', { name: 'Block until end of night' })).toBeVisible();
    });
    await detailOne.getByRole('button', { name: 'Close', exact: true }).click();
    await inspect(one, 'queue');

    await test.step('initial load failure has a working retry', async () => {
      await one.getByRole('button', { name: /Venues/ }).click();
      await one.route('**/rest/v1/rpc/admin_moderation_queue', route => route.fulfill({ status: 503, contentType: 'application/json', body: '{"message":"unavailable"}' }));
      await one.getByRole('button', { name: /Moderation/ }).click();
      await expect(one.getByRole('alert').filter({ hasText: 'Could not update moderation reports.' })).toContainText('Could not update moderation reports.');
      await inspect(one, 'initial-error');
      await one.unroute('**/rest/v1/rpc/admin_moderation_queue');
      await one.getByRole('alert').filter({ hasText: 'Could not update moderation reports.' }).getByRole('button', { name: 'Retry', exact: true }).click();
      await expect(row(one)).toBeVisible();
    });

    expect((await participant.rpc('admin_moderation_queue')).error).not.toBeNull();
    expect((await participant.from('moderation_cases').select('id')).data).toEqual([]);
    // Reporters may still read their own report, never somebody else's report.
    expect((await participant.from('reports').select('id').eq('id', second.data!)).data).toEqual([]);
    expect(received.length).toBeGreaterThan(0);
    expect(received.every(isModerationSignal)).toBe(true);
    for (const payload of received) {
      expect(Object.keys(payload as Record<string, unknown>).sort()).toEqual(['id', 'version']);
    }
    expect(publicReceived).toEqual([]);
    expect(deniedReceived).toEqual([]);
  } finally {
    await Promise.all([participant.removeAllChannels(), target.removeAllChannels(), reviewer.removeAllChannels()]);
  }
});
