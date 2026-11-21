import sharp from 'sharp';
// @ts-expect-error -- Node source entry for deterministic image tests.
import { MAX_PHOTO_OUTPUT_BYTES, centeredRoundCrop, isPhotoCrop, isSquarePhotoCrop, photoCropPixels, type PhotoCrop } from '../photo-upload.ts';
// @ts-expect-error -- Node source entry for deterministic image tests.
import { stripPhotoMetadata } from './photo-metadata.ts';
// @ts-expect-error -- Node source entry for deterministic image tests.
import { validatePhotoContent } from './photo-validation.ts';
// @ts-expect-error -- Node source entry for deterministic image tests.
import { isHeicType } from '../heic.ts';
// @ts-expect-error -- Node source entry for deterministic image tests.
import { convertHeic } from './heic-conversion.ts';

type Depth = 'rgb16' | 'srgb';
const decoderOptions = { limitInputPixels: 25_000_000, failOn: 'warning' } as const;

// One complete, strict decode validates the image and becomes an uncompressed
// oriented copy that every crop reads. Samples, alpha and ICC stay unchanged.
async function decodeOnce(bytes: Buffer, depth: Depth) {
  return sharp(bytes, decoderOptions).pipelineColourspace(depth).autoOrient()
    .toColourspace(depth).keepIccProfile().tiff({ compression: 'none' }).toBuffer();
}
async function cropPng(decoded: Buffer, depth: Depth, area: { left: number; top: number; width: number; height: number }) {
  const bytes = await sharp(decoded, { limitInputPixels: 25_000_000 }).pipelineColourspace(depth).extract(area)
    .toColourspace(depth).keepIccProfile().png({ compressionLevel: 6 }).toBuffer();
  // Never trade pixels or quality for this resource bound.
  if (bytes.length > MAX_PHOTO_OUTPUT_BYTES) throw new Error('crop_too_large');
  return bytes;
}
function roundArea(width: number, height: number, crop?: PhotoCrop) {
  const area = crop ?? centeredRoundCrop(width, height);
  if (!isSquarePhotoCrop(area, width, height)) throw new Error('invalid_photo');
  const pixels = photoCropPixels(area, width, height);
  const side = Math.min(pixels.width, pixels.height);
  return { crop: area, side, pixels: { left: pixels.left, top: pixels.top, width: side, height: side } };
}

export async function preparePhoto(file: File, crop?: PhotoCrop, roundCrop?: PhotoCrop, storedSource = false, roundSourceCrop?: PhotoCrop) {
  const converted = isHeicType(file.type);
  if (converted) file = await convertHeic(file);
  // A cropped command is validated by the complete decode below.
  await validatePhotoContent(file, storedSource || converted ? MAX_PHOTO_OUTPUT_BYTES : undefined, !crop);
  if (crop && !isPhotoCrop(crop)) throw new Error("invalid_photo");
  const bytes = Buffer.from(await file.arrayBuffer());
  const metadata = await sharp(bytes, decoderOptions).metadata();
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
  const depth: Depth = metadata.depth === 'ushort' ? 'rgb16' : 'srgb';
  const round = roundSourceCrop ? roundArea(width, height, roundSourceCrop) : undefined;
  const decoded = await decodeOnce(bytes, depth);
  const [output, roundBytes] = await Promise.all([
    cropPng(decoded, depth, photoCropPixels(crop, width, height)),
    round ? cropPng(decoded, depth, round.pixels) : undefined,
  ]);
  return { bytes: output, type: 'image/png', width: outputSize.width, height: outputSize.height, source,
    round: round && roundBytes ? { bytes: roundBytes, type: 'image/png', crop: round.crop, side: round.side } : undefined };
}

// Only the selected square becomes participant-visible; never publish the source.
export async function prepareRoundPhoto(source: { bytes: Buffer; width: number; height: number }, crop?: PhotoCrop) {
  const round = roundArea(source.width, source.height, crop);
  const metadata = await sharp(source.bytes).metadata();
  const depth: Depth = metadata.depth === 'ushort' ? 'rgb16' : 'srgb';
  const bytes = await cropPng(await decodeOnce(source.bytes, depth), depth, round.pixels);
  return { bytes, type: 'image/png', crop: round.crop, side: round.side };
}
