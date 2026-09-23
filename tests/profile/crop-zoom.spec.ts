import sharp from 'sharp';
import { test, expect, type BrowserContext, type Page } from '@playwright/test';

// Local browser behavior only: no shared users, uploads or venue fixtures.
declare global {
  interface Window { cropExports: { width: number; height: number }[] }
}
async function openCrop(context: BrowserContext, page: Page) {
  const backend = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!);
  const id = '00000000-0000-4000-8000-000000000181';
  const user = { id, aud: 'authenticated', role: 'authenticated', is_anonymous: true, app_metadata: {}, user_metadata: {} };
  const token = `${Buffer.from('{"alg":"HS256"}').toString('base64url')}.${Buffer.from(JSON.stringify({ sub: id, exp: 4099766400, role: 'authenticated' })).toString('base64url')}.synthetic`;
  const session = { user, access_token: token, refresh_token: 'synthetic', token_type: 'bearer', expires_at: 4099766400, expires_in: 3600 };
  await context.addInitScript(({ session, key }) => {
    localStorage.setItem(key, JSON.stringify(session));
    localStorage.setItem('amourette-locale', 'en');
    window.cropExports = [];
    const native = HTMLCanvasElement.prototype.toBlob;
    HTMLCanvasElement.prototype.toBlob = function (callback, ...args) {
      window.cropExports.push({ width: this.width, height: this.height });
      return native.call(this, callback, ...args);
    };
  }, { session, key: `sb-${backend.hostname.split('.')[0]}-auth-token` });
  await context.route(`${backend.origin}/**`, route => route.fulfill({ json: [] }));
  await context.routeWebSocket(/.*/, socket => socket.close());
  if (process.env.E2E_BASE_URL && process.env.E2E_VERCEL_BYPASS) {
    await context.route(`${new URL(process.env.E2E_BASE_URL).origin}/**`, route => route.continue({
      headers: { ...route.request().headers(), 'x-vercel-protection-bypass': process.env.E2E_VERCEL_BYPASS! },
    }));
  }
  await page.goto('/profile');
  await page.getByPlaceholder('First name', { exact: true }).fill('Zoom');
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  const buffer = await sharp('public/test-profiles/portrait-1.svg').png().toBuffer();
  await page.locator('input[type=file]').setInputFiles({ name: 'portrait.png', mimeType: 'image/png', buffer });
  await expect(page.getByRole('button', { name: 'Confirm crop', exact: true })).toBeEnabled();
}
const exportCount = (page: Page) => page.evaluate(() => window.cropExports.length);
async function clearExports(page: Page) { await page.evaluate(() => { window.cropExports = []; }); }

// DOM touch events exercise the library's real touch path in both engines. They
// are a deterministic regression, not a physical Safari gesture/performance test.
async function touch(page: Page, type: 'touchstart' | 'touchmove' | 'touchend' | 'touchcancel', radius = 25) {
  await page.locator('.reactEasyCrop_Container').evaluate((element, { type, radius }) => {
    const box = element.getBoundingClientRect();
    const x = box.x + box.width / 2, y = box.y + box.height / 2;
    const points = type === 'touchend' || type === 'touchcancel' ? [] : [-radius, radius].map((offset, identifier) => ({
      identifier, target: element, clientX: x + offset, clientY: y, pageX: x + offset, pageY: y,
    }));
    const event = new Event(type, { bubbles: true, cancelable: true });
    Object.defineProperties(event, { touches: { value: points }, targetTouches: { value: points }, changedTouches: { value: points } });
    element.dispatchEvent(event);
  }, { type, radius });
}
async function settleFrames(page: Page) {
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
}

