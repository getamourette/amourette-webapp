import sharp from 'sharp';
// @ts-expect-error -- Node source entry for deterministic image tests.
import { MAX_PHOTO_SOURCE_BYTES } from '../photo-upload.ts';

export const MAX_PHOTO_BYTES = MAX_PHOTO_SOURCE_BYTES;
// The larger original travels directly to Storage. Legacy multipart and review
// requests retain their existing bound; no larger function payload is required.
export const MAX_PHOTO_REQUEST_BYTES = 5 * 1024 * 1024 + 64 * 1024;

// Full decoding catches files with plausible headers but corrupt image content.
// No resizing, compression or persisted transformation is introduced by #77.
export async function validatePhotoContent(file: File, maxBytes = MAX_PHOTO_BYTES): Promise<void> {
  const formats: Record<string, string> = { 'image/jpeg': 'jpeg', 'image/png': 'png', 'image/webp': 'webp' };
  if (file.size === 0 || file.size > maxBytes || !formats[file.type]) throw new Error('invalid_photo');
  const decoder = sharp(new Uint8Array(await file.arrayBuffer()), { limitInputPixels: 25000000, failOn: 'warning' });
  const metadata = await decoder.metadata();
  if (metadata.format !== formats[file.type]) throw new Error('invalid_photo');
  await decoder.stats();
}
