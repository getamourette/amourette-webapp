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
    let preparations = 0;
    let release: (() => void) | undefined;
    let releaseState!: () => void;
    const stateHeld = new Promise<void>(resolve => { releaseState = resolve; });
    let releaseRefusal!: () => void;
    const refusalHeld = new Promise<void>(resolve => { releaseRefusal = resolve; });
    let refusalRequested = false;
    if (editing) await page.route('**/rest/v1/photo_state?*', async route => {
      const response = await route.fetch();
      const state = await response.json();
      await stateHeld;
      // A late approval refresh must not cancel a new local file selection.
      await route.fulfill({ response, json: Array.isArray(state) ? state.map(row => ({ ...row, last_action: 'approved' })) : { ...state, last_action: 'approved' } });
    });
    await page.route('**/storage/v1/object/upload/sign/profile-photo-staging/**', route => route.fulfill({ json: { Key: 'staged' } }));
    await page.route('**/api/profile-photo/prepare', async route => {
      const body = route.request().postDataJSON();
      if (!body.ticket) return route.fulfill({ json: { path: `${owner.id}/heic-test.heic`, token: 'test-token', ticket: 'test-ticket' } });
      preparations++;
      if (mode === 'wait') await new Promise<void>(resolve => { release = resolve; });
      if (mode === 'refuse') {
        refusalRequested = true;
        if (editing) await refusalHeld;
        return route.fulfill({ status: 400, json: { error: 'unsupported_heic' } }).catch(() => undefined);
      }
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
    if (editing) {
      try {
        await expect.poll(() => refusalRequested).toBe(true);
        releaseState();
        await expect(page.getByTestId('photo-status')).toHaveCount(1);
      } finally { releaseState(); releaseRefusal(); }
    }
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
    expect(await cropper.locator('img[alt="Photo being cropped"]').getAttribute('src')).toBe(before);
    const beforeReplacement = preparations;
    await cropper.locator('input[type=file]').setInputFiles({ name: 'candidate.heic', mimeType: 'image/heic', buffer: source });
    await expect(cropper.locator('img[alt="Photo being cropped"]')).not.toHaveAttribute('src', before!);
    await expect(cropper.getByRole('button', { name: 'Confirm crop', exact: true })).toBeEnabled();
    expect(preparations).toBe(beforeReplacement + 1);
    await cropper.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(cropper).toHaveCount(0);
    await page.getByRole('button', { name: 'Recrop', exact: true }).click();
    await expect(cropper.getByRole('button', { name: 'Confirm crop', exact: true })).toBeEnabled();
    expect(await cropper.locator('img[alt="Photo being cropped"]').getAttribute('src')).toBe(before);
    expect(preparations).toBe(beforeReplacement + 1);
  });
}
