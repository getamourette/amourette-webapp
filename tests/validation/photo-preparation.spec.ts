import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import sharp from 'sharp';
import { largePhotoSource } from '../helpers/photo-source';

// Execute the actual browser helper/worker with native decoding and encoding.
// This harness uses no database, participant account or external request.
test.beforeEach(async ({ page }) => {
  await page.route('https://photo.test/**', async route => {
    const name = new URL(route.request().url()).pathname.slice(1);
    if (!name) return route.fulfill({ contentType: 'text/html', body: '<title>Photo preparation</title>' });
    if (!['prepare-photo.js', 'photo-preparation.worker.js', 'photo-limits.js'].includes(name)) return route.abort();
    const source = await readFile(`lib/${name.replace('.js', '.ts')}`, 'utf8');
    const output = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText
      .replaceAll("'./photo-limits'", "'./photo-limits.js'")
      .replaceAll("'./photo-preparation.worker.ts'", "'./photo-preparation.worker.js'");
    await route.fulfill({ contentType: 'text/javascript', body: output });
  });
  await page.goto('https://photo.test/');
});

async function prepare(page: Page, buffer: Buffer, type: string, restoring = false) {
  return page.evaluate(async ({ base64, type, restoring }) => {
    const path = '/prepare-photo.js';
    const { preparePhoto } = await import(path);
    try {
      const file: File = await preparePhoto(new File([Uint8Array.from(atob(base64), c => c.charCodeAt(0))], 'untrusted.heic', { type }), new AbortController().signal, restoring);
      return { bytes: Array.from(new Uint8Array(await file.arrayBuffer())), name: file.name, type: file.type, error: '' };
    } catch (error) {
      return { bytes: [], name: '', type: '', error: error instanceof Error ? error.message : 'unknown' };
    }
  }, { base64: buffer.toString('base64'), type, restoring });
}

test('large originals shrink, rotate, preserve color and lose private metadata', async ({ page }) => {
  const source = await largePhotoSource();
  expect(source.buffer.length).toBeGreaterThan(5 * 1024 * 1024);
  const prepared = await prepare(page, source.buffer, source.mimeType);
  expect(prepared.error).toBe('');
  expect(prepared.name).toBe('photo.jpg');
  expect(prepared.type).toBe('image/jpeg');
  expect(prepared.bytes.length).toBeLessThanOrEqual(2 * 1024 * 1024);
  const output = sharp(Buffer.from(prepared.bytes));
  const metadata = await output.metadata();
  expect([metadata.width, metadata.height]).toEqual([1600, 960]);
  expect(metadata.exif).toBeUndefined();
  const restored = await prepare(page, Buffer.from(prepared.bytes), 'image/jpeg', true);
  expect(restored.bytes).toEqual(prepared.bytes);
  const { dominant } = await output.stats();
  expect(Math.abs(dominant.r - 128)).toBeLessThan(10);

  const oriented = await sharp({ create: { width: 120, height: 80, channels: 3, background: 'red' } })
    .withMetadata({ orientation: 6 }).jpeg().toBuffer();
  const rotated = await prepare(page, oriented, 'image/jpeg');
  expect(rotated.error).toBe('');
  const rotatedMeta = await sharp(Buffer.from(rotated.bytes)).metadata();
  expect([rotatedMeta.width, rotatedMeta.height]).toEqual([80, 120]);
  expect(rotatedMeta.exif).toBeUndefined();
});

test('supported formats, corrupt files, dimension limits and cancellation', async ({ page }) => {
  for (const format of ['jpeg', 'png', 'webp'] as const) {
    const bytes = await sharp({ create: { width: 12, height: 8, channels: 3, background: 'blue' } }).toFormat(format).toBuffer();
    const result = await prepare(page, bytes, `image/${format}`);
    expect(result.error).toBe('');
    expect((await sharp(Buffer.from(result.bytes)).metadata()).width).toBe(12);
    expect((await prepare(page, bytes.subarray(0, 30), `image/${format}`)).error).toBe('processing');
  }
  const tooWide = await sharp({ create: { width: 12001, height: 1, channels: 3, background: 'red' } }).png().toBuffer();
  expect((await prepare(page, tooWide, 'image/png')).error).toBe('dimensions');
  expect((await prepare(page, Buffer.from('not an image'), 'image/heic')).error).toBe('type');
  expect((await prepare(page, Buffer.alloc(0), 'image/png')).error).toBe('size');
  expect(await page.evaluate(async () => {
    const path = '/prepare-photo.js';
    const { preparePhoto } = await import(path);
    const controller = new AbortController();
    const pending: Promise<File> = preparePhoto(new File(['x'], 'x.png', { type: 'image/png' }), controller.signal);
    controller.abort();
    return pending.then(() => 'unexpected', (error: Error) => error.message);
  })).toBe('cancelled');
});

test('a stalled worker is terminated and reports a recoverable failure', async ({ page }) => {
  await page.route('https://photo.test/photo-preparation.worker.js', route => route.fulfill({ contentType: 'text/javascript', body: 'self.onmessage = () => {};' }));
  await page.clock.install();
  const pending = prepare(page, Buffer.from('x'), 'image/png');
  // Wait for worker construction before advancing its actual deadline.
  await expect.poll(() => page.workers().length).toBe(1);
  await page.clock.fastForward(20_001);
  expect((await pending).error).toBe('processing');
  await expect.poll(() => page.workers().length).toBe(0);
});


test('source byte limit and all EXIF orientations, including mirrored portraits', async ({ page }) => {
  expect(await page.evaluate(async () => {
    const path = '/prepare-photo.js';
    const { preparePhoto } = await import(path);
    const oversized = new File([new Uint8Array(20 * 1024 * 1024 + 1)], 'large.jpg', { type: 'image/jpeg' });
    return preparePhoto(oversized, new AbortController().signal).then(() => 'unexpected', (error: Error) => error.message);
  })).toBe('size');
  for (let orientation = 1; orientation <= 8; orientation++) {
    const marker = await sharp({ create: { width: 30, height: 20, channels: 3, background: 'red' } }).png().toBuffer();
    const original = await sharp({ create: { width: 120, height: 80, channels: 3, background: 'blue' } })
      .composite([{ input: marker, left: 0, top: 0 }]).withMetadata({ orientation }).jpeg().toBuffer();
    const result = await prepare(page, original, 'image/jpeg');
    expect(result.error).toBe('');
    const actual = await sharp(Buffer.from(result.bytes)).raw().toBuffer({ resolveWithObject: true });
    const expected = await sharp(original).rotate().raw().toBuffer({ resolveWithObject: true });
    expect(actual.info).toEqual(expected.info);
    // Compare interior pixels in every corner; lossy encoding allows small differences.
    for (const x of [5, actual.info.width - 6]) for (const y of [5, actual.info.height - 6]) {
      const offset = (y * actual.info.width + x) * 3;
      for (let channel = 0; channel < 3; channel++) expect(Math.abs(actual.data[offset + channel] - expected.data[offset + channel])).toBeLessThan(20);
    }
  }
});
