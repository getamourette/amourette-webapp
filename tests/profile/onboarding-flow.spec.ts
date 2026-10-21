import { test, expect, type Page } from '@playwright/test';
import sharp from 'sharp';
import { mockNameUi, nameUiState } from '../helpers/name-ui-fixture';
import { t } from '../../lib/strings';

test.beforeEach(async ({ context }) => {
  await mockNameUi(context, nameUiState());
  await context.route('**/rest/v1/profiles?*', route => route.fulfill({ json: null }));
});

async function reachGender(page: Page) {
  await page.goto('/profile');
  await page.getByPlaceholder('First name', { exact: true }).fill('Alice');
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.locator('input[type=file]').setInputFiles({
    name: 'synthetic.png', mimeType: 'image/png',
    buffer: await sharp('public/test-profiles/portrait-1.svg').png().toBuffer(),
  });
  await page.getByRole('dialog').getByRole('button', { name: 'Next', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Confirm', exact: true }).click();
  await expect(page.getByRole('group', { name: 'I am', exact: true })).toBeVisible();
}

test('name keyboard Next shares validation and ignores composition and repeated Enter', async ({ page }) => {
  await page.goto('/profile');
  const name = page.getByPlaceholder('First name', { exact: true });
  await expect(name).toBeFocused();
  await expect(name).toHaveAttribute('autocomplete', 'given-name');
  await expect(name).toHaveAttribute('enterkeyhint', 'next');
  for (const invalid of ['', ' \u00a0', '😀'.repeat(31)]) {
    await name.fill(invalid);
    await name.press('Enter');
    await expect(name).toHaveValue(invalid);
    await expect(page.getByRole('button', { name: 'Continue', exact: true })).toBeDisabled();
  }
  await name.fill(`\u00a0${'😀'.repeat(30)}\ufeff`);
  await expect(page.getByRole('button', { name: 'Continue', exact: true })).toBeEnabled();
  await name.dispatchEvent('keydown', { key: 'Enter', isComposing: true });
  await expect(name).toBeVisible();
  await name.dispatchEvent('keydown', { key: 'Enter', repeat: true });
  await expect(name).toBeVisible();
  await name.press('Enter');
  await expect(page.getByRole('heading', { name: 'Help people recognize you' })).toBeVisible();
});

test('gender advances once after 250ms; returning and multi-select interests stay manual', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await reachGender(page);
  await page.clock.install();
  await page.clock.pauseAt(new Date(Date.now() + 1000));
  const gender = page.getByRole('group', { name: 'I am', exact: true });
  const woman = gender.getByRole('button', { name: 'Woman', exact: true });
  await woman.dispatchEvent('click');
  await woman.dispatchEvent('click');
  await expect(woman).toHaveAttribute('aria-pressed', 'true');
  await page.clock.runFor(249);
  await expect(gender).toBeVisible();
  await page.clock.runFor(1);
  const interests = page.getByRole('group', { name: 'I’d like to meet', exact: true });
  await expect(interests).toBeVisible();
  await interests.getByRole('button', { name: 'Man', exact: true }).dispatchEvent('click');
  await page.clock.runFor(500);
  await expect(interests).toBeVisible();
  await page.getByRole('button', { name: '← Back', exact: true }).dispatchEvent('click');
  await page.clock.runFor(500);
  await expect(woman).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Continue', exact: true }).dispatchEvent('click');
  await expect(interests).toBeVisible();
});

test('navigation cancels pending gender advancement', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await reachGender(page);
  await page.clock.install();
  await page.clock.pauseAt(new Date(Date.now() + 1000));
  const woman = page.getByRole('group', { name: 'I am', exact: true }).getByRole('button', { name: 'Woman', exact: true });
  await woman.dispatchEvent('click');
  await page.getByRole('button', { name: '← Back', exact: true }).dispatchEvent('click');
  await page.clock.runFor(500);
  await expect(page.getByRole('heading', { name: 'Help people recognize you' })).toBeVisible();
  const next = page.getByRole('button', { name: 'Continue', exact: true });
  await next.dispatchEvent('click');
  await woman.dispatchEvent('click');
  await next.dispatchEvent('click');
  await page.getByRole('group', { name: 'I’d like to meet', exact: true }).getByRole('button', { name: 'Man', exact: true }).dispatchEvent('click');
  await next.dispatchEvent('click');
  await page.clock.runFor(500);
  await expect(page.getByRole('textbox', { name: 'Bio (optional)' })).toBeVisible();
});

