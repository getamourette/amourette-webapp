import sharp from 'sharp';
import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { mockNameUi, nameUiState, nameIds } from '../helpers/name-ui-fixture';

// Controlled HTTP/session faults, without shared users, uploads or venue writes.
async function editor(context: BrowserContext, page: Page) {
  await mockNameUi(context, nameUiState());
  const state = { profile_id: nameIds.alice, displayed_id: '00000000-0000-4000-8000-000000000181',
    pending_id: null as string | null, revision: 1, correction_required: false,
    reason: null, last_action: null, updated_at: new Date().toISOString() };
  const source = await sharp('public/test-profiles/portrait-1.svg').jpeg().toBuffer();
  const requests: URL[] = [];
  let release: (() => void) | undefined;
  let hold: Promise<void> | undefined;
  let fail = false;
  await page.route('**/rest/v1/photo_state?*', route => route.fulfill({ json: state }));
  await page.route('**/rest/v1/photo_versions?*', route => route.fulfill({ json: [{
    id: state.pending_id ?? state.displayed_id, profile_id: nameIds.alice,
    path: `${nameIds.alice}/${state.displayed_id}.jpg`, status: 'approved', created_at: state.updated_at,
  }] }));
  await page.route('**/api/profile-photo/source?*', async route => {
    requests.push(new URL(route.request().url()));
    const rejected = fail;
    if (hold) await hold;
    await route.fulfill(rejected ? { status: 503, json: {} } : {
      body: source, contentType: 'image/jpeg', headers: { 'X-Photo-Legacy': 'false' },
    });
  });
  await page.goto('/profile?edit=1');
  const recrop = page.getByRole('button', { name: 'Recrop', exact: true });
  await expect(recrop).toBeVisible();
  const dialog = page.getByRole('dialog', { name: 'Crop your photo', exact: true });
  const confirm = dialog.getByRole('button', { name: 'Confirm crop', exact: true });
  return { state, requests, recrop, dialog, confirm,
    pause() { hold = new Promise<void>(resolve => { release = resolve; }); },
    resume() { hold = undefined; release?.(); },
    fail(value: boolean) { fail = value; },
    async refresh() {
      await Promise.all([
        page.waitForResponse(response => response.url().includes('/photo_versions?')),
        page.evaluate(() => window.dispatchEvent(new Event('amourette-photo-refresh'))),
      ]);
      await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    },
    async cancel() { await dialog.getByRole('button', { name: 'Cancel', exact: true }).click(); await expect(dialog).toHaveCount(0); },
  };
}

