import sharp from 'sharp';

export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
export const MAX_PHOTO_REQUEST_BYTES = MAX_PHOTO_BYTES + 64 * 1024;

// Full decoding catches files with plausible headers but corrupt image content.
// No resizing, compression or persisted transformation is introduced by #77.
export async function validatePhotoContent(file: File): Promise<void> {
  const formats: Record<string, string> = { 'image/jpeg': 'jpeg', 'image/png': 'png', 'image/webp': 'webp' };
  if (file.size === 0 || file.size > MAX_PHOTO_BYTES || !formats[file.type]) throw new Error('invalid_photo');
  const decoder = sharp(new Uint8Array(await file.arrayBuffer()), { limitInputPixels: 25000000, failOn: 'warning' });
  const metadata = await decoder.metadata();
  if (metadata.format !== formats[file.type]) throw new Error('invalid_photo');
  await decoder.stats();
}
