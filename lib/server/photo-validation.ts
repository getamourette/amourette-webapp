import sharp from 'sharp';
// @ts-expect-error -- Node source entry for deterministic image tests.
import { MAX_PHOTO_SOURCE_BYTES } from '../photo-upload.ts';

export const MAX_PHOTO_BYTES = MAX_PHOTO_SOURCE_BYTES;
// The larger original travels directly to Storage. Legacy multipart and review
// requests retain their existing bound; no larger function payload is required.
export const MAX_PHOTO_REQUEST_BYTES = 5 * 1024 * 1024 + 64 * 1024;

// Sharp chooses its loader from the bytes, not from the declared type. The signature
// check keeps every other loader (SVG, GIF, TIFF, HEIF, AVIF...) away from participant
// bytes: only the three decoders the product needs ever see them.
export function hasPhotoSignature(bytes: Uint8Array, type: string): boolean {
  const starts = (signature: number[], offset = 0) =>
    bytes.length >= offset + signature.length && signature.every((byte, index) => bytes[offset + index] === byte);
  if (type === 'image/jpeg') return starts([0xff, 0xd8, 0xff]);
  if (type === 'image/png') return starts([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (type === 'image/webp') return starts([0x52, 0x49, 0x46, 0x46]) && starts([0x57, 0x45, 0x42, 0x50], 8);
  return false;
}

// Full decoding catches files with plausible headers but corrupt image content.
// No resizing, compression or persisted transformation is introduced by #77.
export async function validatePhotoContent(file: File, maxBytes = MAX_PHOTO_BYTES): Promise<void> {
  const formats: Record<string, string> = { 'image/jpeg': 'jpeg', 'image/png': 'png', 'image/webp': 'webp' };
  if (file.size === 0 || file.size > maxBytes || !formats[file.type]) throw new Error('invalid_photo');
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!hasPhotoSignature(bytes, file.type)) throw new Error('invalid_photo');
  const decoder = sharp(bytes, { limitInputPixels: 25000000, failOn: 'warning' });
  const metadata = await decoder.metadata();
  if (metadata.format !== formats[file.type]) throw new Error('invalid_photo');
  await decoder.stats();
}
