// Source limits protect browser memory; upload limits fit the hosted request body.
export const PHOTO_SOURCE_MAX_BYTES = 20 * 1024 * 1024;
export const PHOTO_SOURCE_MAX_PIXELS = 50_000_000;
export const PHOTO_SOURCE_MAX_SIDE = 12_000;
export const PHOTO_UPLOAD_MAX_BYTES = 2 * 1024 * 1024;
export const PHOTO_OUTPUT_MAX_SIDE = 1600;
export const PHOTO_PROCESSING_TIMEOUT_MS = 20_000;
export const PHOTO_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

export function checkPhotoDimensions(width: number, height: number) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 ||
      width > PHOTO_SOURCE_MAX_SIDE || height > PHOTO_SOURCE_MAX_SIDE ||
      width * height > PHOTO_SOURCE_MAX_PIXELS) throw new Error('dimensions');
}

// Inspect container dimensions before allocating a decoded bitmap. This is a
// resource guard, not a substitute for decoding or authoritative server checks.
export function inspectPhoto(bytes: Uint8Array, type: string) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tag = (offset: number, text: string) => [...text].every((c, i) => bytes[offset + i] === c.charCodeAt(0));
  let width = 0;
  let height = 0;
  if (type === 'image/png' && bytes.length >= 33 &&
      [137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => bytes[i] === v) && tag(12, 'IHDR')) {
    width = view.getUint32(16); height = view.getUint32(20);
    for (let p = 8; p + 12 <= bytes.length;) {
      const length = view.getUint32(p);
      if (p + length + 12 > bytes.length) throw new Error('processing');
      if (tag(p + 4, 'acTL')) throw new Error('type');
      p += length + 12;
    }
  } else if (type === 'image/jpeg' && bytes[0] === 255 && bytes[1] === 216) {
    for (let p = 2; p + 3 < bytes.length;) {
      if (bytes[p++] !== 255) throw new Error('processing');
      while (bytes[p] === 255) p++;
      const marker = bytes[p++];
      if (marker === 0xda || marker === 0xd9) break;
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
      if (p + 2 > bytes.length) throw new Error('processing');
      const length = view.getUint16(p);
      if (length < 2 || p + length > bytes.length) throw new Error('processing');
      if ([0xc0, 0xc1, 0xc2].includes(marker)) {
        if (length < 8) throw new Error('processing');
        height = view.getUint16(p + 3); width = view.getUint16(p + 5);
        break;
      }
      p += length;
    }
  } else if (type === 'image/webp' && bytes.length >= 30 && tag(0, 'RIFF') && tag(8, 'WEBP')) {
    if (view.getUint32(4, true) + 8 !== bytes.length) throw new Error('processing');
    if (tag(12, 'VP8X') && view.getUint32(16, true) === 10) {
      if (bytes[20] & 2) throw new Error('type'); // Animated WebP.
      width = 1 + bytes[24] + bytes[25] * 256 + bytes[26] * 65536;
      height = 1 + bytes[27] + bytes[28] * 256 + bytes[29] * 65536;
    } else if (tag(12, 'VP8 ') && bytes[23] === 0x9d && bytes[24] === 0x01 && bytes[25] === 0x2a) {
      width = view.getUint16(26, true) & 0x3fff; height = view.getUint16(28, true) & 0x3fff;
    } else if (tag(12, 'VP8L') && bytes[20] === 0x2f) {
      const bits = view.getUint32(21, true);
      width = 1 + (bits & 0x3fff); height = 1 + ((bits >>> 14) & 0x3fff);
    }
  }
  if (!width || !height) throw new Error('processing');
  checkPhotoDimensions(width, height);
  return { width, height };
}