test('pinch keeps zoom live, exports once at release and confirms the final independent crops', async ({ context, page }) => {
  await openCrop(context, page);
  const dialog = page.getByRole('dialog');
  const confirm = dialog.getByRole('button', { name: 'Confirm crop', exact: true });
  const zoom = dialog.getByRole('slider');
  await clearExports(page);
  await touch(page, 'touchstart');
  for (const radius of [30, 35, 40, 45]) {
    await touch(page, 'touchmove', radius);
    await settleFrames(page);
  }
  await expect(zoom).toHaveValue('1.8');
  await expect(confirm).toBeDisabled();
  await page.screenshot({ path: test.info().outputPath('pinching.png') });
  // A pause with fingers still down must not trigger a debounced export.
  await page.waitForTimeout(300);
  expect(await exportCount(page)).toBe(0);
  // Release immediately after the last move: its animation frame is still queued.
  await touch(page, 'touchmove', 50);
  await touch(page, 'touchend');
  await expect(zoom).toHaveValue('2');
  await expect(confirm).toBeEnabled();
  expect(await exportCount(page)).toBe(1);
  expect(await page.evaluate(() => window.cropExports[0].height)).toBe(550);
  await page.screenshot({ path: test.info().outputPath('final-crop.png') });
  await dialog.getByRole('button', { name: 'Edit this crop', exact: true }).click();
  await expect(zoom).toHaveValue('1');
  await expect(zoom).toBeEnabled();
  await zoom.fill('1.5');
  await expect(confirm).toBeEnabled();
  expect(await exportCount(page)).toBe(1);
  await confirm.click();
  await expect(dialog).toHaveCount(0);
  await page.getByRole('button', { name: '← Back', exact: true }).click();
  await page.getByRole('button', { name: 'Recrop', exact: true }).click();
  await expect(confirm).toBeEnabled();
  await expect(zoom).toHaveValue('2');
  await dialog.getByRole('button', { name: 'Edit this crop', exact: true }).click();
  await expect(zoom).toBeEnabled();
  await expect.poll(async () => Number(await zoom.inputValue())).toBeCloseTo(1.5, 2);
});

test('slider, held keys and wheel defer exports and recover after interrupted input', async ({ context, page }) => {
  await openCrop(context, page);
  const zoom = page.getByRole('slider');
  const confirm = page.getByRole('button', { name: 'Confirm crop', exact: true });
  await clearExports(page);
  await zoom.dispatchEvent('pointerdown', { pointerId: 1 });
  await zoom.fill('1.3'); await settleFrames(page);
  await zoom.fill('1.6'); await settleFrames(page);
  expect(await exportCount(page)).toBe(0);
  await expect(confirm).toBeDisabled();
  await page.locator('body').dispatchEvent('pointerup', { pointerId: 1 });
  await expect(confirm).toBeEnabled(); expect(await exportCount(page)).toBe(1);

  await clearExports(page);
  await zoom.focus();
  await page.keyboard.down('ArrowRight'); await settleFrames(page);
  await page.keyboard.down('ArrowRight'); await settleFrames(page);
  expect(await exportCount(page)).toBe(0);
  await page.keyboard.up('ArrowRight');
  await expect(confirm).toBeEnabled(); expect(await exportCount(page)).toBe(1);

  await clearExports(page);
  await page.keyboard.down('+'); await settleFrames(page);
  await page.keyboard.down('+'); await settleFrames(page);
  expect(await exportCount(page)).toBe(0);
  await page.keyboard.up('+');
  await expect(confirm).toBeEnabled(); expect(await exportCount(page)).toBe(1);

  await clearExports(page);
  const surface = page.locator('.reactEasyCrop_Container');
  await surface.dispatchEvent('wheel', { deltaY: -10, clientX: 190, clientY: 300 });
  await settleFrames(page);
  await surface.dispatchEvent('wheel', { deltaY: -10, clientX: 190, clientY: 300 });
  await settleFrames(page);
  expect(await exportCount(page)).toBe(0);
  await expect(confirm).toBeEnabled(); expect(await exportCount(page)).toBe(1);

  for (const interruption of ['pointercancel', 'blur']) {
    await clearExports(page);
    await zoom.dispatchEvent('pointerdown', { pointerId: 1 });
    await zoom.fill(interruption === 'blur' ? '1.8' : '1.7'); await settleFrames(page);
    expect(await exportCount(page)).toBe(0);
    await page.evaluate(type => (type === 'blur' ? window : document).dispatchEvent(new Event(type)), interruption);
    await expect(confirm).toBeEnabled(); expect(await exportCount(page)).toBe(1);
  }
});

