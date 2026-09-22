import { PHOTO_PROCESSING_TIMEOUT_MS, PHOTO_UPLOAD_MAX_BYTES } from './photo-limits';

export function preparePhoto(file: File, signal: AbortSignal, restoring = false): Promise<File> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) { reject(new Error('cancelled')); return; }
    const worker = new Worker(new URL('./photo-preparation.worker.ts', import.meta.url), { type: 'module' });
    const finish = (error?: string, blob?: Blob) => {
      clearTimeout(timer);
      signal.removeEventListener('abort', cancel);
      worker.terminate();
      if (error || !blob) reject(new Error(error ?? 'processing'));
      else resolve(new File([blob], 'photo.jpg', { type: 'image/jpeg' }));
    };
    const cancel = () => finish('cancelled');
    const timer = setTimeout(() => finish('processing'), PHOTO_PROCESSING_TIMEOUT_MS);
    signal.addEventListener('abort', cancel, { once: true });
    worker.onerror = () => finish('processing');
    worker.onmessageerror = () => finish('processing');
    worker.onmessage = (event: MessageEvent<unknown>) => {
      const value = event.data;
      if (typeof value !== 'object' || value === null) return finish('processing');
      if ('blob' in value && value.blob instanceof Blob && value.blob.type === 'image/jpeg' &&
          value.blob.size > 0 && value.blob.size <= PHOTO_UPLOAD_MAX_BYTES) finish(undefined, value.blob);
      else finish('error' in value && typeof value.error === 'string' ? value.error : 'processing');
    };
    try { worker.postMessage({ file, restoring }); } catch { finish('processing'); }
  });
}
