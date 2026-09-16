// Remove identifying metadata without decoding/re-encoding the image payload.
// Only orientation and rendering data (ICC/colour/alpha) are retained.
function orientationExif(orientation: number) {
  const exif = Buffer.from('45786966000049492a0008000000010012010300010000000100000000000000', 'hex');
  exif.writeUInt16LE(orientation, 24);
  return exif;
}
function crc32(bytes: Buffer) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function pngChunk(type: string, data: Buffer) {
  const chunk = Buffer.alloc(data.length + 12);
  chunk.writeUInt32BE(data.length); chunk.write(type, 4, 4, 'ascii'); data.copy(chunk, 8);
  chunk.writeUInt32BE(crc32(chunk.subarray(4, -4)), chunk.length - 4);
  return chunk;
}
function stripJpeg(bytes: Buffer, orientation: number) {
  const chunks = [bytes.subarray(0, 2)];
  if (orientation > 1) {
    const exif = orientationExif(orientation);
    const marker = Buffer.alloc(4); marker.writeUInt16BE(0xffe1); marker.writeUInt16BE(exif.length + 2, 2);
    chunks.push(marker, exif);
  }
  let offset = 2;
  while (offset < bytes.length) {
    const start = offset;
    if (bytes[offset++] !== 0xff) throw new Error('invalid_photo');
    while (bytes[offset] === 0xff) offset++;
    const marker = bytes[offset++];
    if (marker === 0xd9) { chunks.push(Buffer.from([0xff, 0xd9])); return Buffer.concat(chunks); }
    if (marker === undefined || marker === 0x00 || marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7)) throw new Error('invalid_photo');
    const length = bytes.readUInt16BE(offset);
    if (length < 2 || offset + length > bytes.length) throw new Error('invalid_photo');
    const payload = bytes.subarray(offset + 2, offset + length);
    const application = marker >= 0xe0 && marker <= 0xef;
    const rendering = (marker === 0xe2 && payload.subarray(0, 12).equals(Buffer.from('ICC_PROFILE\0'))) ||
      (marker === 0xee && payload.length === 12 && payload.subarray(0, 5).toString() === 'Adobe');
    if ((!application && marker !== 0xfe) || rendering) chunks.push(bytes.subarray(start, offset + length));
    offset += length;
    if (marker === 0xda) {
      // Scan data can contain escaped FF bytes and restart markers, and
      // progressive JPEGs have multiple scans separated by marker segments.
      const scanStart = offset;
      while (offset < bytes.length) {
        if (bytes[offset] !== 0xff) { offset++; continue; }
        const next = bytes[offset + 1];
        if (next === 0x00 || (next >= 0xd0 && next <= 0xd7)) { offset += 2; continue; }
        if (next === 0xff) { offset++; continue; }
        break;
      }
      chunks.push(bytes.subarray(scanStart, offset));
    }
  }
  throw new Error('invalid_photo');
}
function stripPng(bytes: Buffer, orientation: number) {
  const chunks = [bytes.subarray(0, 8)];
  const keep = new Set(['IHDR', 'PLTE', 'IDAT', 'IEND', 'tRNS', 'gAMA', 'cHRM', 'sRGB', 'iCCP', 'sBIT', 'cICP', 'mDCV', 'cLLI']);
  let offset = 8;
  while (offset + 12 <= bytes.length) {
    const length = bytes.readUInt32BE(offset);
    const end = offset + length + 12;
    if (end > bytes.length) throw new Error('invalid_photo');
    const type = bytes.toString('ascii', offset + 4, offset + 8);
    if (keep.has(type)) chunks.push(bytes.subarray(offset, end));
    if (type === 'IHDR' && orientation > 1) chunks.push(pngChunk('eXIf', orientationExif(orientation).subarray(6)));
    if (type === 'IEND') return Buffer.concat(chunks);
    offset = end;
  }
  throw new Error('invalid_photo');
}
function stripWebp(bytes: Buffer, orientation: number) {
  const chunks: Buffer[] = [];
  let offset = 12;
  let extended = false;
  while (offset + 8 <= bytes.length) {
    const type = bytes.toString('ascii', offset, offset + 4);
    const length = bytes.readUInt32LE(offset + 4);
    const end = offset + 8 + length + (length % 2);
    if (end > bytes.length) throw new Error('invalid_photo');
    if (['VP8X', 'VP8 ', 'VP8L', 'ALPH', 'ICCP'].includes(type)) {
      const chunk = Buffer.from(bytes.subarray(offset, end));
      if (type === 'VP8X') {
        if (length !== 10) throw new Error('invalid_photo');
        extended = true;
        chunk[8] = (chunk[8] & ~0x0c) | (orientation > 1 ? 0x08 : 0);
      }
      chunks.push(chunk);
    }
    offset = end;
  }
  if (orientation > 1) {
    if (!extended) throw new Error('invalid_photo');
    const exif = orientationExif(orientation);
    const chunk = Buffer.alloc(8 + exif.length); chunk.write('EXIF'); chunk.writeUInt32LE(exif.length, 4); exif.copy(chunk, 8);
    chunks.push(chunk);
  }
  const header = Buffer.from('524946460000000057454250', 'hex');
  header.writeUInt32LE(4 + chunks.reduce((size, chunk) => size + chunk.length, 0), 4);
  return Buffer.concat([header, ...chunks]);
}
export function stripPhotoMetadata(bytes: Buffer, type: string, orientation = 1): Buffer {
  if (type === 'image/jpeg') return stripJpeg(bytes, orientation);
  if (type === 'image/png') return stripPng(bytes, orientation);
  if (type === 'image/webp') return stripWebp(bytes, orientation);
  throw new Error('invalid_photo');
}
