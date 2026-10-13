// @ts-check
// This file stays a native Node worker, outside the Next.js bundle. Pin libheif-js:
// the raw WASM API uses the wasm32 layouts from libheif 1.23.2's public headers.
import { parentPort, workerData } from 'node:worker_threads';
import { createRequire } from 'node:module';
import { deflateSync } from 'node:zlib';
import sharp from 'sharp';
const require = createRequire(import.meta.url);
/** @type {Record<string, number>} */
const timings = {};
parentPort?.postMessage({ started: true });
/** @typedef {Omit<import('libheif-js/libheif-wasm/libheif.js').MainModule, 'HEAPU8' | 'HEAPU32' | 'HEAP32'> & { HEAPU8: Uint8Array, HEAPU32: Uint32Array, HEAP32: Int32Array }} HeifModule */

/** @param {string} type @param {Buffer} data */
function pngChunk(type, data) {
  const result = Buffer.alloc(data.length + 12);
  result.writeUInt32BE(data.length); result.write(type, 4); data.copy(result, 8);
  let crc = 0xffffffff;
  for (const byte of result.subarray(4, -4)) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  result.writeUInt32BE((crc ^ 0xffffffff) >>> 0, result.length - 4);
  return result;
}

/** @param {Buffer} bytes */
function exifOrientation(bytes) {
  if (bytes.length < 12) throw new Error('invalid_photo');
  const offset = 4 + bytes.readUInt32BE(0);
  if (offset + 8 > bytes.length) throw new Error('invalid_photo');
  const little = bytes.toString('ascii', offset, offset + 2) === 'II';
  if (!little && bytes.toString('ascii', offset, offset + 2) !== 'MM') throw new Error('invalid_photo');
  const u16 = (/** @type {number} */ p) => little ? bytes.readUInt16LE(p) : bytes.readUInt16BE(p);
  const u32 = (/** @type {number} */ p) => little ? bytes.readUInt32LE(p) : bytes.readUInt32BE(p);
  if (u16(offset + 2) !== 42) throw new Error('invalid_photo');
  const directory = offset + u32(offset + 4);
  const count = u16(directory);
  if (count > 1024 || directory + 2 + count * 12 > bytes.length) throw new Error('invalid_photo');
  for (let i = 0; i < count; i++) {
    const p = directory + 2 + i * 12;
    if (u16(p) !== 0x112) continue;
    if (u16(p + 2) !== 3 || u32(p + 4) !== 1) throw new Error('invalid_photo');
    const orientation = u16(p + 8);
    if (orientation < 1 || orientation > 8) throw new Error('invalid_photo');
    return orientation;
  }
  return 1;
}

