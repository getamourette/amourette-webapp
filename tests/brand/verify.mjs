import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const origin = 'http://127.0.0.1:3100';
const browser = await chromium.launch();
try {
  const context = await browser.newContext({ viewport: { width: 320, height: 740 } });
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin === origin) return route.continue();
    // Intentionally hold the fake auth call to inspect the real loading states.
    assert.equal(url.hostname, 'logo-preview.invalid');
  });
  await context.routeWebSocket(/.*/, socket => socket.close());
  const page = await context.newPage();
  await page.goto(origin);
  const links = await page.locator('link[rel*="icon"]').evaluateAll(els => els.map(el => ({ rel: el.rel, href: el.href, sizes: el.sizes.value })));
  const browserIcons = links.filter(link => link.rel === 'icon');
  assert(browserIcons.some(link => new URL(link.href).pathname === '/favicon.ico'));
  assert(browserIcons.some(link => new URL(link.href).pathname === '/icon.svg'));
  assert(!await page.locator('link[rel="manifest"]').count());
  for (const [path, source] of [
    ['/favicon.ico', 'icons/favicon.ico'], ['/icon.svg', 'icons/favicon.svg'],
    ['/apple-icon.png', 'icons/amourette-phone-180.png'],
    ['/brand/amourette-wordmark-cream.svg', 'svg/amourette-wordmark-cream.svg'],
    ['/brand/amourette-wordmark-ruby.svg', 'svg/amourette-wordmark-ruby.svg'],
    ['/brand/amourette-vertical-ruby.svg', 'svg/amourette-vertical-ruby.svg'],
  ]) {
    const response = await context.request.get(origin + path);
    assert(response.ok(), path);
    assert.deepEqual(await response.body(), await readFile(`docs/brand/logo/v1/${source}`), `Asset changed: ${path}`);
  }
  const phone = links.find(link => link.rel === 'apple-touch-icon');
  assert(phone && phone.sizes === '180x180');
  const loading = page.locator('.landing-brand');
  const motion = await loading.evaluate(el => ({ name: getComputedStyle(el).animationName, duration: getComputedStyle(el).animationDuration }));
  assert.equal(motion.name, 'breathe');
  assert.equal(motion.duration, '2.4s');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  assert.equal(await loading.evaluate(el => getComputedStyle(el).animationName), 'none');
  assert.equal(await page.getByRole('heading', { name: 'Amourette', exact: true }).count(), 1);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto(`${origin}/v/preview-bar`);
  const standby = page.locator('.entry-standby');
  await standby.waitFor({ state: 'attached' });
  const entry = await standby.evaluate(el => {
    const s = getComputedStyle(el);
    return { animation: s.animationName, delay: s.animationDelay, duration: s.animationDuration };
  });
  assert.deepEqual(entry, { animation: 'entry-standby-in', delay: '0.4s', duration: '0.6s' });
  await page.waitForTimeout(1100);
  assert.equal(await standby.evaluate(el => getComputedStyle(el).opacity), '0.7');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  assert.equal(await standby.evaluate(el => getComputedStyle(el).animationName), 'none');
  console.log('Verified exact served assets, F1 browser links, B1 180px touch link, accessible heading, no manifest, public breathing and delayed venue standby with reduced-motion alternatives.');
} finally { await browser.close(); }
