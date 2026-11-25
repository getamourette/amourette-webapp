import { test, expect, type BrowserContext } from '@playwright/test';
import sharp from 'sharp';
import { mockNameUi, nameIds, nameUiState } from '../helpers/name-ui-fixture';
import { photoStrings } from '../../lib/photo-strings';
import type { PhotoState } from '../../lib/photo-moderation';

async function photoDecision(context: BrowserContext, action: 'approved' | 'rejected', locale: 'en' | 'fr' | 'es' = 'en') {
  await mockNameUi(context, nameUiState());
  await context.addInitScript(locale => {
    localStorage.setItem('amourette-locale', locale);
    localStorage.setItem('amourette-room-hint-dismissed', '1');
  }, locale);
  const version = '00000000-0000-4000-8000-000000000340';
  const state: PhotoState = { profile_id: nameIds.alice, displayed_id: version, pending_id: null,
    correction_required: false, reason: null, last_action: action, last_reason: action === 'rejected' ? 'face_unclear' : null,
    revision: 340, updated_at: new Date().toISOString() };
  const night = { venue_id: nameIds.venue, venue_night_id: nameIds.night, status: 'live', participant_count: 1, launch_threshold: 4,
    guaranteed_launch_at: new Date().toISOString(), closes_at: new Date(Date.now() + 3_600_000).toISOString(), terminal_reason: null, updated_at: new Date().toISOString() };
  const photo = await sharp('public/test-profiles/portrait-1.svg').png().toBuffer();
  await context.route('**/rest/v1/**', route => {
    const req = route.request(), url = new URL(req.url()), name = url.pathname.split('/').at(-1);
    const rows = (value: unknown[]) => route.fulfill({ json: req.headers().accept?.includes('object+json') ? value[0] ?? null : value });
    if (name === 'venue_night_state' || name === 'venue_night_public_state') return rows([night]);
    if (name === 'profile_private') return rows([{ adult_confirmed_at: new Date().toISOString() }]);
    if (name === 'presence') return rows([{ id: version, profile_id: nameIds.alice, venue_night_id: nameIds.night, left_at: null, is_visible: true }]);
    if (name === 'matches' || name === 'room_candidates') return rows([]);
    if (name === 'photo_state') return rows([state]);
    if (name === 'photo_versions') return rows([{ id: version, profile_id: nameIds.alice, path: `${nameIds.alice}/${version}.png`, status: 'approved', created_at: state.updated_at }]);
    return route.fallback();
  });
  await context.route('**/storage/v1/**', route => route.fulfill({ body: photo, contentType: 'image/png' }));
  return state;
}

for (const locale of ['en', 'fr', 'es'] as const) test(`room rejection sheet is consumed on display and editor keeps an inline reason (${locale})`, async ({ context, page }, info) => {
  const state = await photoDecision(context, 'rejected', locale);
  const s = photoStrings[locale];
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto('/v/test-bar');
  await page.waitForLoadState('networkidle');
  const dialog = page.getByRole('dialog', { name: s.rejectedTitle, exact: true });
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAttribute('aria-modal', 'true');
  await expect(dialog).toContainText(s.rejected);
  await expect(dialog).toContainText(s.reasons.face_unclear);
  const edit = dialog.getByRole('link', { name: s.chooseAnother, exact: true });
  await expect(edit).toHaveAttribute('href', /\/profile\?edit=1&venue=test-bar/);
  await expect(edit).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(dialog.getByRole('button', { name: s.dismiss, exact: true })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(edit).toBeFocused();
  const sheet = dialog.locator(':scope > div');
  const box = await sheet.boundingBox();
  expect(Math.round(box!.y + box!.height)).toBe(740);
  await expect(page.locator('body')).toHaveJSProperty('scrollWidth', 320);
  expect(await page.evaluate(id => localStorage.getItem(`photo-decision-seen:${id}`), nameIds.alice)).toBe(String(state.revision));
  await page.screenshot({ path: info.outputPath(`room-rejected-${locale}-320.png`) });
  await dialog.getByRole('button', { name: s.dismiss, exact: true }).click();
  await page.reload();
  await page.waitForLoadState('networkidle');
  await expect(page.getByTestId('photo-status')).toHaveCount(0);
  await page.goto('/profile?edit=1&venue=test-bar');
  const inline = page.getByTestId('photo-rejection-inline');
  await expect(inline).toHaveText(s.rejectedInline('face_unclear'));
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(inline.getByRole('button')).toHaveCount(0);
  await page.screenshot({ path: info.outputPath(`editor-rejected-${locale}-320.png`), fullPage: true });
  state.pending_id = '00000000-0000-4000-8000-000000000341';
  state.last_action = 'submitted'; state.revision++;
  await page.reload();
  await page.waitForLoadState('networkidle');
  await expect(inline).toHaveCount(0);
});

test('approval sheet appears once, closes with Escape and restores focus', async ({ context, page }, info) => {
  const state = await photoDecision(context, 'approved');
  // Start without a decision, then receive one with focus already in the room.
  state.last_action = 'cancelled';
  await page.goto('/v/test-bar');
  await page.waitForLoadState('networkidle');
  // Keep focus on a visible room control before the decision arrives.
  const trigger = page.getByRole('button', { name: 'Night options', exact: true });
  await expect(trigger).toBeVisible(); await trigger.focus();
  state.last_action = 'approved'; state.revision++;
  await page.evaluate(() => window.dispatchEvent(new Event('amourette-photo-refresh')));
  const dialog = page.getByRole('dialog', { name: photoStrings.en.approvedTitle });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'OK', exact: true })).toBeFocused();
  await expect(dialog.getByRole('link')).toHaveCount(0);
  await page.screenshot({ path: info.outputPath('room-approved.png') });
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await page.reload();
  await page.waitForLoadState('networkidle');
  await expect(dialog).toHaveCount(0);
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await expect(page.getByTestId('photo-status')).toHaveCount(0);
});

