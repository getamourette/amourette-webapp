import { readFileSync } from 'node:fs';
import sharp from 'sharp';
import { test, expect, type Page } from '@playwright/test';
import { mockPhotoOnboarding } from '../helpers/photo-onboarding-ui';

// #278: a HEIC photo converted at selection is not sent or converted again at
// the save. The backend is stubbed, no shared users; the real route is covered
// by tests/validation/photo-staging.spec.ts.
const userId = '00000000-0000-4000-8000-000000000181';
const venue = 'reuse-test';

async function onboardWithHeic(page: Page) {
  await mockPhotoOnboarding(page.context());
  await page.route('**/rest/v1/rpc/venue_by_slug*', route => route.fulfill({ json: [{ id: '00000000-0000-4000-8000-000000000278', name: 'Reuse bar', slug: venue, city: 'Paris' }] }));
  const png = await sharp({ create: { width: 128, height: 96, channels: 3, background: '#678abc' } }).png().toBuffer();
  await page.route('**/storage/v1/object/upload/sign/profile-photo-staging/**', route => route.fulfill({ json: { Key: 'staged' } }));
  await page.route('**/api/profile-photo/prepare', route => route.request().postDataJSON().ticket
    ? route.fulfill({ contentType: 'image/png', headers: { 'X-Photo-Width': '128', 'X-Photo-Height': '96', 'X-Photo-Source-Ticket': 'converted-source' }, body: png })
    : route.fulfill({ json: { path: `${userId}/selected.heic`, token: 'test-token', ticket: 'preview-ticket' } }));
  const uploads: unknown[] = [];
  await page.route('**/api/profile-photo/upload', route => {
    uploads.push(route.request().postDataJSON());
    return route.fulfill({ json: { path: `${userId}/save.heic`, token: 'test-token', ticket: 'save-ticket' } });
  });
  await page.goto(`/profile?venue=${venue}`);
  await page.getByPlaceholder('First name', { exact: true }).fill('Reuse');
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.locator('input[type=file]').setInputFiles({ name: 'photo.heic', mimeType: 'image/heic', buffer: readFileSync('tests/fixtures/heic/p3-10.heic') });
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Next', exact: true }).click();
  await dialog.getByRole('button', { name: 'Confirm', exact: true }).click();
  await page.getByRole('group', { name: 'I am', exact: true }).getByRole('button', { name: 'Woman', exact: true }).click();
  await page.getByRole('group', { name: 'I’d like to meet', exact: true }).getByRole('button', { name: 'Man', exact: true }).click();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByRole('button', { name: 'Skip', exact: true }).click();
  const confirmation = page.getByTestId('onboarding-confirmation');
  for (const checkbox of await confirmation.getByRole('checkbox').all()) await checkbox.check();
  return { join: confirmation.getByRole('button', { name: 'Join tonight', exact: true }), uploads };
}

test('a HEIC save sends the stored conversion reference, not the photo again', async ({ page }) => {
  const saves: Record<string, unknown>[] = [];
  await page.route('**/api/profile-photo', route => {
    saves.push(route.request().postDataJSON());
    return route.fulfill({ json: { id: '00000000-0000-4000-8000-000000000999' } });
  });
  const { join, uploads } = await onboardWithHeic(page);
  await join.click();
  await expect(page).toHaveURL(new RegExp(`/v/${venue}$`));
  expect(uploads).toEqual([]);
  expect(saves).toHaveLength(1);
  expect(saves[0]).toMatchObject({ source: 'converted-source', revision: 0, profile: { first_name: 'Reuse' } });
  expect(saves[0].crop).toBeTruthy();
  expect(saves[0]).not.toHaveProperty('ticket');
});

test('a missing stored conversion falls back to sending the original once', async ({ page }) => {
  const saves: Record<string, unknown>[] = [];
  await page.route('**/api/profile-photo', route => {
    saves.push(route.request().postDataJSON());
    return saves.length === 1
      ? route.fulfill({ status: 400, json: { error: 'source_missing' } })
      : route.fulfill({ json: { id: '00000000-0000-4000-8000-000000000999' } });
  });
  const { join, uploads } = await onboardWithHeic(page);
  await join.click();
  await expect(page).toHaveURL(new RegExp(`/v/${venue}$`));
  expect(saves.map(save => Object.keys(save)[0])).toEqual(['source', 'ticket']);
  expect(uploads).toHaveLength(1);
  expect(uploads[0]).toMatchObject({ type: 'image/heic', revision: 0 });
});
