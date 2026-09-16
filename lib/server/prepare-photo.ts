import sharp from 'sharp';
// @ts-expect-error -- Node source entry for deterministic image tests.
import { MAX_PHOTO_OUTPUT_BYTES, photoCropPixels, type PhotoCrop } from '../photo-upload.ts';
// @ts-expect-error -- Node source entry for deterministic image tests.
import { stripPhotoMetadata } from './photo-metadata.ts';
// @ts-expect-error -- Node source entry for deterministic image tests.
import { validatePhotoContent } from './photo-validation.ts';

export async function preparePhoto(file: File, crop?: PhotoCrop) {
  await validatePhotoContent(file);
  const bytes = Buffer.from(await file.arrayBuffer());
  const metadata = await sharp(bytes, { limitInputPixels: 25_000_000, failOn: 'warning' }).metadata();
  if ((metadata.pages ?? 1) !== 1) throw new Error('invalid_photo');
  // An uncropped upload keeps its compressed image payload and original colour
  // profile. EXIF/GPS, XMP, comments and thumbnails are removed without re-encoding.
  if (!crop) return { bytes: stripPhotoMetadata(bytes, file.type, metadata.orientation), type: file.type };
  const rotated = (metadata.orientation ?? 1) >= 5;
  const width = rotated ? metadata.height! : metadata.width!;
  const height = rotated ? metadata.width! : metadata.height!;
  const depth = metadata.depth === 'ushort' ? 'rgb16' : 'srgb';
  const output = await sharp(bytes, { limitInputPixels: 25_000_000, failOn: 'warning' })
    .pipelineColourspace(depth).autoOrient().extract(photoCropPixels(crop, width, height))
    .toColourspace(depth).keepIccProfile().png({ compressionLevel: 6 }).toBuffer();
  // Never trade pixels or quality for this resource bound.
  if (output.length > MAX_PHOTO_OUTPUT_BYTES) throw new Error('crop_too_large');
  return { bytes: output, type: 'image/png' };
}
