import sharp from 'sharp';
import { test, expect, type Page } from '@playwright/test';
import { mockPhotoOnboarding } from '../helpers/photo-onboarding-ui';

// Local browser behavior only: the backend is stubbed, no shared users (#512).
const userId = '00000000-0000-4000-8000-000000000181';

async function startOnPhotoStep(page: Page) {
  await mockPhotoOnboarding(page.context());
  await page.goto('/profile');
  await page.getByPlaceholder('First name', { exact: true }).fill('Draft');
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
}

const photoPreview = (page: Page) => page.getByTestId('photo-picker').locator('img');
const previewLoaded = (page: Page) => photoPreview(page).evaluate(image => image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0);

test('a photo draft saved in the older Blob shape is still restored after a reload', async ({ page }) => {
  await startOnPhotoStep(page);
  const png = await sharp({ create: { width: 600, height: 800, channels: 3, background: '#b75e70' } }).png().toBuffer();
  // Drafts saved before #512 hold the photo as a Blob under `blob`.
  const written = await page.evaluate(async ({ userId, bytes }) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('amourette-onboarding', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('photo-drafts', { keyPath: 'userId' });
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
    const result = await new Promise<string>(resolve => {
      const transaction = db.transaction('photo-drafts', 'readwrite');
      transaction.objectStore('photo-drafts').put({
        userId, blob: new Blob([new Uint8Array(bytes)], { type: 'image/png' }),
        name: 'legacy.png', type: 'image/png', lastModified: 1, savedAt: Date.now(),
      });
      transaction.oncomplete = () => resolve('ok');
      transaction.onabort = () => resolve(transaction.error?.message ?? 'aborted');
    });
    db.close();
    return result;
  }, { userId, bytes: [...png] });
  // An ephemeral WebKit session (Safari Private Browsing) cannot hold a Blob, so
  // no older draft can exist there; the shape is only reachable elsewhere.
  test.skip(written !== 'ok', `this engine refuses a Blob in IndexedDB here: ${written}`);
  await page.reload();
  await expect.poll(() => previewLoaded(page)).toBe(true);
  await expect(page.getByRole('button', { name: 'Edit', exact: true })).toBeVisible();
});

test('a refused photo draft write is logged and the selected photo stays usable', async ({ page }) => {
  // Abort the real draft transaction at the real write, as a browser does when
  // it refuses the stored value or runs out of quota.
  await page.addInitScript(() => {
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...args: Parameters<typeof put>) {
      const request = put.apply(this, args);
      this.transaction.abort();
      return request;
    };
  });
  const warnings: string[] = [];
  page.on('console', message => { if (message.type() === 'warning') warnings.push(message.text()); });
  await startOnPhotoStep(page);
  const buffer = await sharp('public/test-profiles/portrait-1.svg').png().toBuffer();
  await page.locator('input[type=file]').setInputFiles({ name: 'portrait.png', mimeType: 'image/png', buffer });
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Next', exact: true }).click();
  await dialog.getByRole('button', { name: 'Confirm', exact: true }).click();
  await expect.poll(() => warnings).toContain('Could not save the onboarding photo draft: the browser refused the write');
  // The guest keeps going with the photo already chosen in this page.
  await page.getByRole('button', { name: '← Back', exact: true }).click();
  await expect.poll(() => previewLoaded(page)).toBe(true);
  await expect(page.getByRole('button', { name: 'Continue', exact: true })).toBeEnabled();
});
