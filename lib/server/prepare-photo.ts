import sharp from 'sharp';
// @ts-expect-error -- Node source entry for deterministic image tests.
import { MAX_PHOTO_OUTPUT_BYTES, centeredRoundCrop, isPhotoCrop, isSquarePhotoCrop, photoCropPixels, type PhotoCrop } from '../photo-upload.ts';
// @ts-expect-error -- Node source entry for deterministic image tests.
import { stripPhotoMetadata } from './photo-metadata.ts';
// @ts-expect-error -- Node source entry for deterministic image tests.
import { validatePhotoContent } from './photo-validation.ts';

export async function preparePhoto(file: File, crop?: PhotoCrop, roundCrop?: PhotoCrop, storedSource = false) {
  await validatePhotoContent(file, storedSource ? MAX_PHOTO_OUTPUT_BYTES : undefined);
  if (crop && !isPhotoCrop(crop)) throw new Error("invalid_photo");
  const bytes = Buffer.from(await file.arrayBuffer());
  const metadata = await sharp(bytes, { limitInputPixels: 25_000_000, failOn: 'warning' }).metadata();
  if ((metadata.pages ?? 1) !== 1) throw new Error('invalid_photo');
  // An uncropped upload keeps its compressed image payload and original colour
  // profile. EXIF/GPS, XMP, comments and thumbnails are removed without re-encoding.

  const rotated = (metadata.orientation ?? 1) >= 5;
  const width = rotated ? metadata.height! : metadata.width!;
  const height = rotated ? metadata.width! : metadata.height!;
  const source = { bytes: stripPhotoMetadata(bytes, file.type, metadata.orientation), type: file.type, width, height };
  const outputSize = crop ? photoCropPixels(crop, width, height) : { width, height };
  if (roundCrop && !isSquarePhotoCrop(roundCrop, outputSize.width, outputSize.height)) throw new Error('invalid_photo');
  if (!crop) return { ...source, source };
  const depth = metadata.depth === 'ushort' ? 'rgb16' : 'srgb';
  const output = await sharp(bytes, { limitInputPixels: 25_000_000, failOn: 'warning' })
    .pipelineColourspace(depth).autoOrient().extract(photoCropPixels(crop, width, height))
    .toColourspace(depth).keepIccProfile().png({ compressionLevel: 6 }).toBuffer();
  // Never trade pixels or quality for this resource bound.
  if (output.length > MAX_PHOTO_OUTPUT_BYTES) throw new Error('crop_too_large');
  return { bytes: output, type: 'image/png', width: outputSize.width, height: outputSize.height, source };
}

// Only the selected square becomes participant-visible; never publish the source.
export async function prepareRoundPhoto(source: { bytes: Buffer; width: number; height: number }, crop?: PhotoCrop) {
  const area = crop ?? centeredRoundCrop(source.width, source.height);
  if (!isSquarePhotoCrop(area, source.width, source.height)) throw new Error('invalid_photo');
  const pixels = photoCropPixels(area, source.width, source.height);
  const side = Math.min(pixels.width, pixels.height);
  const metadata = await sharp(source.bytes).metadata();
  const depth = metadata.depth === 'ushort' ? 'rgb16' : 'srgb';
  const bytes = await sharp(source.bytes, { limitInputPixels: 25_000_000, failOn: 'warning' })
    .pipelineColourspace(depth).autoOrient().extract({ left: pixels.left, top: pixels.top, width: side, height: side })
    .toColourspace(depth).keepIccProfile().png({ compressionLevel: 6 }).toBuffer();
  if (bytes.length > MAX_PHOTO_OUTPUT_BYTES) throw new Error('crop_too_large');
  return { bytes, type: 'image/png', crop: area, side };
}