test('Recrop opens while downloading; cancelled edits reuse the original without dirtying the profile', async ({ context, page }) => {
  const ui = await editor(context, page);
  expect(ui.requests).toHaveLength(0); // Editing text does not prefetch the original.
  await page.setViewportSize({ width: 320, height: 740 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  ui.pause();
  try {
    await ui.recrop.click();
    await expect(ui.dialog.getByRole('status')).toHaveText('Working…');
    await expect(ui.confirm).toBeDisabled();
    await expect(ui.dialog.getByRole('button', { name: 'Cancel', exact: true })).toBeFocused();
    await expect(ui.dialog).toHaveJSProperty('scrollWidth', 320);
    await page.screenshot({ path: test.info().outputPath('loading-320.png') });
  } finally { ui.resume(); }
  await expect(ui.confirm).toBeEnabled();
  await page.screenshot({ path: test.info().outputPath('ready-320.png') });
  await ui.dialog.getByRole('slider').fill('1.5');
  await ui.cancel();
  await expect(ui.recrop).toBeFocused();
  await expect(page.getByRole('button', { name: 'Send this photo', exact: true })).toHaveCount(0);
  await ui.recrop.click();
  await expect(ui.confirm).toBeEnabled();
  await expect(ui.dialog.getByRole('slider')).toHaveValue('1');
  expect(ui.requests).toHaveLength(1);
  const replacement = await sharp({ create: { width: 600, height: 900, channels: 3, background: '#874456' } }).png().toBuffer();
  await ui.dialog.locator('input[type=file]').setInputFiles({ name: 'replacement.png', mimeType: 'image/png', buffer: replacement });
  await expect(ui.confirm).toBeEnabled();
  await ui.cancel();
  await ui.recrop.click(); await expect(ui.confirm).toBeEnabled();
  expect(ui.requests).toHaveLength(2); // Choosing another image discards the retained source.
  await ui.cancel();
  await page.reload();
  await ui.recrop.click();
  await expect(ui.confirm).toBeEnabled();
  expect(ui.requests).toHaveLength(3); // Memory is scoped to the mounted page.
});

test('cancelled downloads cannot reopen the editor or end a newer loading state; failures retry', async ({ context, page }) => {
  const ui = await editor(context, page);
  ui.pause();
  try {
    await ui.recrop.click();
    await expect.poll(() => ui.requests.length).toBe(1);
    await page.keyboard.press('Escape');
    await expect(ui.dialog).toHaveCount(0);
    await expect(ui.recrop).toBeFocused();
    ui.fail(true);
    await ui.recrop.click();
    await expect.poll(() => ui.requests.length).toBe(2);
    await expect(ui.dialog.getByRole('status')).toBeVisible();
  } finally { ui.resume(); }
  await expect(ui.dialog).toHaveCount(0);
  await expect(page.getByRole('alert').filter({ hasText: "Couldn't load your original photo" })).toBeVisible();
  await page.screenshot({ path: test.info().outputPath('source-error.png') });
  ui.fail(false);
  await ui.recrop.click();
  await expect(ui.confirm).toBeEnabled();
  expect(ui.requests).toHaveLength(3);
});

test('photo revisions and versions invalidate cached and in-flight originals', async ({ context, page }) => {
  const ui = await editor(context, page);
  await ui.recrop.click(); await expect(ui.confirm).toBeEnabled(); await ui.cancel();
  ui.state.revision = 2;
  await ui.refresh();
  ui.pause();
  try {
    await ui.recrop.click();
    await expect.poll(() => ui.requests.length).toBe(2);
    expect(ui.requests[1].searchParams.get('revision')).toBe('2');
    ui.state.pending_id = '00000000-0000-4000-8000-000000000182';
    ui.state.revision = 3;
    await ui.refresh();
    await expect(ui.dialog).toHaveCount(0);
  } finally { ui.resume(); }
  await ui.recrop.click(); await expect(ui.confirm).toBeEnabled();
  expect(ui.requests).toHaveLength(3);
  expect(ui.requests[2].searchParams.get('version')).toBe(ui.state.pending_id);
  expect(ui.requests[2].searchParams.get('revision')).toBe('3');
});

test('session changes clear private memory and correction sources are always reauthorized', async ({ context, page }) => {
  const ui = await editor(context, page);
  ui.state.correction_required = true;
  ui.state.revision++;
  await ui.refresh();
  await expect(page.getByTestId('photo-status')).toBeVisible();
  for (let i = 0; i < 2; i++) {
    await ui.recrop.click(); await expect(ui.confirm).toBeEnabled(); await ui.cancel();
  }
  expect(ui.requests).toHaveLength(2);
  ui.state.correction_required = false;
  ui.state.revision++;
  await ui.refresh();
  await expect(page.getByTestId('photo-status')).toHaveCount(0);
  await ui.recrop.click(); await expect(ui.confirm).toBeEnabled();
  await page.evaluate(() => {
    const key = Object.keys(localStorage).find(key => /^sb-.*-auth-token$/.test(key))!;
    const session = JSON.parse(localStorage.getItem(key)!);
    session.user.id = '00000000-0000-4000-8000-000000000002';
    localStorage.setItem(key, JSON.stringify(session));
    const channel = new BroadcastChannel(key);
    channel.postMessage({ event: 'SIGNED_IN', session });
    channel.close();
  });
  await expect(ui.dialog).toHaveCount(0);
  await ui.recrop.click();
  await expect(page.getByRole('alert').filter({ hasText: "Couldn't load your original photo" })).toBeVisible();
  expect(ui.requests).toHaveLength(3); // Never request/reuse Alice's file as Bob.
});

test('localized loading keeps cancellation reachable at narrow mobile width', async ({ context, page }) => {
  const ui = await editor(context, page);
  await page.setViewportSize({ width: 320, height: 568 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const locale of ['fr', 'es']) {
    await page.evaluate(locale => {
      localStorage.setItem('amourette-locale', locale);
      window.dispatchEvent(new Event('amourette-locale-change'));
    }, locale);
    ui.pause();
    try {
      await page.getByRole('button', { name: locale === 'fr' ? 'Recadrer' : 'Reencuadrar', exact: true }).click();
      const dialog = page.getByRole('dialog');
      await expect(dialog.getByRole('status')).toBeVisible();
      const cancel = dialog.getByRole('button', { name: locale === 'fr' ? 'Annuler' : 'Cancelar', exact: true });
      await expect(cancel).toBeFocused();
      await expect(cancel).toBeInViewport();
      await expect(dialog).toHaveJSProperty('scrollWidth', 320);
      await page.screenshot({ path: test.info().outputPath(`loading-${locale}-320.png`) });
      await cancel.click();
      await expect(dialog).toHaveCount(0);
    } finally { ui.resume(); }
  }
});
