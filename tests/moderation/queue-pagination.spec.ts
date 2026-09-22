import { test, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { mockNameUi, nameUiState, nameIds } from '../helpers/name-ui-fixture';

// Keep network/action evidence without repeatedly serializing 1,001 table rows
// for every intercepted page. Screenshots still capture failures and preview states.
test.use({ trace: { mode: 'retain-on-failure', snapshots: false } });

test('all 1001 reports load alongside name corrections and survive later-page failures', async ({ context, page }) => {
  test.setTimeout(90_000);
  const inspect = async (state: string) => {
    if (!process.env.E2E_SCREENSHOTS_DIR) return;
    await mkdir(process.env.E2E_SCREENSHOTS_DIR, { recursive: true });
    await page.screenshot({ path: join(process.env.E2E_SCREENSHOTS_DIR, `${test.info().project.name}-pagination-${state}.png`) });
  };
  const names = nameUiState();
  const correctionId = crypto.randomUUID();
  names.corrections.push({ id: correctionId, profile_id: nameIds.alice, proposed_name: 'Alix', status: 'pending', created_at: new Date().toISOString(), resolved_at: null, reviewed_by: null });
  await mockNameUi(context, names, 'admin');
  const reports = Array.from({ length: 1001 }, (_, i) => ({
    id: `10000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`,
    case_id: null, venue_night_id: null, reason: i === 1000 ? 'underage' : 'harassment',
    note: `Report ${i + 1}`, created_at: new Date(Date.now() - (1000 - i) * 1000).toISOString(),
    reviewed_at: null as string | null, interaction_evidence: 'shared_venue_night', interaction_verified_at: null,
    reporter: { id: nameIds.alice, first_name: 'Alice', photo_url: null },
    reported: { id: nameIds.bob, first_name: 'Bob', photo_url: null },
    moderation_case: null, venue_night: null,
  }));
  let failLaterPage = false;
  const cursors = { reports: new Set<string>(), metadata: new Set<string>() };
  await page.route('**/rest/v1/reports?*', route => {
    const query = new URL(route.request().url()).searchParams;
    expect(query.get('order')).toBe('id.asc');
    const after = query.get('id')?.slice(3) ?? '';
    cursors.reports.add(after);
    // Different server caps deliberately make independently truncated reads disagree.
    return route.fulfill({ json: reports.filter(row => row.id > after).slice(0, Math.min(137, Number(query.get('limit')))).map(row => ({ ...row, reporter: { ...row.reporter, first_name: names.name } })) });
  });
  await page.route('**/rest/v1/rpc/admin_moderation_queue*', route => {
    const query = new URL(route.request().url()).searchParams;
    expect(query.get('order')).toBe('report_id.asc');
    const after = query.get('report_id')?.slice(3) ?? '';
    cursors.metadata.add(after);
    if (after && failLaterPage) return route.fulfill({ status: 503, json: { message: 'unavailable' } });
    return route.fulfill({ json: reports.filter(row => row.id > after).slice(0, Math.min(83, Number(query.get('limit')))).map(row => ({ report_id: row.id, total_reports: 1, unique_reporters: 1, reporter_activity: 1, priority_score: row.reason === 'underage' ? 1000 : 200, priority_reason: 'New report', is_handled: Boolean(row.reviewed_at), handled_at: row.reviewed_at })) });
  });
  await page.route('**/rest/v1/rpc/review_report', route => {
    const id = route.request().postDataJSON().p_report_id;
    reports.find(row => row.id === id)!.reviewed_at = new Date().toISOString();
    return route.fulfill({ json: null });
  });
  await page.goto('/admin');
  await page.getByRole('button', { name: /Moderation/ }).click();
  await expect(page.getByText('1001 open', { exact: true })).toBeVisible();
  expect(cursors.reports.size).toBe(9);
  expect(cursors.metadata.size).toBe(14);
  const corrections = page.getByTestId('admin-name-corrections');
  await corrections.getByRole('button', { name: /Name corrections/ }).click();
  await corrections.getByRole('button', { name: /Alice → Alix/ }).click();
  const nameDetail = page.getByRole('dialog', { name: 'Name correction', exact: true });
  const inspected = await nameDetail.elementHandle();
  // A report refresh must not remount the independent name review.
  await Promise.all([
    page.waitForResponse(response => {
      const url = new URL(response.url());
      return url.pathname.endsWith('/admin_moderation_queue') && url.searchParams.get('report_id') === `gt.${reports.at(-1)!.id}`;
    }),
    page.evaluate(() => window.dispatchEvent(new Event('online'))),
  ]);
  await expect(page.getByRole('button', { name: 'Refresh', exact: true, includeHidden: true })).toBeEnabled();
  expect(await inspected?.evaluate(node => node.isConnected)).toBe(true);
  await inspect('name-review');
  await nameDetail.getByRole('button', { name: 'Approve correction' }).click();
  await expect(nameDetail).toContainText('Correction approved.');
  await nameDetail.getByRole('button', { name: 'Close name review' }).click();
  await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  const latest = page.getByRole('button').filter({ hasText: 'Underage concern' });
  await expect(latest).toContainText('Alix');
  await latest.click();
  const detail = page.getByRole('dialog', { name: 'Report details' });
  await expect(detail).toContainText('“Report 1001”');
  failLaterPage = true;
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect(detail).toContainText('Updates interrupted');
  await expect(detail).toContainText('1001 open in queue');
  await expect(detail).toContainText('“Report 1001”');
  await inspect('stale-detail');
  failLaterPage = false;
  await detail.getByRole('button', { name: 'Retry', exact: true }).click();
  await expect(detail).not.toContainText('Updates interrupted');
  await detail.getByRole('button', { name: 'Mark reviewed' }).click();
  await expect(detail.getByRole('button', { name: 'Reviewed', exact: true })).toBeDisabled();
  await expect(detail).toContainText('1000 open in queue');
  await detail.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(corrections).toContainText('0 pending');
  await inspect('combined-queues');
});
