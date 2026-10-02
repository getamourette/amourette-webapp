// HEIC is an input format only. Stored sources and crop outputs remain PNG.
export const HEIC_TYPES = ['image/heic', 'image/heif'] as const;
export type HeicType = typeof HEIC_TYPES[number];
export const PHOTO_ACCEPT = 'image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif';
export function isHeicType(type: unknown): type is HeicType {
  return type === 'image/heic' || type === 'image/heif';
}

// A bounded file-type-box check is a routing hint, never a substitute for decoding.
export function hasHeicBrand(bytes: Uint8Array): boolean {
  if (bytes.length < 20) return false;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const size = view.getUint32(0);
  const text = (offset: number) => String.fromCharCode(...bytes.subarray(offset, offset + 4));
  if (text(4) !== 'ftyp' || size < 20 || size > bytes.length || size > 4096 || size % 4) return false;
  const brands = [text(8)];
  for (let offset = 16; offset < size; offset += 4) brands.push(text(offset));
  return brands.some(brand => brand === 'heic' || brand === 'heix') &&
    !brands.some(brand => ['msf1', 'hevc', 'hevx', 'avis', 'avif'].includes(brand));
}

// Pickers sometimes provide an empty MIME type. Inspect bytes in that case;
// filenames alone never authorize a new format. A picker-produced JPEG stays JPEG.
export async function normalizePhotoFileType(file: File): Promise<File> {
  if (file.type !== '' && file.type !== 'application/octet-stream') return file;
  if (!hasHeicBrand(new Uint8Array(await file.slice(0, 4096).arrayBuffer()))) return file;
  return new File([file], file.name, { type: 'image/heic', lastModified: file.lastModified });
}
