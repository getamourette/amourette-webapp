import { readFileSync } from 'node:fs';
import sharp from 'sharp';
import { test, expect, type Page } from '@playwright/test';
import { mockPhotoOnboarding } from '../helpers/photo-onboarding-ui';
import { t } from '../../lib/strings';

// Door onboarding failures (#485). The backend is stubbed, no shared users.
const userId = '00000000-0000-4000-8000-000000000181';
const venue = 'door-test';
const s = t.en.profile;

async function stubBackend(page: Page, profile: () => boolean) {
  await mockPhotoOnboarding(page.context());
  await page.route('**/rest/v1/rpc/venue_by_slug*', route => route.fulfill({ json: [{ id: '00000000-0000-4000-8000-000000000485', name: 'Door bar', slug: venue, city: 'Paris' }] }));
  await page.route('**/rest/v1/profiles?*', route => route.fulfill({ json: profile() ? [{ id: userId }] : [] }));
  let permissions = 0;
  await page.route('**/api/profile-photo/upload', route => {
    permissions++;
    return route.fulfill({ json: { path: `${userId}/door.png`, token: 'test-token', ticket: 'door-ticket' } });
  });
  await page.route('**/storage/v1/object/upload/sign/profile-photo-staging/**', route => route.fulfill({ json: { Key: 'staged' } }));
  return { permissions: () => permissions };
}

async function reachConfirmation(page: Page) {
  await page.goto(`/profile?venue=${venue}`);
  await page.getByPlaceholder('First name', { exact: true }).fill('Door');
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.locator('input[type=file]').setInputFiles({
    name: 'portrait.png', mimeType: 'image/png', buffer: await sharp('public/test-profiles/portrait-1.svg').png().toBuffer(),
  });
  await page.getByRole('dialog').getByRole('button', { name: 'Next', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Confirm', exact: true }).click();
  await page.getByRole('group', { name: 'I am', exact: true }).getByRole('button', { name: 'Woman', exact: true }).click();
  await page.getByRole('group', { name: 'I’d like to meet', exact: true }).getByRole('button', { name: 'Man', exact: true }).click();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByRole('button', { name: 'Skip', exact: true }).click();
  const confirmation = page.getByTestId('onboarding-confirmation');
  for (const checkbox of await confirmation.getByRole('checkbox').all()) await checkbox.check();
  return confirmation.getByRole('button', { name: s.save, exact: true });
}

test('a busy photo converter is retried with a status, without uploading the photo again', async ({ page }) => {
  const backend = await stubBackend(page, () => false);
  const saves: unknown[] = [];
  await page.route('**/api/profile-photo', route => {
    saves.push(route.request().postDataJSON());
    return saves.length === 1
      ? route.fulfill({ status: 503, json: { error: 'converter_busy' } })
      : route.fulfill({ json: { id: '00000000-0000-4000-8000-000000000999' } });
  });
  const join = await reachConfirmation(page);
  await join.click();
  await expect(page.getByText(s.photoBusyRetrying, { exact: true })).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`/v/${venue}$`));
  expect(saves).toEqual([{ ticket: 'door-ticket' }, { ticket: 'door-ticket' }]);
  expect(backend.permissions()).toBe(1);
});

test('a converter still busy after every retry says so and leaves Join usable', async ({ page }) => {
  await stubBackend(page, () => false);
  let saves = 0;
  await page.route('**/api/profile-photo', route => { saves++; return route.fulfill({ status: 503, json: { error: 'converter_busy' } }); });
  const join = await reachConfirmation(page);
  await join.click();
  // Three pauses of 2, 4 and 8 seconds, then the final answer.
  await expect(page.getByText(s.photoBusy, { exact: true })).toBeVisible({ timeout: 20_000 });
  expect(saves).toBe(4);
  await expect(join).toBeEnabled();
  await expect(page).toHaveURL(/\/profile/);
});

test('a save whose answer was lost after the profile was created lands the guest in the room', async ({ page }) => {
  let created = false;
  await stubBackend(page, () => created);
  let saves = 0;
  await page.route('**/api/profile-photo', route => {
    saves++;
    // The server commits, then the phone loses the answer.
    if (saves === 1) { created = true; return route.abort('connectionreset'); }
    return route.fulfill({ status: 409, json: {} });
  });
  const join = await reachConfirmation(page);
  await join.click();
  await expect(page.getByText(s.photoUploadFailed, { exact: true })).toBeVisible();
  await join.click();
  await expect(page).toHaveURL(new RegExp(`/v/${venue}$`));
  expect(saves).toBe(2);
});

test('a refused save with no profile behind it keeps the error and the guest on the form', async ({ page }) => {
  await stubBackend(page, () => false);
  await page.route('**/api/profile-photo', route => route.fulfill({ status: 409, json: {} }));
  const join = await reachConfirmation(page);
  await join.click();
  await expect(page.getByText(s.photoUploadFailed, { exact: true })).toBeVisible();
  await expect(join).toBeEnabled();
  await expect(page).toHaveURL(/\/profile/);
});

