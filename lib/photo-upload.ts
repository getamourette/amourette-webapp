// Source bytes are transported unchanged. Cropping is a separate instruction.
export const MAX_PHOTO_SOURCE_BYTES = 5 * 1024 * 1024;
export const MAX_PHOTO_OUTPUT_BYTES = 50 * 1024 * 1024;
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
