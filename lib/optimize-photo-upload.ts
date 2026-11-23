import { MAX_PHOTO_DISPLAY_BYTES, squarePhotoCrop, type PhotoCrop } from './photo-upload';

// Leave HEIC validation, wide-gamut PNG/WebP sources and older recrops on
// their existing paths. The full oriented JPEG frame remains available to recrop.
const MAX_JPEG_UPLOAD_SIDE = 2560;

export async function optimizePhotoUpload(file: File, roundSourceCrop?: PhotoCrop) {
  const original = { file, roundSourceCrop };
  if (file.type !== 'image/jpeg' || file.size <= MAX_PHOTO_DISPLAY_BYTES) return original;
  const signature = new Uint8Array(await file.slice(0, 3).arrayBuffer());
  if (signature[0] !== 255 || signature[1] !== 216 || signature[2] !== 255) return original;
  try {
    const image = await createImageBitmap(file, { imageOrientation: 'from-image' });
    try {
      if (image.width * image.height > 25_000_000) return original;
      const scale = Math.min(1, MAX_JPEG_UPLOAD_SIDE / Math.max(image.width, image.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(image.width * scale));
      canvas.height = Math.max(1, Math.round(image.height * scale));
      try {
        const context = canvas.getContext('2d');
        if (!context) return original;
        context.imageSmoothingQuality = 'high';
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.88));
        if (!blob?.size || blob.type !== file.type || blob.size >= file.size) return original;
        return {
          file: new File([blob], 'photo.jpg', { type: blob.type }),
          roundSourceCrop: roundSourceCrop && squarePhotoCrop(roundSourceCrop, canvas.width, canvas.height),
        };
      } finally {
        canvas.width = canvas.height = 0;
      }
    } finally {
      image.close();
    }
  } catch {
    // Keep the existing authenticated upload/validation path on decode or
    // browser encoder failure.
    return original;
  }
}