test('Join tonight stays reachable after an upload error on a small screen', async ({ page }) => {
  await stubBackend(page, () => false);
  await page.route('**/api/profile-photo', route => route.fulfill({ status: 400, json: { error: 'invalid_photo' } }));
  const join = await reachConfirmation(page);
  await page.setViewportSize({ width: 320, height: 460 });
  await join.click();
  await expect(page.getByText(s.photoUploadFailed, { exact: true })).toBeVisible();
  await join.scrollIntoViewIfNeeded();
  const box = (await join.boundingBox())!;
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.y + box.height).toBeLessThanOrEqual(460);
  // Nothing clips or covers it: a tap at its centre reaches the button.
  expect(await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.closest('button')?.textContent, { x: box.x + box.width / 2, y: box.y + box.height / 2 })).toBe(s.save);
});

// Chromium does not decode HEIC. Model a native decoder with a same-size PNG, as
// heic-native-preview.spec.ts does, keeping the genuine HEIC file and flow.
for (const outcome of ['accepted', 'refused'] as const) {
  test(`a restored HEIC draft shows the wizard before the server conversion ends (${outcome})`, async ({ page }) => {
    await stubBackend(page, () => false);
    const png = await sharp({ create: { width: 128, height: 96, channels: 3, background: '#678abc' } }).png().toBuffer();
    await page.addInitScript(bytes => {
      const create = URL.createObjectURL.bind(URL);
      URL.createObjectURL = blob => create(blob instanceof Blob && blob.type === 'image/heic' ? new Blob([new Uint8Array(bytes)], { type: 'image/png' }) : blob);
    }, [...png]);
    let release!: () => void;
    const held = new Promise<void>(resolve => { release = resolve; });
    let conversions = 0;
    await page.route('**/api/profile-photo/prepare', async route => {
      if (!route.request().postDataJSON().ticket) return route.fulfill({ json: { path: `${userId}/draft.heic`, token: 'test-token', ticket: 'test-ticket' } });
      conversions++;
      await held;
      if (outcome === 'refused') return route.fulfill({ status: 400, json: { error: 'unsupported_heic' } }).catch(() => undefined);
      await route.fulfill({ contentType: 'image/png', headers: { 'X-Photo-Width': '128', 'X-Photo-Height': '96' }, body: png }).catch(() => undefined);
    });
    try {
      await page.goto(`/profile?venue=${venue}`);
      await expect(page.getByPlaceholder('First name', { exact: true })).toBeVisible();
      // Seed the drafts an unloaded tab leaves behind, then come back.
      await page.evaluate(async ({ userId, bytes }) => {
        localStorage.setItem(`amourette-onboarding-draft:${userId}`, JSON.stringify({ firstName: 'Door', bio: '', adultConfirmed: false, step: 2 }));
        const db = await new Promise<IDBDatabase>((resolve, reject) => {
          const request = indexedDB.open('amourette-onboarding', 1);
          request.onupgradeneeded = () => request.result.createObjectStore('photo-drafts', { keyPath: 'userId' });
          request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
        });
        await new Promise<void>((resolve, reject) => {
          const transaction = db.transaction('photo-drafts', 'readwrite');
          transaction.objectStore('photo-drafts').put({ userId, bytes: new Uint8Array(bytes).buffer, name: 'draft.heic', type: 'image/heic', lastModified: 1, savedAt: Date.now() });
          transaction.oncomplete = () => resolve(); transaction.onerror = () => reject(transaction.error);
        });
        db.close();
      }, { userId, bytes: [...readFileSync('tests/fixtures/heic/p3-10.heic')] });
      await page.reload();
      // The conversion is still held: the wizard must not wait for it.
      await expect(page.getByRole('group', { name: 'I am', exact: true })).toBeVisible({ timeout: 5_000 });
      expect(conversions).toBeLessThanOrEqual(1);
      release();
      if (outcome === 'refused') {
        await expect(page.getByRole('heading', { name: 'Help people recognize you' })).toBeVisible();
        await expect(page.getByText(s.photoHeicUnsupported, { exact: true })).toBeVisible();
        await expect(page.getByTestId('photo-picker').locator('img')).toHaveCount(0);
      } else {
        await expect.poll(() => page.evaluate(() => performance.getEntriesByName('photo.prepare.native-validation').length)).toBe(1);
        // The converted PNG body is never downloaded when the native preview matches.
        expect(await page.evaluate(() => performance.getEntriesByName('photo.prepare.download').length)).toBe(0);
        await page.getByRole('button', { name: '← Back', exact: true }).click();
        await expect(page.getByTestId('photo-picker').locator('img')).toBeVisible();
      }
    } finally { release(); }
  });
}
