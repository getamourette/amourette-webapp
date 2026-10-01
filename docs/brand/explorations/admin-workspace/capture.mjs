// Local design review only; no Playwright config or shared fixture setup.
import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';

const origin = 'http://127.0.0.1:3162';
const directory = new URL('./captures/', import.meta.url).pathname;
await mkdir(directory, { recursive: true });
const browser = await chromium.launch();
const failures = [];
try {
  for (const width of [1440, 390, 320]) {
    const context = await browser.newContext({ viewport: { width, height: width === 1440 ? 1100 : 844 }, reducedMotion: 'reduce' });
    const page = await context.newPage();
    page.on('pageerror', error => failures.push(error.message));
    await context.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.origin === origin && !url.pathname.startsWith('/api/')) return route.continue();
      failures.push(`Unexpected network request: ${url.origin}${url.pathname}`);
      return route.abort();
    });
    // Permit only Next's local HMR; refuse any backend websocket.
    await context.routeWebSocket(/.*/, socket => {
      if (new URL(socket.url()).host === new URL(origin).host) socket.connectToServer();
      else { failures.push(`Unexpected websocket: ${socket.url()}`); socket.close(); }
    });
    await page.goto(`${origin}/admin/workspace-preview`);
    await expect(page.getByRole('heading', { name: 'Le Salon', exact: true })).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    // Hide Next's development badge only in captures, not in the application.
    await page.addStyleTag({ content: 'nextjs-portal { display: none; }' });
    const capture = async name => {
      const modalOpen = await page.getByRole('dialog').count() > 0;
      await page.screenshot({ path: `${directory}${name}-${width}.png`, fullPage: !modalOpen });
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `${name}: horizontal overflow at ${width}`);
    };
    for (const variant of ['A · Venue page', 'B · Tabs']) {
      const prefix = variant[0].toLowerCase();
      await page.getByRole('button', { name: variant, exact: true }).click();
      await page.getByLabel('Scenario').selectOption('populated');
      await capture(`${prefix}-overview`);
      await page.getByText('History', { exact: false }).filter({ has: page.locator('span') }).first().click();
      await page.getByRole('button', { name: /View night Sat.*26 Sep/ }).click();
      const dialog = page.getByRole('dialog');
      await expect(dialog.getByText('This night is part of venue history.', { exact: false })).toBeVisible();
      assert.equal(await dialog.locator('input, select').count(), 0, 'Terminal history has no form controls');
      assert.equal(await dialog.getByRole('button', { name: /Save|Pause|Reopen/ }).count(), 0);
      if (prefix === 'a') await capture('history-detail');
      await page.keyboard.press('Escape');
      await expect(dialog).toHaveCount(0);
      await expect(page.getByRole('button', { name: /View night Sat.*26 Sep/ })).toBeFocused();
      await page.getByRole('button', { name: /Edit night Fri.*2 Oct/ }).click();
      await expect(dialog.getByLabel('Night date')).toHaveValue('2026-10-02');
      if (prefix === 'a') await capture('schedule-editor');
      await dialog.getByRole('button', { name: 'Save schedule', exact: true }).click();
      await expect(dialog.getByRole('status')).toHaveText('Schedule form preview only. No night was saved.');
      await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
      await page.getByLabel('Scenario').selectOption('empty');
      await expect(page.getByText('Ready for your first night')).toBeVisible();
      await capture(`${prefix}-empty`);
      await page.getByLabel('Scenario').selectOption('long');
      await capture(`${prefix}-long-name`);
      await page.getByLabel('Scenario').selectOption('error');
      await expect(page.getByText('Nights could not be loaded')).toBeVisible();
      await page.getByRole('button', { name: 'Try again', exact: true }).click();
      await expect(page.getByText('Live now', { exact: true })).toBeVisible();
    }
    await page.getByRole('button', { name: 'Venue details', exact: true }).click();
    await capture('b-venue-details');
    await page.getByRole('button', { name: 'Edit venue details', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Venue name', { exact: true }).fill('x'.repeat(121));
    await dialog.getByRole('button', { name: 'Save venue details' }).click();
    await expect(dialog.getByRole('alert')).toBeVisible();
    await dialog.getByLabel('Venue name', { exact: true }).fill('  Le Salon Updated  ');
    await dialog.getByRole('button', { name: 'Save venue details' }).click();
    await expect(page.getByRole('heading', { name: 'Le Salon Updated', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Nights', exact: false }).filter({ has: page.locator('span') }).click();
    await page.getByRole('button', { name: /Edit night Fri.*2 Oct/ }).click();
    await expect(dialog.getByLabel('Night date')).toHaveValue('2026-10-02');
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Manage night', exact: false }).click();
    await dialog.getByRole('button', { name: 'Pause room' }).click();
    await expect(dialog.getByRole('button', { name: 'Reopen room' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByText('Paused now', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Production QR', exact: true }).click();
    await expect(dialog.getByText('Sample QR placement')).toBeVisible();
    await capture('qr-panel');
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'All venues', exact: true }).click();
    await expect(page.getByText('2 upcoming nights', { exact: true })).toBeVisible();
    await context.close();
  }
  assert.deepEqual(failures, []);
  console.log('Design preview verified at 1440, 390 and 320 px: A/B layouts, history, editor dismissal/focus, empty/error states, local detail saving, simulated pause, QR placement and counts. No backend calls.');
} finally { await browser.close(); }