test('touch cancellation and native gesture end recover; closing a gesture preserves the accepted draft', async ({ context, page }) => {
  await openCrop(context, page);
  const dialog = page.getByRole('dialog');
  const confirm = dialog.getByRole('button', { name: 'Confirm crop', exact: true });
  const zoom = dialog.getByRole('slider');
  await clearExports(page);
  await touch(page, 'touchstart'); await touch(page, 'touchmove', 35); await settleFrames(page);
  expect(await exportCount(page)).toBe(0);
  await touch(page, 'touchcancel');
  await expect(confirm).toBeEnabled(); expect(await exportCount(page)).toBe(1);
  await expect(zoom).toHaveValue('1.4');
  await confirm.click(); await expect(dialog).toHaveCount(0);
  await page.getByRole('button', { name: '← Back', exact: true }).click();
  const accepted = await page.locator('label img').getAttribute('src');
  await page.getByRole('button', { name: 'Recrop', exact: true }).click();
  await expect(confirm).toBeEnabled();
  await clearExports(page);
  await touch(page, 'touchstart'); await touch(page, 'touchmove', 40); await settleFrames(page);
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await settleFrames(page);
  expect(await exportCount(page)).toBe(0);
  await expect(page.locator('label img')).toHaveAttribute('src', accepted!);
  await page.getByRole('button', { name: 'Recrop', exact: true }).click();
  await expect(confirm).toBeEnabled(); await expect(zoom).toHaveValue('1.4');

  await clearExports(page);
  await page.locator('.reactEasyCrop_Container').dispatchEvent('gesturestart');
  // Safari owns gesturechange; use the existing zoom control to exercise the
  // export gate while the native gesture lifecycle is active on either engine.
  await zoom.fill('1.9'); await settleFrames(page);
  expect(await exportCount(page)).toBe(0);
  await page.locator('body').dispatchEvent('gestureend');
  await expect(confirm).toBeEnabled(); expect(await exportCount(page)).toBe(1);
});

test('a failed final export can return to the last valid preview without a broken object URL', async ({ context, page }) => {
  await openCrop(context, page);
  const dialog = page.getByRole('dialog');
  const confirm = dialog.getByRole('button', { name: 'Confirm crop', exact: true });
  await page.evaluate(() => {
    const native = HTMLCanvasElement.prototype.toBlob;
    HTMLCanvasElement.prototype.toBlob = function (callback) {
      callback(null);
    };
    window.addEventListener('allow-crop-export', () => { HTMLCanvasElement.prototype.toBlob = native; }, { once: true });
  });
  await dialog.getByRole('slider').fill('1.8');
  await expect(dialog.getByRole('alert')).toContainText("Couldn't prepare this photo");
  await expect(confirm).toBeDisabled();
  await clearExports(page);
  await page.evaluate(() => window.dispatchEvent(new Event('allow-crop-export')));
  await dialog.getByRole('button', { name: 'Reset', exact: true }).click();
  await expect(confirm).toBeEnabled();
  await expect(dialog.getByRole('alert')).toHaveCount(0);
  expect(await exportCount(page)).toBe(0);
  await dialog.getByRole('button', { name: 'Preview', exact: true }).click();
  const preview = dialog.getByTestId('feed-photo-preview').locator('img');
  await expect.poll(() => preview.evaluate(image => image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0)).toBe(true);
  await confirm.click();
  await expect(dialog).toHaveCount(0);
});