test('reduced motion advances gender immediately without a timer', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await reachGender(page);
  await page.clock.install();
  await page.clock.pauseAt(new Date(Date.now() + 1000));
  await page.getByRole('group', { name: 'I am', exact: true }).getByRole('button', { name: 'Woman', exact: true }).dispatchEvent('click');
  // Timers remain paused: reduced motion must not wait even 1ms.
  await expect(page.getByRole('group', { name: 'I’d like to meet', exact: true })).toBeVisible();
});

test('optional bio labels localize; confirmation edits through the card and top back control', async ({ page }) => {
  await reachGender(page);
  await page.getByRole('group', { name: 'I am', exact: true }).getByRole('button', { name: 'Woman', exact: true }).click();
  await page.getByRole('group', { name: 'I’d like to meet', exact: true }).getByRole('button', { name: 'Man', exact: true }).click();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  for (const locale of ['fr', 'es', 'en'] as const) {
    await page.evaluate(value => {
      localStorage.setItem('amourette-locale', value);
      window.dispatchEvent(new Event('amourette-locale-change'));
    }, locale);
    const s = t[locale].profile;
    const bio = page.getByRole('textbox');
    await expect(page.getByRole('button', { name: s.onb.skip, exact: true })).toBeEnabled();
    await bio.fill(' \u00a0\n');
    await expect(page.getByRole('button', { name: s.onb.skip, exact: true })).toBeEnabled();
    await bio.fill('Hello');
    await expect(page.getByRole('button', { name: s.onb.continue, exact: true })).toBeEnabled();
    await bio.fill('😀'.repeat(301));
    await expect(page.getByRole('button', { name: s.onb.continue, exact: true })).toBeDisabled();
    await bio.fill('');
  }
  await page.getByRole('button', { name: 'Skip', exact: true }).click();
  const confirmation = page.getByTestId('onboarding-confirmation');
  await expect(confirmation.getByRole('button', { name: 'Recrop', exact: true })).toHaveCount(0);
  await expect(confirmation.locator('input[type=file]')).toHaveCount(0);
  const card = confirmation.getByRole('button', { name: 'Change photo', exact: true });
  await expect(card.getByTestId('feed-photo-preview')).toBeVisible();
  const bottom = confirmation.locator(':scope > div').last();
  await expect(bottom.getByText('Change photo', { exact: true })).toHaveCount(0);
  await expect(bottom.getByRole('checkbox')).toHaveCount(2);
  await expect(bottom.getByRole('button')).toHaveCount(2); // Learn more and submit.
  for (const viewport of [{ width: 320, height: 568 }, { width: 393, height: 851 }]) {
    await page.setViewportSize(viewport);
    await page.screenshot({ path: test.info().outputPath(`confirmation-${viewport.width}.png`), animations: 'disabled' });
  }
  const back = confirmation.getByRole('button', { name: 'Back', exact: true });
  const backBox = await back.boundingBox();
  const cardBox = await card.boundingBox();
  expect(backBox!.width).toBeGreaterThanOrEqual(44);
  expect(backBox!.height).toBeGreaterThanOrEqual(44);
  expect(backBox!.y + backBox!.height).toBeLessThanOrEqual(cardBox!.y);
  await back.click();
  await expect(page.getByRole('textbox', { name: 'Bio (optional)' })).toBeVisible();
  await page.getByRole('button', { name: 'Skip', exact: true }).click();
  await card.focus();
  await expect(card).toBeFocused();
  await card.press('Enter');
  await expect(page.getByRole('heading', { name: 'Help people recognize you' })).toBeVisible();
  const picker = page.getByTestId('photo-picker');
  await expect(picker.getByRole('button', { name: 'Edit', exact: true })).toBeVisible();
  await expect(picker.getByRole('button')).toHaveCount(1);
  await expect(page.locator('input[type=file]')).toHaveCount(0);
  await expect(picker.locator('img')).toBeVisible();
  await picker.getByRole('button', { name: 'Edit', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Your photo in the room', exact: true }).getByRole('button', { name: 'Next', exact: true })).toBeEnabled();
});
