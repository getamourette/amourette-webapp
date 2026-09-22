import sharp from 'sharp';

// @ts-expect-error -- Node type-stripping tests resolve explicit extensions.
import { PHOTO_UPLOAD_MAX_BYTES, PHOTO_OUTPUT_MAX_SIDE, inspectPhoto } from '../photo-limits.ts';
export const MAX_PHOTO_BYTES = PHOTO_UPLOAD_MAX_BYTES;
export const MAX_PHOTO_REQUEST_BYTES = MAX_PHOTO_BYTES + 64 * 1024;

// Full decoding catches files with plausible headers but corrupt image content.
// Never trust browser optimization, MIME metadata or filenames.
export async function validatePhotoContent(file: File): Promise<void> {
  const formats: Record<string, string> = { 'image/jpeg': 'jpeg', 'image/png': 'png', 'image/webp': 'webp' };
  if (file.size === 0 || file.size > MAX_PHOTO_BYTES || !formats[file.type]) throw new Error('invalid_photo');
  const bytes = new Uint8Array(await file.arrayBuffer());
  inspectPhoto(bytes, file.type);
  const decoder = sharp(bytes, { limitInputPixels: 25000000, failOn: 'warning' });
  const metadata = await decoder.metadata();
  if (metadata.format !== formats[file.type] || (metadata.pages ?? 1) !== 1 ||
      !metadata.width || !metadata.height || metadata.width > PHOTO_OUTPUT_MAX_SIDE || metadata.height > PHOTO_OUTPUT_MAX_SIDE) throw new Error('invalid_photo');
  await decoder.stats();
}

// Re-encoding remains authoritative even when the browser sent a prepared JPEG.
// Bound the final bytes too: different encoders need not produce identical sizes.
export async function normalizePhotoContent(file: File): Promise<Buffer> {
  await validatePhotoContent(file);
  const bytes = new Uint8Array(await file.arrayBuffer());
  for (const quality of [85, 78, 70]) {
    const normalized = await sharp(bytes, { limitInputPixels: PHOTO_OUTPUT_MAX_SIDE ** 2, failOn: 'warning' })
      .rotate().flatten({ background: '#fff' })
      .resize({ width: PHOTO_OUTPUT_MAX_SIDE, height: PHOTO_OUTPUT_MAX_SIDE, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality }).toBuffer();
    if (normalized.length > 0 && normalized.length <= MAX_PHOTO_BYTES) return normalized;
  }
  throw new Error('invalid_photo');
}
