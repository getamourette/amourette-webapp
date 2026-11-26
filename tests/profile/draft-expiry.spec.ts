import sharp from 'sharp';
import { test, expect, type Page } from '@playwright/test';
import { mockPhotoOnboarding } from '../helpers/photo-onboarding-ui';

// #286: an unfinished onboarding draft (text in localStorage, photo in
// IndexedDB) lives 24 hours after its last deliberate edit. Browser time is
// fixed with the Playwright clock; the backend is stubbed, no shared users.
const userId = '00000000-0000-4000-8000-000000000181';
const otherId = '00000000-0000-4000-8000-000000000182';
const draftKey = (id: string) => `amourette-onboarding-draft:${id}`;
const HOUR = 60 * 60 * 1000;
const T0 = new Date('2026-11-26T20:00:00+01:00').getTime();

const firstName = (page: Page) => page.getByPlaceholder('First name', { exact: true });
const genderStep = (page: Page) => page.getByRole('group', { name: 'I am', exact: true });

async function storedText(page: Page, id = userId) {
  return page.evaluate(key => {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) as Record<string, unknown> : null;
  }, draftKey(id));
}

async function storedPhotoSavedAt(page: Page, id = userId) {
  return page.evaluate(async id => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('amourette-onboarding', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('photo-drafts', { keyPath: 'userId' });
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
    const value = await new Promise<{ savedAt?: number } | undefined>(resolve => {
      const request = db.transaction('photo-drafts', 'readonly').objectStore('photo-drafts').get(id);
      request.onsuccess = () => resolve(request.result); request.onerror = () => resolve(undefined);
    });
    db.close();
    return value?.savedAt ?? null;
  }, id);
}

async function seedPhoto(page: Page, id: string, savedAt: number) {
  const png = await sharp('public/test-profiles/portrait-1.svg').png().toBuffer();
  await page.evaluate(async ({ id, bytes, savedAt }) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('amourette-onboarding', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('photo-drafts', { keyPath: 'userId' });
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction('photo-drafts', 'readwrite');
      transaction.objectStore('photo-drafts').put({ userId: id, bytes: new Uint8Array(bytes).buffer, name: 'portrait.png', type: 'image/png', lastModified: 1, savedAt });
      transaction.oncomplete = () => resolve(); transaction.onerror = () => reject(transaction.error);
    });
    db.close();
  }, { id, bytes: [...png], savedAt });
}

async function choosePhoto(page: Page) {
  const buffer = await sharp('public/test-profiles/portrait-1.svg').png().toBuffer();
  await page.locator('input[type=file]').setInputFiles({ name: 'portrait.png', mimeType: 'image/png', buffer });
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Next', exact: true }).click();
  await dialog.getByRole('button', { name: 'Confirm', exact: true }).click();
  await expect(genderStep(page)).toBeVisible();
}

async function expectExpired(page: Page) {
  await expect(firstName(page)).toBeVisible();
  await expect(firstName(page)).toHaveValue('');
  await expect.poll(() => storedText(page)).toBeNull();
  await expect.poll(() => storedPhotoSavedAt(page)).toBeNull();
}

test.beforeEach(async ({ context }) => {
  await mockPhotoOnboarding(context);
});

test('a draft resumes for 24 hours after its last edit; reloads do not extend it, then text and photo expire together', async ({ page }) => {
  await page.clock.setFixedTime(T0);
  await page.goto('/profile');
  await firstName(page).fill('Draft');
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await choosePhoto(page);
  expect((await storedText(page))?.editedAt).toBe(T0);
  expect(await storedPhotoSavedAt(page)).toBe(T0);

  // Passive reloads inside the window restore the draft and keep its deadline.
  // The gender step is reachable only with a restored first name and photo.
  for (const at of [T0 + 1 * HOUR, T0 + 23 * HOUR, T0 + 24 * HOUR - 1]) {
    await page.clock.setFixedTime(at);
    await page.reload();
    await expect(genderStep(page)).toBeVisible();
    expect(await storedText(page)).toMatchObject({ firstName: 'Draft', editedAt: T0 });
    expect(await storedPhotoSavedAt(page)).toBe(T0);
  }

  // Exactly 24 hours after the last edit: nothing is shown, both stores are cleared,
  // and the guest's session survives the cleanup.
  await page.clock.setFixedTime(T0 + 24 * HOUR);
  await page.reload();
  await expectExpired(page);
  expect(await page.evaluate(() => Object.keys(localStorage).some(key => key.endsWith('-auth-token')))).toBe(true);
});

