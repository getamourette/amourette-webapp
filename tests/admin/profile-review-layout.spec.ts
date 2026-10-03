import { test, expect } from '@playwright/test';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

// Exercise the independent view before its transactional #236 integration.
// The fixtures use memory callbacks and a fake loopback Supabase configuration;
// passing here does not establish real moderation, RLS or notification delivery.
test.use({ baseURL: 'http://127.0.0.1:3101' });
let preview: ChildProcess;
let closed: Promise<void>;
let output = '';
test.beforeAll(async () => {
  test.setTimeout(120_000);
  const root = process.cwd();
  preview = spawn(process.execPath, [join(root, 'scripts/preview-profile-review.mjs')], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
  for (const stream of [preview.stdout, preview.stderr]) stream?.on('data', chunk => { output = `${output}${String(chunk)}`.slice(-6000); });
  closed = new Promise(resolve => preview.once('close', () => resolve()));
  const deadline = Date.now() + 110_000;
  while (Date.now() < deadline) {
    if (preview.exitCode !== null) throw new Error(`Layout preview failed: ${output}`);
    try {
      const response = await fetch('http://127.0.0.1:3101/admin/profile-review-layout', { signal: AbortSignal.timeout(1500) });
      if (response.ok && output.includes('Ready in') && preview.exitCode === null) return;
    } catch { /* Wait only for this owned development server. */ }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw new Error(`Layout preview did not become ready: ${output}`);
});
test.afterAll(async () => {
  if (!preview) return;
  preview.kill('SIGTERM');
  await closed;
});

const screenshotDirectory = process.env.E2E_SCREENSHOTS_DIR;
async function inspect(page: import('@playwright/test').Page, name: string) {
  if (!screenshotDirectory) return;
  await mkdir(screenshotDirectory, { recursive: true });
  await page.screenshot({ path: join(screenshotDirectory, `${name}.png`), fullPage: true });
}

test('approval and one multi-field request advance only after confirmation and finish the actionable queue', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/admin/profile-review-layout');
  const review = page.getByTestId('admin-profile-review');
  await expect(review.getByText('Camille', { exact: true })).toBeVisible();
  await review.getByRole('button', { name: 'Enlarge profile picture' }).click();
  await expect(page.getByRole('dialog', { name: 'Submitted profile picture' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(review.getByRole('button', { name: 'Enlarge profile picture' })).toBeFocused();
  await inspect(page, 'approval-desktop');
  await review.getByRole('button', { name: 'Request changes', exact: true }).click();
  await expect(review.getByRole('button', { name: 'Request changes & next' })).toBeDisabled();
  await review.getByRole('checkbox', { name: 'Bio', exact: true }).check();
  await review.getByRole('checkbox', { name: 'Profile picture', exact: true }).check();
  await review.getByRole('combobox', { name: 'Bio reason' }).selectOption('harassment');
  await review.getByRole('combobox', { name: 'Profile picture reason' }).selectOption('multiple_people');
  await expect(review.getByText('Please update your bio and profile picture so we can approve your profile.')).toBeVisible();
  await inspect(page, 'correction-desktop');
  await review.getByRole('button', { name: 'Request changes & next' }).click();
  await expect(review.getByText('Jules', { exact: true })).toBeVisible();
  await expect(review.getByRole('button', { name: 'Awaiting changes 2 profiles' })).toBeVisible();
  await expect(review.getByRole('heading', { name: 'Profile review', exact: true })).toBeFocused();
  await expect(page.locator('#last-command')).toContainText('"reason":"harassment"');
  await expect(page.locator('#last-command')).toContainText('"reason":"multiple_people"');
  await review.getByRole('button', { name: 'Approve & next' }).click();
  await expect(review.getByText('You’re all caught up')).toBeVisible();
  await review.getByRole('button', { name: 'Awaiting changes 2 profiles' }).click();
  await expect(review.getByText('Camille', { exact: true })).toBeVisible();
  await expect(review.getByRole('button', { name: 'Approve & next' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Active queue', exact: true })).toBeVisible();
});

test('stale and uncertain decisions require rereview; venue switching and resubmissions preserve context', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto('/admin/profile-review-layout');
  const review = page.getByTestId('admin-profile-review');
  await page.getByText('Local fixture controls', { exact: true }).click();
  await page.getByRole('button', { name: 'Return stale decision' }).click();
  await review.getByRole('button', { name: 'Approve & next' }).click();
  await expect(review.getByRole('alert')).toContainText('This profile changed');
  await expect(review.getByRole('button', { name: 'Approve & next' })).toBeDisabled();
  await review.getByRole('button', { name: 'Reload profile' }).click();
  await expect(review.getByRole('button', { name: 'Approve & next' })).toBeEnabled();
  await page.getByRole('button', { name: 'Resubmit Nora' }).click();
  await expect(review.getByText('Nora', { exact: true })).toBeVisible();
  await expect(review.getByText('Original text', { exact: true })).toBeVisible();
  await expect(review.getByText('Updated', { exact: true })).toHaveCount(2);
  await inspect(page, 'resubmission-mobile');
  await page.getByRole('button', { name: 'Return uncertain decision' }).click();
  await review.getByRole('button', { name: 'Request changes', exact: true }).click();
  await review.getByRole('checkbox', { name: 'Bio', exact: true }).check();
  await review.getByRole('button', { name: 'Request changes & next' }).click();
  await expect(review.getByRole('alert')).toContainText('Could not confirm');
  await expect(review.getByRole('checkbox', { name: 'Bio', exact: true })).toBeChecked();
  await expect(review.getByRole('button', { name: 'Request changes & next' })).toBeDisabled();
  await review.getByRole('combobox', { name: 'Venue' }).selectOption('empty');
  await expect(review.getByText('Nora', { exact: true })).toHaveCount(0);
  await expect(review.getByText('You’re all caught up')).toBeVisible();
  await expect(review.getByRole('button', { name: 'All profiles 0 profiles' })).toBeVisible();
  await expect(page.locator('body')).toHaveJSProperty('scrollWidth', 320);
});

test('consolidated owner prompt retains required edits and needs all fields plus server readiness', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto('/profile/review-layout');
  const prompt = page.getByTestId('profile-correction-prompt');
  await prompt.getByRole('button', { name: 'Got it', exact: true }).click();
  await expect(prompt.getByText('We need a few changes to your profile.')).toHaveCount(0);
  await prompt.getByRole('button', { name: 'Edit name' }).click();
  await expect(prompt.getByRole('button', { name: 'Submit for review' })).toBeDisabled();
  await prompt.getByRole('button', { name: 'Edit bio' }).click();
  await prompt.getByRole('button', { name: 'Change picture' }).click();
  await expect(prompt.getByRole('button', { name: 'Submit for review' })).toBeEnabled();
  await inspect(page, 'owner-en-mobile');
  await page.getByText('Local fixture controls', { exact: true }).click();
  for (const [locale, button, submit] of [['fr', 'French', 'Envoyer pour vérification'], ['es', 'Spanish', 'Enviar para revisión']]) {
    await page.getByRole('button', { name: button, exact: true }).click();
    await expect(prompt.getByRole('button', { name: submit, exact: true })).toBeEnabled();
    await expect(page.locator('body')).toHaveJSProperty('scrollWidth', 320);
    await inspect(page, `owner-${locale}-mobile`);
  }
  await page.getByRole('button', { name: 'Server not ready' }).click();
  await expect(prompt.getByRole('button', { name: 'Enviar para revisión', exact: true })).toBeDisabled();
  await page.reload();
  await prompt.getByRole('button', { name: 'Edit name' }).click();
  await prompt.getByRole('button', { name: 'Edit bio' }).click();
  await prompt.getByRole('button', { name: 'Change picture' }).click();
  await prompt.getByRole('button', { name: 'Submit for review' }).click();
  await expect(prompt.getByRole('heading', { name: 'Your changes are waiting for review' })).toBeVisible();
  await expect(prompt.getByRole('button', { name: 'Submit for review' })).toHaveCount(0);
});
