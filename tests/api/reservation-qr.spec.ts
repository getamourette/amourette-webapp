import { test, expect } from '@playwright/test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFile, readdir, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';
import jsQR from 'jsqr';
import { ReservationQr } from '@/components/ReservationQr';
import { renderLaunchQr, type LaunchArrivalQr } from '@/lib/launch-qr';
import { launchQrStrings } from '@/lib/launch-qr-strings';
import type { Locale } from '@/lib/strings';

// Real reusable component + production CSS, synthetic paid-booking response.
// No reservation page, camera workflow, shared DB or email delivery is simulated.
let css: string;
let qr: LaunchArrivalQr;
const secret = '1860'.repeat(16);
test.beforeAll(async () => {
  const directory = join(process.cwd(), '.next/static/chunks');
  const files = (await readdir(directory)).filter(name => name.endsWith('.css'));
  expect(files.length).toBeGreaterThan(0);
  css = (await Promise.all(files.map(name => readFile(join(directory, name), 'utf8')))).join('\n');
  qr = {
    reservation_id: '12345678-1234-1234-1234-123456789abc', night_id: '12345678-1234-1234-1234-123456789def',
    starts_at: '2026-10-20T18:00:00Z', ends_at: '2026-10-20T22:00:00Z', timezone: 'Europe/Paris',
    verified_at: null, png_data_url: `data:image/png;base64,${(await renderLaunchQr(secret)).toString('base64')}`,
  };
});

for (const locale of ['en', 'fr', 'es'] as Locale[]) {
  test(`${locale}: accessible private QR remains readable on narrow mobile and after verification`, async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 740 });
    const outbound: string[] = [];
    page.on('request', request => { if (/^https?:/.test(request.url())) outbound.push(request.url()); });
    for (const verified of [false, true]) {
      const html = renderToStaticMarkup(createElement(ReservationQr, {
        locale, qr: { ...qr, verified_at: verified ? '2026-10-20T20:00:00Z' : null },
      }));
      await page.setContent(`<html lang="${locale}"><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>${css}</style></head><body style="font-family:system-ui,sans-serif"><main class="p-4">${html}</main></body></html>`);
      const text = launchQrStrings[locale];
      const image = page.getByRole('img', { name: text.alt });
      await expect(image).toBeVisible();
      await expect(page.getByText(verified ? text.verified : text.instructions)).toBeVisible();
      await expect(page.getByText(qr.reservation_id)).toBeVisible();
      await expect(page.getByText(text.fallback)).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      expect(await page.evaluate(() => window.innerWidth)).toBe(320);
      expect(await image.evaluate((element: HTMLImageElement) => element.complete && element.naturalWidth === 360)).toBe(true);
      // Decode pixels actually rendered by Chromium, including CSS downscaling.
      const png = await image.screenshot();
      const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      expect(jsQR(new Uint8ClampedArray(data), info.width, info.height)?.data).toBe(secret);
      if (process.env.E2E_SCREENSHOTS_DIR) {
        await mkdir(process.env.E2E_SCREENSHOTS_DIR, { recursive: true });
        await page.screenshot({ path: join(process.env.E2E_SCREENSHOTS_DIR, `reservation-qr-${locale}-${verified ? 'verified' : 'ready'}.png`), fullPage: true });
      }
    }
    expect(outbound).toEqual([]);
    // An email client blocking the image still leaves a usable reference and instructions.
    await page.getByRole('img').evaluate(image => image.remove());
    await expect(page.getByText(qr.reservation_id)).toBeVisible();
    await expect(page.getByText(launchQrStrings[locale].fallback)).toBeVisible();
  });
}
