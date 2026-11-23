import { createClient } from '@supabase/supabase-js';
import { test, expect, type TestData, type TestIdentity } from '../helpers/fixtures';
import type { Database } from '../../lib/database.types';

function client(data: TestData, user: TestIdentity) {
  return createClient<Database>(data.env.url, data.env.publishableKey, {
    accessToken: async () => user.session.access_token,
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// #475: a founder away from /admin/moderation (here on Tonight, where the door
// screen lives) learns about a new report without reloading.
test('a report filed during the night alerts a founder on another admin screen', async ({ data, contextFor }) => {
  test.setTimeout(90000);
  const founder = await data.identity('AlertFounder');
  const reporter = await data.identity('AlertReporter', 'woman');
  const reported = await data.identity('AlertReported', 'man');
  expect((await data.service.from('admins').insert({ user_id: founder.id })).error).toBeNull();
  const venue = await data.venue();
  await data.checkIn(venue, [reporter, reported]);
  const reviewer = client(data, founder);
  // The shared development database may already hold open reports from others.
  const openNow = async () => {
    const { data: rows, error } = await reviewer.rpc('admin_moderation_queue').select('report_id').eq('is_handled', false);
    expect(error).toBeNull();
    return rows!.length;
  };
  const baseline = await openNow();

  const context = await contextFor(founder);
  await context.addInitScript(() => {
    const cues = { vibrations: 0, tones: 0 };
    Object.assign(window, { __reportCues: cues });
    Object.defineProperty(navigator, 'vibrate', { configurable: true, value: () => { cues.vibrations++; return true; } });
    const Real = window.AudioContext;
    window.AudioContext = class extends Real {
      createOscillator() {
        const oscillator = super.createOscillator();
        const start = oscillator.start.bind(oscillator);
        oscillator.start = (when?: number) => { cues.tones++; start(when); };
        return oscillator;
      }
    };
  });
  const page = await context.newPage();
  const cues = () => page.evaluate(() => (window as unknown as { __reportCues: { vibrations: number; tones: number } }).__reportCues);
  await page.goto('/admin/tonight');
  await expect(page.getByRole('heading', { name: 'Tonight', exact: true })).toBeVisible();
  const moderationLink = page.getByRole('navigation', { name: 'Admin', exact: true }).getByRole('link', { name: 'Moderation', exact: true });
  const alert = page.getByRole('main').getByRole('alert').filter({ hasText: /\d+ open reports?/ });
  if (baseline === 0) {
    await expect(alert).toHaveCount(0);
    await expect(moderationLink).toHaveText('Moderation');
  } else {
    await expect(alert).toContainText(`${baseline} open report`);
  }
  // Browsers only allow audio after a gesture; any tap in the admin unlocks it.
  await page.getByRole('heading', { name: 'Tonight', exact: true }).click();

  const submit = await client(data, reporter).rpc('submit_report', { p_reported_id: reported.id, p_venue_night_id: venue.nightId, p_reason: 'harassment', p_note: 'Alert test report' });
  expect(submit.error).toBeNull();
  const reportId = submit.data!;

  // Within one poll (10 s) plus slack, with no reload or navigation.
  const raised = new RegExp(`^${baseline + 1} open reports?$`);
  await expect(alert.locator('span')).toHaveText(raised, { timeout: 15000 });
  await expect(moderationLink).toContainText(String(baseline + 1));
  await expect.poll(cues).toEqual({ vibrations: 1, tones: 2 });

  await test.step('a failed refresh keeps the alert instead of hiding it', async () => {
    await page.route('**/rest/v1/rpc/admin_moderation_queue*', route => route.fulfill({ status: 503, contentType: 'application/json', body: '{"message":"unavailable"}' }));
    const failed = page.waitForResponse(response => response.url().includes('/rpc/admin_moderation_queue') && response.status() === 503);
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await failed;
    await expect(alert.locator('span')).toHaveText(raised);
    await page.unroute('**/rest/v1/rpc/admin_moderation_queue*');
  });

  await test.step('the moderation link opens the queue, where the banner steps aside', async () => {
    await alert.getByRole('link', { name: 'Open moderation' }).click();
    await expect(page).toHaveURL(/\/admin\/moderation$/);
    await expect(page.getByRole('button').filter({ hasText: reporter.name }).filter({ hasText: 'Harassment' })).toBeVisible();
    await expect(alert).toHaveCount(0);
  });

  await test.step('handling the report clears the count without a new cue', async () => {
    expect((await reviewer.rpc('review_report', { p_report_id: reportId })).error).toBeNull();
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    if (baseline === 0) await expect(moderationLink).toHaveText('Moderation');
    else await expect(moderationLink).toContainText(String(baseline));
    expect(await cues()).toEqual({ vibrations: 1, tones: 2 });
  });
});