test('a deliberate edit renews the whole draft, photo included', async ({ page }) => {
  await page.clock.setFixedTime(T0);
  await page.goto('/profile');
  await firstName(page).fill('Draft');
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await choosePhoto(page);

  // 20 hours later the guest comes back and changes the first name.
  await page.clock.setFixedTime(T0 + 20 * HOUR);
  await page.reload();
  await expect(genderStep(page)).toBeVisible();
  await page.getByRole('button', { name: '← Back', exact: true }).click();
  await page.getByRole('button', { name: '← Back', exact: true }).click();
  await firstName(page).fill('Drafted');
  await expect.poll(async () => (await storedText(page))?.editedAt).toBe(T0 + 20 * HOUR);

  // The photo saved at T0 is now 30 hours old, but the draft was edited 10 hours ago.
  await page.clock.setFixedTime(T0 + 30 * HOUR);
  await page.reload();
  await expect(firstName(page)).toHaveValue('Drafted');
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Continue', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(genderStep(page)).toBeVisible();
  expect(await storedPhotoSavedAt(page)).toBe(T0);
  expect(await storedText(page)).toMatchObject({ firstName: 'Drafted', editedAt: T0 + 20 * HOUR });

  await page.clock.setFixedTime(T0 + 44 * HOUR);
  await page.reload();
  await expectExpired(page);
});

test('a legacy draft without an edit time, or with a future one, is never restored', async ({ page }) => {
  await page.clock.setFixedTime(T0);
  await page.goto('/profile');
  await expect(firstName(page)).toBeVisible();
  for (const editedAt of [undefined, 'yesterday', T0 + HOUR]) {
    await page.evaluate(({ key, editedAt }) => {
      localStorage.setItem(key, JSON.stringify({ firstName: 'Legacy', bio: '', adultConfirmed: false, step: 1, editedAt }));
    }, { key: draftKey(userId), editedAt });
    await page.reload();
    await expect(firstName(page)).toHaveValue('');
    await expect.poll(() => storedText(page)).toBeNull();
  }
  // A photo whose own record is older than 24 hours and has no live text is not restored either.
  await seedPhoto(page, userId, T0 - 25 * HOUR);
  await page.reload();
  await expectExpired(page);
});

test('opening any page clears expired drafts on the device and keeps live ones', async ({ page }) => {
  await page.clock.setFixedTime(T0);
  await page.goto('/profile');
  await expect(firstName(page)).toBeVisible();
  await page.evaluate(({ expired, live, T0, HOUR }) => {
    localStorage.setItem(expired, JSON.stringify({ firstName: 'Old', bio: '', adultConfirmed: false, step: 1, editedAt: T0 - 25 * HOUR }));
    localStorage.setItem(live, JSON.stringify({ firstName: 'Fresh', bio: '', adultConfirmed: false, step: 1, editedAt: T0 - 2 * HOUR }));
    localStorage.setItem('unrelated', 'keep');
  }, { expired: draftKey(otherId), live: draftKey(userId), T0, HOUR });
  await seedPhoto(page, otherId, T0 - 25 * HOUR);
  await seedPhoto(page, userId, T0 - 30 * HOUR); // kept: its text was edited 2 hours ago

  // Reopening the app on the home page, never on the onboarding resume path.
  await page.goto('/');
  await expect.poll(() => storedText(page, otherId)).toBeNull();
  await expect.poll(() => storedPhotoSavedAt(page, otherId)).toBeNull();
  expect(await storedText(page, userId)).toMatchObject({ firstName: 'Fresh', editedAt: T0 - 2 * HOUR });
  expect(await storedPhotoSavedAt(page, userId)).toBe(T0 - 30 * HOUR);
  expect(await page.evaluate(() => localStorage.getItem('unrelated'))).toBe('keep');
  expect(await page.evaluate(() => Object.keys(localStorage).some(key => key.endsWith('-auth-token')))).toBe(true);
});
