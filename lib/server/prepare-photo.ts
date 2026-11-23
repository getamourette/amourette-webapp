import sharp, { type Region } from 'sharp';
// @ts-expect-error -- Node source entry for deterministic image tests.
import { MAX_PHOTO_OUTPUT_BYTES, MAX_PHOTO_DISPLAY_BYTES, PHOTO_PORTRAIT_MAX_SIDE, PHOTO_ROUND_MAX_SIDE, centeredRoundCrop, isPhotoCrop, isSquarePhotoCrop, photoCropPixels, type PhotoCrop } from '../photo-upload.ts';
// @ts-expect-error -- Node source entry for deterministic image tests.
import { stripPhotoMetadata } from './photo-metadata.ts';
// @ts-expect-error -- Node source entry for deterministic image tests.
import { validatePhotoContent } from './photo-validation.ts';
// @ts-expect-error -- Node source entry for deterministic image tests.
import { isHeicType } from '../heic.ts';
// @ts-expect-error -- Node source entry for deterministic image tests.
import { convertHeic } from './heic-conversion.ts';

function displayImage(bytes: Buffer, region?: Region) {
  const image = sharp(bytes, { limitInputPixels: 25_000_000, failOn: 'warning' }).autoOrient();
  if (region) image.extract(region);
  return image.toColourspace('srgb');
}

function fitDisplay(side: number) {
  return { width: side, height: side, fit: 'inside', withoutEnlargement: true } as const;
}

export async function preparePhoto(file: File, crop?: PhotoCrop, roundCrop?: PhotoCrop, storedSource = false) {
  const converted = isHeicType(file.type);
  if (converted) file = await convertHeic(file);
  await validatePhotoContent(file, storedSource || converted ? MAX_PHOTO_OUTPUT_BYTES : undefined);
  if (crop && !isPhotoCrop(crop)) throw new Error('invalid_photo');
  const bytes = Buffer.from(await file.arrayBuffer());
  const metadata = await sharp(bytes, { limitInputPixels: 25_000_000, failOn: 'warning' }).metadata();
  if ((metadata.pages ?? 1) !== 1) throw new Error('invalid_photo');

  const rotated = (metadata.orientation ?? 1) >= 5;
  const width = rotated ? metadata.height! : metadata.width!;
  const height = rotated ? metadata.width! : metadata.height!;
  const source = { bytes: stripPhotoMetadata(bytes, file.type, metadata.orientation), type: file.type, width, height };
  const region = crop ? photoCropPixels(crop, width, height) : undefined;
  // The submission RPC validates framing against the native crop dimensions.
  const nativeCrop = region ? { width: region.width, height: region.height } : { width, height };
  if (roundCrop && !isSquarePhotoCrop(roundCrop, nativeCrop.width, nativeCrop.height)) throw new Error('invalid_photo');
  const image = displayImage(bytes, region);
  let output = await image.clone().resize(fitDisplay(PHOTO_PORTRAIT_MAX_SIDE)).webp({ quality: 84 }).toBuffer();
  if (output.length > MAX_PHOTO_DISPLAY_BYTES) {
    output = await image.resize(fitDisplay(640)).webp({ quality: 76, alphaQuality: 80 }).toBuffer();
  }
  if (output.length > MAX_PHOTO_DISPLAY_BYTES) throw new Error('crop_too_large');
  return { bytes: output, type: 'image/webp', nativeCrop, source };
}

// The existing square bucket only accepts PNG. A smaller square keeps
// high-entropy/transparent PNGs within the byte budget without palette loss.
export async function prepareRoundPhoto(source: { bytes: Buffer; width: number; height: number }, crop?: PhotoCrop) {
  const area = crop ?? centeredRoundCrop(source.width, source.height);
  if (!isSquarePhotoCrop(area, source.width, source.height)) throw new Error('invalid_photo');
  const pixels = photoCropPixels(area, source.width, source.height);
  const side = Math.min(pixels.width, pixels.height);
  const image = displayImage(source.bytes, { left: pixels.left, top: pixels.top, width: side, height: side });
  let bytes = await image.clone().resize(fitDisplay(PHOTO_ROUND_MAX_SIDE)).png().toBuffer();
  if (bytes.length > MAX_PHOTO_DISPLAY_BYTES) bytes = await image.resize(fitDisplay(336)).png().toBuffer();
  if (bytes.length > MAX_PHOTO_DISPLAY_BYTES) throw new Error('crop_too_large');
  return { bytes, type: 'image/png', crop: area, side };
}
