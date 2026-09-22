import { checkPhotoDimensions, inspectPhoto, PHOTO_OUTPUT_MAX_SIDE, PHOTO_SOURCE_MAX_BYTES, PHOTO_TYPES, PHOTO_UPLOAD_MAX_BYTES } from './photo-limits';

self.onmessage = async (event: MessageEvent<unknown>) => {
  let bitmap: ImageBitmap | undefined;
  try {
    const input = event.data;
    if (typeof input !== 'object' || input === null || !('file' in input)) throw new Error('processing');
    const file = input.file;
    if (!(file instanceof Blob) || !PHOTO_TYPES.has(file.type)) throw new Error('type');
    if (!file.size) throw new Error('processing');
    if (file.size > PHOTO_SOURCE_MAX_BYTES) throw new Error('size');
    const dimensions = inspectPhoto(new Uint8Array(await file.arrayBuffer()), file.type);
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    checkPhotoDimensions(bitmap.width, bitmap.height);
    // EXIF may swap the axes, but must not change the actual pixel count.
    if (bitmap.width * bitmap.height !== dimensions.width * dimensions.height) throw new Error('processing');
    // Avoid another lossy encode on every draft reload. Still inspect and decode
    // restored bytes; the server remains responsible for stripping metadata.
    if ('restoring' in input && input.restoring === true && file.type === 'image/jpeg' &&
        file.size <= PHOTO_UPLOAD_MAX_BYTES && Math.max(bitmap.width, bitmap.height) <= PHOTO_OUTPUT_MAX_SIDE) {
      self.postMessage({ blob: file });
      return;
    }
    const scale = Math.min(1, PHOTO_OUTPUT_MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const canvas = new OffscreenCanvas(Math.max(1, Math.round(bitmap.width * scale)), Math.max(1, Math.round(bitmap.height * scale)));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('processing');
    // Transparent images get a consistent light background instead of black.
    context.fillStyle = '#fff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close(); bitmap = undefined;
    for (const quality of [0.85, 0.78, 0.7]) {
      const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality });
      if (blob.type === 'image/jpeg' && blob.size > 0 && blob.size <= PHOTO_UPLOAD_MAX_BYTES) {
        self.postMessage({ blob });
        return;
      }
    }
    throw new Error('processing');
  } catch (error) {
    const code = error instanceof Error && ['type', 'size', 'dimensions'].includes(error.message) ? error.message : 'processing';
    self.postMessage({ error: code });
  } finally { bitmap?.close(); }
};
