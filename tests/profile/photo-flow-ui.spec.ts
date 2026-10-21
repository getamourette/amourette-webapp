import sharp from 'sharp';
import { test, expect } from '@playwright/test';
import { mockPhotoOnboarding } from '../helpers/photo-onboarding-ui';
import { mockNameUi, nameUiState, nameIds } from '../helpers/name-ui-fixture';
import { cropZoom, cropReady, setCropZoom } from '../helpers/photo-crop-ui';

test.use({ viewport: { width: 390, height: 844 } });

test('one photo target guides both crops, back preserves framing and Edit restores both', async ({ context, page }, info) => {
  await mockPhotoOnboarding(context);
  await page.goto('/profile');
  await page.getByPlaceholder('First name', { exact: true }).fill('Alice');
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  const picker = page.getByTestId('photo-picker');
  await expect(picker.locator('label')).toHaveCount(1);
  await expect(picker.getByText('Add a photo', { exact: true })).toHaveCount(1);
  // Chromium exposes the native file input as a button: it is the one target,
  // not a second visible add button beneath the frame.
  await expect(picker.getByRole('button', { name: 'Add a photo', exact: true })).toHaveCount(1);
  await expect(picker.getByRole('button')).toHaveAttribute('type', 'file');
  await expect(picker.locator('button')).toHaveCount(0);
  await expect(picker.locator('input[type=file]')).toHaveCount(1);
  await page.screenshot({ scale: 'css', path: info.outputPath('empty-390.png') });
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), picker.getByText('Add a photo', { exact: true }).click()]);
  await chooser.setFiles({ name: 'portrait.png', mimeType: 'image/png', buffer: await sharp('public/test-profiles/portrait-1.svg').png().toBuffer() });
  const dialog = page.getByRole('dialog');
  const next = dialog.getByRole('button', { name: 'Next', exact: true });
  await expect(dialog).toHaveAccessibleName('Your photo in the room');
  await expect(next).toBeEnabled();
  await expect(dialog.getByRole('slider')).toHaveCount(0);
  await expect(dialog.getByRole('button', { name: /Reset|Preview|Confirm/ })).toHaveCount(0);
  await expect(dialog.getByRole('button', { name: 'Cancel', exact: true })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(dialog.locator('.reactEasyCrop_CropArea')).toBeFocused();
  await setCropZoom(dialog, 1.7);
  await dialog.locator('.reactEasyCrop_CropArea').press('ArrowRight');
  await expect(next).toBeEnabled();
  const transform = () => dialog.locator('.reactEasyCrop_Image').evaluate(image => {
    const matrix = new DOMMatrix(getComputedStyle(image).transform);
    return [matrix.a, matrix.d, matrix.e, matrix.f];
  });
  const portraitTransform = await transform();
  await page.screenshot({ scale: 'css', path: info.outputPath('stage-1-390.png') });
  await next.click();
  await expect(dialog).toHaveAccessibleName('Your round photo');
  await expect(dialog.getByText('2 of 2', { exact: true })).toBeVisible();
  await expect(dialog.getByText('Alice', { exact: true })).toBeVisible();
  await expect(dialog.getByText('This is how you’ll appear in matches and messages')).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Back', exact: true })).toBeFocused();
  await expect(dialog.locator('input[type=file]')).toHaveCount(0);
  await setCropZoom(dialog, 2.1);
  await page.screenshot({ scale: 'css', path: info.outputPath('stage-2-390.png') });
  await dialog.getByRole('button', { name: 'Back', exact: true }).click();
  await expect(next).toBeEnabled();
  // Percentage restoration can introduce subpixel floating point noise (1e-13 px).
  await expect.poll(transform).toEqual(portraitTransform.map(value => expect.closeTo(value, 6)));
  await next.click();
  await cropReady(dialog);
  await expect.poll(() => cropZoom(dialog)).toBeCloseTo(2.1, 2);
  await dialog.getByRole('button', { name: 'Confirm', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await page.getByRole('button', { name: '← Back', exact: true }).click();
  const edit = picker.getByRole('button', { name: 'Edit', exact: true });
  await expect(picker.getByRole('button')).toHaveCount(1);
  await expect(picker.locator('img')).toHaveCount(1);
  await expect(picker.locator('input')).toHaveCount(0);
  const accepted = await picker.locator('img').getAttribute('src');
  await page.screenshot({ scale: 'css', path: info.outputPath('filled-390.png') });
  await edit.click();
  await expect(next).toBeEnabled();
  await expect(dialog).toHaveAccessibleName('Your photo in the room');
  // Percentage restoration can introduce subpixel floating point noise (1e-13 px).
  await expect.poll(transform).toEqual(portraitTransform.map(value => expect.closeTo(value, 6)));
  await next.click();
  await cropReady(dialog);
  await expect.poll(() => cropZoom(dialog)).toBeCloseTo(2.1, 2);
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(edit).toBeFocused();
  await expect(picker.locator('img')).toHaveAttribute('src', accepted!);
});

test('profile editor shares Edit, pending and legacy notices, and retains accepted photo on cancel', async ({ context, page }, info) => {
  await mockNameUi(context, nameUiState());
  const version = '00000000-0000-4000-8000-000000000181';
  const source = await sharp('public/test-profiles/portrait-1.svg').png().toBuffer();
  await page.route('**/rest/v1/photo_state?*', route => route.fulfill({ json: {
    profile_id: nameIds.alice, displayed_id: null, pending_id: version, revision: 1,
    correction_required: false, reason: null, last_action: null, updated_at: new Date().toISOString(),
  } }));
  await page.route('**/rest/v1/photo_versions?*', route => route.fulfill({ json: [{
    id: version, profile_id: nameIds.alice, path: `${nameIds.alice}/${version}.png`, status: 'pending', created_at: new Date().toISOString(),
  }] }));
  await page.route('**/storage/v1/object/**', route => route.fulfill({ body: source, contentType: 'image/png' }));
  await page.route('**/api/profile-photo/source?*', route => route.fulfill({ body: source, contentType: 'image/png', headers: { 'X-Photo-Legacy': 'true' } }));
  await page.goto('/profile?edit=1');
  const picker = page.getByTestId('photo-picker');
  const edit = picker.getByRole('button', { name: 'Edit', exact: true });
  await expect(picker.locator('img')).toBeVisible();
  await expect(picker.getByRole('button')).toHaveCount(1);
  await page.screenshot({ scale: 'css', path: info.outputPath('editor-390.png') });
  await edit.click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('button', { name: 'Next', exact: true })).toBeEnabled();
  await expect(dialog.getByText('Editing the photo awaiting review')).toBeVisible();
  await expect(dialog.getByText(/This older photo only contains/)).toBeVisible();
  await page.screenshot({ scale: 'css', path: info.outputPath('editor-crop-390.png') });
  await dialog.getByRole('button', { name: 'Next', exact: true }).click();
  await dialog.getByRole('button', { name: 'Confirm', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Send this photo', exact: true })).toBeVisible();
  const accepted = await picker.locator('img').getAttribute('src');
  await edit.click();
  await expect(dialog.getByRole('button', { name: 'Next', exact: true })).toBeEnabled();
  await page.keyboard.press('Escape');
  await expect(edit).toBeFocused();
  await expect(picker.locator('img')).toHaveAttribute('src', accepted!);
});

test('profile editor compares the displayed photo with a new one and keeps the current photo on request', async ({ context, page }, info) => {
  await mockNameUi(context, nameUiState());
  const displayed = '00000000-0000-4000-8000-000000000276';
  const pending = '00000000-0000-4000-8000-000000000277';
  const source = await sharp('public/test-profiles/portrait-1.svg').png().toBuffer();
  const replacement = await sharp({ create: { width: 64, height: 64, channels: 3, background: '#543121' } }).png().toBuffer();
  let pendingId: string | null = pending;
  let revision = 2;
  let lastAction: string | null = 'submitted';
  let cancelFails = true;
  await page.route('**/rest/v1/photo_state?*', route => route.fulfill({ json: {
    profile_id: nameIds.alice, displayed_id: displayed, pending_id: pendingId, revision,
    correction_required: false, reason: null, last_action: lastAction, updated_at: new Date().toISOString(),
  } }));
  await page.route('**/rest/v1/rpc/decide_profile_photo', async route => {
    expect(route.request().postDataJSON()).toMatchObject({ p_version: pending, p_expected_revision: 2, p_action: 'cancelled' });
    if (cancelFails) return route.fulfill({ status: 500, json: { message: 'unavailable' } });
    pendingId = null; revision = 3; lastAction = 'cancelled';
    await route.fulfill({ json: null });
  });
  await page.route('**/rest/v1/photo_versions?*', route => route.fulfill({ json: [displayed, ...(pendingId ? [pendingId] : [])].map(id => ({
    id, profile_id: nameIds.alice, path: `${nameIds.alice}/${id}.png`, status: id === displayed ? 'approved' : 'unverified', created_at: new Date().toISOString(),
  })) }));
  await page.route('**/storage/v1/object/**', route => route.fulfill({ body: source, contentType: 'image/png' }));
  await page.route('**/api/profile-photo/source?*', route => route.fulfill({ body: source, contentType: 'image/png' }));
  await page.goto('/profile?edit=1');
  const section = page.getByTestId('photo-section');
  const picker = page.getByTestId('photo-picker');
  // A pending replacement sits next to the photo others still see; only it is editable.
  await expect(section.getByText('Visible to others', { exact: true })).toBeVisible();
  await expect(section.getByText('Waiting for review', { exact: true })).toBeVisible();
  await expect(section.locator('img')).toHaveCount(2);
  await expect(section.getByRole('button', { name: 'Edit', exact: true })).toHaveCount(1);
  await expect(section.getByRole('button', { name: 'Cancel submission', exact: true })).toBeVisible();
  await expect(section.getByRole('button', { name: 'Keep my current photo', exact: true })).toHaveCount(0);
  await expect(page.getByText('Editing the photo awaiting review')).toHaveCount(0);
  await page.screenshot({ scale: 'css', path: info.outputPath('editor-pending-390.png') });

  // A new selection over a pending one can be dropped without cancelling the submission.
  const dialog = page.getByRole('dialog');
  const next = dialog.getByRole('button', { name: 'Next', exact: true });
  await picker.getByRole('button', { name: 'Edit', exact: true }).click();
  await expect(next).toBeEnabled();
  await dialog.locator('input[type=file]').setInputFiles({ name: 'other.png', mimeType: 'image/png', buffer: replacement });
  await next.click();
  await dialog.getByRole('button', { name: 'Confirm', exact: true }).click();
  await expect(section.getByText('Not sent yet', { exact: true })).toBeVisible();
  await expect(section.getByRole('button', { name: 'Cancel submission', exact: true })).toHaveCount(0);
  await section.getByRole('button', { name: 'Don’t send this photo', exact: true }).click();
  await expect(section.getByText('Waiting for review', { exact: true })).toBeVisible();

  // A failed cancellation reports the error and keeps the submission; a retry succeeds.
  const cancel = section.getByRole('button', { name: 'Cancel submission', exact: true });
  await cancel.click();
  await expect(section.getByRole('alert')).toHaveText('Could not update photo status. Please try again.');
  await expect(section.getByText('Waiting for review', { exact: true })).toBeVisible();
  cancelFails = false;
  await cancel.click();
  await expect(page.getByTestId('photo-status')).toHaveText('Submission cancelled. Your current photo is still visible.');
  await expect(section.getByRole('alert')).toHaveCount(0);
  await expect(section.locator('img')).toHaveCount(1);
  await expect(cancel).toHaveCount(0);

  // Without a pending version, one photo is shown until another is selected.
  await page.reload();
  await expect(section.locator('img')).toHaveCount(1);
  await expect(section.getByText('Visible to others', { exact: true })).toBeVisible();
  await expect(page.getByTestId('photo-status')).toHaveCount(0);
  // Recropping the saved photo, then keeping it, must not break the next Edit.
  await picker.getByRole('button', { name: 'Edit', exact: true }).click();
  await expect(next).toBeEnabled();
  await next.click();
  await cropReady(dialog);
  await dialog.getByRole('button', { name: 'Confirm', exact: true }).click();
  await section.getByRole('button', { name: 'Keep my current photo', exact: true }).click();
  await picker.getByRole('button', { name: 'Edit', exact: true }).click();
  await expect(next).toBeEnabled();
  await expect(dialog.locator('img[alt="Photo being cropped"]')).toHaveJSProperty('complete', true);
  expect(await dialog.locator('img[alt="Photo being cropped"]').evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(0);
  await dialog.locator('input[type=file]').setInputFiles({ name: 'new.png', mimeType: 'image/png', buffer: replacement });
  await dialog.getByRole('button', { name: 'Next', exact: true }).click();
  await dialog.getByRole('button', { name: 'Confirm', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(section.getByText('Not sent yet', { exact: true })).toBeVisible();
  await expect(section.locator('img')).toHaveCount(2);
  await expect(page.getByRole('button', { name: 'Send this photo', exact: true })).toBeVisible();
  // The photo send is the editor's only primary action; other saves are secondary.
  await expect(section.locator('.night-button-primary')).toHaveCount(1);
  for (const name of ['Save my bio', 'Save my preferences'])
    await expect(page.getByRole('button', { name, exact: true })).toHaveClass(/night-button-secondary/);
  await page.screenshot({ scale: 'css', path: info.outputPath('editor-selected-390.png') });
  const selectedSrc = await picker.locator('img').getAttribute('src');
  await section.getByRole('button', { name: 'Keep my current photo', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Send this photo', exact: true })).toHaveCount(0);
  await expect(section.locator('img')).toHaveCount(1);
  await expect(section.getByText('Not sent yet', { exact: true })).toHaveCount(0);
  await expect(picker.locator('img')).not.toHaveAttribute('src', selectedSrc!);
  // Dropping the selection leaves nothing unsaved, so Back leaves without a prompt.
  await page.getByRole('button', { name: 'Back', exact: true }).first().click();
  await expect(page).not.toHaveURL(/\/profile/);
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
});
