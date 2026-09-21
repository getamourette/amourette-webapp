// Source bytes are transported unchanged. Cropping is a separate instruction.
export const MAX_PHOTO_SOURCE_BYTES = 5 * 1024 * 1024;
export const MAX_PHOTO_OUTPUT_BYTES = 50 * 1024 * 1024;
export const PHOTO_ASPECT = 9 / 19.5;
export const PHOTO_SOURCE_BUCKET = 'profile-photo-sources';
export const PHOTO_STAGING_BUCKET = 'profile-photo-staging';
export type PhotoCrop = { x: number; y: number; width: number; height: number };
export const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export type PhotoType = typeof PHOTO_TYPES[number];
export function isPhotoType(value: unknown): value is PhotoType {
  return typeof value === 'string' && PHOTO_TYPES.some(type => type === value);
}
export function isPhotoCrop(value: unknown): value is PhotoCrop {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const area = value as Record<string, unknown>;
  return Object.keys(area).length === 4 && ['x', 'y', 'width', 'height'].every(key => typeof area[key] === 'number' && Number.isFinite(area[key])) &&
    (area.x as number) >= 0 && (area.y as number) >= 0 && (area.width as number) > 0 && (area.height as number) > 0 &&
    (area.x as number) + (area.width as number) <= 100.000001 && (area.y as number) + (area.height as number) <= 100.000001;
}
export function photoCropPixels(area: PhotoCrop, width: number, height: number) {
  const left = Math.min(width - 1, Math.round(width * area.x / 100));
  const top = Math.min(height - 1, Math.round(height * area.y / 100));
  return {
    left, top,
    width: Math.max(1, Math.min(width, Math.round(width * (area.x + area.width) / 100)) - left),
    height: Math.max(1, Math.min(height, Math.round(height * (area.y + area.height) / 100)) - top),
  };
}

// Both crops use percentages: portrait in the oriented source, round in portrait.
export function centeredRoundCrop(width: number, height: number): PhotoCrop {
  const side = Math.min(width, height);
  return { x: (width - side) / width * 50, y: (height - side) / height * 50, width: side / width * 100, height: side / height * 100 };
}
export function isSquarePhotoCrop(crop: unknown, width: number, height: number): crop is PhotoCrop {
  return isPhotoCrop(crop) && Math.abs(crop.width * width / 100 - crop.height * height / 100) <= 1;
}
export function samePhotoCrop(a: PhotoCrop, b: PhotoCrop): boolean {
  return (['x', 'y', 'width', 'height'] as const).every(key => Math.abs(a[key] - b[key]) < 0.00001);
}
// A reduced canvas can round one dimension. Project the round selection back
// into native portrait pixels, preserving its center and a square pixel area.
export function squarePhotoCrop(crop: PhotoCrop, width: number, height: number): PhotoCrop {
  const side = Math.min(crop.width * width / 100, crop.height * height / 100);
  const w = side / width * 100, h = side / height * 100;
  return { x: Math.max(0, Math.min(100 - w, crop.x + (crop.width - w) / 2)),
    y: Math.max(0, Math.min(100 - h, crop.y + (crop.height - h) / 2)), width: w, height: h };
}

// Restore older drafts into the fixed reference ratio and supported zoom range.
// Preserve the selected center while clamping the frame inside the full source.
export function fitPhotoCrop(crop: PhotoCrop, width: number, height: number, aspect: number): PhotoCrop {
  const baseWidth = Math.min(width, height * aspect);
  const cropWidth = Math.max(baseWidth / 3, Math.min(baseWidth, crop.width * width / 100));
  const w = cropWidth / width * 100, h = cropWidth / aspect / height * 100;
  return { x: Math.max(0, Math.min(100 - w, crop.x + crop.width / 2 - w / 2)),
    y: Math.max(0, Math.min(100 - h, crop.y + crop.height / 2 - h / 2)), width: w, height: h };
}
