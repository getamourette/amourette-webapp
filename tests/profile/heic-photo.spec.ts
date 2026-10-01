import { readFileSync } from 'node:fs';
import sharp from 'sharp';
import { test, expect } from '../helpers/fixtures';
import { convertHeic } from '../../lib/server/heic-conversion';

// Controlled transport failures exercise the browser's selection lifecycle;
// photo-staging.spec.ts separately covers the real private HEIC transport.
for (const editing of [false, true]) {
  test(`HEIC ${editing ? 'replacement' : 'onboarding'} keeps crops after refusal and cancellation`, async ({ data, contextFor }) => {
    const original = await sharp({ create: { width: 128, height: 192, channels: 3, background: '#678abc' } }).jpeg().toBuffer();
    const owner = await data.identity('HeicCrop', editing ? 'woman' : undefined, undefined, editing ? original : undefined);
    const page = await (await contextFor(owner)).newPage();
    const source = readFileSync('tests/fixtures/heic/p3-10.heic');
    const normalized = Buffer.from(await (await convertHeic(new File([source], 'photo.heic', { type: 'image/heic' }))).arrayBuffer());
    let mode: 'success' | 'refuse' | 'wait' = 'success';
    let release: (() => void) | undefined;
    await page.route('**/storage/v1/object/upload/sign/profile-photo-staging/**', route => route.fulfill({ json: { Key: 'staged' } }));
    await page.route('**/api/profile-photo/prepare', async route => {
      const body = route.request().postDataJSON();
      if (!body.ticket) return route.fulfill({ json: { path: `${owner.id}/heic-test.heic`, token: 'test-token', ticket: 'test-ticket' } });
      if (mode === 'wait') await new Promise<void>(resolve => { release = resolve; });
      if (mode === 'refuse') return route.fulfill({ status: 400, json: { error: 'unsupported_heic' } });
      await route.fulfill({ contentType: 'image/png', body: normalized }).catch(() => undefined);
    });
    await page.goto(editing ? '/profile?edit=1' : '/profile');
    if (!editing) {
      await page.getByPlaceholder('First name', { exact: true }).fill(owner.name);
      await page.getByRole('button', { name: 'Continue', exact: true }).click();
    }
    await page.locator('input[type=file]').first().setInputFiles({ name: 'photo.heic', mimeType: 'image/heic', buffer: source });
    const cropper = page.locator('dialog:has(img[alt="Photo being cropped"])');
    await expect(cropper).toBeVisible();
    await expect(cropper.getByRole('button', { name: 'Confirm crop', exact: true })).toBeEnabled();
    const before = await cropper.locator('img[alt="Photo being cropped"]').getAttribute('src');
    mode = 'refuse';
    await cropper.locator('input[type=file]').setInputFiles({ name: 'hdr.heic', mimeType: 'image/heic', buffer: source });
    await expect(cropper.getByRole('alert')).toContainText("can't preserve");
    expect(await cropper.locator('img[alt="Photo being cropped"]').getAttribute('src')).toBe(before);
    mode = 'wait';
    await cropper.locator('input[type=file]').setInputFiles({ name: 'slow.heic', mimeType: 'image/heic', buffer: source });
    await expect.poll(() => Boolean(release)).toBe(true);
    await page.locator('dialog:has(#photo-source-title)').getByRole('button', { name: 'Cancel', exact: true }).click();
    mode = 'success'; release?.();
    await expect(cropper).toBeVisible();
    expect(await cropper.locator('img[alt="Photo being cropped"]').getAttribute('src')).toBe(before);
    await cropper.getByRole('button', { name: 'Confirm crop', exact: true }).click();
    await expect(cropper).toHaveCount(0);
    if (!editing) await page.getByRole('button', { name: '← Back', exact: true }).click();
    await page.getByRole('button', { name: 'Recrop', exact: true }).click();
    await expect(cropper).toBeVisible();
    await expect(cropper.getByRole('button', { name: 'Confirm crop', exact: true })).toBeEnabled();
  });
}