/** @param {Uint8Array} bytes */
async function decode(bytes) {
  let checkpoint = performance.now();
  /** @type {HeifModule} */
  const m = require('libheif-js/wasm-bundle');
  timings.module = performance.now() - checkpoint; checkpoint = performance.now();
  if (m.heif_get_version() !== '1.23.2') throw new Error('decoder_unavailable');
  /** @type {number[]} */
  const allocations = [];
  const alloc = (/** @type {number} */ size) => {
    const p = m._malloc(size);
    if (!p) throw new Error('invalid_photo');
    allocations.push(p); return p;
  };
  const status = alloc(12), slot = alloc(4), input = alloc(bytes.length);
  m.HEAPU8.set(bytes, input);
  const context = m._heif_context_alloc();
  let handle = 0, image = 0, options = 0, nclx = 0;
  const check = () => { if (m.HEAPU32[status / 4]) throw new Error('invalid_photo'); };
  const string = (/** @type {number} */ p) => {
    let end = p;
    while (end < p + 512 && m.HEAPU8[end]) end++;
    if (end === p + 512) throw new Error('invalid_photo');
    return Buffer.from(m.HEAPU8.subarray(p, end)).toString('utf8');
  };
  try {
    const limits = m._heif_context_get_security_limits(context);
    const view = new DataView(m.HEAPU8.buffer);
    if (view.getUint8(limits) !== 4) throw new Error('decoder_unavailable');
    // Limits apply before parsing and include hidden images/tiles, not only the
    // final RGB allocation. Zero means unlimited, so never zero these fields.
    view.setBigUint64(limits + 8, BigInt(25_000_000), true);
    view.setBigUint64(limits + 16, BigInt(256), true);
    view.setUint32(limits + 28, 512, true);
    view.setUint32(limits + 32, 1024 * 1024, true);
    view.setBigUint64(limits + 40, BigInt(200 * 1024 * 1024), true);
    view.setBigUint64(limits + 64, BigInt(256 * 1024 * 1024), true);
    m._heif_context_read_from_memory(status, context, input, bytes.length, 0); check();
    if (m._heif_context_get_number_of_top_level_images(context) !== 1) throw new Error('unsupported_heic');
    m._heif_context_get_primary_image_handle(status, context, slot); check();
    handle = m.HEAPU32[slot / 4];
    const width = m._heif_image_handle_get_width(handle), height = m._heif_image_handle_get_height(handle);
    if (width < 1 || height < 1 || width * height > 25_000_000) throw new Error('invalid_photo');
    if (m._heif_image_handle_is_premultiplied_alpha(handle)) throw new Error('unsupported_heic');

    const iccSize = m._heif_image_handle_get_raw_color_profile_size(handle);
    if (iccSize > 1024 * 1024) throw new Error('invalid_photo');
    /** @type {Buffer | undefined} */
    let icc;
    if (iccSize) {
      const p = alloc(iccSize);
      m._heif_image_handle_get_raw_color_profile(status, handle, p); check();
      icc = Buffer.from(m.HEAPU8.slice(p, p + iccSize));
      if (icc.length < 128 || icc.toString('ascii', 16, 20) !== 'RGB ') throw new Error('unsupported_heic');
    }
    m._heif_image_handle_get_nclx_color_profile(status, handle, slot);
    const profileError = m.HEAPU32[status / 4];
    if (profileError && profileError !== 10) check(); // 10: no colour profile.
    if (!profileError) nclx = m.HEAPU32[slot / 4];
    /** @type {number | undefined} */
    let primaries, transfer;
    if (nclx) {
      primaries = m.HEAPU32[(nclx + 4) / 4]; transfer = m.HEAPU32[(nclx + 8) / 4];
      if (transfer === 16 || transfer === 18) throw new Error('unsupported_heic');
    }
    if (!icc) {
      if (transfer !== 13 || (primaries !== 1 && primaries !== 12)) throw new Error('unsupported_heic');
      // Attach a matching profile to unchanged RGB samples, never transform them
      // from a falsely assumed sRGB input. Sharp provides these standard profiles.
      const swatch = await sharp({ create: { width: 1, height: 1, channels: 3, background: '#000000' } })
        .withIccProfile(primaries === 12 ? 'p3' : 'srgb').png().toBuffer();
      icc = (await sharp(swatch).metadata()).icc;
    }
    if (!icc) throw new Error('unsupported_heic');

    // HEIF rotation/mirroring takes precedence. Legacy EXIF-only orientation is
    // applied after decode, once, without retaining other EXIF/GPS fields.
    let orientation = 1;
    const item = m._heif_image_handle_get_item_id(handle);
    const propertyCount = m._heif_item_get_transformation_properties(context, item, 0, 0);
    if (propertyCount > 16) throw new Error('unsupported_heic');
    const properties = alloc(Math.max(4, propertyCount * 4));
    m._heif_item_get_transformation_properties(context, item, properties, propertyCount);
    let oriented = false;
    for (let i = 0; i < propertyCount; i++) {
      const type = m._heif_item_get_property_type(context, item, m.HEAPU32[properties / 4 + i]);
      if (type === 0x69726f74 || type === 0x696d6972) oriented = true; // irot / imir
    }
    const count = m._heif_image_handle_get_number_of_metadata_blocks(handle, 0);
    if (count > 64) throw new Error('invalid_photo');
    const ids = alloc(Math.max(4, count * 4));
    m._heif_image_handle_get_list_of_metadata_block_IDs(handle, 0, ids, count);
    for (let i = 0; i < count && !oriented; i++) {
      const id = m.HEAPU32[ids / 4 + i];
      if (string(m._heif_image_handle_get_metadata_type(handle, id)) !== 'Exif') continue;
      const size = m._heif_image_handle_get_metadata_size(handle, id);
      if (size > 1024 * 1024) throw new Error('invalid_photo');
      const p = alloc(size);
      m._heif_image_handle_get_metadata(status, handle, id, p); check();
      orientation = exifOrientation(Buffer.from(m.HEAPU8.slice(p, p + size)));
    }
    options = m._heif_decoding_options_alloc();
    if (m.HEAPU8[options] !== 10) throw new Error('decoder_unavailable');
    // Decode RGB first, then permute native pixels. Rotating subsampled YCbCr
    // before RGB conversion changes chroma interpolation in 90-degree cases.
    m.HEAPU8[options + 1] = 1;
    m.HEAPU8[options + 20] = 0; // no HDR-to-8-bit conversion
    m.HEAPU8[options + 21] = 1; // strict decoding
    m.HEAPU8[options + 69] = 1; // preserve input NCLX instead of default sRGB conversion
    timings.parse = performance.now() - checkpoint; checkpoint = performance.now();
    const alpha = Boolean(m._heif_image_handle_has_alpha_channel(handle));
    const channels = alpha ? 4 : 3;
    m._heif_decode_image(status, handle, slot, 1, alpha ? 13 : 12, options); check();
    timings.decode = performance.now() - checkpoint; checkpoint = performance.now();
    image = m.HEAPU32[slot / 4];
    if (m._heif_image_get_decoding_warnings(image, 0, 0, 0)) throw new Error('invalid_photo');
    const channel = 10; // interleaved
    const decodedWidth = m._heif_image_get_width(image, channel), decodedHeight = m._heif_image_get_height(image, channel);
    const bits = m._heif_image_get_bits_per_pixel_range(image, channel);
    if (decodedWidth < 1 || decodedHeight < 1 || decodedWidth * decodedHeight > 25_000_000 || bits < 8 || bits > 16) throw new Error('invalid_photo');
    const plane = m._heif_image_get_plane_readonly(image, channel, slot), stride = m.HEAPU32[slot / 4];
    /** @type {Uint16Array} */
    let samples = new Uint16Array(decodedWidth * decodedHeight * channels);
    const max = 2 ** bits - 1;
    for (let y = 0; y < decodedHeight; y++) for (let x = 0; x < decodedWidth * channels; x++) {
      const p = plane + y * stride + x * 2;
      const sample = (m.HEAPU8[p] << 8) | m.HEAPU8[p + 1];
      samples[y * decodedWidth * channels + x] = Math.round(sample * 65535 / max);
    }
    m._heif_image_release(image); image = 0;
    timings.samples = performance.now() - checkpoint; checkpoint = performance.now();
    let currentWidth = decodedWidth, currentHeight = decodedHeight;
    const borders = alloc(16);
    for (let i = 0; i < propertyCount; i++) {
      const property = m.HEAPU32[properties / 4 + i];
      const type = m._heif_item_get_property_type(context, item, property);
      let operation = sharp(samples, { raw: { width: currentWidth, height: currentHeight, channels } }).pipelineColourspace('rgb16');
      if (type === 0x69726f74) {
        const angle = m._heif_item_get_property_transform_rotation_ccw(context, item, property);
        if (![0, 90, 180, 270].includes(angle)) throw new Error('invalid_photo');
        operation = operation.rotate((360 - angle) % 360);
      } else if (type === 0x696d6972) {
        const axis = m._heif_item_get_property_transform_mirror(context, item, property);
        if (axis !== 0 && axis !== 1) throw new Error('invalid_photo');
        operation = axis === 0 ? operation.flip() : operation.flop();
      } else if (type === 0x636c6170) {
        m._heif_item_get_property_transform_crop_borders(context, item, property, currentWidth, currentHeight, borders, borders + 4, borders + 8, borders + 12);
        const [left, top, right, bottom] = m.HEAP32.slice(borders / 4, borders / 4 + 4);
        if (Math.min(left, top, right, bottom) < 0 || left + right >= currentWidth || top + bottom >= currentHeight) throw new Error('invalid_photo');
        operation = operation.extract({ left, top, width: currentWidth - left - right, height: currentHeight - top - bottom });
      } else throw new Error('unsupported_heic');
      const transformed = await operation.toColourspace('rgb16').raw({ depth: 'ushort' }).toBuffer({ resolveWithObject: true });
      samples = new Uint16Array(transformed.data.buffer, transformed.data.byteOffset, transformed.data.byteLength / 2);
      currentWidth = transformed.info.width; currentHeight = transformed.info.height;
    }
    if (currentWidth !== width || currentHeight !== height) throw new Error('invalid_photo');
    timings.transform = performance.now() - checkpoint; checkpoint = performance.now();
    // PNG filtering/compression is lossless: retain every native sample and ICC.
    let png = await sharp(samples, { raw: { width, height, channels } }).toColourspace('rgb16').png({ adaptiveFiltering: true, compressionLevel: 3 }).toBuffer();
    const metadata = [pngChunk('iCCP', Buffer.concat([Buffer.from('source\0\0'), deflateSync(icc)]))];
    if (orientation !== 1) {
      const exif = Buffer.from('49492a0008000000010012010300010000000100000000000000', 'hex');
      exif.writeUInt16LE(orientation, 18); metadata.push(pngChunk('eXIf', exif));
    }
    png = Buffer.concat([png.subarray(0, 33), ...metadata, png.subarray(33)]);
    if (orientation !== 1) png = await sharp(png).pipelineColourspace('rgb16').autoOrient().toColourspace('rgb16').keepIccProfile().png({ adaptiveFiltering: true, compressionLevel: 3 }).toBuffer();
    if (png.length > 50 * 1024 * 1024) throw new Error('heic_too_large');
    timings.png = performance.now() - checkpoint;
    return png;
  } finally {
    if (image) m._heif_image_release(image);
    if (options) m._heif_decoding_options_free(options);
    if (nclx) m._heif_nclx_color_profile_free(nclx);
    if (handle) m._heif_image_handle_release(handle);
    m._heif_context_free(context);
    for (const p of allocations) m._free(p);
  }
}

try {
  /** @type {unknown} */
  const input = workerData;
  if (!(input instanceof ArrayBuffer)) throw new Error('invalid_photo');
  const png = await decode(new Uint8Array(input));
  parentPort?.postMessage({ png, timings });
} catch (error) {
  const message = error instanceof Error ? error.message : '';
  parentPort?.postMessage({ error: ['unsupported_heic', 'heic_too_large', 'decoder_unavailable'].includes(message) ? message : 'invalid_photo' });
}
