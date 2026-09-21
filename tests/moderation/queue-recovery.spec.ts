import { test, expect, type WebSocketRoute, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

async function inspect(page: Page, state: string) {
  const directory = process.env.E2E_SCREENSHOTS_DIR;
  if (!directory) return;
  await mkdir(directory, { recursive: true });
  await page.screenshot({ path: join(directory, `${test.info().project.name}-controlled-queue-${state}.png`), fullPage: true });
}

// Controlled browser faults complement the real two-founder/Supabase journey.
// No shared fixtures or remote writes: HTTP and Realtime are both intercepted.
test('queue preserves inspection through live updates, read failures and recovery', async ({ page, baseURL }) => {
  await page.clock.install();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.route('https://vercel.live/_next-live/feedback/feedback.js', route => route.abort());
  if (process.env.E2E_VERCEL_BYPASS && baseURL) {
    // Match the shared fixture's existing preview contract; never send this to Supabase.
    await page.route(`${new URL(baseURL).origin}/**`, route => route.continue({
      headers: { ...route.request().headers(), 'x-vercel-protection-bypass': process.env.E2E_VERCEL_BYPASS! },
    }));
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const project = new URL(url).hostname.split('.')[0];
  const owner = '00000000-0000-4000-8000-000000000001';
  const expires = Math.floor(Date.now() / 1000) + 3600;
  const token = [
    Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url'),
    Buffer.from(JSON.stringify({ sub: owner, exp: expires, role: 'authenticated' })).toString('base64url'),
    'browser-test-signature',
  ].join('.');
  await page.addInitScript(({ key, owner, token, expires }) => {
    localStorage.setItem(key, JSON.stringify({ access_token: token, refresh_token: 'browser-test', expires_at: expires, expires_in: 3600, token_type: 'bearer', user: { id: owner, aud: 'authenticated', role: 'authenticated' } }));
  }, { key: `sb-${project}-auth-token`, owner, token, expires });

  let socket: WebSocketRoute | undefined;
  let joinRef: string | null = null;
  await page.routeWebSocket(`${url.replace(/^http/, 'ws')}/realtime/v1/**`, ws => {
    socket = ws;
    ws.onMessage(raw => {
      const [join, ref, topic, event] = JSON.parse(String(raw));
      if (event === 'phx_join') {
        if (topic === 'realtime:founder-moderation') joinRef = join;
        ws.send(JSON.stringify([join, ref, topic, 'phx_reply', { status: 'ok', response: { postgres_changes: [] } }]));
      } else if (event === 'heartbeat' || event === 'phx_leave') {
        ws.send(JSON.stringify([join, ref, topic, 'phx_reply', { status: 'ok', response: {} }]));
      }
    });
  });
  const signal = () => socket!.send(JSON.stringify([joinRef, null, 'realtime:founder-moderation', 'broadcast', { event: 'queue_changed', payload: { version: 1 } }]));
  const report = {
    id: '00000000-0000-4000-8000-000000000002', case_id: '00000000-0000-4000-8000-000000000003',
    venue_night_id: null, reason: 'harassment', note: 'Keep this detail open', created_at: new Date().toISOString(), reviewed_at: null as string | null,
    interaction_evidence: 'shared_venue_night', interaction_verified_at: null,
    reporter: { id: owner, first_name: 'Reporter', photo_url: null },
    reported: { id: '00000000-0000-4000-8000-000000000004', first_name: 'Reported', photo_url: null },
    moderation_case: { id: '00000000-0000-4000-8000-000000000003', status: 'pending_review', action_expires_at: null }, venue_night: null,
  };
  let reports = [report];
  let fail = true;
  let reads = 0;
  let hold: Promise<void> | undefined;
  await page.route(`${url}/**`, async route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/rpc/am_i_admin')) return route.fulfill({ json: true });
    if (path.endsWith('/reports')) {
      reads++;
      const snapshot = structuredClone(reports);
      if (hold) await hold;
      return route.fulfill({ json: snapshot });
    }
    if (path.endsWith('/rpc/admin_moderation_queue')) {
      if (fail) return route.fulfill({ status: 503, json: { message: 'unavailable' } });
      return route.fulfill({ json: reports.map(row => ({ report_id: row.id, total_reports: 1, unique_reporters: 1, reporter_activity: 1, priority_score: 200, priority_reason: 'New report', is_handled: Boolean(row.reviewed_at), handled_at: row.reviewed_at })) });
    }
    if (path.endsWith('/rpc/profile_photo_source')) return route.fulfill({ json: null });
    return route.fulfill({ json: [] });
  });
  await page.goto('/admin');
  let releaseInitial!: () => void;
  hold = new Promise<void>(resolve => { releaseInitial = resolve; });
  await page.getByRole('button', { name: /Moderation/ }).click();
  await expect(page.getByText('Loading moderation reports…')).toBeVisible();
  await inspect(page, 'loading');
  hold = undefined;
  releaseInitial();
  await expect(page.getByRole('alert').filter({ hasText: 'Could not update moderation reports.' })).toContainText('Could not update moderation reports.');
  await inspect(page, 'initial-error');
  fail = false;
  const retry = page.getByRole('alert').filter({ hasText: 'Could not update moderation reports.' }).getByRole('button', { name: 'Retry' });
  await retry.focus();
  await retry.press('Enter');
  await expect(page.getByText('Live updates connected.', { exact: true })).toBeVisible();
  await page.getByRole('button').filter({ hasText: 'Harassment' }).click();
  const dialog = page.getByRole('dialog', { name: 'Report details' });
  const node = await dialog.elementHandle();
  await expect(dialog.getByText('“Keep this detail open”')).toBeVisible();
  report.reviewed_at = new Date().toISOString();
  signal();
  await expect(dialog.getByRole('button', { name: 'Reviewed', exact: true })).toBeDisabled();
  expect(await node?.evaluate(el => el.isConnected)).toBe(true);
  await inspect(page, 'live-detail');

  fail = true;
  signal();
  await expect(dialog.getByText(/Updates interrupted/)).toBeVisible();
  await expect(dialog.getByText('“Keep this detail open”')).toBeVisible();
  await inspect(page, 'stale-detail');
  fail = false;
  await dialog.getByRole('button', { name: 'Retry' }).click();
  await expect(dialog.getByText(/Updates interrupted/)).toHaveCount(0);

  // Invalid payloads have no effects, including no authorized refetch.
  const beforeInvalid = reads;
  socket!.send(JSON.stringify([joinRef, null, 'realtime:founder-moderation', 'broadcast', { event: 'queue_changed', payload: { version: '1' } }]));
  await page.waitForTimeout(400);
  expect(reads).toBe(beforeInvalid);

  // A change during a slow fetch must be followed by another fetch.
  let release!: () => void;
  hold = new Promise<void>(resolve => { release = resolve; });
  const beforeSlow = reads;
  signal();
  await expect.poll(() => reads).toBe(beforeSlow + 1);
  report.moderation_case.status = 'removed_for_night';
  for (let i = 0; i < 20; i++) signal();
  await page.waitForTimeout(300);
  expect(reads).toBe(beforeSlow + 1);
  hold = undefined;
  release();
  await expect(dialog.getByRole('button', { name: 'Restore access' })).toBeVisible();
  expect(reads).toBe(beforeSlow + 2);
  expect(await node?.evaluate(el => el.isConnected)).toBe(true);

  // Browsers can emit offline/online while a socket remains joined.
  await page.evaluate(() => window.dispatchEvent(new Event('offline')));
  await expect(page.getByText('Live updates interrupted. Checking for changes every 30 seconds.', { exact: false })).toBeAttached();
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect(page.getByText('Live updates connected.', { exact: true })).toBeAttached();

  // Foreground and periodic recovery work even with no invalidation delivery.
  report.moderation_case.status = 'pending_review';
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await expect(dialog.getByRole('button', { name: 'Block until end of night' })).toBeVisible();
  report.moderation_case.status = 'removed_for_night';
  await page.clock.fastForward(30000);
  await expect(dialog.getByRole('button', { name: 'Restore access' })).toBeVisible();
  reports = [];
  signal();
  await expect(dialog.getByText('This report is no longer available.')).toBeVisible();
  await dialog.getByRole('button', { name: 'Close' }).click();
  await expect(page.getByText('0 open')).toBeVisible();
  await inspect(page, 'empty');
});