test('home consumes the same decision before room without requiring dismissal', async ({ context, page }) => {
  await photoDecision(context, 'rejected');
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await expect(page.getByTestId('photo-status')).toContainText(photoStrings.en.rejectedTitle);
  await page.goto('/v/test-bar');
  await page.waitForLoadState('networkidle');
  await expect(page.getByRole('dialog', { name: photoStrings.en.rejectedTitle })).toHaveCount(0);
  await page.goto('/profile?edit=1');
  await expect(page.getByTestId('photo-rejection-inline')).toBeVisible();
});

test('backdrop dismissal survives refreshes within the mount when decision storage fails', async ({ context, page }) => {
  await photoDecision(context, 'rejected');
  await context.addInitScript(() => {
    const get = Storage.prototype.getItem, set = Storage.prototype.setItem;
    Storage.prototype.getItem = function(key) { if (key.startsWith('photo-decision-seen:')) throw new Error('Storage unavailable'); return get.call(this, key); };
    Storage.prototype.setItem = function(key, value) { if (key.startsWith('photo-decision-seen:')) throw new Error('Storage unavailable'); return set.call(this, key, value); };
  });
  await page.goto('/v/test-bar');
  await page.waitForLoadState('networkidle');
  const dialog = page.getByRole('dialog', { name: photoStrings.en.rejectedTitle });
  await expect(dialog).toBeVisible();
  await dialog.click({ position: { x: 10, y: 10 } });
  await expect(dialog).toHaveCount(0);
  const read = page.waitForResponse(response => response.url().includes('/photo_state?'));
  await page.evaluate(() => window.dispatchEvent(new Event('amourette-photo-refresh')));
  await read;
  await expect(dialog).toHaveCount(0);
});

for (const receipt of ['339', ' 340 ', 'x'.repeat(17)]) test(`a stale or malformed receipt does not suppress a new decision (${receipt.length})`, async ({ context, page }) => {
  await photoDecision(context, 'approved');
  await context.addInitScript(({ id, receipt }) => {
    if (!sessionStorage.getItem('decision-test-seeded')) {
      localStorage.setItem(`photo-decision-seen:${id}`, receipt);
      sessionStorage.setItem('decision-test-seeded', '1');
    }
  }, { id: nameIds.alice, receipt });
  await page.goto('/v/test-bar');
  await page.waitForLoadState('networkidle');
  const dialog = page.getByRole('dialog', { name: photoStrings.en.approvedTitle });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'OK', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await page.reload();
  await page.waitForLoadState('networkidle');
  await expect(dialog).toHaveCount(0);
});

test('editing first does not consume the decision and the room action returns to the inline status', async ({ context, page }) => {
  await photoDecision(context, 'rejected');
  await page.goto('/profile?edit=1');
  await expect(page.getByTestId('photo-rejection-inline')).toBeVisible();
  expect(await page.evaluate(id => localStorage.getItem(`photo-decision-seen:${id}`), nameIds.alice)).toBeNull();
  await page.goto('/v/test-bar');
  await page.waitForLoadState('networkidle');
  const dialog = page.getByRole('dialog', { name: photoStrings.en.rejectedTitle });
  await dialog.getByRole('link', { name: photoStrings.en.chooseAnother }).click();
  await expect(page).toHaveURL(/\/profile\?edit=1&venue=test-bar/);
  await expect(page.getByTestId('photo-rejection-inline')).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.goto('/v/test-bar');
  await page.waitForLoadState('networkidle');
  await expect(dialog).toHaveCount(0);
});
